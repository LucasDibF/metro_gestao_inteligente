import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
test('only administrators and commerce assign works; mobile and direct child access enforce assignments and revocation', async () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const tenant = await db.tenant.create({ data: { name: 'Mobile assignment test' } });
  const users: Array<{ id: string; email: string }> = [];
  const password = crypto.randomUUID();
  try {
    const hash = await hashPassword(password);
    for (const role of ['ADMIN', 'COMMERCIAL', 'OPERATOR', 'OPERATOR', 'ENGINEER'] as const) {
      const user = await db.user.create({
        data: { email: crypto.randomUUID() + '@example.invalid', passwordHash: hash },
      });
      users.push(user);
      await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role } });
    }
    const work = await db.work.create({ data: { tenantId: tenant.id, name: 'Assigned work' } });
    const hidden = await db.work.create({ data: { tenantId: tenant.id, name: 'Unassigned work' } });
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api/v1';
    const tokens = await Promise.all(
      users.map(async (user) => {
        const res = await fetch(base + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: tenant.id, email: user.email, password }),
        });
        assert.equal(res.status, 200);
        return (await res.json()).accessToken;
      }),
    );
    const call = (user: number, route: string, body?: unknown) =>
      fetch(base + route, {
        method: body ? 'PUT' : 'GET',
        headers: { Authorization: 'Bearer ' + tokens[user], 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const route = `/obras/${work.id}/equipe-campo`;
    assert.equal((await call(2, `/obras/${work.id}`)).status, 404);
    assert.equal((await call(2, `/obras/${work.id}/furos`)).status, 404);
    assert.equal((await call(4, route, { operatorId: users[2].id, version: 0 })).status, 403);
    assert.equal((await call(1, route, { operatorId: users[4].id, version: 0 })).status, 400);
    const assigned = await call(1, route, { operatorId: users[2].id, version: 0 });
    assert.equal(assigned.status, 200);
    const assignment = await assigned.json();
    assert.equal(assignment.version, 1);
    const own = await (await call(2, '/mobile/obras')).json();
    assert.deepEqual(
      own.items.map((w: { id: string }) => w.id),
      [work.id],
    );
    assert.deepEqual((await (await call(3, '/mobile/obras')).json()).items, []);
    assert.equal((await call(0, '/mobile/obras')).status, 403);
    assert.equal((await call(2, `/obras/${work.id}`)).status, 200);
    assert.equal((await call(2, `/obras/${hidden.id}/furos`)).status, 404);
    assert.equal((await call(2, route, { operatorId: users[3].id, version: 1 })).status, 403);
    assert.equal((await call(0, route, { operatorId: users[3].id, version: 0 })).status, 409);
    assert.equal((await call(0, route, { operatorId: null, version: 1 })).status, 200);
    assert.equal((await call(2, `/obras/${work.id}/furos`)).status, 404);
    assert.deepEqual((await (await call(2, '/mobile/obras')).json()).items, []);
  } finally {
    await app.close();
    await db.workAssignment.deleteMany({ where: { tenantId: tenant.id } });
    await db.work.deleteMany({ where: { tenantId: tenant.id } });
    await db.authSession.deleteMany({ where: { tenantId: tenant.id } });
    await db.membership.deleteMany({ where: { tenantId: tenant.id } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.tenant.delete({ where: { id: tenant.id } });
    await db.$disconnect();
  }
});
