import sharp from 'sharp';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { mkdtemp, open, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { PrivateStorage } from '@spt/private-storage';
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
async function docker(args: string[], input?: string, output?: string) {
  const source = input ? await open(input, 'r') : undefined,
    target = output ? await open(output, 'w', 0o600) : undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('docker', ['compose', 'exec', '-T', 'db', ...args], {
        stdio: [source?.fd ?? 'ignore', target?.fd ?? 'ignore', 'pipe'],
      });
      child.stderr?.resume();
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(Error('Database archive operation failed')),
      );
    });
  } finally {
    await source?.close();
    await target?.close();
  }
}
async function main() {
  const adminUrl = new URL(process.env.MIGRATION_DATABASE_URL ?? ''),
    endpoint = new URL(process.env.S3_ENDPOINT ?? '');
  if (
    !['localhost', '127.0.0.1'].includes(adminUrl.hostname) ||
    !['localhost', '127.0.0.1'].includes(endpoint.hostname) ||
    adminUrl.pathname !== '/spt' ||
    process.env.NODE_ENV === 'production'
  )
    throw Error('Restore verification restricted to local development');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl.href }) }),
    storage = new PrivateStorage(),
    folder = await mkdtemp(join(tmpdir(), 'spt-backup-')),
    database = 'spt_restore_' + randomUUID().replaceAll('-', ''),
    bucket = 'spt-restore-' + randomUUID();
  let createdDatabase = false,
    createdBucket = false,
    restored: PrismaClient | undefined;
  const s3 = new S3Client({
      endpoint: endpoint.href,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    }),
    manifest: Array<{ key: string; file: string; sha256: string }> = [];
  let probeTenant: string | undefined;
  const probeKeys: string[] = [];
  try {
    // Synthetic, unassigned tenant ensures photos and PDFs are exercised even on a new project.
    probeTenant = (await db.tenant.create({ data: { name: 'Synthetic backup verification' } })).id;
    const probeWork = await db.work.create({
        data: { tenantId: probeTenant, name: 'Synthetic restore probe' },
      }),
      probeHole = await db.borehole.create({
        data: { tenantId: probeTenant, workId: probeWork.id, code: 'RESTORE-PROBE' },
      });
    const image = await sharp({
        create: { width: 32, height: 32, channels: 3, background: '#285440' },
      })
        .jpeg()
        .toBuffer(),
      photoKey = `${probeTenant}/${probeWork.id}/photos/probe/original`,
      thumbKey = `${probeTenant}/${probeWork.id}/photos/probe/preview.jpg`;
    await storage.put(photoKey, image, 'image/jpeg');
    await storage.put(thumbKey, image, 'image/jpeg');
    probeKeys.push(photoKey, thumbKey);
    await db.boreholePhoto.create({
      data: {
        tenantId: probeTenant,
        workId: probeWork.id,
        boreholeId: probeHole.id,
        objectKey: photoKey,
        thumbnailKey: thumbKey,
        sha256: hash(image),
        mime: 'image/jpeg',
        sizeBytes: image.length,
        width: 32,
        height: 32,
        caption: 'Synthetic restore probe',
        processingState: 'READY',
      },
    });
    const probeReport = await db.report.create({
      data: {
        tenantId: probeTenant,
        workId: probeWork.id,
        title: 'Synthetic restore probe',
        composition: { holeIds: [probeHole.id], photoIds: [], showOtherBoreholes: false },
      },
    });
    const content = 'BT /F1 12 Tf 30 60 Td (Synthetic restore probe) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const pdfBytes = Buffer.from(pdf),
      pdfKey = `${probeTenant}/${probeWork.id}/reports/restore-probe.pdf`;
    await storage.put(pdfKey, pdfBytes, 'application/pdf');
    probeKeys.push(pdfKey);
    await db.reportIssue.create({
      data: {
        tenantId: probeTenant,
        workId: probeWork.id,
        reportId: probeReport.id,
        requestedBy: randomUUID(),
        idempotencyKey: randomUUID(),
        requestHash: hash(Buffer.from('restore-probe')),
        compositionVersion: 1,
        issueNumber: 1,
        snapshot: { syntheticRestoreProbe: true },
        snapshotHash: hash(Buffer.from('restore-probe')),
        state: 'READY',
        objectKey: pdfKey,
        pdfSha256: hash(pdfBytes),
        finishedAt: new Date(),
      },
    });
    // pg_dump takes a consistent database snapshot. Immutable object keys preserve referenced content.
    await docker(['pg_dump', '-U', 'spt', '-Fc', 'spt'], undefined, join(folder, 'database.dump'));
    const photos = await db.boreholePhoto.findMany(),
      issues = await db.reportIssue.findMany({ where: { state: 'READY' } });
    const keys = [
      ...photos.flatMap((p) => [
        p.objectKey,
        ...(p.processingState === 'READY' ? [p.thumbnailKey] : []),
      ]),
      ...issues.flatMap((i) => (i.objectKey ? [i.objectKey] : [])),
    ];
    for (const [index, key] of [...new Set(keys)].entries()) {
      const data = await storage.get(key),
        file = index + '.bin';
      await writeFile(join(folder, file), data, { mode: 0o600 });
      manifest.push({ key, file, sha256: hash(data) });
    }
    await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    await db.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    createdDatabase = true;
    await docker(
      ['pg_restore', '-U', 'spt', '--no-owner', '-d', database],
      join(folder, 'database.dump'),
    );
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    createdBucket = true;
    for (const entry of manifest) {
      const data = await readFile(join(folder, entry.file));
      if (hash(data) !== entry.sha256) throw Error('Backup hash mismatch');
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: entry.key, Body: data }));
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: entry.key }));
      if (
        !object.Body ||
        hash(Buffer.from(await object.Body.transformToByteArray())) !== entry.sha256
      )
        throw Error('Restored object mismatch');
    }
    const restoredUrl = new URL(adminUrl);
    restoredUrl.pathname = '/' + database;
    restored = new PrismaClient({ adapter: new PrismaPg({ connectionString: restoredUrl.href }) });
    const restoredPhotos = await restored.boreholePhoto.findMany(),
      restoredIssues = await restored.reportIssue.findMany({ where: { state: 'READY' } });
    for (const photo of restoredPhotos) {
      const entry = manifest.find((v) => v.key === photo.objectKey);
      if (!entry || entry.sha256 !== photo.sha256) throw Error('Restored photo reference mismatch');
    }
    for (const issue of restoredIssues) {
      const entry = manifest.find((v) => v.key === issue.objectKey);
      if (!entry || entry.sha256 !== issue.pdfSha256)
        throw Error('Restored PDF reference mismatch');
    }
    const tables = await restored.$queryRaw<
      Array<{ name: string }>
    >`SELECT tablename AS name FROM pg_tables WHERE schemaname='public'`;
    console.log(
      JSON.stringify({
        event: 'local_restore_verified',
        tables: tables.length,
        photoReferences: restoredPhotos.length,
        pdfReferences: restoredIssues.length,
        objects: manifest.length,
      }),
    );
  } finally {
    await restored?.$disconnect();
    if (createdDatabase) await db.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (createdBucket) {
      if (manifest.length)
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: manifest.map((v) => ({ Key: v.key })) },
          }),
        );
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    }
    if (probeTenant) {
      await db.reportIssue.deleteMany({ where: { tenantId: probeTenant } });
      await db.report.deleteMany({ where: { tenantId: probeTenant } });
      await db.boreholePhoto.deleteMany({ where: { tenantId: probeTenant } });
      await db.borehole.deleteMany({ where: { tenantId: probeTenant } });
      await db.work.deleteMany({ where: { tenantId: probeTenant } });
      await db.tenant.delete({ where: { id: probeTenant } });
    }
    await Promise.allSettled(probeKeys.map((key) => storage.remove(key)));
    storage.close();
    s3.destroy();
    await db.$disconnect();
    await rm(folder, { recursive: true, force: true });
  }
}
main().catch(() => {
  console.error('Local backup/restore verification failed');
  process.exitCode = 1;
});
