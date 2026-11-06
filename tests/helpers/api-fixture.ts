import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type MembershipRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrivateStorage } from '@spt/private-storage';
import sharp from 'sharp';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
import { assertTestDatabase } from './test-database';

export interface FixtureUser {
  id: string;
  email: string;
  token: string;
  session: { accessToken: string; refreshToken: string };
}
export interface ApiFixture {
  db: PrismaClient;
  app: NestExpressApplication;
  base: string;
  tenantId: string;
  password: string;
  users: FixtureUser[];
  work: { id: string };
  hole: { id: string };
  login(user: { email: string }, password?: string): Promise<Response>;
  call(
    user: FixtureUser,
    route: string,
    body?: unknown,
    method?: string,
    headers?: Record<string, string>,
  ): Promise<Response>;
  sendPhoto(
    user: FixtureUser,
    route: string,
    image: Buffer,
    fields: Record<string, string>,
  ): Promise<Response>;
  close(): Promise<void>;
}
export const jpeg = (background: string): Promise<Buffer> =>
  sharp({ create: { width: 24, height: 24, channels: 3, background } })
    .jpeg()
    .toBuffer();

/** A disposable tenant, one work and one hole, refusing any database not named *_test. */
export async function apiFixture(
  roles: Array<{ role: MembershipRole; additionalRoles?: MembershipRole[] }>,
  configure?: (app: NestExpressApplication) => void,
): Promise<ApiFixture> {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const [target] = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assertTestDatabase(target.name);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  configure?.(app);
  const tenant = await db.tenant.create({ data: { name: 'Fixture ' + randomUUID() } });
  const tenantId = tenant.id;
  const password = 'Fixture password ' + randomUUID();
  const passwordHash = await hashPassword(password);
  const records: Array<{ id: string; email: string }> = [];
  for (const { role, additionalRoles = [] } of roles) {
    const user = await db.user.create({
      data: { email: randomUUID() + '@example.invalid', passwordHash },
    });
    await db.membership.create({ data: { tenantId, userId: user.id, role, additionalRoles } });
    records.push(user);
  }
  const work = await db.work.create({ data: { tenantId, name: 'Fixture work' } });
  const hole = await db.borehole.create({ data: { tenantId, workId: work.id, code: 'FX-01' } });
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()) + '/api/v1';
  const login = (user: { email: string }, secret = password) =>
    fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: secret, tenantId }),
    });
  const users: FixtureUser[] = [];
  for (const record of records) {
    const response = await login(record);
    assert.equal(response.status, 200);
    const session = (await response.json()) as FixtureUser['session'];
    users.push({ id: record.id, email: record.email, token: session.accessToken, session });
  }
  return {
    db,
    app,
    base,
    tenantId,
    password,
    users,
    work,
    hole,
    login,
    call: (user, route, body, method = body ? 'POST' : 'GET', headers = {}) =>
      fetch(base + route, {
        method,
        headers: {
          Authorization: 'Bearer ' + user.token,
          'Content-Type': 'application/json',
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    sendPhoto: (user, route, image, fields) => {
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'campo.jpg');
      for (const [name, value] of Object.entries(fields)) form.set(name, value);
      return fetch(base + route, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + user.token },
        body: form,
      });
    },
    close: async () => {
      await app.close();
      const photos = await db.boreholePhoto.findMany({ where: { tenantId } });
      if (photos.length) {
        const storage = new PrivateStorage();
        await Promise.allSettled(
          photos.flatMap((p) => [storage.remove(p.objectKey), storage.remove(p.thumbnailKey)]),
        );
        storage.close();
      }
      await db.$executeRaw`DELETE FROM mobile_operations WHERE tenant_id=${tenantId}::uuid`;
      await db.report.updateMany({ where: { tenantId }, data: { currentIssueId: null } });
      await db.reportIssue.deleteMany({ where: { tenantId } });
      await db.report.deleteMany({ where: { tenantId } });
      await db.boreholePhoto.deleteMany({ where: { tenantId } });
      await db.technicalEvent.deleteMany({ where: { tenantId } });
      await db.soilLayer.deleteMany({ where: { tenantId } });
      await db.sptTest.deleteMany({ where: { tenantId } });
      await db.borehole.updateMany({ where: { tenantId }, data: { officialCoordinateId: null } });
      await db.boreholeCoordinate.deleteMany({ where: { tenantId } });
      await db.borehole.deleteMany({ where: { tenantId } });
      await db.workAssignment.deleteMany({ where: { tenantId } });
      await db.work.deleteMany({ where: { tenantId } });
      await db.authSession.deleteMany({ where: { tenantId } });
      await db.professionalProfile.deleteMany({ where: { tenantId } });
      await db.membership.deleteMany({ where: { tenantId } });
      await db.user.deleteMany({ where: { id: { in: records.map((r) => r.id) } } });
      await db.tenant.delete({ where: { id: tenantId } });
      await db.$disconnect();
    },
  };
}
