import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpt } from '../apps/api/src/spt/spt-input';
import { fieldChecklist } from '../apps/api/src/technical/field-checklist';
test('structured measurements reject invented options and preserve measured zero', () => {
  const body = {
    depthM: '1',
    advances: [0, 1, 2].map((blows) => ({ blows, penetrationMm: 150 })),
    soil: { soilType: 'Areia', description: 'Fina.', soilColor: 'Marrom', soilMoisture: 'Úmida' },
    fieldDetails: { executionMethod: 'SP_TH' },
    technicalVersion: 1,
  };
  const parsed = parseSpt(body, false);
  assert.equal(parsed.advances[0].blows, 0);
  assert.equal(parsed.soil?.soilColor, 'Marrom');
  assert.equal(parsed.soil?.soilMoisture, 'Úmida');
  assert.throws(() =>
    parseSpt(
      { ...body, fieldDetails: { executionMethod: 'SP_TH', sampleRecovery: 'PARCIAL' } },
      false,
    ),
  );
  assert.deepEqual(parsed.fieldDetails, { executionMethod: 'SP_TH' });
  assert.throws(() => parseSpt({ ...body, fieldDetails: { executionMethod: 'unknown' } }, false));
  assert.throws(() =>
    parseSpt({ ...body, soil: { ...body.soil, soilMoisture: 'invented' } }, false),
  );
});
test('field checklist distinguishes review blockers, issuance and recommendations', () => {
  const hole = {
    fieldDate: '2026-11-01',
    executedDepthM: '2',
    officialCoordinateId: null,
    reviewState: 'DRAFT',
    technicalVersion: 1,
    approvedVersion: null,
  };
  const tests = [
    { depthM: '1', advances: [], result: { status: 'NOT_TESTED' } },
    {
      depthM: '2',
      advances: [{ blows: 30, penetrationMm: 60 }],
      result: { status: 'INTERRUPTED' },
    },
  ];
  const items = fieldChecklist(hole, tests, [{ fromM: '0', toM: '2' }], 0);
  assert.ok(items.filter((i) => i.stage === 'review').every((i) => i.complete));
  assert.ok(items.filter((i) => i.stage === 'issue').every((i) => !i.complete));
  assert.equal(items.find((i) => i.id === 'photos')?.stage, 'recommended');
  assert.equal(
    fieldChecklist(hole, tests, [{ fromM: '1', toM: '2' }], 0).find((i) => i.id === 'soil')
      ?.complete,
    false,
  );
});

test('first metre stores only soil without inventing blows or NSPT; description is optional', () => {
  const input = {
    depthM: '1',
    recordType: 'INITIAL_SOIL',
    advances: [],
    soil: { soilType: 'Argila', soilColor: 'Marrom' },
    technicalVersion: 1,
  };
  const result = parseSpt(input, false);
  assert.equal(result.result.status, 'NOT_TESTED');
  assert.equal(result.result.nSpt, null);
  assert.deepEqual(result.advances, []);
  assert.equal(result.soil?.description, '');
  assert.throws(() => parseSpt({ ...input, depthM: '2' }, false));
  assert.throws(() => parseSpt({ ...input, advances: [{ blows: 1, penetrationMm: 150 }] }, false));
  const checks = fieldChecklist(
    {
      fieldDate: '2026-11-02',
      executedDepthM: '1',
      officialCoordinateId: null,
      reviewState: 'DRAFT',
      technicalVersion: 1,
      approvedVersion: null,
    },
    [{ depthM: '1', advances: [], result: result.result }],
    [{ fromM: '0', toM: '1' }],
    0,
  );
  assert.ok(checks.filter((c) => c.stage === 'review').every((c) => c.complete));
});

test('field checklist flags metres without a record and accepts interruption without advances', () => {
  const hole = {
    fieldDate: '2026-11-01',
    executedDepthM: '3',
    officialCoordinateId: null,
    reviewState: 'DRAFT',
    technicalVersion: 1,
    approvedVersion: null,
  };
  const layers = [{ fromM: '0', toM: '3' }];
  const interrupted = { advances: [], result: { status: 'INTERRUPTED' } };
  const item = (depths: number[], id: string) =>
    fieldChecklist(
      hole,
      depths.map((d) => ({ ...interrupted, depthM: String(d) })),
      layers,
      0,
    ).find((i) => i.id === id)?.complete;
  assert.equal(item([1, 3], 'metres'), false);
  assert.equal(item([1, 2, 3], 'metres'), true);
  assert.equal(item([1, 2, 3], 'advances'), true);
});
