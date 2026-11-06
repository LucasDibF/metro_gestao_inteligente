import { renderReportPdf, PermanentReportError } from './report-renderer';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { PrivateStorage } from '@spt/private-storage';
import { canonicalJson, ReportSnapshot, isSupportedTemplateVersion } from '@spt/report-templates';
interface Job {
  id: string;
  tenantId: string;
  workId: string;
  reportId: string;
  leaseToken: string;
  snapshot: ReportSnapshot;
  snapshotHash: string;
  attempts: number;
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export async function processNextReport(
  db: PrismaClient,
  options: { channel?: string; capturePath?: string; onlyJobId?: string } = {},
): Promise<boolean> {
  const [row] = await db.$queryRaw<
    Array<{ job: Job | null }>
  >`SELECT claim_report_job(${options.onlyJobId ?? null}::uuid) AS job`;
  const job = row?.job;
  if (!job) return false;
  const started = Date.now();
  let heartbeat: ReturnType<typeof setInterval> | undefined,
    storage: PrivateStorage | undefined,
    permanent = false;
  try {
    const snapshot = job.snapshot;
    if (
      hash(canonicalJson(snapshot)) !== job.snapshotHash ||
      snapshot.schemaVersion !== 1 ||
      !isSupportedTemplateVersion(snapshot.templateVersion) ||
      !Array.isArray(snapshot.holes) ||
      !snapshot.holes.length ||
      snapshot.holes.length > 20 ||
      !Array.isArray(snapshot.photos) ||
      snapshot.photos.length > 40
    ) {
      permanent = true;
      throw Error('Invalid snapshot');
    }
    heartbeat = setInterval(() => {
      void db.$queryRaw`SELECT renew_report_job(${job.id}::uuid,${job.leaseToken}::uuid)`.catch(
        () => {},
      );
    }, 30000);
    storage = new PrivateStorage();
    const photos: Record<string, string> = {};
    for (let offset = 0; offset < snapshot.photos.length; offset += 4) {
      await Promise.all(
        snapshot.photos.slice(offset, offset + 4).map(async (p) => {
          if (!p.objectKey.startsWith(job.tenantId + '/' + job.workId + '/photos/')) {
            permanent = true;
            throw Error('Invalid photo scope');
          }
          const original = await storage!.get(p.objectKey, 8 * 1024 * 1024);
          if (hash(original) !== p.sha256) {
            permanent = true;
            throw Error('Photo integrity failed');
          }
          const metadata = await sharp(original, { limitInputPixels: 25000000 }).metadata(),
            swap = [5, 6, 7, 8].includes(metadata.orientation ?? 1),
            width = (swap ? metadata.height : metadata.width)!,
            height = (swap ? metadata.width : metadata.height)!;
          const left = Math.min(width - 1, Math.floor(p.crop.x * width)),
            top = Math.min(height - 1, Math.floor(p.crop.y * height));
          const cropped = await sharp(original, { limitInputPixels: 25000000 })
            .timeout({ seconds: 5 })
            .rotate()
            .extract({
              left,
              top,
              width: Math.max(1, Math.min(width - left, Math.round(p.crop.width * width))),
              height: Math.max(1, Math.min(height - top, Math.round(p.crop.height * height))),
            })
            .resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 92 })
            .toBuffer();
          photos[p.id] = 'data:image/jpeg;base64,' + cropped.toString('base64');
        }),
      );
    }
    const { pdf, browserVersion } = await renderReportPdf(snapshot, photos, options);
    const sha = hash(pdf),
      key = `${job.tenantId}/${job.workId}/reports/${job.id}/${sha}.pdf`;
    await storage.put(key, pdf, 'application/pdf');
    const stored = await storage.get(key);
    if (hash(stored) !== sha) throw Error('Stored PDF integrity failed');
    const [published] = await db.$queryRaw<
      Array<{ ok: boolean }>
    >`SELECT publish_report_job(${job.id}::uuid,${job.leaseToken}::uuid,${key},${sha}) AS ok`;
    console.log(
      JSON.stringify({
        event: 'report_job_finished',
        jobId: job.id,
        tenantId: job.tenantId,
        attempt: job.attempts,
        published: published.ok,
        durationMs: Date.now() - started,
        browserVersion,
      }),
    );
  } catch (error) {
    permanent ||= error instanceof PermanentReportError;
    // Logged first so the failure stays visible even when recording it in the database fails.
    console.error(
      JSON.stringify({
        event: 'report_job_failed',
        reason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown generation error',
        jobId: job.id,
        tenantId: job.tenantId,
        attempt: job.attempts,
        permanent,
        durationMs: Date.now() - started,
      }),
    );
    await db.$queryRaw`SELECT fail_report_job(${job.id}::uuid,${job.leaseToken}::uuid,${permanent})`;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    storage?.close();
  }
  return true;
}
