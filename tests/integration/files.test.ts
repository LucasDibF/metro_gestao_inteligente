import { processNextPhoto } from '../../apps/worker/src/photo-worker';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import { PrivateStorage } from '@spt/private-storage';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
test('private photos preserve originals, validate content and tenant access; official coordinates invalidate review', async () => {
  const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
    }),
    app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const tenants: string[] = [],
    userIds: string[] = [],
    keys: string[] = [];
  const storage = new PrivateStorage();
  try {
    const password = crypto.randomUUID(),
      passwordHash = await hashPassword(password),
      users = [];
    for (let i = 0; i < 3; i++) {
      const tenantId =
        i === 1
          ? tenants[0]
          : (await db.tenant.create({ data: { name: 'Photos ' + crypto.randomUUID() } })).id;
      if (i !== 1) tenants.push(tenantId);
      const user = await db.user.create({
        data: { email: crypto.randomUUID() + '@example.invalid', passwordHash },
      });
      userIds.push(user.id);
      await db.membership.create({
        data: {
          tenantId,
          userId: user.id,
          role: i === 1 ? 'VIEWER' : 'ADMIN',
          additionalRoles: i === 1 ? [] : ['ENGINEER'],
        },
      });
      users.push({ ...user, tenantId });
    }
    const work = await db.work.create({ data: { tenantId: tenants[0], name: 'Private files' } }),
      hole = await db.borehole.create({
        data: { tenantId: tenants[0], workId: work.id, code: 'SP-01' },
      });
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api/v1';
    const tokens = await Promise.all(
      users.map(async (u) => {
        const r = await fetch(base + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: u.email, password, tenantId: u.tenantId }),
        });
        assert.equal(r.status, 200);
        return ((await r.json()) as { accessToken: string }).accessToken;
      }),
    );
    const path = `/obras/${work.id}/furos/${hole.id}/arquivos`;
    const call = (suffix: string, body?: unknown, index = 0, method = body ? 'PUT' : 'GET') =>
      fetch(base + path + suffix, {
        method,
        headers: {
          Authorization: 'Bearer ' + tokens[index],
          ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
      });
    const coordinate = {
      eastingM: '500000',
      northingM: '9400000',
      zone: 25,
      hemisphere: 'S',
      datum: 'SIRGAS2000',
      reference: 'Fixture de campo',
    };
    assert.equal((await call('/coordenadas/executada', { ...coordinate, zone: 61 })).status, 400);
    assert.equal((await call('/coordenadas/executada', coordinate, 1)).status, 403);
    assert.equal((await call('/coordenadas/executada', coordinate, 2)).status, 404);
    const result = await call('/coordenadas/executada', coordinate);
    assert.equal(result.status, 200);
    const coord = (await result.json()) as { id: string; version: number };
    assert.equal(
      (await call('/coordenadas/oficial', { coordinateId: coord.id, technicalVersion: 1 })).status,
      200,
    );
    const h = await db.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    assert.equal(h.technicalVersion, 2);
    assert.equal(h.officialCoordinateId, coord.id);
    assert.equal(
      (
        await call('/coordenadas/executada', {
          ...coordinate,
          eastingM: '500010',
          version: coord.version,
        })
      ).status,
      200,
    );
    assert.equal(
      (await db.borehole.findUniqueOrThrow({ where: { id: hole.id } })).technicalVersion,
      3,
    );
    const image = await sharp({
      create: { width: 320, height: 200, channels: 3, background: '#285440' },
    })
      .jpeg()
      .toBuffer();
    const upload = (bytes: Buffer, mime = 'image/jpeg', index = 0) => {
      const body = new FormData();
      body.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), 'field.jpg');
      // Caption deliberately omitted: it is optional.
      return call('/fotografias', body, index, 'POST');
    };
    assert.equal((await upload(Buffer.from('<svg>invalid</svg>'))).status, 400);
    assert.equal((await upload(image, 'image/jpeg', 1)).status, 403);
    const sent = await upload(image);
    assert.equal(sent.status, 201);
    const photo = (await sent.json()) as { id: string; version: number; caption: string };

    const worker = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.WORKER_DATABASE_URL }),
    });
    try {
      assert.equal(await processNextPhoto(worker, photo.id), true);
    } finally {
      await worker.$disconnect();
    }
    const record = await db.boreholePhoto.findUniqueOrThrow({ where: { id: photo.id } });
    assert.equal(record.caption, '');
    keys.push(record.objectKey, record.thumbnailKey);
    assert.equal(record.gpsLatitude, null);
    assert.deepEqual(await storage.get(record.objectKey), image);
    const anon = await fetch(
      process.env.S3_ENDPOINT + '/' + process.env.S3_BUCKET + '/' + record.objectKey,
    );
    assert.equal(anon.status, 403);
    assert.equal((await call('/fotografias/' + photo.id + '/original', undefined, 2)).status, 404);
    const downloaded = await call('/fotografias/' + photo.id + '/original', undefined, 1);
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), image);
    assert.equal(
      (
        await call('/fotografias/' + photo.id, {
          version: 1,
          caption: 'Crop',
          crop: { x: 0.9, y: 0, width: 0.5, height: 1 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call('/fotografias/' + photo.id, {
          version: 1,
          caption: 'Recorte de teste',
          crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        })
      ).status,
      200,
    );
    assert.deepEqual(await storage.get(record.objectKey), image);
    assert.equal(
      (
        await call('/fotografias/' + photo.id, {
          version: 1,
          caption: 'Stale',
          crop: { x: 0, y: 0, width: 1, height: 1 },
        })
      ).status,
      409,
    );
    assert.equal((await call('/fotografias/' + photo.id, { version: 2 }, 0, 'DELETE')).status, 200);
    assert.equal((await call('/fotografias/' + photo.id + '/original')).status, 404);
    assert.deepEqual(await storage.get(record.objectKey), image);
  } finally {
    await app.close();
    await Promise.allSettled(keys.map((k) => storage.remove(k)));
    storage.close();
    await db.boreholePhoto.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.technicalEvent.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.borehole.updateMany({
      where: { tenantId: { in: tenants } },
      data: { officialCoordinateId: null },
    });
    await db.boreholeCoordinate.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.borehole.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.work.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.tenant.deleteMany({ where: { id: { in: tenants } } });
    await db.$disconnect();
  }
});
