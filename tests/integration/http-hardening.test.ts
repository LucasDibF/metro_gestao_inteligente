import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';
import { configureHttp } from '../../apps/api/src/operations/http-setup';
import { clientFailure } from '../../apps/api/src/operations/http-observability';
import { assertTestDatabase } from '../helpers/test-database';

async function server(hops: string | undefined) {
  const saved = process.env.TRUST_PROXY_HOPS;
  if (hops === undefined) delete process.env.TRUST_PROXY_HOPS;
  else process.env.TRUST_PROXY_HOPS = hops;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  configureHttp(app);
  if (saved === undefined) delete process.env.TRUST_PROXY_HOPS;
  else process.env.TRUST_PROXY_HOPS = saved;
  await app.listen(0, '127.0.0.1');
  return { app, base: (await app.getUrl()) + '/api/v1' };
}
const attempt = (base: string, forwarded: string) =>
  fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwarded },
    body: '{}',
  });
async function exhaust(base: string, forwarded: string) {
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await attempt(base, forwarded)).status;
  return last;
}

test('behind one proxy the limiter separates clients by the proxy-set address', async () => {
  const { app, base } = await server('1');
  try {
    assert.equal(await exhaust(base, '198.51.100.1'), 429);
    assert.equal((await attempt(base, '198.51.100.2')).status, 400);
  } finally {
    await app.close();
  }
});

test('without TRUST_PROXY_HOPS a forged X-Forwarded-For cannot escape the limiter', async () => {
  const { app, base } = await server(undefined);
  try {
    assert.equal(await exhaust(base, '198.51.100.1'), 429);
    assert.equal((await attempt(base, '198.51.100.2')).status, 429);
  } finally {
    await app.close();
  }
});

test('API responses carry helmet headers and stay JSON, with HSTS left to the TLS layer', async () => {
  const { app, base } = await server('0');
  try {
    const response = await fetch(base + '/health/live');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal(
      response.headers.get('content-security-policy'),
      "default-src 'none';frame-ancestors 'none'",
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-site');
    assert.equal(response.headers.get('strict-transport-security'), null);
    assert.equal(response.headers.get('x-powered-by'), null);
  } finally {
    await app.close();
  }
});

test('real database failures arrive as the classes and codes the filter maps', async () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const [target] = await admin.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  assertTestDatabase(target.name);
  const tenant = await admin.tenant.create({ data: { name: 'Failures ' + randomUUID() } });
  const failure = async (operation: () => Promise<unknown>) => {
    const error = await operation().then(
      () => assert.fail('expected a database error'),
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
    return clientFailure(error);
  };
  try {
    const duplicate = () => admin.tenant.create({ data: { id: tenant.id, name: 'x' } });
    assert.equal((await failure(duplicate))?.status, 409);
    const missing = () => admin.tenant.findUniqueOrThrow({ where: { id: randomUUID() } });
    assert.equal((await failure(missing))?.status, 404);
    const expired = () =>
      admin.$transaction(
        async (tx) => {
          await new Promise((resolve) => setTimeout(resolve, 300));
          await tx.tenant.count();
        },
        { timeout: 100 },
      );
    assert.equal((await failure(expired))?.status, 503);
    const check = () =>
      admin.$transaction(async (tx) => {
        const work = await tx.work.create({ data: { tenantId: tenant.id, name: 'x' } });
        await tx.borehole.create({
          data: { tenantId: tenant.id, workId: work.id, code: 'x', reviewState: 'NOPE' },
        });
      });
    assert.equal((await failure(check))?.status, 409);
    const rowLevel = () => runtime.work.create({ data: { tenantId: tenant.id, name: 'x' } });
    assert.equal((await failure(rowLevel))?.status, 403);
    const sqlState = (state: string) => () =>
      admin.$executeRawUnsafe(`DO $$ BEGIN RAISE EXCEPTION 'x' USING ERRCODE='${state}'; END $$`);
    assert.equal((await failure(sqlState('23514')))?.status, 409);
    assert.equal((await failure(sqlState('42501')))?.status, 403);
    assert.equal((await failure(sqlState('40001')))?.status, 503);
    assert.equal((await failure(sqlState('55P03')))?.status, 503);
    assert.equal(await failure(sqlState('22012')), null);
    const conflicting = () =>
      Promise.all([
        admin.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT count(*) FROM tenants`;
            await new Promise((resolve) => setTimeout(resolve, 200));
            await tx.tenant.update({ where: { id: tenant.id }, data: { name: 'a' } });
          },
          { isolationLevel: 'RepeatableRead' },
        ),
        admin.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT count(*) FROM tenants`;
            await tx.tenant.update({ where: { id: tenant.id }, data: { name: 'b' } });
          },
          { isolationLevel: 'RepeatableRead' },
        ),
      ]);
    const write = await failure(conflicting);
    assert.equal(write?.status, 503);
  } finally {
    await admin.tenant.delete({ where: { id: tenant.id } }).catch(() => undefined);
    await admin.$disconnect();
    await runtime.$disconnect();
  }
});
