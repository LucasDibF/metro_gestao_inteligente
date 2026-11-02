import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../apps/api/src/health.controller';

test('liveness does not require database', () => {
  assert.deepEqual(new HealthController({} as PrismaClient).live(), { status: 'ok' });
});
test('readiness succeeds only when database responds', async () => {
  const db = { $queryRaw: async () => [{ '?column?': 1 }] } as unknown as PrismaClient;
  assert.deepEqual(await new HealthController(db).ready(), { status: 'ok' });
});
test('readiness returns 503 without exposing database errors', async () => {
  const db = {
    $queryRaw: async () => {
      throw new Error('private connection');
    },
  } as unknown as PrismaClient;
  await assert.rejects(
    new HealthController(db).ready(),
    (err: unknown) =>
      err instanceof ServiceUnavailableException &&
      err.getStatus() === 503 &&
      !err.message.includes('private'),
  );
});
