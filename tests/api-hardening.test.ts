import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrivateStorage, StorageUnavailableError } from '@spt/private-storage';
import { poolSettings } from '../apps/api/src/database/pool-settings';
import { loopbackRequest } from '../apps/api/src/auth/development-access';
import { closePrivateStorage, privateStorage } from '../apps/api/src/files/shared-storage';
import { trustProxyHops } from '../apps/api/src/operations/http-setup';
import { clientFailure, SafeExceptionFilter } from '../apps/api/src/operations/http-observability';
import { ReportsService } from '../apps/api/src/reports/reports.service';
import { TechnicalService } from '../apps/api/src/technical/technical.service';
import type { TenantDatabaseService } from '../apps/api/src/database/tenant-database.service';
import { boreholeSelectFor } from '../apps/api/src/works/borehole-select';
import { runQueueLoops } from '../apps/worker/src/queue-loop';

const known = (code: string, originalCode?: string) =>
  new Prisma.PrismaClientKnownRequestError('private detail', {
    code,
    clientVersion: 'test',
    meta: originalCode ? { driverAdapterError: { cause: { originalCode } } } : {},
  });
const context = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
};
const project = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

test('pool settings use safe defaults and ignore invalid values', () => {
  assert.deepEqual(poolSettings({}), { max: 20, maxWaitMs: 5000, lockTimeoutMs: 5000 });
  assert.deepEqual(
    poolSettings({
      DATABASE_POOL_MAX: '7',
      DATABASE_POOL_MAX_WAIT_MS: '250',
      DATABASE_LOCK_TIMEOUT_MS: '900',
    }),
    { max: 7, maxWaitMs: 250, lockTimeoutMs: 900 },
  );
  for (const invalid of ['', '0', '-3', 'many', '1.5'])
    assert.equal(poolSettings({ DATABASE_POOL_MAX: invalid }).max, 20);
});

test('trust proxy accepts only a numeric hop count and defaults to none', () => {
  assert.equal(trustProxyHops('1'), 1);
  assert.equal(trustProxyHops('0'), 0);
  for (const value of [undefined, '', 'true', 'loopback', '-1', '1,2', '1.5'])
    assert.equal(trustProxyHops(value), 0);
});

test('the development bypass needs a loopback socket even when X-Forwarded-For says loopback', () => {
  assert.equal(loopbackRequest({ ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } }), true);
  assert.equal(loopbackRequest({ ip: '127.0.0.1', socket: { remoteAddress: '192.0.2.9' } }), false);
  assert.equal(loopbackRequest({ ip: '192.0.2.9', socket: { remoteAddress: '127.0.0.1' } }), false);
  assert.equal(loopbackRequest({}), false);
});

test('database and storage failures map to a status and never expose their detail', () => {
  const statuses: Array<[unknown, number]> = [
    [known('P2002'), 409],
    [known('P2025'), 404],
    [known('P2028'), 503],
    [known('P2034'), 503],
    [known('P2010', '23514'), 409],
    [known('P2039', '23514'), 409],
    [known('P2010', '42501'), 403],
    [known('P2039', '42501'), 403],
    [known('P2010', '55P03'), 503],
    [new StorageUnavailableError(new Error('private detail')), 503],
  ];
  const filter = new SafeExceptionFilter();
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    for (const [error, status] of statuses) {
      let sent: { status?: number; body?: unknown } = {};
      const response = {
        getHeader: () => 'request-id',
        status(code: number) {
          sent.status = code;
          return this;
        },
        json(body: unknown) {
          sent = { ...sent, body };
        },
      };
      filter.catch(error, {
        switchToHttp: () => ({ getResponse: () => response }),
      } as unknown as ArgumentsHost);
      assert.equal(sent.status, status);
      const text = JSON.stringify(sent.body);
      assert.deepEqual(Object.keys(sent.body as object).sort(), ['code', 'message']);
      assert.ok(!text.includes('private'));
    }
  } finally {
    console.warn = warn;
  }
  assert.equal(clientFailure(known('P2003')), null);
  assert.equal(clientFailure(new Error('other')), null);
});

test('private storage reports failures as StorageUnavailableError without the cause in the message', async () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    S3_BUCKET: 'unit',
    S3_ACCESS_KEY_ID: 'unit',
    S3_SECRET_ACCESS_KEY: 'unit',
    S3_ENDPOINT: 'http://127.0.0.1:9',
  });
  const storage = new PrivateStorage();
  (storage as unknown as { client: { send: () => Promise<never> } }).client = {
    send: () => Promise.reject(new Error('connect private-host')),
  };
  try {
    for (const operation of [
      () => storage.put('k', Buffer.from('x'), 'image/jpeg'),
      () => storage.get('k'),
      () => storage.head('k'),
      () => storage.remove('k'),
    ])
      await assert.rejects(operation, (error: unknown) => {
        assert.ok(error instanceof StorageUnavailableError);
        assert.ok(!error.message.includes('private'));
        return true;
      });
  } finally {
    process.env = saved;
  }
});

