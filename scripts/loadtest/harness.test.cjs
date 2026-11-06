const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summary, percentile } = require('./metrics.cjs');
test('business latency excludes fast 429, failed responses, timeouts and invalid success payloads', () => {
  const result = summary([
    { status: 200, valid: true, ms: 87 },
    { status: 429, valid: true, ms: 1 },
    { status: 500, valid: true, ms: 2 },
    { status: 0, valid: true, ms: 15000 },
    { status: 400, valid: true, ms: 3 },
    { status: 404, valid: true, ms: 3, expected: true },
    { status: 200, valid: false, ms: 4 },
  ]);
  assert.equal(result.requests, 7);
  assert.equal(result.successful, 1);
  assert.equal(result.p95Ms, 87);
  assert.equal(result.status429, 1);
  assert.equal(result.serverErrors, 1);
  assert.equal(result.clientErrors, 1);
  assert.equal(result.timeouts, 1);
  assert.equal(result.invalidResponses, 1);
});
test('nearest-rank percentiles preserve outliers and empty samples are not zero latency', () => {
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([50, 1, 2, 3, 4], 0.5), 3);
  assert.equal(percentile([50, 1, 2, 3, 4], 0.95), 50);
  assert.equal(percentile([50, 1, 2, 3, 4], 0.99), 50);
});
