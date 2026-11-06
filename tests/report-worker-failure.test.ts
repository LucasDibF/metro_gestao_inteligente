import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { processNextReport } from '../apps/worker/src/report-worker';

/** A database stand-in that hands out one job with a tampered snapshot and fails to record the failure. */
function brokenDatabase(calls: string[]): PrismaClient {
  const job = {
    id: '3f2b8c1e-9d4a-4b6f-8e2a-1c5d7f9b0a3e',
    tenantId: '0b5e7a2c-4d1f-4c3a-9e8b-2f6d1a7c5e90',
    workId: '6c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    reportId: '7d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a',
    leaseToken: '8e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
    snapshot: { schemaVersion: 1, holes: [], photos: [] },
    snapshotHash: 'not-the-hash',
    attempts: 1,
  };
  const database = {
    $queryRaw(strings: TemplateStringsArray): Promise<unknown> {
      const sql = strings.join('?');
      calls.push(
        sql.includes('claim_report_job') ? 'claim' : sql.includes('fail_report_job') ? 'fail' : sql,
      );
      if (sql.includes('claim_report_job')) return Promise.resolve([{ job }]);
      calls.push('fail-error');
      return Promise.reject(new Error('database unavailable'));
    },
  };
  return database as unknown as PrismaClient;
}

test('a report failure is logged even when recording it in the database fails', async (t) => {
  const calls: string[] = [];
  const logged: string[] = [];
  t.mock.method(console, 'error', (line: string) => {
    calls.push('log');
    logged.push(line);
  });
  await assert.rejects(processNextReport(brokenDatabase(calls)), /database unavailable/);
  assert.deepEqual(calls, ['claim', 'log', 'fail', 'fail-error']);
  const entry = JSON.parse(logged[0]) as Record<string, unknown>;
  assert.equal(entry.event, 'report_job_failed');
  assert.equal(entry.reason, 'Invalid snapshot');
  assert.equal(entry.permanent, true);
  assert.equal(entry.jobId, '3f2b8c1e-9d4a-4b6f-8e2a-1c5d7f9b0a3e');
});
