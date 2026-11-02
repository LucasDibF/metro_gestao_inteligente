import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReviewData } from '../apps/api/src/technical/review-validation';
const hole = { fieldDate: new Date('2026-11-01'), executedDepthM: '7' };
const reading = {
  depthM: '7',
  advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
  result: { status: 'CONVENTIONAL' },
};
function code(operation: () => void, expected: string) {
  assert.throws(
    operation,
    (e: unknown) => (e as { getResponse(): { code: string } }).getResponse().code === expected,
  );
}
test('last metre remains within executed depth; penetration is not added twice', () => {
  assert.doesNotThrow(() => validateReviewData(hole, [reading], 1));
  assert.doesNotThrow(() =>
    validateReviewData(hole, [{ ...reading, result: { status: 'INTERRUPTED' } }], 1),
  );
  code(() => validateReviewData(hole, [{ ...reading, depthM: '8' }], 1), 'SPT_DEPTH_OUTSIDE');
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
