import 'reflect-metadata';
import { test, mock } from 'node:test';
import { inpeFixture } from '../helpers/inpe-fixture';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { ReportSnapshot } from '@spt/report-templates';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrivateStorage } from '@spt/private-storage';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
import { processNextReport } from '../../apps/worker/src/report-worker';
import { completeReviewerCopy, saveProfessionalProfile } from '../helpers/professional-profile';
test('report snapshots and PDFs are immutable, private and idempotent; worker leases recover and older jobs cannot replace current issues', async () => {
  const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
    }),
    worker = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.WORKER_DATABASE_URL, max: 3 }),
    }),
    runtime = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }),
    storage = new PrivateStorage();
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const tenantIds: string[] = [],
    userIds: string[] = [],
    keys: string[] = [];
  try {
    const logoDataUrl =
      'data:image/png;base64,' +
      (
        await sharp({ create: { width: 20, height: 10, channels: 3, background: '#176045' } })
          .png()
          .toBuffer()
      ).toString('base64');
    const password = crypto.randomUUID(),
      passwordHash = await hashPassword(password),
      users = [];
    for (const [i, role] of (['ENGINEER', 'ADMIN', 'VIEWER', 'ENGINEER'] as const).entries()) {
      const tenantId =
        i === 0 || i === 3
          ? (
              await db.tenant.create({
                data: {
                  name: 'Empresa sintética para relatório',
                  ...(i === 0 ? { profile: { logoDataUrl } } : {}),
                },
              })
            ).id
          : tenantIds[0];
      if (i === 0 || i === 3) tenantIds.push(tenantId);
      const user = await db.user.create({
        data: { email: crypto.randomUUID() + '@example.invalid', passwordHash },
      });
      userIds.push(user.id);
      await db.membership.create({
        data: {
          userId: user.id,
          tenantId,
          role,
          additionalRoles: role === 'ADMIN' ? ['ENGINEER'] : [],
        },
      });
      users.push({ ...user, tenantId });
    }
    const work = await db.work.create({
        data: {
          name: 'Obra sintética de homologação',
          tenantId: tenantIds[0],
          clientName: 'Contratante de teste',
        },
      }),
      hole = await db.borehole.create({
        data: { tenantId: tenantIds[0], workId: work.id, code: 'SP-TESTE' },
      });
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api/v1';
    const tokens = await Promise.all(
      users.map(async (u) => {
        const r = await fetch(base + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: u.email, password, tenantId: u.tenantId }),
        });
        assert.equal(r.status, 200);
        return ((await r.json()) as { accessToken: string }).accessToken;
      }),
    );
    const call = (path: string, body?: unknown, index = 0, method = body ? 'POST' : 'GET') =>
      fetch(base + path, {
        method,
        headers: { Authorization: 'Bearer ' + tokens[index], 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const holePath = `/obras/${work.id}/furos/${hole.id}`,
      reportPath = `/obras/${work.id}/relatorios`;
    const current = () => db.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    assert.equal(
      (
        await call(
          holePath + '/tecnico',
          { technicalVersion: 1, executedDepthM: '5', waterLevelM: '1.8', fieldDate: '2026-10-31' },
          0,
          'PUT',
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(holePath + '/tecnico/camadas', {
          fromM: '0',
          toM: '5',
          soilType: 'Areia siltosa',
          description: 'Descrição sintética para validação do relatório.',
        })
      ).status,
      201,
    );
    const spt = {
      depthM: '1',
      advances: [
        { blows: 4, penetrationMm: 150 },
        { blows: 6, penetrationMm: 150 },
        { blows: 8, penetrationMm: 150 },
      ],
    };
    assert.equal((await call(holePath + '/ensaios', spt)).status, 201);
    let lastMetre = { id: '', version: 0 };
    for (const depthM of ['2', '3', '4', '5']) {
      const created = await call(holePath + '/ensaios', { ...spt, depthM });
      assert.equal(created.status, 201);
      lastMetre = (await created.json()) as { id: string; version: number };
    }
    const coordResponse = await call(
      holePath + '/arquivos/coordenadas/executada',
      {
        eastingM: '500000',
        northingM: '9400000',
        zone: 25,
        hemisphere: 'S',
        datum: 'SIRGAS2000',
        reference: 'Coordenada sintética de teste',
      },
      0,
      'PUT',
    );
    assert.equal(coordResponse.status, 200);
    const coordinate = (await coordResponse.json()) as { id: string };
    assert.equal(
      (
        await call(
          holePath + '/arquivos/coordenadas/oficial',
          { coordinateId: coordinate.id, technicalVersion: (await current()).technicalVersion },
          0,
          'PUT',
        )
      ).status,
      200,
    );
    async function approve() {
      const version = (await current()).technicalVersion;
      if ((await current()).reviewState === 'DRAFT') {
        assert.equal(
          (
            await call(holePath + '/tecnico/enviar-revisao', {
              technicalVersion: version,
              note: 'Conferência de dados sintéticos.',
            })
          ).status,
          201,
        );
      }
      assert.equal(
        (
          await call(holePath + '/tecnico/aprovar', {
            technicalVersion: version,
            note: 'Caso sintético conferido para testes.',
          })
        ).status,
        201,
      );
    }
    await saveProfessionalProfile(base, tokens[0]);
    await approve();
    const body = {
      title: 'Relatório de sondagem — teste sintético',
      notes: 'Documento exclusivo para teste automatizado.',
      holeIds: [hole.id],
      photoIds: [],
      showOtherBoreholes: true,
    };
    assert.equal((await call(reportPath, body, 2)).status, 403);
    const created = await call(reportPath, body);
    assert.equal(created.status, 201);
    const report = (await created.json()) as { id: string; version: number };
    const issuesPath = reportPath + '/' + report.id + '/emissoes';
    assert.equal(
      (await call(issuesPath, { version: 1, idempotencyKey: crypto.randomUUID() }, 2)).status,
      403,
    );
    assert.equal((await call(issuesPath, undefined, 3)).status, 404);
    const key = crypto.randomUUID(),
      repeated = await Promise.all([
        call(issuesPath, { version: 1, idempotencyKey: key }),
        call(issuesPath, { version: 1, idempotencyKey: key }),
      ]);
    assert.deepEqual(
      repeated.map((r) => r.status),
      [201, 201],
    );
    const one = (await repeated[0].json()) as { id: string },
      again = (await repeated[1].json()) as { id: string };
    assert.equal(one.id, again.id);
    assert.equal((await call(issuesPath, { version: 2, idempotencyKey: key })).status, 409);
    const next = await call(issuesPath, { version: 1, idempotencyKey: crypto.randomUUID() });
    assert.equal(next.status, 201);
    const two = (await next.json()) as { id: string };
    await assert.rejects(runtime.$queryRaw`SELECT claim_report_job()`);
    await assert.rejects(worker.reportIssue.findMany());
    const captures = 'apps/web/.impeccable/review';
    await mkdir(captures, { recursive: true });
    const channel = process.platform === 'darwin' ? 'chrome' : undefined;
    const processed = await Promise.all([
      processNextReport(worker, {
        channel,
        onlyJobId: two.id,
        capturePath: captures + '/report-render.png',
      }),
      processNextReport(worker, { channel, onlyJobId: two.id }),
    ]);
    assert.deepEqual(processed.sort(), [false, true]);
    let issue = await db.reportIssue.findUniqueOrThrow({ where: { id: two.id } });
    assert.equal((issue.snapshot as unknown as ReportSnapshot).tenant.logoDataUrl, logoDataUrl);
    // The snapshot freezes the approval copy, title included; phone and e-mail never enter it.
    const [frozen] = (issue.snapshot as unknown as ReportSnapshot).holes;
    assert.equal(frozen.reviewerName, completeReviewerCopy.reviewerName);
    assert.equal(frozen.reviewerRegistration, completeReviewerCopy.reviewerRegistration);
    assert.equal(frozen.reviewerTitle, completeReviewerCopy.reviewerTitle);
    assert.equal((issue.snapshot as unknown as ReportSnapshot).templateVersion, '0.8.18');
    await db.tenant.update({
      where: { id: tenantIds[0] },
      data: { profile: { logoDataUrl: null } },
    });
    assert.equal(
      (
        (await db.reportIssue.findUniqueOrThrow({ where: { id: two.id } }))
          .snapshot as unknown as ReportSnapshot
      ).tenant.logoDataUrl,
      logoDataUrl,
    );
    assert.equal(issue.state, 'READY');
    keys.push(issue.objectKey!);
    assert.equal(
      (await db.report.findUniqueOrThrow({ where: { id: report.id } })).currentIssueId,
      two.id,
    );
    assert.equal(await processNextReport(worker, { channel, onlyJobId: one.id }), true);
    const old = await db.reportIssue.findUniqueOrThrow({ where: { id: one.id } });
    assert.equal(old.state, 'READY');
    keys.push(old.objectKey!);
    assert.equal(
      (await db.report.findUniqueOrThrow({ where: { id: report.id } })).currentIssueId,
      two.id,
    );
    await assert.rejects(
      db.reportIssue.update({ where: { id: two.id }, data: { snapshot: { changed: true } } }),
    );
    const pdfPath = issuesPath + '/' + two.id + '/pdf';
    assert.equal((await call(pdfPath, undefined, 3)).status, 404);
    const downloaded = await call(pdfPath, undefined, 2);
    assert.equal(downloaded.status, 200);
    const bytes = Buffer.from(await downloaded.arrayBuffer());
    assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), issue.pdfSha256);
    await writeFile(captures + '/report-synthetic.pdf', bytes);
    assert.equal(
      (
        await call(
          holePath + '/ensaios/' + lastMetre.id,
          { ...spt, depthM: '5', version: lastMetre.version },
          0,
          'PUT',
        )
      ).status,
      200,
    );
    assert.equal(
      (await db.report.findUniqueOrThrow({ where: { id: report.id } })).currentIssueId,
      null,
    );
    assert.equal((await current()).reviewState, 'IN_REVIEW');
    assert.deepEqual(Buffer.from(await (await call(pdfPath)).arrayBuffer()), bytes);
    assert.equal(
      (await call(issuesPath, { version: 1, idempotencyKey: crypto.randomUUID() })).status,
      400,
    );
    await approve();
    const thirdResponse = await call(issuesPath, {
      version: 1,
      idempotencyKey: crypto.randomUUID(),
    });
    assert.equal(thirdResponse.status, 201);
    const third = (await thirdResponse.json()) as { id: string };
    const [claimed] = await worker.$queryRaw<
      Array<{ job: { leaseToken: string } }>
    >`SELECT claim_report_job(${third.id}::uuid) AS job`;
    const emptyHash = '0'.repeat(64),
      emptyKey = `${tenantIds[0]}/${work.id}/reports/${third.id}/${emptyHash}.pdf`;
    const [withoutLease] = await worker.$queryRaw<
      Array<{ ok: boolean }>
    >`SELECT publish_report_job(${third.id}::uuid,NULL::uuid,${emptyKey},${emptyHash}) AS ok`;
    assert.equal(withoutLease.ok, false);
    assert.equal(
      (await db.reportIssue.findUniqueOrThrow({ where: { id: third.id } })).state,
      'PROCESSING',
    );
    await db.reportIssue.update({
      where: { id: third.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    await processNextReport(worker, { channel, onlyJobId: third.id });
    issue = await db.reportIssue.findUniqueOrThrow({ where: { id: third.id } });
    assert.equal(issue.state, 'READY');
    assert.equal(issue.attempts, 2);
    keys.push(issue.objectKey!);
    const [stale] = await worker.$queryRaw<
      Array<{ ok: boolean }>
    >`SELECT publish_report_job(${third.id}::uuid,${claimed.job.leaseToken}::uuid,${issue.objectKey},${issue.pdfSha256}) AS ok`;
    assert.equal(stale.ok, false);
    const mapResponse = await call(reportPath + '/' + report.id + '/croqui');
    assert.equal(mapResponse.status, 200);
    const mapData = (await mapResponse.json()) as { map: { view: { spanM: number } }; svg: string };
    assert.ok(mapData.map.view.spanM > 0);
    assert.ok(mapData.svg.includes('SIRGAS2000'));
    const mapPath = reportPath + '/' + report.id + '/croqui';
    const currentView = { centerX: 500000, centerY: 9400000, spanM: 100 };
    assert.equal(
      (await call(mapPath, { version: 1, view: currentView, baseMap: 'satellite' }, 0, 'PUT'))
        .status,
      400,
    );
    assert.equal((await db.report.findUniqueOrThrow({ where: { id: report.id } })).version, 1);
    const originalKey = process.env.GOOGLE_MAPS_API_KEY;
    try {
      process.env.GOOGLE_MAPS_API_KEY = 'synthetic-browser-key';
      const response = await call(mapPath);
      assert.equal(response.status, 200);
      const reference = (await response.json()) as { google: { embedUrl: string }; svg: string };
      assert.equal(
        new URL(reference.google.embedUrl).searchParams.get('key'),
        'synthetic-browser-key',
      );
      assert.ok(!reference.svg.includes('synthetic-browser-key'));
      assert.ok(!reference.svg.includes('<image'));
    } finally {
      if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
      else process.env.GOOGLE_MAPS_API_KEY = originalKey;
    }

    assert.equal(
      (
        await call(
          reportPath + '/' + report.id + '/croqui',
          { version: 1, view: { centerX: 0, centerY: 0, spanM: 10 } },
          0,
          'PUT',
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          reportPath + '/' + report.id + '/croqui',
          { version: 1, view: { centerX: 500000, centerY: 9400000, spanM: 100 } },
          0,
          'PUT',
        )
      ).status,
      200,
    );
    assert.equal(
      (await db.report.findUniqueOrThrow({ where: { id: report.id } })).currentIssueId,
      null,
    );
    assert.equal(
      (await call(reportPath + '/' + report.id + '/croqui', { version: 1, view: null }, 0, 'PUT'))
        .status,
      409,
    );
    const originalImagery = process.env.INPE_MAP_ENABLED;
    const originalFetch = globalThis.fetch;
    const fixture = inpeFixture({ zone: 25 });
    process.env.INPE_MAP_ENABLED = 'true';
    mock.method(
      globalThis,
      'fetch',
      async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new URL(String(input)).hostname === 'data.inpe.br'
          ? fixture.transport(input, init)
          : originalFetch(input, init),
    );
    try {
      const preview = (await (await call(mapPath)).json()) as {
        imagery: { state: string; date: string };
        svg: string;
      };
      assert.equal(preview.imagery.state, 'ready');
      assert.equal(preview.imagery.date, '2026-09-23');
      assert.ok(preview.svg.includes('<image'));
      const emitted = await call(issuesPath, { version: 2, idempotencyKey: crypto.randomUUID() });
      assert.equal(emitted.status, 201);
      const job = (await emitted.json()) as { id: string };
      await processNextReport(worker, {
        channel,
        onlyJobId: job.id,
        capturePath: captures + '/report-inpe-render.png',
      });
      const published = await db.reportIssue.findUniqueOrThrow({ where: { id: job.id } });
      assert.equal(published.state, 'READY');
      keys.push(published.objectKey!);
      const download = await call(issuesPath + '/' + job.id + '/pdf');
      assert.equal(download.status, 200);
      await writeFile(captures + '/report-inpe.pdf', Buffer.from(await download.arrayBuffer()));
      assert.ok(fixture.calls.every((c) => !c.url.includes(tenantIds[0])));
    } finally {
      mock.restoreAll();
      if (originalImagery === undefined) delete process.env.INPE_MAP_ENABLED;
      else process.env.INPE_MAP_ENABLED = originalImagery;
    }
  } finally {
    await app.close();
    await Promise.allSettled(keys.map((k) => storage.remove(k)));
    storage.close();
    await db.report.updateMany({
      where: { tenantId: { in: tenantIds } },
      data: { currentIssueId: null },
    });
    await db.reportIssue.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.report.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.technicalEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.soilLayer.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.sptTest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.borehole.updateMany({
      where: { tenantId: { in: tenantIds } },
      data: { officialCoordinateId: null },
    });
    await db.boreholeCoordinate.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.borehole.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.work.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.professionalProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await worker.$disconnect();
    await runtime.$disconnect();
    await db.$disconnect();
  }
});
