import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';
import { SptService } from '../../apps/api/src/spt/spt.service';
import { parseSpt } from '../../apps/api/src/spt/spt-input';

test('combined metre save rolls back both records, preserves neighbouring soil and rejects stale edits', async () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const service = new SptService(new TenantDatabaseService(runtime));
  const tenant = await admin.tenant.create({ data: { name: 'Teste atômico por metro' } });
  const user = await admin.user.create({
    data: { email: crypto.randomUUID() + '@example.invalid', passwordHash: 'unused' },
  });
  const c = { tenantId: tenant.id, userId: user.id };
  let workId: string | undefined;
  try {
    await admin.membership.create({ data: { ...c, role: 'ENGINEER' } });
    const work = await admin.work.create({ data: { tenantId: tenant.id, name: 'Teste' } });
    workId = work.id;
    const hole = await admin.borehole.create({
      data: { tenantId: tenant.id, workId, code: 'SP-01', executedDepthM: '0.5' },
    });
    const soil = {
      soilType: 'Areia',
      description: 'Fina, marrom.',
      soilColor: 'Marrom',
      soilMoisture: 'Úmida',
    };
    // Partial soil intervals are valid. Force a storage failure after the SPT
    // insert to verify atomic rollback independently of terminal-depth rules.
    const rejected = parseSpt(
      {
        depthM: '0',
        advances: [{ blows: 1, penetrationMm: 10 }],
        soil,
        technicalVersion: hole.technicalVersion,
      },
      false,
    );
    rejected.soil!.soilType = 'x'.repeat(121); // Exceeds the database column limit.
    await assert.rejects(service.save(c, workId, hole.id, rejected));
    assert.equal(await admin.sptTest.count({ where: { boreholeId: hole.id } }), 0);
    assert.equal(await admin.soilLayer.count({ where: { boreholeId: hole.id } }), 0);
    assert.equal(
      (await admin.borehole.findUniqueOrThrow({ where: { id: hole.id } })).technicalVersion,
      hole.technicalVersion,
    );
    await admin.borehole.update({ where: { id: hole.id }, data: { executedDepthM: '5' } });
    await admin.soilLayer.create({
      data: {
        tenantId: tenant.id,
        workId,
        boreholeId: hole.id,
        fromM: '0',
        toM: '5',
        soilType: 'Argila',
        description: 'Descrição original.',
      },
    });
    const before = await service.list(c, workId, hole.id, 1);
    const input = {
      depthM: '3',
      advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
      soil,
      fieldDetails: { executionMethod: 'TH' },
      technicalVersion: before.technicalVersion,
    };
    const saved = await service.save(c, workId, hole.id, parseSpt(input, false));
    const layers = await admin.soilLayer.findMany({
      where: { boreholeId: hole.id },
      orderBy: { fromM: 'asc' },
    });
    assert.deepEqual(
      layers.map((l) => [String(l.fromM), String(l.toM), l.soilType, l.description]),
      [
        ['0', '2', 'Argila', 'Descrição original.'],
        ['2', '3', 'Areia', 'Fina, marrom.'],
        ['3', '5', 'Argila', 'Descrição original.'],
      ],
    );
    const state = await service.list(c, workId, hole.id, 1);
    assert.equal(state.items[0].soil[0].description, soil.description);
    assert.equal(state.items[0].soil[0].soilColor, 'Marrom');
    assert.equal(layers[0].soilColor, null);
    assert.equal(layers[2].soilColor, null);
    assert.deepEqual((await service.get(c, workId, hole.id, '3'))?.fieldDetails, {
      executionMethod: 'TH',
    });
    assert.equal(await service.get(c, workId, hole.id, '4'), null);
    const edits = await Promise.allSettled(
      [0, 1].map((i) =>
        service.save(
          c,
          workId!,
          hole.id,
          parseSpt(
            {
              ...input,
              technicalVersion: state.technicalVersion,
              version: saved.version,
              soil: { ...soil, description: 'Edição ' + i },
            },
            true,
          ),
          saved.id,
        ),
      ),
    );
    assert.equal(edits.filter((e) => e.status === 'fulfilled').length, 1);
    assert.equal(edits.filter((e) => e.status === 'rejected').length, 1);
    const updated = await admin.sptTest.findUniqueOrThrow({ where: { id: saved.id } });
    assert.equal(updated.version, 2);
    assert.equal(
      (await admin.borehole.findUniqueOrThrow({ where: { id: hole.id } })).reviewState,
      'DRAFT',
    );
    await assert.rejects(
      service.save(
        c,
        workId,
        hole.id,
        parseSpt({ ...input, version: updated.version }, true),
        saved.id,
      ),
    );
    assert.equal((await admin.sptTest.findUniqueOrThrow({ where: { id: saved.id } })).version, 2);
  } finally {
    if (workId) {
      await admin.technicalEvent.deleteMany({ where: { workId } });
      await admin.soilLayer.deleteMany({ where: { workId } });
      await admin.sptTest.deleteMany({ where: { workId } });
      await admin.borehole.deleteMany({ where: { workId } });
      await admin.work.delete({ where: { id: workId } });
    }
    await admin.membership.deleteMany({ where: { tenantId: tenant.id } });
    await admin.user.delete({ where: { id: user.id } });
    await admin.tenant.delete({ where: { id: tenant.id } });
    await runtime.$disconnect();
    await admin.$disconnect();
  }
});
