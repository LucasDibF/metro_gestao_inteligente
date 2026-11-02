import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';
import { DatabaseService } from '../../apps/api/src/database/database.service';

// One pooled connection forces context reuse between all tested transactions.
test('RLS denies missing/foreign context and never leaks context after commit or rollback', async () => {
  assert.ok(process.env.MIGRATION_DATABASE_URL);
  assert.ok(process.env.DATABASE_URL);
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 }),
  });
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
  });
  const scoped = new TenantDatabaseService(runtime);
  const suffix = crypto.randomUUID();
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  try {
    const [role] = await runtime.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);
    for (const label of ['a', 'b']) {
      const tenant = await admin.tenant.create({ data: { name: `E02 ${label} ${suffix}` } });
      tenantIds.push(tenant.id);
      const user = await admin.user.create({
        data: { email: `${label}-${suffix}@example.invalid`, passwordHash: 'TEST-ONLY-NO-LOGIN' },
      });
      userIds.push(user.id);
      await admin.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: 'ADMIN',
          additionalRoles: ['ENGINEER'],
        },
      });
    }
    const a = { tenantId: tenantIds[0], userId: userIds[0] };
    const b = { tenantId: tenantIds[1], userId: userIds[1] };
    assert.deepEqual(await runtime.tenant.findMany(), []);
    assert.deepEqual(await runtime.membership.findMany(), []);
    assert.deepEqual(await scoped.run(a, (tx) => tx.tenant.findMany({ select: { id: true } })), [
      { id: a.tenantId },
    ]);
    assert.deepEqual(
      await scoped.run(a, (tx) => tx.membership.findMany({ select: { userId: true } })),
      [{ userId: a.userId }],
    );
    assert.equal(
      await scoped.run(a, (tx) => tx.tenant.findUnique({ where: { id: b.tenantId } })),
      null,
    );
    assert.deepEqual(
      await scoped.run({ ...a, tenantId: b.tenantId }, (tx) => tx.tenant.findMany()),
      [],
    );
    assert.deepEqual(await runtime.tenant.findMany(), []);
    await assert.rejects(
      scoped.run(a, async (tx) => {
        assert.equal(await tx.tenant.count(), 1);
        throw new Error('Rollback context');
      }),
      /Rollback context/,
    );
    assert.deepEqual(await runtime.tenant.findMany(), []);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const context = i % 2 ? a : b;
        return scoped.run(context, async (tx) => {
          assert.deepEqual(await tx.tenant.findMany({ select: { id: true } }), [
            { id: context.tenantId },
          ]);
        });
      }),
    );
    assert.equal(results.length, 8);
    await assert.rejects(
      scoped.run(a, (tx) =>
        tx.tenant.update({ where: { id: b.tenantId }, data: { name: 'Forbidden' } }),
      ),
    );
    await admin.membership.update({ where: { tenantId_userId: a }, data: { active: false } });
    assert.deepEqual(await scoped.run(a, (tx) => tx.tenant.findMany()), []);
    await admin.membership.update({ where: { tenantId_userId: a }, data: { active: true } });
    await admin.user.update({ where: { id: a.userId }, data: { active: false } });
    assert.deepEqual(await scoped.run(a, (tx) => tx.tenant.findMany()), []);
    assert.deepEqual(await scoped.run(a, (tx) => tx.membership.findMany()), []);
    assert.deepEqual(await runtime.tenant.findMany(), []);
  } finally {
    await admin.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.user.deleteMany({ where: { id: { in: userIds } } });
    await admin.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await runtime.$disconnect();
    await admin.$disconnect();
  }
});

test('API rejects a superuser database connection', async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
  let db: DatabaseService | undefined;
  try {
    db = new DatabaseService();
    await assert.rejects(db.onModuleInit(), /without RLS bypass/);
  } finally {
    process.env.DATABASE_URL = previous;
    await db?.$disconnect();
  }
});
