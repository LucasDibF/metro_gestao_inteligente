import assert from 'node:assert/strict';

/** Same rule as scripts/test-target.ts: an isolated `*_test` database, or `spt` in CI. */
export function assertTestDatabase(name: string): void {
  assert.ok(
    /_test$/.test(name) || (Boolean(process.env.CI) && name === 'spt'),
    'Test database required',
  );
}
