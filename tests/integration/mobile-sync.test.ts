import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
import { PrivateStorage } from '@spt/private-storage';
import { assertTestDatabase } from '../helpers/test-database';

test('mobile sync is atomic, idempotent, versioned and assignment-only; partial completion reaches technical review', async () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const [target] = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assertTestDatabase(target.name);
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const tenant = await db.tenant.create({ data: { name: 'Disposable mobile sync QA' } });
  let userId: string | undefined;
  try {
    const password = randomUUID();
    const user = await db.user.create({
      data: {
        email: randomUUID() + '@example.invalid',
        passwordHash: await hashPassword(password),
      },
    });
    userId = user.id;
    await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'OPERATOR',
        additionalRoles: ['ENGINEER'],
      },
    });
    const work = await db.work.create({
      data: { tenantId: tenant.id, name: 'Disposable field work' },
    });
    const hidden = await db.work.create({
      data: { tenantId: tenant.id, name: 'Unassigned field work' },
    });
    const hole = await db.borehole.create({
      data: { tenantId: tenant.id, workId: work.id, code: 'QA-01' },
    });
    const unavailable = await db.borehole.create({
      data: { tenantId: tenant.id, workId: hidden.id, code: 'QA-HIDDEN' },
    });
    await db.workAssignment.create({
      data: { tenantId: tenant.id, workId: work.id, operatorId: user.id, assignedBy: user.id },
    });
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api/v1';
    const login = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: tenant.id, email: user.email, password }),
    });
    assert.equal(login.status, 200);
    const { accessToken } = await login.json();
    const call = (route: string, body?: unknown) =>
      fetch(base + route, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const route = `/obras/${work.id}/furos/${hole.id}/mobile`;
    assert.equal(
      (await call(`/obras/${hidden.id}/furos/${unavailable.id}/mobile/snapshot`)).status,
      404,
      'Combined roles still require assignment',
    );
    const start = await (await call(route + '/snapshot')).json();
    let version = start.technical.hole.technicalVersion;
    const initial = {
      operationId: randomUUID(),
      kind: 'METRE',
      expectedTechnicalVersion: version,
      payload: {
        depthM: '1',
        recordType: 'INITIAL_SOIL',
        advances: [],
        technicalVersion: version,
        soil: { soilType: 'Argila arenosa', soilColor: 'Marrom', description: '' },
      },
    };
    const duplicates = await Promise.all([
      call(route + '/operacoes', initial),
      call(route + '/operacoes', initial),
    ]);
    for (const response of duplicates)
      assert.equal(response.status, 201, await response.clone().text());
    const [first, retry] = await Promise.all(duplicates.map((r) => r.json()));
    assert.deepEqual(first, retry);
    assert.equal(await db.sptTest.count({ where: { boreholeId: hole.id } }), 1);
    const lookup = await (await call(route + '/operacoes/' + initial.operationId)).json();
    assert.deepEqual(lookup.receipt, first);
    const operationsBeforeReuse = await db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM mobile_operations WHERE tenant_id=${tenant.id}::uuid`;
    const reusedWithOtherPayload = await call(route + '/operacoes', {
      ...initial,
      payload: { ...initial.payload, soil: { soilType: 'Areia' } },
    });
    assert.equal(reusedWithOtherPayload.status, 409);
    assert.equal(
      ((await reusedWithOtherPayload.json()) as { code: string }).code,
      'OPERATION_REUSED',
    );
    const reusedWithOtherKind = await call(route + '/operacoes', {
      operationId: initial.operationId,
      kind: 'FIELDS',
      expectedTechnicalVersion: first.technicalVersion,
      payload: { technicalVersion: first.technicalVersion, fieldDate: '2026-11-04' },
    });
    assert.equal(reusedWithOtherKind.status, 409);
    assert.equal(((await reusedWithOtherKind.json()) as { code: string }).code, 'OPERATION_REUSED');
    const operationsAfterReuse = await db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM mobile_operations WHERE tenant_id=${tenant.id}::uuid`;
    assert.equal(operationsAfterReuse[0].count, operationsBeforeReuse[0].count);
    assert.equal(await db.sptTest.count({ where: { boreholeId: hole.id } }), 1);
    const unchangedHole = await db.borehole.findUniqueOrThrow({ where: { id: hole.id } });
    assert.equal(unchangedHole.technicalVersion, first.technicalVersion);
    assert.equal(unchangedHole.fieldDate, null, 'a refused reuse must not apply its payload');
    assert.deepEqual(
      (await (await call(route + '/operacoes/' + initial.operationId)).json()).receipt,
      first,
      'the stored receipt keeps the original response',
    );
    version = first.technicalVersion;
    const stale = await call(route + '/operacoes', {
      operationId: randomUUID(),
      kind: 'FIELDS',
      expectedTechnicalVersion: 1,
      payload: { technicalVersion: 1, fieldDate: '2026-11-04', executedDepthM: '2' },
    });
    assert.equal(stale.status, 409);
    const before = await db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM mobile_operations WHERE tenant_id=${tenant.id}::uuid`;
    const invalid = await call(route + '/operacoes', {
      operationId: randomUUID(),
      kind: 'METRE',
      expectedTechnicalVersion: version,
      payload: {
        depthM: '2',
        advances: [{ blows: -1, penetrationMm: 150 }],
        soil: { soilType: 'Argila' },
        technicalVersion: version,
      },
    });
    assert.equal(invalid.status, 400);
    const after = await db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM mobile_operations WHERE tenant_id=${tenant.id}::uuid`;
    assert.equal(before[0].count, after[0].count);
    const partial = await call(route + '/operacoes', {
      operationId: randomUUID(),
      kind: 'METRE',
      expectedTechnicalVersion: version,
      payload: {
        depthM: '2',
        advances: [
          { blows: 30, penetrationMm: 150 },
          { blows: 30, penetrationMm: 140 },
          { blows: 30, penetrationMm: 150 },
        ],
        interruptionReason: 'Encerrado por resistência à penetração',
        technicalVersion: version,
        soil: { soilType: 'Argila arenosa', soilColor: 'Marrom', description: '' },
      },
    });
    assert.equal(partial.status, 201, await partial.clone().text());
    version = (await partial.json()).technicalVersion;
    const fields = await call(route + '/operacoes', {
      operationId: randomUUID(),
      kind: 'FIELDS',
      expectedTechnicalVersion: version,
      payload: {
        technicalVersion: version,
        fieldDate: '2026-11-04',
        executedDepthM: '1.44',
        waterLevelM: '1.2',
      },
    });
    assert.equal(fields.status, 201, await fields.clone().text());
    version = (await fields.json()).technicalVersion;
    const coordinateOperation = {
      operationId: randomUUID(),
      kind: 'COORDINATE',
      expectedTechnicalVersion: version,
      payload: {
        eastingM: '500000',
        northingM: '7400000',
        zone: 23,
        hemisphere: 'S',
        datum: 'SIRGAS2000',
        altitudeM: '12.5',
        reference: 'GPS de campo',
      },
    };
    const coordinate = await call(route + '/operacoes', coordinateOperation);
    assert.equal(coordinate.status, 201, await coordinate.clone().text());
    const coordinateReceipt = (await coordinate.json()) as {
      result: { id: string; kind: string; eastingM: string; version: number };
      technicalVersion: number;
      reviewState: string;
    };
    assert.equal(coordinateReceipt.result.kind, 'EXECUTED');
    assert.equal(coordinateReceipt.result.version, 1);
    assert.equal(coordinateReceipt.reviewState, 'DRAFT');
    assert.equal(
      coordinateReceipt.technicalVersion,
      version,
      'only an official coordinate changes the technical version',
    );
    const savedCoordinates = await db.boreholeCoordinate.findMany({
      where: { boreholeId: hole.id },
    });
    assert.equal(savedCoordinates.length, 1);
    assert.equal(savedCoordinates[0].id, coordinateReceipt.result.id);
    assert.equal(savedCoordinates[0].kind, 'EXECUTED');
    assert.equal(
      await db.technicalEvent.count({
        where: { boreholeId: hole.id, action: 'COORDINATE_UPDATED' },
      }),
      1,
    );
    const coordinateRetry = await call(route + '/operacoes', coordinateOperation);
    assert.equal(coordinateRetry.status, 201);
    assert.deepEqual(await coordinateRetry.json(), coordinateReceipt);
    assert.equal(await db.boreholeCoordinate.count({ where: { boreholeId: hole.id } }), 1);
    const invalidCoordinate = await call(route + '/operacoes', {
      ...coordinateOperation,
      operationId: randomUUID(),
      expectedTechnicalVersion: coordinateReceipt.technicalVersion,
      payload: { ...coordinateOperation.payload, zone: 61 },
    });
    assert.equal(invalidCoordinate.status, 400);
    version = coordinateReceipt.technicalVersion;
    const photoId = randomUUID();
    const image = await sharp({
      create: { width: 24, height: 24, channels: 3, background: '#b68c64' },
    })
      .jpeg()
      .toBuffer();
    const sendPhoto = () => {
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'solo.jpg');
      form.set('operationId', photoId);
      form.set('caption', '');
      form.set('purpose', 'SAMPLE_2');
      form.set('expectedTechnicalVersion', String(version));
      return fetch(base + route + '/fotografias', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken },
        body: form,
      });
    };
    const photo = await sendPhoto();
    assert.equal(photo.status, 201, await photo.clone().text());
    const uploaded = await photo.json();
    const repeated = await sendPhoto();
    assert.equal(repeated.status, 201, await repeated.clone().text());
    assert.deepEqual(await repeated.json(), uploaded);
    assert.equal(await db.boreholePhoto.count({ where: { boreholeId: hole.id } }), 1);
    version = uploaded.technicalVersion;
    const submission = {
      operationId: randomUUID(),
      kind: 'SUBMIT',
      expectedTechnicalVersion: version,
      payload: { technicalVersion: version, note: 'Execução concluída para análise.' },
    };
    const submit = await call(route + '/operacoes', submission);
    assert.equal(submit.status, 201, await submit.clone().text());
    assert.equal((await submit.json()).reviewState, 'IN_REVIEW');
    const repeatedSubmit = await call(route + '/operacoes', submission);
    assert.equal(repeatedSubmit.status, 201);
    // Remove combined engineering rights before testing the operator's lock.
    await db.membership.update({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      data: { additionalRoles: [] },
    });
    const current = await (await call(route + '/snapshot')).json();
    const locked = await call(route + '/operacoes', {
      operationId: randomUUID(),
      kind: 'FIELDS',
      expectedTechnicalVersion: current.technical.hole.technicalVersion,
      payload: {
        technicalVersion: current.technical.hole.technicalVersion,
        fieldDate: '2026-11-04',
        executedDepthM: '1.44',
        waterLevelM: null,
      },
    });
    assert.equal(locked.status, 403);
    await db.workAssignment.update({ where: { workId: work.id }, data: { active: false } });
    assert.equal((await call(route + '/operacoes/' + initial.operationId)).status, 404);
  } finally {
    await app.close();
    const photos = await db.boreholePhoto.findMany({ where: { tenantId: tenant.id } });
    if (photos.length) {
      const storage = new PrivateStorage();
      try {
        for (const p of photos)
          await Promise.allSettled([storage.remove(p.objectKey), storage.remove(p.thumbnailKey)]);
      } finally {
        storage.close();
      }
    }
    await db.$executeRaw`DELETE FROM mobile_operations WHERE tenant_id=${tenant.id}::uuid`;
    await db.technicalEvent.deleteMany({ where: { tenantId: tenant.id } });
    await db.soilLayer.deleteMany({ where: { tenantId: tenant.id } });
    await db.sptTest.deleteMany({ where: { tenantId: tenant.id } });
    await db.boreholePhoto.deleteMany({ where: { tenantId: tenant.id } });
    await db.boreholeCoordinate.deleteMany({ where: { tenantId: tenant.id } });
    await db.borehole.deleteMany({ where: { tenantId: tenant.id } });
    await db.workAssignment.deleteMany({ where: { tenantId: tenant.id } });
    await db.work.deleteMany({ where: { tenantId: tenant.id } });
    await db.authSession.deleteMany({ where: { tenantId: tenant.id } });
    await db.membership.deleteMany({ where: { tenantId: tenant.id } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.tenant.delete({ where: { id: tenant.id } });
    await db.$disconnect();
  }
});
