import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';

test('API readiness, persistence and transaction rollback against PostgreSQL', async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const response = await fetch(`${base}/api/v1/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL! }),
    });
    try {
      let id: string | undefined;
      await assert.rejects(
        db.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({ data: { name: 'E01 integration test' } });
          id = tenant.id;
          assert.equal((await tx.tenant.findUniqueOrThrow({ where: { id } })).name, tenant.name);
          throw new Error('Intentional rollback');
        }),
        /Intentional rollback/,
      );
      assert.ok(id);
      assert.equal(await db.tenant.findUnique({ where: { id } }), null);
    } finally {
      await db.$disconnect();
    }
  } finally {
    await app.close();
  }
});
