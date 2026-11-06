import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  downloadIssuePdf,
  pdfUrlLifetimeMs,
  saveBlobAs,
  type BlobSaver,
} from '../apps/web/src/reports/pdf-download';

interface SaverLog {
  saver: BlobSaver;
  events: string[];
  pending: Array<{ task: () => void; delayMs: number }>;
}

function recordingSaver(): SaverLog {
  const events: string[] = [];
  const pending: SaverLog['pending'] = [];
  return {
    events,
    pending,
    saver: {
      createObjectURL: () => {
        events.push('create');
        return 'blob:pdf';
      },
      revokeObjectURL: (url) => events.push('revoke ' + url),
      clickLink: (url, fileName) => events.push(`click ${url} ${fileName}`),
      schedule: (task, delayMs) => {
        pending.push({ task, delayMs });
      },
    },
  };
}

test('saved PDF keeps its blob URL for 30 seconds before revoking it', () => {
  const log = recordingSaver();
  saveBlobAs(new Blob(['%PDF']), 'sondagem-emissao-3.pdf', log.saver);
  assert.deepEqual(log.events, ['create', 'click blob:pdf sondagem-emissao-3.pdf']);
  assert.equal(pdfUrlLifetimeMs, 30_000);
  assert.deepEqual(
    log.pending.map((entry) => entry.delayMs),
    [30_000],
  );
  log.pending[0].task();
  assert.deepEqual(log.events.at(-1), 'revoke blob:pdf');
});

test('issue PDF is requested with a long deadline and saved under its issue number', async () => {
  const log = recordingSaver();
  const requests: Array<{ path: string; signal: AbortSignal | null | undefined }> = [];
  const client = {
    request: async <T>(
      path: string,
      init: RequestInit = {},
      read?: (response: Response) => Promise<T>,
    ): Promise<T> => {
      requests.push({ path, signal: init.signal });
      assert.ok(read, 'the PDF must be read as a blob');
      return read(new Response('%PDF'));
    },
  };
  await downloadIssuePdf(
    { workId: 'work-1', reportId: 'report-2', issueId: 'issue-3', issueNumber: 7 },
    { client, saver: log.saver },
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/obras/work-1/relatorios/report-2/emissoes/issue-3/pdf');
  assert.ok(requests[0].signal instanceof AbortSignal);
  assert.equal(requests[0].signal.aborted, false);
  assert.deepEqual(log.events, ['create', 'click blob:pdf sondagem-emissao-7.pdf']);
  assert.equal(log.pending[0].delayMs, 30_000);
});

test('failed PDF request does not create a download link', async () => {
  const log = recordingSaver();
  const client = {
    request: async <T>(): Promise<T> => {
      throw new Error('Este registro não está disponível na sua empresa.');
    },
  };
  await assert.rejects(
    downloadIssuePdf(
      { workId: 'work-1', reportId: 'report-2', issueId: 'issue-3', issueNumber: 1 },
      { client, saver: log.saver },
    ),
    /não está disponível/,
  );
  assert.deepEqual(log.events, []);
  assert.deepEqual(log.pending, []);
});
