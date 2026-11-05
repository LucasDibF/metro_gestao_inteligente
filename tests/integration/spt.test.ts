import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';

test('SPT saves raw data and server results, enforces roles/tenants and serializes revisions', async () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
  });
  const scoped = new TenantDatabaseService(runtime);
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const tenants: string[] = [];
  const users: Array<{ id: string; email: string; tenantId: string }> = [];
  const works: string[] = [];
  const holes: string[] = [];
  const password = 'SPT integration password 123!';
  try {
    const hash = await hashPassword(password);
    for (let i = 0; i < 2; i++) {
      const tenant = await admin.tenant.create({ data: { name: `SPT ${crypto.randomUUID()}` } });
      tenants.push(tenant.id);
      const work = await admin.work.create({ data: { name: 'SPT work', tenantId: tenant.id } });
      works.push(work.id);
      holes.push(
        (
          await admin.borehole.create({
            data: { tenantId: tenant.id, workId: work.id, code: 'SP-01' },
          })
        ).id,
      );
    }
    for (const [i, role] of (
      ['ADMIN', 'ENGINEER', 'OPERATOR', 'VIEWER', 'ADMIN'] as const
    ).entries()) {
      const user = await admin.user.create({
        data: { email: `${crypto.randomUUID()}@example.invalid`, passwordHash: hash },
      });
      const tenantId = tenants[i === 4 ? 1 : 0];
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
    await admin.workAssignment.create({
      data: {
        workId: works[0],
        tenantId: tenants[0],
        operatorId: users[2].id,
        assignedBy: users[0].id,
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
    const path = `/obras/${works[0]}/furos/${holes[0]}/ensaios`;
    const call = (suffix = '', body?: unknown, index = 0, method = body ? 'POST' : 'GET') =>
      fetch(base + path + suffix, {
        method,
        headers: { Authorization: `Bearer ${tokens[index]}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const input = {
      depthM: '1.00',
      advances: [
        { blows: 4, penetrationMm: 150 },
        { blows: 6, penetrationMm: 150 },
        { blows: 8, penetrationMm: 150 },
      ],
    };
    assert.equal((await call('', { ...input, nSpt: 999 })).status, 400);
    assert.equal((await call('', { ...input, depthM: '-1' })).status, 400);
    assert.equal((await call('', { ...input, depthM: '1.001' })).status, 400);
    assert.equal(
      (await call('', { ...input, advances: [{ blows: 1.5, penetrationMm: 150 }] })).status,
      400,
    );
    for (const i of [3]) assert.equal((await call('', input, i)).status, 403);
    assert.equal((await call('', undefined, 4)).status, 404);
    const created = await call('', input, 1);
    assert.equal(created.status, 201);
    const record = (await created.json()) as {
      id: string;
      version: number;
      engineVersion: string;
      result: { nSpt: number; status: string };
    };
    assert.equal(record.result.nSpt, 14);
    assert.equal(record.engineVersion, '0.1.0');
    const saved = await admin.sptTest.findUniqueOrThrow({ where: { id: record.id } });
    assert.deepEqual(saved.advances, input.advances);
    assert.equal(saved.createdBy, users[1].id);
    assert.equal((await admin.borehole.findUniqueOrThrow({ where: { id: holes[0] } })).version, 2);
    assert.equal((await call('', input)).status, 409);
    for (const i of [3]) assert.equal((await call('', undefined, i)).status, 200);
    const draft = await call('', { depthM: '2', advances: input.advances.slice(0, 2) });
    assert.equal(draft.status, 201);
    const draftData = (await draft.json()) as { result: { nSpt: null; status: string } };
    assert.equal(draftData.result.status, 'INCOMPLETE');
    assert.equal(draftData.result.nSpt, null);
    const interrupted = await call('', {
      ...input,
      depthM: '3',
      interruptionReason: 'Registro de campo',
    });
    assert.equal(interrupted.status, 201);
    assert.equal(((await interrupted.json()) as { result: { nSpt: null } }).result.nSpt, null);
    const partial = await call('', {
      depthM: '4',
      advances: [...input.advances.slice(0, 2), { blows: 8, penetrationMm: 100 }],
    });
    assert.equal(partial.status, 201);
    assert.equal(
      ((await partial.json()) as { result: { status: string } }).result.status,
      'REQUIRES_REVIEW',
    );
    const edits = await Promise.all(
      [10, 12].map((blows) =>
        call(
          `/${record.id}`,
          {
            ...input,
            advances: [...input.advances.slice(0, 2), { blows, penetrationMm: 150 }],
            version: 1,
          },
          0,
          'PUT',
        ),
      ),
    );
    assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
    const updated = await admin.sptTest.findUniqueOrThrow({ where: { id: record.id } });
    assert.equal(updated.version, 2);
    assert.equal(updated.updatedBy, users[0].id);
    assert.ok([16, 18].includes((updated.result as { nSpt: number }).nSpt));
    assert.deepEqual(await runtime.sptTest.findMany(), []);
    const foreignContext = { tenantId: tenants[1], userId: users[4].id };
    assert.equal((await scoped.run(foreignContext, (tx) => tx.sptTest.findMany())).length, 0);
    await assert.rejects(
      scoped.run({ tenantId: tenants[0], userId: users[3].id }, (tx) =>
        tx.sptTest.create({
          data: {
            tenantId: tenants[0],
            workId: works[0],
            boreholeId: holes[0],
            depthM: '5',
            advances: [],
            result: {},
            engineVersion: 'test',
            createdBy: users[3].id,
            updatedBy: users[3].id,
          },
        }),
      ),
    );
    await assert.rejects(
      scoped.run({ tenantId: tenants[0], userId: users[0].id }, (tx) =>
        tx.sptTest.create({
          data: {
            tenantId: tenants[0],
            workId: works[0],
            boreholeId: holes[1],
            depthM: '5',
            advances: [],
            result: {},
            engineVersion: 'test',
            createdBy: users[0].id,
            updatedBy: users[0].id,
          },
        }),
      ),
    );
    const hole = await admin.borehole.findUniqueOrThrow({ where: { id: holes[0] } });
    const deleted = await fetch(`${base}/obras/${works[0]}/furos/${holes[0]}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: hole.version }),
    });
    assert.equal(deleted.status, 200);
    assert.equal((await call()).status, 404);
    assert.equal((await call('', { ...input, depthM: '5' })).status, 404);
    assert.equal(await admin.sptTest.count({ where: { boreholeId: holes[0] } }), 4);
    assert.deepEqual(
      await scoped.run({ tenantId: tenants[0], userId: users[0].id }, (tx) =>
        tx.sptTest.findMany(),
      ),
      [],
    );
    const restored = await fetch(`${base}/lixeira/furos/${holes[0]}/restaurar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: hole.version + 1 }),
    });
    assert.equal(restored.status, 200);
    const list = (await (await call()).json()) as { total: number };
    assert.equal(list.total, 4);
  } finally {
    await app.close();
    await admin.sptTest.deleteMany({ where: { tenantId: { in: tenants } } });
    await admin.technicalEvent.deleteMany({ where: { tenantId: { in: tenants } } });
    await admin.borehole.deleteMany({ where: { tenantId: { in: tenants } } });
    await admin.workAssignment.deleteMany({ where: { tenantId: { in: tenants } } });
    await admin.work.deleteMany({ where: { id: { in: works } } });
    const ids = users.map((u) => u.id);
    await admin.authSession.deleteMany({ where: { userId: { in: ids } } });
    await admin.membership.deleteMany({ where: { userId: { in: ids } } });
    await admin.user.deleteMany({ where: { id: { in: ids } } });
    await admin.tenant.deleteMany({ where: { id: { in: tenants } } });
    await runtime.$disconnect();
    await admin.$disconnect();
  }
});
