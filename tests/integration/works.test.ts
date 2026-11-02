import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { PrismaClient, MembershipRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';

test('works enforce tenant boundaries, database write roles, pagination and concurrent version checks', async () => {
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
  const password = 'Works integration password 123!';
  try {
    const hash = await hashPassword(password);
    for (let i = 0; i < 2; i++)
      tenantIds.push(
        (await admin.tenant.create({ data: { name: `Works ${crypto.randomUUID()}` } })).id,
      );
    for (const [i, role] of (
      ['ADMIN', 'ENGINEER', 'OPERATOR', 'VIEWER', 'ADMIN'] as MembershipRole[]
    ).entries()) {
      const user = await admin.user.create({
        data: { email: `${crypto.randomUUID()}@example.invalid`, passwordHash: hash },
      });
      const tenantId = tenantIds[i === 4 ? 1 : 0];
      users.push({ ...user, tenantId });
      await admin.membership.create({
        data: {
          userId: user.id,
          tenantId,
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
    const call = (path: string, index = 0, method = 'GET', body?: unknown) =>
      fetch(`${base}/obras${path}`, {
        method,
        headers: { Authorization: `Bearer ${tokens[index]}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal((await call('', 0, 'POST', { name: '   ' })).status, 400);
    assert.equal(
      (await call('', 0, 'POST', { name: 'Spoof', tenantId: tenantIds[1] })).status,
      400,
    );
    assert.equal((await call('', 0, 'POST', { name: 'Bad state', state: 'XX' })).status, 400);
    const created = await call('', 0, 'POST', {
      name: 'Obra de referência',
      clientName: 'Contratante',
      city: 'Goiânia',
      state: 'go',
    });
    assert.equal(created.status, 201);
    const work = (await created.json()) as {
      id: string;
      version: number;
      state: string;
      tenantId: string;
    };
    assert.equal(work.tenantId, tenantIds[0]);
    assert.equal(work.state, 'GO');
    for (const index of [1, 2, 3]) assert.equal((await call(`/${work.id}`, index)).status, 200);
    for (const index of [2, 3])
      assert.equal((await call('', index, 'POST', { name: 'Denied' })).status, 403);
    assert.equal((await call('', 1, 'POST', { name: 'Engineer work' })).status, 201);
    const foreign = await call(`/${work.id}`, 4);
    const missing = await call(`/${crypto.randomUUID()}`, 4);
    assert.equal(foreign.status, 404);
    assert.deepEqual(await foreign.json(), await missing.json());
    assert.equal(
      (await call(`/${work.id}`, 4, 'PUT', { name: 'Foreign', version: 1 })).status,
      404,
    );
    const attempts = await Promise.all(
      ['First edit', 'Second edit'].map((name) =>
        call(`/${work.id}`, 0, 'PUT', { name, version: work.version }),
      ),
    );
    assert.deepEqual(attempts.map((result) => result.status).sort(), [200, 409]);
    assert.equal((await admin.work.findUniqueOrThrow({ where: { id: work.id } })).version, 2);
    assert.equal((await call(`/${work.id}`, 0, 'PUT', { name: 'No version' })).status, 400);
    const a = { userId: users[0].id, tenantId: tenantIds[0] };
    const viewer = { userId: users[3].id, tenantId: tenantIds[0] };
    const b = { userId: users[4].id, tenantId: tenantIds[1] };
    assert.deepEqual(await runtime.work.findMany(), []);
    assert.deepEqual(await scoped.run(b, (tx) => tx.work.findMany()), []);
    await assert.rejects(
      scoped.run(viewer, (tx) =>
        tx.work.create({ data: { tenantId: tenantIds[0], name: 'Direct viewer write' } }),
      ),
    );
    await assert.rejects(
      scoped.run(a, (tx) =>
        tx.work.create({ data: { tenantId: tenantIds[1], name: 'Direct cross-tenant write' } }),
      ),
    );
    assert.equal(
      (
        await scoped.run(viewer, (tx) =>
          tx.work.updateMany({ where: { id: work.id }, data: { name: 'Denied' } }),
        )
      ).count,
      0,
    );
    for (let i = 0; i < 21; i++)
      await admin.work.create({ data: { tenantId: tenantIds[0], name: `Pagination ${i}` } });
    const first = (await (await call('')).json()) as { items: unknown[]; total: number };
    const second = (await (await call('?page=2')).json()) as { items: unknown[] };
    assert.equal(first.items.length, 20);
    assert.equal(first.total, 23);
    assert.equal(second.items.length, 3);
    const search = (await (await call('?q=Engineer')).json()) as { total: number };
    assert.equal(search.total, 1);
    assert.equal((await call('?page=0')).status, 400);
    await admin.membership.update({ where: { tenantId_userId: a }, data: { active: false } });
    assert.deepEqual(await scoped.run(a, (tx) => tx.work.findMany()), []);
    assert.deepEqual(await runtime.work.findMany(), []);
  } finally {
    await app.close();
    const ids = users.map((user) => user.id);
    await admin.work.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.authSession.deleteMany({ where: { userId: { in: ids } } });
    await admin.membership.deleteMany({ where: { userId: { in: ids } } });
    await admin.user.deleteMany({ where: { id: { in: ids } } });
    await admin.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await runtime.$disconnect();
    await admin.$disconnect();
  }
});
