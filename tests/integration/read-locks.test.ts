import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../apps/api/src/database/database.service';
import { TenantDatabaseService } from '../../apps/api/src/database/tenant-database.service';
import {
  clientFailure,
  SafeExceptionFilter,
} from '../../apps/api/src/operations/http-observability';
import { apiFixture } from '../helpers/api-fixture';

function withEnv(values: Record<string, string>): () => void {
  const saved = Object.keys(values).map((key) => [key, process.env[key]] as const);
  Object.assign(process.env, values);
  return () => {
    for (const [key, value] of saved)
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  };
}

test('reads pass a held work lock; writes wait, then fail with 503 at lock_timeout', async () => {
  const restore = withEnv({ DATABASE_LOCK_TIMEOUT_MS: '500', INPE_MAP_ENABLED: 'false' });
  const fx = await apiFixture(
    [
      { role: 'ENGINEER' },
      { role: 'OPERATOR' },
      { role: 'OPERATOR' },
      { role: 'ADMIN', additionalRoles: ['OPERATOR'] },
    ],
    (app) => app.useGlobalFilters(new SafeExceptionFilter()),
  );
  const [engineer, assigned, unassigned, administrator] = fx.users;
  let release = () => {};
  let holder: Promise<unknown> | undefined;
  try {
    await fx.db.workAssignment.create({
      data: {
        tenantId: fx.tenantId,
        workId: fx.work.id,
        operatorId: assigned.id,
        assignedBy: engineer.id,
      },
    });
    const work = `/obras/${fx.work.id}`;
    const hole = `${work}/furos/${fx.hole.id}`;
    const report = await fx.call(engineer, `${work}/relatorios`, {
      title: 'Bloqueio',
      notes: '',
      holeIds: [fx.hole.id],
      photoIds: [],
      showOtherBoreholes: false,
    });
    assert.equal(report.status, 201, await report.clone().text());
    const reportId = ((await report.json()) as { id: string }).id;
    const reportRoute = `${work}/relatorios/${reportId}`;

    const held = new Promise<void>((resolve) => {
      holder = fx.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM works WHERE id=${fx.work.id}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM boreholes WHERE id=${fx.hole.id}::uuid FOR UPDATE`;
          resolve();
          await new Promise<void>((done) => (release = done));
        },
        { timeout: 60000 },
      );
    });
    await held;

    const reads = [
      `${work}/pastas`,
      `${work}/furos`,
      `${work}/relatorios`,
      `${work}/relatorios/opcoes`,
      `${reportRoute}/emissoes`,
      `${reportRoute}/croqui`,
      `${hole}/tecnico`,
      `${hole}/tecnico/analise`,
      `${hole}/tecnico/folha`,
      `${hole}/ensaios`,
      `${hole}/ensaios/metro?depth=1`,
      `${hole}/arquivos`,
    ];
    for (const route of reads) {
      const response = await fx.call(engineer, route);
      assert.equal(response.status, 200, route + ' ' + (await response.clone().text()));
    }
    const team = await fx.call(administrator, `${work}/equipe-campo`);
    assert.equal(team.status, 200, await team.clone().text());
    const mobile = await fx.call(assigned, `${hole}/mobile/snapshot`);
    assert.equal(mobile.status, 200, await mobile.clone().text());
    const receipt = await fx.call(assigned, `${hole}/mobile/operacoes/${randomUUID()}`);
    assert.equal(receipt.status, 200);

    // The read path keeps checking visibility.
    assert.equal((await fx.call(unassigned, `${hole}/tecnico`)).status, 404);
    assert.equal((await fx.call(unassigned, `${work}/furos`)).status, 404);
    assert.equal((await fx.call(engineer, `/obras/${randomUUID()}/furos`)).status, 404);

    // issue and saveMap stay serialized by the work lock.
    const writes = [
      fx.call(engineer, `${reportRoute}/emissoes`, { version: 1, idempotencyKey: randomUUID() }),
      fx.call(
        engineer,
        `${reportRoute}/croqui`,
        { version: 1, view: { centerX: 500000, centerY: 9400000, spanM: 100 } },
        'PUT',
      ),
      fx.call(engineer, `${hole}/tecnico`, { technicalVersion: 1 }, 'PUT'),
    ];
    for (const response of await Promise.all(writes)) {
      assert.equal(response.status, 503, await response.clone().text());
      assert.deepEqual(await response.json(), {
        code: 'DATABASE_BUSY',
        message: 'Service busy; try again',
      });
    }
    release();
    await holder;
    const free = await fx.call(engineer, `${hole}/tecnico`, { technicalVersion: 1 }, 'PUT');
    assert.equal(free.status, 200, await free.clone().text());
  } finally {
    release();
    await holder?.catch(() => undefined);
    await fx.close();
    restore();
  }
});

test('pool size, maxWait and lock_timeout come from the environment', async () => {
  const restore = withEnv({
    DATABASE_POOL_MAX: '1',
    DATABASE_POOL_MAX_WAIT_MS: '100',
    DATABASE_LOCK_TIMEOUT_MS: '1234',
  });
  const fx = await apiFixture([{ role: 'ENGINEER' }]);
  const db = new DatabaseService();
  const tenants = new TenantDatabaseService(db);
  const context = { userId: fx.users[0].id, tenantId: fx.tenantId };
  let release = () => {};
  let holder: Promise<unknown> | undefined;
  try {
    const [setting] = await tenants.run(
      context,
      (tx) =>
        tx.$queryRaw<Array<{ value: string }>>`SELECT current_setting('lock_timeout') AS value`,
    );
    assert.equal(setting.value, '1234ms');
    // A second transaction cannot get the only connection and gives up after maxWait.
    await new Promise<void>((resolve) => {
      holder = tenants.run(context, async () => {
        resolve();
        await new Promise<void>((done) => (release = done));
      });
    });
    const started = Date.now();
    await assert.rejects(
      tenants.run(context, async () => undefined),
      (error: unknown) => {
        assert.deepEqual(clientFailure(error)?.status, 503);
        assert.equal((error as { code?: string }).code, 'P2028');
        return true;
      },
    );
    assert.ok(Date.now() - started < 4000, 'must honour maxWait, not the Prisma default path');
  } finally {
    release();
    await holder?.catch(() => undefined);
    await db.$disconnect();
    await fx.close();
    restore();
  }
});
