import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { developmentBypassEnabled } from '../apps/api/src/auth/development-access';
import { DevelopmentController } from '../apps/api/src/auth/development.controller';
import { PrismaClient } from '@prisma/client';
import { TokenService } from '../apps/api/src/auth/token.service';
import { TenantDatabaseService } from '../apps/api/src/database/tenant-database.service';

test('development bypass defaults off and refuses production and remote databases', async () => {
  const saved = {
    flag: process.env.DEV_AUTH_BYPASS,
    mode: process.env.NODE_ENV,
    database: process.env.DATABASE_URL,
  };
  try {
    delete process.env.DEV_AUTH_BYPASS;
    assert.equal(developmentBypassEnabled(), false);
    process.env.DEV_AUTH_BYPASS = 'true';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/test';
    assert.throws(() => developmentBypassEnabled(), /development mode/);
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://user:password@remote.example.invalid:5432/test';
    assert.throws(() => developmentBypassEnabled(), /local database/);
    process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/test';
    assert.equal(developmentBypassEnabled(), true);
    const controller = new DevelopmentController(
      {} as PrismaClient,
      {} as TokenService,
      {} as TenantDatabaseService,
    );
    await assert.rejects(
      controller.session({ ip: '192.0.2.1' }),
      (error) =>
        typeof error === 'object' &&
        error !== null &&
        'getStatus' in error &&
        (error as { getStatus: () => number }).getStatus() === 404,
    );
  } finally {
    for (const [key, value] of Object.entries({
      DEV_AUTH_BYPASS: saved.flag,
      NODE_ENV: saved.mode,
      DATABASE_URL: saved.database,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
