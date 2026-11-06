import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { apiFixture, jpeg, type ApiFixture } from '../helpers/api-fixture';

const coordinate = {
  eastingM: '500000',
  northingM: '9400000',
  zone: 25,
  hemisphere: 'S',
  datum: 'SIRGAS2000',
  reference: 'Referência de campo',
};
const code = async (response: Response) => ((await response.json()) as { code?: string }).code;
const assign = (fx: ApiFixture, operatorId: string) =>
  fx.db.workAssignment.create({
    data: { tenantId: fx.tenantId, workId: fx.work.id, operatorId, assignedBy: operatorId },
  });

test('an operator with other roles needs an active assignment to write; reading stays open', async () => {
  const fx = await apiFixture([{ role: 'ADMIN', additionalRoles: ['OPERATOR'] }]);
  const [mixed] = fx.users;
  try {
    const hole = `/obras/${fx.work.id}/furos/${fx.hole.id}`;
    const metre = {
      depthM: '1',
      advances: [1, 2, 3].map((blows) => ({ blows, penetrationMm: 150 })),
    };
    const fields = { technicalVersion: 1, fieldDate: '2026-11-04', executedDepthM: '1' };
    const attempts = async () => [
      await fx.call(mixed, `${hole}/tecnico`, fields, 'PUT'),
      await fx.call(mixed, `${hole}/ensaios`, metre),
      await fx.call(mixed, `${hole}/arquivos/coordenadas/executada`, coordinate, 'PUT'),
      await fx.sendPhoto(mixed, `${hole}/arquivos/fotografias`, await jpeg('#203040'), {}),
      await fx.call(mixed, `${hole}/tecnico/enviar-revisao`, {
        technicalVersion: 1,
        note: 'Sem atribuição',
      }),
    ];
    for (const denied of await attempts()) {
      assert.equal(denied.status, 403);
      assert.equal(await code(denied), 'FIELD_EXECUTION_LOCKED');
    }
    assert.equal((await fx.call(mixed, `${hole}/tecnico`)).status, 200);
    assert.equal((await fx.call(mixed, `${hole}/arquivos`)).status, 200);
    assert.equal((await fx.call(mixed, `${hole}/ensaios`)).status, 200);

    await assign(fx, mixed.id);
    const allowed = await fx.call(mixed, `${hole}/tecnico`, fields, 'PUT');
    assert.equal(allowed.status, 200, await allowed.clone().text());
    const submit = await fx.call(mixed, `${hole}/tecnico/enviar-revisao`, {
      technicalVersion: 1,
      note: 'Com atribuição',
    });
    assert.notEqual(submit.status, 403, await submit.clone().text());

    await fx.db.workAssignment.update({ where: { workId: fx.work.id }, data: { active: false } });
    const inactive = await fx.call(mixed, `${hole}/tecnico`, fields, 'PUT');
    assert.equal(inactive.status, 403);
  } finally {
    await fx.close();
  }
});

test('only an engineer can make the planned coordinate official', async () => {
  const fx = await apiFixture([{ role: 'ENGINEER' }, { role: 'OPERATOR' }]);
  const [engineer, operator] = fx.users;
  try {
    await assign(fx, operator.id);
    const files = `/obras/${fx.work.id}/furos/${fx.hole.id}/arquivos`;
    const planned = await fx.call(engineer, `${files}/coordenadas/planejada`, coordinate, 'PUT');
    assert.equal(planned.status, 200, await planned.clone().text());
    const executed = await fx.call(operator, `${files}/coordenadas/executada`, coordinate, 'PUT');
    assert.equal(executed.status, 200, await executed.clone().text());
    const plannedId = ((await planned.json()) as { id: string }).id;
    const executedId = ((await executed.json()) as { id: string }).id;
    const version = async () =>
      (await fx.db.borehole.findUniqueOrThrow({ where: { id: fx.hole.id } })).technicalVersion;
    const choose = async (user: typeof engineer, coordinateId: string) =>
      fx.call(
        user,
        `${files}/coordenadas/oficial`,
        { coordinateId, technicalVersion: await version() },
        'PUT',
      );
    const denied = await choose(operator, plannedId);
    assert.equal(denied.status, 403);
    assert.equal(await code(denied), 'FIELD_EXECUTION_LOCKED');
    const hole = await fx.db.borehole.findUniqueOrThrow({ where: { id: fx.hole.id } });
    assert.equal(hole.officialCoordinateId, null);
    assert.equal((await choose(operator, executedId)).status, 200);
    assert.equal((await choose(engineer, plannedId)).status, 200);
  } finally {
    await fx.close();
  }
});

