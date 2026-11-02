import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';

test('folders and boreholes enforce parent integrity, tenant roles, decimal depth and concurrent versions', async () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
  });
  const scoped = new TenantDatabaseService(runtime);
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const users: Array<{ id: string; email: string; tenantId: string }> = [];
  const tenantIds: string[] = [];
  const workIds: string[] = [];
  const password = 'Hierarchy integration password 123!';
  try {
    const hash = await hashPassword(password);
    for (let i = 0; i < 2; i++)
      tenantIds.push(
        (await admin.tenant.create({ data: { name: `Hierarchy ${crypto.randomUUID()}` } })).id,
      );
    for (let i = 0; i < 3; i++)
      workIds.push(
        (
          await admin.work.create({
            data: { name: `Work ${i}`, tenantId: tenantIds[i === 2 ? 1 : 0] },
          })
        ).id,
      );
    for (const [i, role] of (['ADMIN', 'VIEWER', 'ADMIN'] as const).entries()) {
      const user = await admin.user.create({
        data: { email: `${crypto.randomUUID()}@example.invalid`, passwordHash: hash },
      });
      const tenantId = tenantIds[i === 2 ? 1 : 0];
      users.push({ ...user, tenantId });
      await admin.membership.create({
        data: {
          tenantId,
          userId: user.id,
          role,
          additionalRoles: role === 'ADMIN' ? ['ENGINEER'] : [],
        },
      });
    }
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    const tokens = await Promise.all(
      users.map(async (user) => {
        const result = await fetch(`${base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, password, tenantId: user.tenantId }),
        });
        assert.equal(result.status, 200);
        return ((await result.json()) as { accessToken: string }).accessToken;
      }),
    );
    const call = (path: string, body?: unknown, index = 0, method = body ? 'POST' : 'GET') =>
      fetch(`${base}/obras/${path}`, {
        method,
        headers: { Authorization: `Bearer ${tokens[index]}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const created = await call(`${workIds[0]}/pastas`, { name: 'Etapa 1' });
    assert.equal(created.status, 201);
    const folder = (await created.json()) as { id: string; version: number };
    const other = await call(`${workIds[1]}/pastas`, { name: 'Outra obra' });
    const otherFolder = (await other.json()) as { id: string };
    const foreign = await call(`${workIds[2]}/pastas`, { name: 'Outra empresa' }, 2);
    const foreignFolder = (await foreign.json()) as { id: string };
    assert.equal((await call(`${workIds[0]}/pastas`, { name: 'Etapa 1' })).status, 409);
    assert.equal((await call(`${workIds[0]}/pastas`, { name: 'Denied' }, 1)).status, 403);
    assert.equal((await call(`${workIds[0]}/pastas`, undefined, 2)).status, 404);
    assert.equal(
      (await call(`${workIds[0]}/furos`, { code: 'SP-01', folderId: otherFolder.id })).status,
      404,
    );
    assert.equal(
      (await call(`${workIds[0]}/furos`, { code: 'SP-01', folderId: foreignFolder.id })).status,
      404,
    );
    for (const depth of ['-1', '0', '1.234', '1000000', 'NaN', 12])
      assert.equal(
        (await call(`${workIds[0]}/furos`, { code: 'INVALID', plannedDepthM: depth })).status,
        400,
      );
    assert.equal(
      (await call(`${workIds[0]}/furos`, { code: 'SP-01', tenantId: tenantIds[1] })).status,
      400,
    );
    const holeResponse = await call(`${workIds[0]}/furos`, {
      code: ' sp-01 ',
      folderId: folder.id,
      plannedDepthM: '12.50',
    });
    assert.equal(holeResponse.status, 201);
    const hole = (await holeResponse.json()) as {
      id: string;
      code: string;
      plannedDepthM: string;
      version: number;
    };
    assert.equal(hole.code, 'SP-01');
    assert.equal(Number(hole.plannedDepthM), 12.5);
    assert.equal((await call(`${workIds[0]}/furos`, { code: 'sp-01' })).status, 409);
    assert.equal((await call(`${workIds[0]}/furos`, { code: 'Denied' }, 1)).status, 403);
    assert.equal((await call(`${workIds[0]}/furos`, undefined, 1)).status, 200);
    assert.equal((await call(`${workIds[0]}/furos`, { code: 'ß'.repeat(60) })).status, 400);
    const a = { tenantId: tenantIds[0], userId: users[0].id };
    const viewer = { tenantId: tenantIds[0], userId: users[1].id };
    const b = { tenantId: tenantIds[1], userId: users[2].id };
    assert.deepEqual(await runtime.borehole.findMany(), []);
    assert.equal((await scoped.run(b, (tx) => tx.borehole.findMany())).length, 0);
    await assert.rejects(
      scoped.run(a, (tx) =>
        tx.borehole.create({
          data: {
            code: 'CROSS-WORK',
            workId: workIds[0],
            tenantId: tenantIds[0],
            folderId: otherFolder.id,
          },
        }),
      ),
    );
    await assert.rejects(
      scoped.run(a, (tx) =>
        tx.folder.create({
          data: { name: 'CROSS-TENANT', workId: workIds[2], tenantId: tenantIds[0] },
        }),
      ),
    );
    await assert.rejects(
      scoped.run(viewer, (tx) =>
        tx.borehole.create({
          data: { code: 'DIRECT-DENIED', workId: workIds[0], tenantId: tenantIds[0] },
        }),
      ),
    );
    assert.equal(
      (
        await scoped.run(viewer, (tx) =>
          tx.folder.updateMany({ where: { id: folder.id }, data: { name: 'Denied' } }),
        )
      ).count,
      0,
    );
    const updates = await Promise.all(
      ['SP-02', 'SP-03'].map((code) =>
        call(
          `${workIds[0]}/furos/${hole.id}`,
          { code, version: 1, folderId: null, plannedDepthM: '15.25' },
          0,
          'PUT',
        ),
      ),
    );
    assert.deepEqual(updates.map((result) => result.status).sort(), [200, 409]);
    const saved = await admin.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    assert.equal(saved.version, 2);
    assert.equal(saved.folderId, null);
    assert.equal(saved.plannedDepthM?.toString(), '15.25');
    assert.equal(
      (await call(`${workIds[1]}/furos/${hole.id}`, { code: 'MOVE', version: 2 }, 0, 'PUT')).status,
      404,
    );
    const folderUpdates = await Promise.all(
      ['Etapa A', 'Etapa B'].map((name) =>
        call(`${workIds[0]}/pastas/${folder.id}`, { name, version: 1 }, 0, 'PUT'),
      ),
    );
    assert.deepEqual(folderUpdates.map((result) => result.status).sort(), [200, 409]);
    await admin.borehole.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        code: `PAGE-${i}`,
        tenantId: tenantIds[0],
        workId: workIds[0],
      })),
    });
    const page1 = (await (await call(`${workIds[0]}/furos`)).json()) as {
      items: unknown[];
      total: number;
    };
    const page2 = (await (await call(`${workIds[0]}/furos?page=2`)).json()) as { items: unknown[] };
    assert.equal(page1.items.length, 20);
    assert.equal(page1.total, 22);
    assert.equal(page2.items.length, 2);
    await admin.borehole.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        code: `FILTER-${i}`,
        tenantId: tenantIds[0],
        workId: workIds[0],
        folderId: folder.id,
      })),
    });
    const filtered = (await (await call(`${workIds[0]}/furos?folderId=${folder.id}`)).json()) as {
      items: unknown[];
      total: number;
    };
    const filteredPage2 = (await (
      await call(`${workIds[0]}/furos?folderId=${folder.id}&page=2`)
    ).json()) as { items: unknown[] };
    const root = (await (await call(`${workIds[0]}/furos?folderId=root`)).json()) as {
      total: number;
    };
    assert.equal(filtered.total, 21);
    assert.equal(filtered.items.length, 20);
    assert.equal(filteredPage2.items.length, 1);
    assert.equal(root.total, 22);
    assert.equal((await call(`${workIds[0]}/furos?folderId=${otherFolder.id}`)).status, 404);
    assert.equal((await call(`${workIds[0]}/furos?folderId=${foreignFolder.id}`)).status, 404);
    assert.equal((await call(`${workIds[0]}/furos?folderId=invalid`)).status, 400);
    assert.deepEqual(await runtime.folder.findMany(), []);
    assert.deepEqual(await runtime.borehole.findMany(), []);
  } finally {
    await app.close();
    await admin.borehole.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.folder.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.work.deleteMany({ where: { id: { in: workIds } } });
    const ids = users.map((user) => user.id);
    await admin.authSession.deleteMany({ where: { userId: { in: ids } } });
    await admin.membership.deleteMany({ where: { userId: { in: ids } } });
    await admin.user.deleteMany({ where: { id: { in: ids } } });
    await admin.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await runtime.$disconnect();
    await admin.$disconnect();
  }
});
