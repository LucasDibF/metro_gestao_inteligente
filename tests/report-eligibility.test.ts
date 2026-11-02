import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReportEligibility } from '../apps/api/src/reports/report-eligibility';
const hole = {
  code: 'SP 01',
  reviewState: 'APPROVED',
  technicalVersion: 10,
  approvedVersion: 10,
  officialCoordinateId: null,
};
function expectCode(run: () => void, code: string) {
  assert.throws(
    run,
    (e: unknown) => (e as { getResponse(): { code: string } }).getResponse().code === code,
  );
}
test('approved holes without official coordinates get the coordinate-specific error', () => {
  expectCode(() => validateReportEligibility([hole], 1), 'REPORT_COORDINATES_REQUIRED');
  assert.doesNotThrow(() =>
    validateReportEligibility([{ ...hole, officialCoordinateId: 'coordinate' }], 1),
  );
});
test('report distinguishes stale approval and unavailable selected holes', () => {
  expectCode(
    () => validateReportEligibility([{ ...hole, approvedVersion: 9 }], 1),
    'REPORT_NOT_APPROVED',
  );
  expectCode(() => validateReportEligibility([], 1), 'REPORT_HOLE_UNAVAILABLE');
});
