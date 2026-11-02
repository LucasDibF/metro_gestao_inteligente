import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from '../apps/api/src/auth/password';
import { TokenService } from '../apps/api/src/auth/token.service';

test('password hashes are salted and reject incorrect passwords and malformed hashes', async () => {
  const password = 'Example-only password 123!';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('Wrong password', first), false);
  assert.equal(await verifyPassword(password, 'invalid'), false);
  await assert.rejects(hashPassword('short'));
});

test('access tokens require valid signature, issuer, audience, expiration and algorithm', async () => {
  const previous = process.env.JWT_SECRET;
  const secret = 'test-only-key-'.repeat(4);
  process.env.JWT_SECRET = secret;
  try {
    const service = new TokenService();
    const identity = { userId: randomUUID(), tenantId: randomUUID(), sessionId: randomUUID() };
    const valid = await service.sign(identity);
    assert.deepEqual(await service.verify(valid), identity);
    await assert.rejects(service.verify(`${valid}invalid`));
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sub: identity.userId,
      tenant: identity.tenantId,
      sid: identity.sessionId,
      iss: 'spt-api',
      aud: 'spt-api',
      iat: now,
      exp: now + 900,
    };
    const signedFixture = (change: object, alg = 'HS256') => {
      const payload = [
        Buffer.from(JSON.stringify({ typ: 'JWT', alg })).toString('base64url'),
        Buffer.from(JSON.stringify({ ...claims, ...change })).toString('base64url'),
      ].join('.');
      return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    };
    for (const token of [
      signedFixture({ exp: now - 1 }),
      signedFixture({ aud: 'other' }),
      signedFixture({ iss: 'other' }),
      signedFixture({}, 'none'),
    ]) {
      await assert.rejects(service.verify(token));
    }
    delete process.env.JWT_SECRET;
    assert.throws(() => new TokenService(), /JWT_SECRET/);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
