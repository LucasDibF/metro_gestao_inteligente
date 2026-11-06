import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';
test('soil intervals, field data and engineering approval are isolated, versioned and invalidated atomically', async () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
  });
  const scoped = new TenantDatabaseService(runtime),
    app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const tenantIds: string[] = [],
    userIds: string[] = [];
  try {
    const password = crypto.randomUUID(),
      hash = await hashPassword(password);
    for (let i = 0; i < 2; i++)
      tenantIds.push(
        (await db.tenant.create({ data: { name: 'Technical ' + crypto.randomUUID() } })).id,
      );
    const users = [];
    for (const [i, role] of (['ADMIN', 'ENGINEER', 'VIEWER', 'ENGINEER'] as const).entries()) {
      const tenantId = tenantIds[i === 3 ? 1 : 0];
      const user = await db.user.create({
        data: { email: crypto.randomUUID() + '@example.invalid', passwordHash: hash },
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
    const work = await db.work.create({ data: { name: 'Technical work', tenantId: tenantIds[0] } }),
      hole = await db.borehole.create({
        data: { code: 'SP-01', tenantId: tenantIds[0], workId: work.id },
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
    const path = `/obras/${work.id}/furos/${hole.id}`;
    const call = (suffix: string, body?: unknown, index = 0, method = body ? 'POST' : 'GET') =>
      fetch(base + path + suffix, {
        method,
        headers: { Authorization: 'Bearer ' + tokens[index], 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const current = () => db.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    assert.equal((await call('/tecnico', undefined, 3)).status, 404);
    assert.equal((await call('/tecnico/folha', undefined, 3)).status, 404);
    assert.equal((await call('/tecnico/analise', undefined, 3)).status, 404);
    const analysisResponse = await call('/tecnico/analise', undefined, 2);
    assert.equal(analysisResponse.status, 200);
    assert.equal(analysisResponse.headers.get('cache-control'), 'private, no-store');
    const analysis = await analysisResponse.json();
    assert.equal(analysis.html, undefined);
    assert.ok(Array.isArray(analysis.tests));
    assert.ok(Array.isArray(analysis.layers));

    const beforeSheet = await current();
    const sheetResponse = await call('/tecnico/folha', undefined, 2);
    assert.equal(sheetResponse.status, 200);
    assert.equal(sheetResponse.headers.get('cache-control'), 'private, no-store');
    const sheet = await sheetResponse.json();
    assert.ok(sheet.pageCount >= 1);
    assert.ok(sheet.warnings.includes('Data de campo não informada.'));
    assert.ok(sheet.html.includes('Não informadas'));
    assert.ok(!sheet.html.includes('<script>'));
    assert.equal((await current()).technicalVersion, beforeSheet.technicalVersion);
    assert.equal((await current()).reviewState, 'DRAFT');

    assert.equal(
      (
        await call(
          '/tecnico',
          { technicalVersion: 1, executedDepthM: '5', fieldDate: '2026-02-30' },
          0,
          'PUT',
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          '/tecnico',
          { technicalVersion: 1, executedDepthM: '5', fieldDate: '2026-10-31', waterLevelM: '0' },
          2,
          'PUT',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          '/tecnico',
          { technicalVersion: 1, executedDepthM: '5', fieldDate: '2026-10-31', waterLevelM: '0' },
          0,
          'PUT',
        )
      ).status,
      200,
    );
    assert.equal((await current()).technicalVersion, 2);
    const input = {
      fromM: '0',
      toM: '2',
      soilType: 'Areia siltosa',
      description: 'Marrom, com fragmentos finos.',
    };
    const response = await call('/tecnico/camadas', input);
    assert.equal(response.status, 201);
    const layer = (await response.json()) as { id: string; version: number };
    assert.equal((await call('/tecnico/camadas', { ...input, fromM: '1', toM: '3' })).status, 409);
    assert.equal((await call('/tecnico/camadas', { ...input, fromM: '3', toM: '2' })).status, 400);
    assert.equal((await call('/tecnico/camadas', { ...input, fromM: '2', toM: '6' })).status, 400);
    assert.equal(
      (await call('/tecnico/camadas', { ...input, fromM: '2', toM: '5', soilType: 'Argila' }))
        .status,
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
    assert.equal((await call('/ensaios', spt)).status, 201);
    const missing = await call('/tecnico/enviar-revisao', {
      technicalVersion: (await current()).technicalVersion,
      note: 'Faltam metros.',
    });
    assert.equal(missing.status, 400);
    assert.equal(((await missing.json()) as { code: string }).code, 'SPT_METRES_MISSING');
    let lastMetre = { id: '', version: 0 };
    for (const depthM of ['2', '3', '4', '5']) {
      const created = await call('/ensaios', { ...spt, depthM });
      assert.equal(created.status, 201);
      lastMetre = (await created.json()) as { id: string; version: number };
    }
    let h = await current();
    assert.equal(h.technicalVersion, 9);
    assert.equal(
      (
        await call('/tecnico/enviar-revisao', {
          technicalVersion: h.technicalVersion,
          note: 'Pronto para revisão.',
        })
      ).status,
      201,
    );
    assert.equal((await current()).reviewState, 'IN_REVIEW');
    const approval = {
      technicalVersion: h.technicalVersion,
      note: 'Conferidos os dados de campo e o perfil.',
      reviewerName: 'Engenheira de teste',
      reviewerRegistration: 'TESTE-123',
    };
    assert.equal((await call('/tecnico/aprovar', approval, 2)).status, 403);
    assert.equal(
      (await call('/tecnico/aprovar', { ...approval, technicalVersion: 1 }, 1)).status,
      409,
    );
    assert.equal((await call('/tecnico/aprovar', approval, 1)).status, 201);
    h = await current();
    assert.equal(h.reviewState, 'APPROVED');
    assert.equal(h.approvedVersion, h.technicalVersion);
    assert.equal(
      (
        await call(
          '/tecnico/camadas/' + layer.id,
          { ...input, description: 'Descrição conferida e corrigida.', version: layer.version },
          0,
          'PUT',
        )
      ).status,
      200,
    );
    h = await current();
    assert.equal(h.reviewState, 'IN_REVIEW');
    assert.equal(h.approvedVersion, null);
    assert.equal(h.technicalVersion, 10);
    assert.equal(
      (await call('/tecnico/camadas/' + layer.id, { ...input, version: layer.version }, 0, 'PUT'))
        .status,
      409,
    );
    assert.equal(
      (
        await call('/tecnico/enviar-revisao', {
          technicalVersion: h.technicalVersion,
          note: 'Correção concluída.',
        })
      ).status,
      409,
    );
    const results = await Promise.all([
      call('/tecnico/aprovar', { ...approval, technicalVersion: h.technicalVersion }, 1),
      call(
        '/ensaios/' + lastMetre.id,
        { ...spt, depthM: '5', version: lastMetre.version },
        0,
        'PUT',
      ),
    ]);
    assert.equal(results[1].status, 200);
    assert.ok([201, 409].includes(results[0].status));
    h = await current();
    assert.equal(h.reviewState, 'IN_REVIEW');
    assert.equal(h.approvedVersion, null);
    const data = (await (await call('/tecnico')).json()) as {
      layers: unknown[];
      events: Array<{ id: string }>;
    };
    assert.equal(data.layers.length, 2);
    assert.ok(data.events.length >= 9);
    assert.deepEqual(await runtime.soilLayer.findMany(), []);
    assert.deepEqual(
      await scoped.run({ tenantId: tenantIds[1], userId: users[3].id }, (tx) =>
        tx.soilLayer.findMany(),
      ),
      [],
    );
    await assert.rejects(
      scoped.run({ tenantId: tenantIds[0], userId: users[2].id }, (tx) =>
        tx.soilLayer.create({
          data: {
            boreholeId: hole.id,
            workId: work.id,
            tenantId: tenantIds[0],
            ...input,
            fromM: '10',
            toM: '11',
          },
        }),
      ),
    );
    await assert.rejects(
      db.technicalEvent.update({ where: { id: data.events[0].id }, data: { action: 'ALTERED' } }),
    );
  } finally {
    await app.close();
    await db.technicalEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.soilLayer.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.sptTest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.borehole.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.work.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await runtime.$disconnect();
    await db.$disconnect();
  }
});
