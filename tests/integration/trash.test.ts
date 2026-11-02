import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';

test('trash preserves hierarchy, audit identity, authorization and concurrent restoration', async () => {
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
  const tenants: string[] = [];
  const password = 'Trash integration password 123!';
  try {
    const hash = await hashPassword(password);
    for (let i = 0; i < 2; i++)
      tenants.push(
        (await admin.tenant.create({ data: { name: `Trash ${crypto.randomUUID()}` } })).id,
      );
    for (const [i, role] of (['ADMIN', 'ENGINEER', 'VIEWER', 'ADMIN'] as const).entries()) {
      const user = await admin.user.create({
        data: { email: `${crypto.randomUUID()}@example.invalid`, passwordHash: hash },
      });
      const tenantId = tenants[i === 3 ? 1 : 0];
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
    const work = await admin.work.create({ data: { name: 'Original work', tenantId: tenants[0] } });
    const folder = await admin.folder.create({
      data: { name: 'Original folder', workId: work.id, tenantId: tenants[0] },
    });
    const hole = await admin.borehole.create({
      data: {
        code: 'SP-01',
        folderId: folder.id,
        workId: work.id,
        tenantId: tenants[0],
        plannedDepthM: '12.50',
      },
    });
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    const tokens = await Promise.all(
      users.map(async (user) => {
        const r = await fetch(`${base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, password, tenantId: user.tenantId }),
        });
        assert.equal(r.status, 200);
        return ((await r.json()) as { accessToken: string }).accessToken;
      }),
    );
    const call = (path: string, method = 'GET', body?: unknown, index = 0) =>
      fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${tokens[index]}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const workPath = `/obras/${work.id}`,
      folderPath = `${workPath}/pastas/${folder.id}`,
      holePath = `${workPath}/furos/${hole.id}`;
    assert.equal((await call(workPath, 'DELETE', { version: 1 })).status, 409);
    assert.equal((await call(folderPath, 'DELETE', { version: 1 })).status, 409);
    for (const i of [1, 2]) {
      assert.equal((await call(holePath, 'DELETE', { version: 1 }, i)).status, 403);
      assert.equal((await call('/lixeira', 'GET', undefined, i)).status, 403);
    }
    assert.equal((await call(holePath, 'DELETE', { version: 1 }, 3)).status, 404);
    assert.equal((await call(holePath, 'DELETE', { version: 99 })).status, 409);
    assert.equal((await call(holePath, 'DELETE', {})).status, 400);
    assert.equal(
      (await call(holePath, 'DELETE', { version: 1, deletedBy: users[3].id })).status,
      400,
    );
    const a = { tenantId: tenants[0], userId: users[0].id };
    const engineer = { tenantId: tenants[0], userId: users[1].id };
    await assert.rejects(
      scoped.run(engineer, (tx) =>
        tx.folder.update({ where: { id: folder.id }, data: { deletedAt: new Date() } }),
      ),
    );
    await assert.rejects(
      scoped.run(a, (tx) =>
        tx.work.update({ where: { id: work.id }, data: { deletedAt: new Date() } }),
      ),
    );
    assert.equal((await call(holePath, 'DELETE', { version: 1 })).status, 200);
    const deleted = await admin.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    assert.ok(deleted.deletedAt);
    assert.equal(deleted.deletedBy, users[0].id);
    assert.equal(deleted.version, 2);
    assert.equal(deleted.plannedDepthM?.toString(), '12.5');
    const liveHoles = (await (await call(`${workPath}/furos`)).json()) as { total: number };
    assert.equal(liveHoles.total, 0);
    assert.deepEqual(await scoped.run(engineer, (tx) => tx.borehole.findMany()), []);
    await assert.rejects(
      scoped.run(a, (tx) =>
        tx.borehole.update({ where: { id: hole.id }, data: { code: 'FORBIDDEN-EDIT' } }),
      ),
    );
    await assert.rejects(scoped.run(a, (tx) => tx.borehole.delete({ where: { id: hole.id } })));
    assert.equal((await call(`${workPath}/furos`, 'POST', { code: 'sp-01' })).status, 409);
    assert.equal((await call(folderPath, 'DELETE', { version: 1 })).status, 200);
    await assert.rejects(
      scoped.run(a, (tx) =>
        tx.borehole.create({
          data: {
            code: 'UNAVAILABLE-PARENT',
            workId: work.id,
            tenantId: tenants[0],
            folderId: folder.id,
          },
        }),
      ),
    );
    assert.equal(
      (await call(`/lixeira/furos/${hole.id}/restaurar`, 'POST', { version: 2 })).status,
      409,
    );
    assert.equal((await call(workPath, 'DELETE', { version: 1 })).status, 200);
    assert.equal((await call(workPath)).status, 404);
    assert.equal((await call(`${workPath}/pastas`)).status, 404);
    assert.equal((await call(`${workPath}/pastas`, 'POST', { name: 'Blocked' })).status, 404);
    assert.equal(
      (await call(`/lixeira/pastas/${folder.id}/restaurar`, 'POST', { version: 2 })).status,
      409,
    );
    const trash = (await (await call('/lixeira?tipo=obras')).json()) as {
      total: number;
      items: Array<{ id: string }>;
    };
    assert.equal(trash.total, 1);
    assert.equal(trash.items[0].id, work.id);
    const foreign = (await (await call('/lixeira?tipo=obras', 'GET', undefined, 3)).json()) as {
      total: number;
    };
    assert.equal(foreign.total, 0);
    assert.equal(
      (await call(`/lixeira/obras/${work.id}/restaurar`, 'POST', { version: 2 }, 3)).status,
      404,
    );
    const restores = await Promise.all(
      [0, 1].map(() => call(`/lixeira/obras/${work.id}/restaurar`, 'POST', { version: 2 })),
    );
    assert.deepEqual(restores.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (await call(`/lixeira/pastas/${folder.id}/restaurar`, 'POST', { version: 2 })).status,
      200,
    );
    assert.equal(
      (await call(`/lixeira/furos/${hole.id}/restaurar`, 'POST', { version: 2 })).status,
      200,
    );
    const restored = await admin.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    assert.equal(restored.code, 'SP-01');
    assert.equal(restored.folderId, folder.id);
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.deletedBy, null);
    assert.equal(restored.version, 3);
    const empty = await admin.work.create({ data: { tenantId: tenants[0], name: 'Race work' } });
    const race = await Promise.all([
      call(`/obras/${empty.id}`, 'DELETE', { version: 1 }),
      call(`/obras/${empty.id}/pastas`, 'POST', { name: 'Concurrent folder' }),
    ]);
    assert.ok(
      [200, 404].every((status, i) => race[i].status === status) ||
        [409, 201].every((status, i) => race[i].status === status),
    );
    if ((await admin.work.findUniqueOrThrow({ where: { id: empty.id } })).deletedAt)
      assert.equal(await admin.folder.count({ where: { workId: empty.id, deletedAt: null } }), 0);
    const edits = await Promise.all([
      call(holePath, 'DELETE', { version: 3 }),
      call(holePath, 'PUT', {
        code: 'SP-EDIT',
        folderId: folder.id,
        plannedDepthM: '20.00',
        version: 3,
      }),
    ]);
    assert.equal(edits.filter((r) => r.status === 200).length, 1);
    assert.ok(edits.every((r) => [200, 404, 409].includes(r.status)));
    assert.deepEqual(await runtime.work.findMany(), []);
  } finally {
    await app.close();
    await admin.borehole.deleteMany({ where: { tenantId: { in: tenants } } });
    await admin.folder.deleteMany({ where: { tenantId: { in: tenants } } });
    await admin.work.deleteMany({ where: { tenantId: { in: tenants } } });
    const ids = users.map((u) => u.id);
    await admin.authSession.deleteMany({ where: { userId: { in: ids } } });
    await admin.membership.deleteMany({ where: { userId: { in: ids } } });
    await admin.user.deleteMany({ where: { id: { in: ids } } });
    await admin.tenant.deleteMany({ where: { id: { in: tenants } } });
    await runtime.$disconnect();
    await admin.$disconnect();
  }
});
