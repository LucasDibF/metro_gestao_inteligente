import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingMetres, validateReviewData } from '../apps/api/src/technical/review-validation';
const hole = { fieldDate: new Date('2026-11-01'), executedDepthM: '7' };
const reading = {
  depthM: '7',
  advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
  result: { status: 'CONVENTIONAL' },
};
const rowsUpTo = (last: number, base: Record<string, unknown> = reading) =>
  Array.from({ length: last - 1 }, (_, i) => ({ ...reading, ...base, depthM: String(i + 1) }));
const full = [...rowsUpTo(7), reading];
function code(operation: () => void, expected: string) {
  assert.throws(
    operation,
    (e: unknown) => (e as { getResponse(): { code: string } }).getResponse().code === expected,
  );
}
test('last metre remains within executed depth; penetration is not added twice', () => {
  assert.doesNotThrow(() => validateReviewData(hole, full, 1));
  assert.doesNotThrow(() =>
    validateReviewData(
      hole,
      [...rowsUpTo(7), { ...reading, result: { status: 'INTERRUPTED' } }],
      1,
    ),
  );
  code(
    () => validateReviewData(hole, [...full, { ...reading, depthM: '8' }], 1),
    'SPT_DEPTH_OUTSIDE',
  );
});
test('review reports the actual missing field and identifies the incomplete metre', () => {
  code(() => validateReviewData({ ...hole, fieldDate: null }, [reading], 1), 'FIELD_DATE_REQUIRED');
  code(
    () => validateReviewData({ ...hole, executedDepthM: null }, [reading], 1),
    'EXECUTED_DEPTH_REQUIRED',
  );
  code(() => validateReviewData(hole, [], 1), 'SPT_REQUIRED');
  code(() => validateReviewData(hole, [reading], 0), 'SOIL_DESCRIPTION_REQUIRED');
  assert.throws(
    () => validateReviewData(hole, [{ ...reading, result: { status: 'INCOMPLETE' } }], 1),
    (e: unknown) => {
      const body = (e as { getResponse(): { code: string; depths: string[] } }).getResponse();
      return body.code === 'SPT_READINGS_INCOMPLETE' && body.depths[0] === '7';
    },
  );
});

test('physical terminal depth permits row 5 at 4.12 m without inventing N-SPT', () => {
  const terminal = {
    depthM: '5',
    advances: [{ blows: 30, penetrationMm: 120 }],
    result: { status: 'INTERRUPTED', nSpt: null },
    interruptionReason: 'Encerrado',
  };
  assert.doesNotThrow(() =>
    validateReviewData({ ...hole, executedDepthM: '4.12' }, [...rowsUpTo(5), terminal], 1),
  );
  code(
    () => validateReviewData({ ...hole, executedDepthM: '4.11' }, [terminal], 1),
    'SPT_DEPTH_OUTSIDE',
  );
});

test('review names every metre without a record up to the executed depth', () => {
  const at = (...depths: number[]) => depths.map((d) => ({ ...reading, depthM: String(d) }));
  assert.throws(
    () => validateReviewData({ ...hole, executedDepthM: '20' }, at(2, 5), 1),
    (e: unknown) => {
      const body = (e as { getResponse(): { code: string; depths: string[] } }).getResponse();
      return (
        body.code === 'SPT_METRES_MISSING' &&
        body.depths.join() === [1, 3, 4, ...Array.from({ length: 15 }, (_, i) => i + 6)].join()
      );
    },
  );
  assert.deepEqual(missingMetres('3', at(1, 2, 3)), []);
});

test('a hole ending inside a metre owes only its whole metres; a gap in the middle still blocks', () => {
  const at = (...depths: number[]) => depths.map((d) => ({ ...reading, depthM: String(d) }));
  const upTo = (last: number) => at(...Array.from({ length: last }, (_, i) => i + 1));
  assert.deepEqual(missingMetres('10.45', upTo(10)), []);
  assert.deepEqual(missingMetres('10.45', upTo(9)), ['10']);
  assert.deepEqual(missingMetres('10.45', at(1, 2, 3)), ['4', '5', '6', '7', '8', '9', '10']);
  assert.deepEqual(missingMetres('4.12', upTo(4)), []);
  assert.deepEqual(missingMetres('4.12', upTo(5)), [], 'a partial row 5 stays accepted');
  assert.deepEqual(missingMetres('4.12', at(1, 2, 3)), ['4']);
  assert.deepEqual(missingMetres('4.12', at(1, 2, 4)), ['3'], 'a gap in the middle stays blocked');
  assert.deepEqual(missingMetres('4.12', at(1, 2, 3, 5)), ['4'], 'a gap before the partial row');
  assert.deepEqual(missingMetres('0.45', []), []);
});

test('a metre interrupted without advances counts as a record; zero blows stay for human review', () => {
  const interrupted = {
    depthM: '7',
    advances: [],
    result: { status: 'INTERRUPTED', nSpt: null },
  };
  assert.doesNotThrow(() => validateReviewData(hole, [...rowsUpTo(7), interrupted], 1));
  const zero = {
    depthM: '7',
    advances: [0, 0, 0].map((blows) => ({ blows, penetrationMm: 150 })),
    result: { status: 'REQUIRES_REVIEW', nSpt: null },
  };
  assert.doesNotThrow(() => validateReviewData(hole, [...rowsUpTo(7), zero], 1));
});
