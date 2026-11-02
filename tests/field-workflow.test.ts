import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpt } from '../apps/api/src/spt/spt-input';
import { fieldChecklist } from '../apps/api/src/technical/field-checklist';
test('structured measurements reject invented options and preserve measured zero', () => {
  const body = {
    depthM: '1',
    advances: [0, 1, 2].map((blows) => ({ blows, penetrationMm: 150 })),
    soil: { soilType: 'Areia', description: 'Fina.', soilColor: 'Marrom', soilMoisture: 'Úmida' },
    fieldDetails: { executionMethod: 'SP_TH', sampleRecovery: 'PARCIAL' },
    technicalVersion: 1,
  };
  const parsed = parseSpt(body, false);
  assert.equal(parsed.advances[0].blows, 0);
  assert.equal(parsed.soil?.soilColor, 'Marrom');
  assert.deepEqual(parsed.fieldDetails, { executionMethod: 'SP_TH', sampleRecovery: 'PARCIAL' });
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
