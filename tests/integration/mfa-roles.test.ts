import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { NestFactory } from '@nestjs/core';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../apps/api/src/app.module';
import { hashPassword } from '../../apps/api/src/auth/password';
// Resolve the OTP library from the app that declares it, independent of hoisting.
const { generate } = createRequire(`${process.cwd()}/apps/api/package.json`)(
  'otplib',
) as typeof import('otplib');
interface Tokens {
  accessToken: string;
  refreshToken: string;
}

test('MFA enrollment, encrypted storage, replay, recovery, revocation and current tenant roles', async () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  const password = 'MFA integration password 123!';
  const suffix = crypto.randomUUID();
  const users: Array<{ id: string; email: string; tenantId: string; role: MembershipRole }> = [];
  const tenantIds: string[] = [];
  try {
    const hash = await hashPassword(password);
    for (let i = 0; i < 2; i++)
      tenantIds.push((await admin.tenant.create({ data: { name: `MFA ${suffix} ${i}` } })).id);
    for (const [index, role] of (
      ['ADMIN', 'VIEWER', 'ENGINEER', 'OPERATOR', 'ADMIN'] as MembershipRole[]
    ).entries()) {
      const user = await admin.user.create({
        data: { email: `${index}-${suffix}@example.invalid`, passwordHash: hash },
      });
      const tenantId = tenantIds[index === 4 ? 1 : 0];
      users.push({ ...user, tenantId, role });
      await admin.membership.create({
        data: {
          userId: user.id,
          tenantId,
          role,
          additionalRoles: role === 'ADMIN' ? ['ENGINEER'] : [],
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
    const get = (route: string, token: string) =>
      fetch(`${base}/${route}`, { headers: { Authorization: `Bearer ${token}` } });
    const loginResponse = (index: number, mfaCode?: string) =>
      post('login', {
        email: users[index].email,
        password,
        tenantId: users[index].tenantId,
        mfaCode,
      });
    const login = async (index: number, mfaCode?: string): Promise<Tokens> => {
      const response = await loginResponse(index, mfaCode);
      assert.equal(response.status, 200);
      return (await response.json()) as Tokens;
    };
    const tokens = await Promise.all(users.map((_, index) => login(index)));
    for (const index of [1, 2, 3])
      assert.equal((await get('tenant-sessions', tokens[index].accessToken)).status, 403);
    const list = await get('tenant-sessions', tokens[0].accessToken);
    assert.equal(list.status, 200);
    const sessions = (await list.json()) as Array<{
      familyId: string;
      userId: string;
      refreshHash?: string;
    }>;
    assert.equal(sessions.length, 4);
    assert.equal(
      sessions.some((item) => item.userId === users[4].id),
      false,
    );
    assert.equal(
      sessions.some((item) => item.refreshHash !== undefined),
      false,
    );
    const foreign = (await (await get('tenant-sessions', tokens[4].accessToken)).json()) as Array<{
      familyId: string;
    }>;
    assert.equal(
      (await post(`tenant-sessions/${foreign[0].familyId}/revoke`, {}, tokens[0].accessToken))
        .status,
      404,
    );
    const viewerSession = sessions.find((item) => item.userId === users[1].id)!;
    assert.equal(
      (await post(`tenant-sessions/${viewerSession.familyId}/revoke`, {}, tokens[2].accessToken))
        .status,
      403,
    );
    assert.equal(
      (await post(`tenant-sessions/${viewerSession.familyId}/revoke`, {}, tokens[0].accessToken))
        .status,
      204,
    );
    assert.equal((await get('me', tokens[1].accessToken)).status, 401);
    // Role changes take effect without waiting for the JWT to expire.
    await admin.membership.update({
      where: { tenantId_userId: { tenantId: tenantIds[0], userId: users[0].id } },
      data: { role: 'VIEWER' },
    });
    assert.equal((await get('tenant-sessions', tokens[0].accessToken)).status, 403);
    await admin.membership.update({
      where: { tenantId_userId: { tenantId: tenantIds[0], userId: users[0].id } },
      data: { role: 'ADMIN', additionalRoles: ['ENGINEER'] },
    });

    assert.equal((await post('mfa/setup', { password })).status, 401);
    assert.equal(
      (await post('mfa/setup', { password: 'incorrect' }, tokens[0].accessToken)).status,
      401,
    );
    let setup = await post('mfa/setup', { password }, tokens[0].accessToken);
    assert.equal(setup.status, 200);
    await admin.mfaCredential.update({
      where: { userId: users[0].id },
      data: { pendingExpiresAt: new Date(0) },
    });
    assert.equal(
      (await post('mfa/enable', { password, code: '000000' }, tokens[0].accessToken)).status,
      400,
    );
    setup = await post('mfa/setup', { password }, tokens[0].accessToken);
    const { secret, uri } = (await setup.json()) as { secret: string; uri: string };
    assert.ok(uri.startsWith('otpauth://totp/'));
    const pending = await admin.mfaCredential.findUniqueOrThrow({ where: { userId: users[0].id } });
    assert.equal(pending.secretCipher.includes(secret), false);
    assert.equal(pending.enabledAt, null);
    const epoch = Math.floor(Date.now() / 1000);
    const code = await generate({ secret, epoch });
    const expiredCode = await generate({ secret, epoch: epoch - 300 });
    assert.equal(
      (await post('mfa/enable', { password, code: expiredCode }, tokens[0].accessToken)).status,
      401,
    );
    const [enabled, concurrentRefresh] = await Promise.all([
      post('mfa/enable', { password, code }, tokens[0].accessToken),
      post('refresh', { refreshToken: tokens[0].refreshToken }),
    ]);
    assert.ok([200, 401].includes(concurrentRefresh.status));
    if (concurrentRefresh.status === 200) {
      const raced = (await concurrentRefresh.json()) as Tokens;
      assert.equal((await get('me', raced.accessToken)).status, 401);
    }
    assert.equal(enabled.status, 200);
    const { recoveryCodes } = (await enabled.json()) as { recoveryCodes: string[] };
    assert.equal(recoveryCodes.length, 10);
    assert.equal(new Set(recoveryCodes).size, 10);
    assert.equal((await get('me', tokens[0].accessToken)).status, 401);
    assert.equal((await post('refresh', { refreshToken: tokens[0].refreshToken })).status, 401);
    assert.equal((await loginResponse(0)).status, 401);
    assert.equal((await loginResponse(0, code)).status, 401);
    assert.equal((await loginResponse(0, expiredCode)).status, 401);
    const stored = await admin.mfaCredential.findUniqueOrThrow({ where: { userId: users[0].id } });
    assert.equal(stored.recoveryHashes.includes(recoveryCodes[0]), false);

    const nextCode = await generate({ secret, epoch: Math.floor(Date.now() / 1000) + 30 });
    const attempts = await Promise.all([loginResponse(0, nextCode), loginResponse(0, nextCode)]);
    assert.deepEqual(attempts.map((result) => result.status).sort(), [200, 401]);
    const mfaTokens = (await attempts.find((result) => result.status === 200)!.json()) as Tokens;
    const mfaProfile = await get('me', mfaTokens.accessToken);
    assert.equal(mfaProfile.status, 200);
    assert.equal(((await mfaProfile.json()) as { mfaEnabled: boolean }).mfaEnabled, true);
    assert.equal((await post('refresh', { refreshToken: mfaTokens.refreshToken })).status, 200);
    const recovered = await login(0, recoveryCodes[0]);
    assert.equal((await loginResponse(0, recoveryCodes[0])).status, 401);
    assert.equal((await post('mfa/setup', { password }, recovered.accessToken)).status, 409);
    assert.equal(
      (
        await post(
          'mfa/disable',
          { password: 'incorrect', code: recoveryCodes[1] },
          recovered.accessToken,
        )
      ).status,
      401,
    );
    assert.equal(
      (await post('mfa/disable', { password, code: recoveryCodes[1] }, recovered.accessToken))
        .status,
      204,
    );
    assert.equal((await get('me', recovered.accessToken)).status, 401);
    assert.equal(await admin.mfaCredential.findUnique({ where: { userId: users[0].id } }), null);
    assert.equal((await loginResponse(0)).status, 200);
  } finally {
    await app.close();
    const ids = users.map((user) => user.id);
    await admin.mfaCredential.deleteMany({ where: { userId: { in: ids } } });
    await admin.authSession.deleteMany({ where: { userId: { in: ids } } });
    await admin.membership.deleteMany({ where: { userId: { in: ids } } });
    await admin.user.deleteMany({ where: { id: { in: ids } } });
    await admin.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await admin.$disconnect();
  }
});