test('the reviewer name and registration reach engineers only', async () => {
  const fx = await apiFixture([
    { role: 'ENGINEER' },
    { role: 'OPERATOR' },
    { role: 'VIEWER' },
    { role: 'OPERATOR', additionalRoles: ['ENGINEER'] },
  ]);
  const [engineer, operator, viewer, combined] = fx.users;
  try {
    await assign(fx, operator.id);
    await fx.db.borehole.update({
      where: { id: fx.hole.id },
      data: { reviewerName: 'Revisora Fixture', reviewerRegistration: 'CREA-0000' },
    });
    const list = async (user: typeof engineer, route: string) => {
      const response = await fx.call(user, route);
      assert.equal(response.status, 200, await response.clone().text());
      const [hole] = ((await response.json()) as { items: Array<Record<string, unknown>> }).items;
      assert.equal(hole.id, fx.hole.id);
      assert.equal(hole.code, 'FX-01');
      return hole;
    };
    const hierarchy = `/obras/${fx.work.id}/furos`;
    const mobile = `/mobile/obras/${fx.work.id}/furos`;
    for (const hole of [
      await list(operator, hierarchy),
      await list(viewer, hierarchy),
      await list(operator, mobile),
    ]) {
      assert.ok(!('reviewerName' in hole));
      assert.ok(!('reviewerRegistration' in hole));
      assert.equal(hole.reviewState, 'DRAFT');
    }
    assert.equal((await list(engineer, hierarchy)).reviewerName, 'Revisora Fixture');
    assert.equal((await list(engineer, hierarchy)).reviewerRegistration, 'CREA-0000');
    await fx.db.workAssignment.update({
      where: { workId: fx.work.id },
      data: { operatorId: combined.id },
    });
    assert.equal((await list(combined, mobile)).reviewerName, 'Revisora Fixture');
  } finally {
    await fx.close();
  }
});

test('a hole ending at 10.45 m owes metres 1..10 at review; a gap in the middle still blocks', async () => {
  const fx = await apiFixture([{ role: 'ENGINEER' }]);
  const [engineer] = fx.users;
  try {
    const hole = `/obras/${fx.work.id}/furos/${fx.hole.id}`;
    const version = async () =>
      (await fx.db.borehole.findUniqueOrThrow({ where: { id: fx.hole.id } })).technicalVersion;
    const metre = async (depth: number) => {
      const saved = await fx.call(engineer, `${hole}/ensaios`, {
        depthM: String(depth),
        advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
      });
      assert.equal(saved.status, 201, await saved.clone().text());
    };
    for (const depth of [1, 2, 3, 4, 6, 7, 8, 9, 10]) await metre(depth);
    const fields = await fx.call(
      engineer,
      `${hole}/tecnico`,
      { technicalVersion: await version(), fieldDate: '2026-11-04', executedDepthM: '10.45' },
      'PUT',
    );
    assert.equal(fields.status, 200, await fields.clone().text());
    const layer = await fx.call(engineer, `${hole}/tecnico/camadas`, {
      fromM: '0',
      toM: '10.45',
      soilType: 'Argila arenosa',
    });
    assert.equal(layer.status, 201, await layer.clone().text());
    const submit = async () =>
      fx.call(engineer, `${hole}/tecnico/enviar-revisao`, {
        technicalVersion: await version(),
        note: 'Encerrado em 10,45 m',
      });
    const gap = await submit();
    assert.equal(gap.status, 400);
    const body = (await gap.json()) as { code: string; depths: string[] };
    assert.equal(body.code, 'SPT_METRES_MISSING');
    assert.deepEqual(body.depths, ['5']);
    await metre(5);
    const passed = await submit();
    assert.equal(passed.status, 201, await passed.clone().text());
    assert.equal(
      (await fx.db.borehole.findUniqueOrThrow({ where: { id: fx.hole.id } })).reviewState,
      'IN_REVIEW',
    );
  } finally {
    await fx.close();
  }
});

test('expected technical version is checked on mobile photo retry without a new random ID', async () => {
  const fx = await apiFixture([{ role: 'OPERATOR' }]);
  const [operator] = fx.users;
  try {
    await assign(fx, operator.id);
    const route = `/obras/${fx.work.id}/furos/${fx.hole.id}/mobile/fotografias`;
    const image = await jpeg('#304050');
    const operationId = randomUUID();
    const send = (version: string) =>
      fx.sendPhoto(operator, route, image, {
        operationId,
        caption: '',
        purpose: 'SITE',
        expectedTechnicalVersion: version,
      });
    assert.equal((await send('999')).status, 409);
    const first = await send('1');
    assert.equal(first.status, 201, await first.clone().text());
    const body = (await first.json()) as { result: { id: string } };
    assert.equal(body.result.id, operationId, 'the photo keeps the client operation ID');
  } finally {
    await fx.close();
  }
});
