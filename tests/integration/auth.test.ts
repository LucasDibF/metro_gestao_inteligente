import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

test('authentication, tenant binding, refresh rotation/replay, logout, expiry and throttling', async () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const password = 'Integration test password 123!';
  const suffix = crypto.randomUUID();
  try {
    const passwordHash = await hashPassword(password);
    for (const label of ['a', 'b']) {
      const tenant = await admin.tenant.create({ data: { name: `Auth ${label} ${suffix}` } });
      tenantIds.push(tenant.id);
      const user = await admin.user.create({
        data: { email: `${label}-${suffix}@example.invalid`, passwordHash },
      });
      userIds.push(user.id);
      await admin.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'ADMIN',
          additionalRoles: ['ENGINEER'],
        },
      });
    }
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1/auth`;
    const post = (route: string, body: unknown, token?: string) =>
      fetch(`${base}/${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    const me = (token?: string) =>
      fetch(`${base}/me`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-tenant-id': tenantIds[1],
          'x-user-id': userIds[1],
        },
      });
    const credentials = { email: `a-${suffix}@example.invalid`, password, tenantId: tenantIds[0] };
    const login = async () => {
      const response = await post('login', credentials);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return (await response.json()) as Tokens;
    };
    assert.equal((await me()).status, 401);
    assert.equal((await me('tampered')).status, 401);
    assert.equal((await post('login', {})).status, 400);
    const wrongPassword = await post('login', { ...credentials, password: 'incorrect' });
    const unknownUser = await post('login', {
      ...credentials,
      email: `missing-${suffix}@example.invalid`,
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownUser.status, 401);
    assert.deepEqual(await wrongPassword.json(), await unknownUser.json());
    assert.equal((await post('login', { ...credentials, tenantId: tenantIds[1] })).status, 401);
    const tokens = await login();
    const response = await me(tokens.accessToken);
    assert.equal(response.status, 200);
    const profile = (await response.json()) as {
      userId: string;
      tenant: { id: string };
      role: string;
    };
    assert.equal(profile.userId, userIds[0]);
    assert.equal(profile.tenant.id, tenantIds[0]);
    assert.equal(profile.role, 'ADMIN');
    const records = await admin.authSession.findMany({ where: { userId: userIds[0] } });
    assert.equal(records.length, 1);
    assert.notEqual(records[0].refreshHash, tokens.refreshToken);
    assert.match(records[0].refreshHash, /^[a-f0-9]{64}$/);
    const rotated = await post('refresh', { refreshToken: tokens.refreshToken });
    assert.equal(rotated.status, 200);
    const next = (await rotated.json()) as Tokens;
    assert.notEqual(next.refreshToken, tokens.refreshToken);
    assert.equal((await me(next.accessToken)).status, 200);
    assert.equal((await post('refresh', { refreshToken: tokens.refreshToken })).status, 401);
    assert.equal((await me(next.accessToken)).status, 401);
    assert.equal((await post('refresh', { refreshToken: next.refreshToken })).status, 401);

    const logoutTokens = await login();
    assert.equal((await post('logout', {}, logoutTokens.accessToken)).status, 204);
    assert.equal((await me(logoutTokens.accessToken)).status, 401);
    assert.equal((await post('refresh', { refreshToken: logoutTokens.refreshToken })).status, 401);

    const concurrent = await login();
    const attempts = await Promise.all(
      [0, 1].map(() => post('refresh', { refreshToken: concurrent.refreshToken })),
    );
    assert.deepEqual(attempts.map((item) => item.status).sort(), [200, 401]);
    const winner = (await attempts.find((item) => item.status === 200)!.json()) as Tokens;
    assert.equal((await me(winner.accessToken)).status, 401);

    const racingLogout = await login();
    const [logoutResult, refreshResult] = await Promise.all([
      post('logout', {}, racingLogout.accessToken),
      post('refresh', { refreshToken: racingLogout.refreshToken }),
    ]);
    assert.equal(logoutResult.status, 204);
    assert.ok([200, 401].includes(refreshResult.status));
    assert.equal((await me(racingLogout.accessToken)).status, 401);
    if (refreshResult.status === 200) {
      const raced = (await refreshResult.json()) as Tokens;
      assert.equal((await me(raced.accessToken)).status, 401);
      assert.equal((await post('refresh', { refreshToken: raced.refreshToken })).status, 401);
    }

    const inactive = await login();
    await admin.user.update({ where: { id: userIds[0] }, data: { active: false } });
    assert.equal((await me(inactive.accessToken)).status, 401);
    assert.equal((await post('refresh', { refreshToken: inactive.refreshToken })).status, 401);
    assert.equal((await post('login', credentials)).status, 401);
    await admin.user.update({ where: { id: userIds[0] }, data: { active: true } });

    const removedMembership = await login();
    await admin.membership.update({
      where: { tenantId_userId: { tenantId: tenantIds[0], userId: userIds[0] } },
      data: { active: false },
    });
    assert.equal((await me(removedMembership.accessToken)).status, 401);
    assert.equal(
      (await post('refresh', { refreshToken: removedMembership.refreshToken })).status,
      401,
    );
    await admin.membership.update({
      where: { tenantId_userId: { tenantId: tenantIds[0], userId: userIds[0] } },
      data: { active: true },
    });

    const expired = await login();
    await admin.authSession.updateMany({
      where: { userId: userIds[0] },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await me(expired.accessToken)).status, 401);
    assert.equal((await post('refresh', { refreshToken: expired.refreshToken })).status, 401);
    let limited = false;
    for (let i = 0; i < 31; i++) {
      if ((await post('login', {})).status === 429) {
        limited = true;
        break;
      }
    }
    assert.equal(limited, true);
  } finally {
    await app.close();
    await admin.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await admin.membership.deleteMany({ where: { userId: { in: userIds } } });
    await admin.user.deleteMany({ where: { id: { in: userIds } } });
    await admin.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await admin.$disconnect();
  }
});
