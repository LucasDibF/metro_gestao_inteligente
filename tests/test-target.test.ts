import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestTarget } from '../scripts/test-target';
test('test tooling refuses development or remote data targets and accepts the isolated local test environment', () => {
  const config = {
    DATABASE_URL: 'postgresql://runtime:local@localhost:55432/spt_test',
    MIGRATION_DATABASE_URL: 'postgresql://migration:local@localhost:55432/spt_test',
    WORKER_DATABASE_URL: 'postgresql://worker:local@localhost:55432/spt_test',
    S3_BUCKET: 'spt-test-private',
  };
  assert.doesNotThrow(() => assertTestTarget(config));
  assert.throws(() =>
    assertTestTarget({ ...config, DATABASE_URL: config.DATABASE_URL.replace('spt_test', 'spt') }),
  );
  assert.throws(() =>
    assertTestTarget({
      ...config,
      WORKER_DATABASE_URL: config.WORKER_DATABASE_URL.replace('localhost', 'remote.invalid'),
    }),
  );
  assert.throws(() => assertTestTarget({ ...config, S3_BUCKET: 'spt-private' }));
});
