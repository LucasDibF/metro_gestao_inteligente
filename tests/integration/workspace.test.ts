import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';
import { WorkspaceService } from '../../apps/api/src/workspace/workspace.service';
import { WorksService } from '../../apps/api/src/works/works.service';
test('workspace scopes reports, review notifications and per-user receipts to active company records', async () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const database = new TenantDatabaseService(runtime),
    service = new WorkspaceService(database),
    works = new WorksService(database);
  const tenants: string[] = [],
    users: string[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const t = await admin.tenant.create({ data: { name: 'Workspace test' } });
      tenants.push(t.id);
      for (let j = 0; j < 2; j++) {
        const u = await admin.user.create({
          data: { email: crypto.randomUUID() + '@example.invalid', passwordHash: 'unused' },
        });
        users.push(u.id);
        await admin.membership.create({
          data: {
            tenantId: t.id,
            userId: u.id,
            role: j === 0 ? 'ADMIN' : 'VIEWER',
            additionalRoles: j === 0 ? ['ENGINEER'] : [],
          },
        });
      }
      const w = await admin.work.create({
        data: { tenantId: t.id, name: 'Obra workspace ' + i, clientName: 'Contratante sintético' },
      });
      const b = await admin.borehole.create({
        data: { tenantId: t.id, workId: w.id, code: 'SP-01' },
      });
      await admin.technicalEvent.create({
        data: {
          tenantId: t.id,
          workId: w.id,
          boreholeId: b.id,
          actorId: users[i * 2],
          technicalVersion: 1,
          action: 'REVIEW_REJECT',
        },
      });
      await admin.report.create({
        data: {
          tenantId: t.id,
          workId: w.id,
          title: 'Composição ' + i,
          composition: { holeIds: [b.id], photoIds: [], showOtherBoreholes: false },
        },
      });
    }
    const c = { tenantId: tenants[0], userId: users[0] },
      other = { tenantId: tenants[1], userId: users[2] },
      viewer = { tenantId: tenants[0], userId: users[1] };
    assert.equal((await service.summary(c)).total, 1);
    assert.equal((await service.summary(c)).counts.IN_FIELD, 1);
    assert.equal((await works.list(c, 1, '', 'IN_FIELD')).total, 1);
    assert.equal((await works.list(c, 1, '', 'APPROVED')).total, 0);
    const reports = await service.reports(c, 1, 'workspace', 'UNISSUED');
    assert.equal(reports.total, 1);
    assert.equal(reports.items[0].title, 'Composição 0');
    assert.equal((await service.reports(c, 1, 'Composição 1', '')).total, 0);
    const activity = await service.activity(c);
    assert.equal(activity.items.length, 1);
    assert.equal(activity.items[0].read, false);
    await service.read(viewer, { keys: [activity.items[0].key] });
    assert.equal((await service.activity(viewer)).items[0].read, true);
    assert.equal((await service.activity(c)).items[0].read, false);
    await service.read(c, { keys: [activity.items[0].key] });
    await service.read(c, { keys: [activity.items[0].key] });
    assert.equal((await service.activity(c)).items[0].read, true);
    const foreign = (await service.activity(other)).items[0].key;
    await assert.rejects(service.read(c, { keys: [foreign] }));
    const rows = await database.run(c, (tx) => tx.notificationRead.findMany());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].userId, c.userId);
  } finally {
    const where = { tenantId: { in: tenants } };
    await admin.notificationRead.deleteMany({ where });
    await admin.report.deleteMany({ where });
    await admin.technicalEvent.deleteMany({ where });
    await admin.borehole.deleteMany({ where });
    await admin.work.deleteMany({ where });
    await admin.membership.deleteMany({ where });
    await admin.user.deleteMany({ where: { id: { in: users } } });
    await admin.tenant.deleteMany({ where: { id: { in: tenants } } });
    await runtime.$disconnect();
    await admin.$disconnect();
  }
});
