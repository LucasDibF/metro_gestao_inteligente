import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  curveValue,
  displayDepth,
  graphMaximum,
  profileExtent,
  sampleBand,
} from '../apps/web/src/spt/sheet/profile-model';
import type { SheetData, SheetTest } from '../apps/web/src/spt/sheet/types';
const reading = (depthM: string, blows: number[]): SheetTest => ({
  id: depthM,
  depthM,
  advances: blows.map((blows) => ({ blows, penetrationMm: 150 })),
  result: { nSpt: blows[1] + blows[2], status: 'CONVENTIONAL' },
  interruptionReason: null,
  fieldDetails: null,
  version: 1,
  engineVersion: '0.1.0',
});
test('analysis plots conventional raw sums including zero without extrapolating partial or interrupted results', () => {
  const test = reading('1', [4, 6, 8]);
  assert.equal(curveValue(test, 0), 10);
  assert.equal(curveValue(test, 1), 14);
  assert.equal(curveValue(reading('2', [0, 0, 0]), 1), 0);
  assert.equal(curveValue({ ...test, interruptionReason: 'Interrupção de campo' }, 1), null);
  assert.equal(
    curveValue(
      {
        ...test,
        advances: [{ blows: 30, penetrationMm: 60 }],
        result: { nSpt: null, status: 'REQUIRES_REVIEW' },
      },
      0,
    ),
    null,
  );
  assert.equal(graphMaximum([reading('1', [90, 90, 90])]), 180);
});
test('analysis range and terminal marker follow physical termination rather than deeper nominal rows or layer bounds', () => {
  const test = reading('7', [30]);
  const data = {
    termination: { depth: 6.14, row: 7, partial: true },
    tests: [test],
    layers: [{ toM: '20' }],
  } as SheetData;
  assert.equal(profileExtent(data), 6.14);
  assert.equal(displayDepth(test, data), 6.14);
  assert.equal(displayDepth(reading('6', [1, 2, 3]), data), 6);
});

test('metre rows occupy the same geological intervals, including clipped continuation windows', () => {
  assert.deepEqual(sampleBand(1, 0, 20), { from: 0, to: 1, center: 0.5 });
  assert.deepEqual(sampleBand(2, 0, 20), { from: 1, to: 2, center: 1.5 });
  assert.deepEqual(sampleBand(21, 20, 40), { from: 20, to: 21, center: 20.5 });
  assert.deepEqual(sampleBand(20.5, 20, 40), { from: 20, to: 20.5, center: 20.25 });
  assert.deepEqual(sampleBand(0, 0, 20), { from: 0, to: 0, center: 0 });
});