test('the API process reuses one S3 client until shutdown', () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    S3_BUCKET: 'unit',
    S3_ACCESS_KEY_ID: 'unit',
    S3_SECRET_ACCESS_KEY: 'unit',
    S3_ENDPOINT: 'http://127.0.0.1:9',
  });
  try {
    const first = privateStorage();
    assert.equal(privateStorage(), first);
    closePrivateStorage();
    assert.notEqual(privateStorage(), first);
    closePrivateStorage();
    delete process.env.S3_BUCKET;
    assert.throws(() => privateStorage(), /Private storage unavailable/);
  } finally {
    process.env = saved;
  }
});

test('report issue lookups do not load the frozen snapshot', async () => {
  const selects: unknown[] = [];
  const tx = {
    $queryRaw: async () => [],
    work: { findFirst: async () => ({ id: 'work' }) },
    report: { findFirst: async () => ({ id: 'report', version: 1 }) },
    reportIssue: {
      findFirst: async (args: { select?: Record<string, boolean> }) => {
        selects.push(args.select);
        return null;
      },
      count: async () => 50,
    },
  };
  const db = { run: (_: unknown, operation: (t: unknown) => unknown) => operation(tx) };
  const service = new ReportsService(db as unknown as TenantDatabaseService);
  await assert.rejects(service.download(context, 'work', 'report', 'issue'));
  await assert.rejects(
    service.issue(context, 'work', 'report', {
      version: 1,
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
    }),
  );
  assert.equal(selects.length, 2);
  for (const select of selects as Array<Record<string, boolean> | undefined>) {
    assert.ok(select, 'an explicit select is required');
    assert.equal(select.snapshot, undefined);
  }
});

test('the technical read queries soil layers once and takes no row lock', async () => {
  let layerQueries = 0;
  const empty = async () => [];
  const tx = {
    $queryRaw: async () => assert.fail('a read must not lock rows'),
    work: { findFirst: async () => ({ id: 'work' }) },
    borehole: {
      findFirst: async () => ({
        id: 'hole',
        fieldDate: null,
        executedDepthM: null,
        officialCoordinateId: null,
        reviewState: 'DRAFT',
        technicalVersion: 1,
        approvedVersion: null,
      }),
    },
    sptTest: { findMany: empty },
    soilLayer: {
      findMany: async () => {
        layerQueries++;
        return [];
      },
    },
    boreholePhoto: { count: async () => 0 },
    technicalEvent: { findMany: empty },
  };
  const db = { run: (_: unknown, operation: (t: unknown) => unknown) => operation(tx) };
  const service = new TechnicalService(db as unknown as TenantDatabaseService);
  const result = await service.get(context, 'work', 'hole');
  assert.equal(layerQueries, 1);
  assert.deepEqual(result.layers, []);
});

test('a slow report does not hold back the photo queue', async () => {
  let stopping = false;
  let photos = 0;
  let finishReport = () => {};
  let reportStarted = false;
  const report = async () => {
    reportStarted = true;
    await new Promise<void>((done) => (finishReport = done));
    return false;
  };
  const photo = async () => {
    photos++;
    if (photos === 5) {
      assert.equal(reportStarted, true);
      stopping = true;
      finishReport();
    }
    await new Promise((resolve) => setImmediate(resolve));
    return true;
  };
  await runQueueLoops([photo, report], {
    shouldStop: () => stopping,
    stop: () => {
      stopping = true;
    },
    idleMs: 1,
  });
  assert.ok(photos >= 5);
});

test('a failing queue stops the other loop and surfaces its error', async () => {
  let stopping = false;
  await assert.rejects(
    runQueueLoops(
      [
        async () => {
          throw new Error('queue failed');
        },
        async () => false,
      ],
      {
        shouldStop: () => stopping,
        stop: () => {
          stopping = true;
        },
        idleMs: 1,
      },
    ),
    /queue failed/,
  );
  assert.equal(stopping, true);
});

test('reviewer identity columns are selected for engineers only', () => {
  const engineer = boreholeSelectFor({ role: 'ADMIN', additionalRoles: ['ENGINEER'] });
  assert.equal('reviewerName' in engineer, true);
  for (const role of ['OPERATOR', 'VIEWER', 'COMMERCIAL', 'ADMIN']) {
    const select = boreholeSelectFor({ role, additionalRoles: [] });
    assert.equal('reviewerName' in select, false);
    assert.equal('reviewerRegistration' in select, false);
  }
});

test('deployment files overwrite forwarded headers and harden every service', () => {
  const nginx = project('infrastructure/docker/nginx.conf');
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
  assert.match(nginx, /proxy_set_header X-Real-IP \$remote_addr;/);
  assert.doesNotMatch(nginx, /add_header Strict-Transport-Security/);
  const compose = project('compose.production.yaml');
  assert.equal(compose.match(/security_opt: \[no-new-privileges:true\]/g)?.length, 3);
  assert.match(compose, /TRUST_PROXY_HOPS: \$\{TRUST_PROXY_HOPS:-2\}/);
  const api = compose.slice(compose.indexOf('  api:'), compose.indexOf('  worker:'));
  assert.match(api, /mem_limit: /);
  const web = project('infrastructure/docker/Dockerfile');
  assert.match(web.slice(web.indexOf('AS web')), /USER nginx/);
  const ignored = project('.dockerignore').split('\n');
  for (const entry of ['apps/mobile', 'graphify-out', 'load-test-results'])
    assert.ok(ignored.includes(entry));
  assert.ok(project('.gitignore').split('\n').includes('graphify-out/'));
});
