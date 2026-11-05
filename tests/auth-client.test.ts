import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthClient, ApiError } from '../apps/web/src/auth/client';
const credentials = {
  email: 'test@example.invalid',
  password: 'not-a-real-password',
  tenantId: 'test',
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test('parallel unauthorized requests rotate refresh once and retry with the new token', async () => {
  let renewals = 0;
  const client = new AuthClient(async (url, init) => {
    if (String(url).endsWith('/login'))
      return json({ accessToken: 'old', refreshToken: 'refresh' });
    if (String(url).endsWith('/refresh')) {
      renewals++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return json({ accessToken: 'new', refreshToken: 'next' });
    }
    const header = (init?.headers as Record<string, string>).Authorization;
    return header === 'Bearer new' ? json({ ok: true }) : json({}, 401);
  });
  await client.login(credentials);
  const values = await Promise.all([client.request('/auth/me'), client.request('/auth/me')]);
  assert.deepEqual(values, [{ ok: true }, { ok: true }]);
  assert.equal(renewals, 1);
});

test('failed refresh clears memory and requires a new login', async () => {
  const client = new AuthClient(async (url) =>
    String(url).endsWith('/login')
      ? json({ accessToken: 'old', refreshToken: 'refresh' })
      : json({}, 401),
  );
  await client.login(credentials);
  await assert.rejects(
    client.request('/auth/me'),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(client.hasSession, false);
});

test('logout during pending refresh cannot restore a session', async () => {
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = new AuthClient(async (url) => {
    if (String(url).endsWith('/login'))
      return json({ accessToken: 'old', refreshToken: 'refresh' });
    if (String(url).endsWith('/refresh')) {
      started();
      await wait;
      return json({ accessToken: 'new', refreshToken: 'next' });
    }
    return json({}, 401);
  });
  await client.login(credentials);
  const pending = client.request('/auth/me');
  await ready;
  client.clear();
  release();
  await assert.rejects(pending);
  assert.equal(client.hasSession, false);
});

test('failed MFA reauthentication does not rotate or discard the authenticated session', async () => {
  let refreshes = 0;
  const client = new AuthClient(async (url) => {
    if (String(url).endsWith('/login'))
      return json({ accessToken: 'current', refreshToken: 'refresh' });
    if (String(url).endsWith('/refresh')) refreshes++;
    return json({ code: 'MFA_VERIFICATION_FAILED' }, 401);
  });
  await client.login(credentials);
  await assert.rejects(
    client.request('/auth/mfa/setup', { method: 'POST', body: '{}' }),
    (error) => error instanceof ApiError && error.code === 'MFA_VERIFICATION_FAILED',
  );
  assert.equal(refreshes, 0);
  assert.equal(client.hasSession, true);
});

test('switching a local test profile preserves the session and unrelated pending requests', async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = new AuthClient(async (url) => {
    const path = String(url);
    if (path.endsWith('/login')) return json({ accessToken: 'access', refreshToken: 'refresh' });
    if (path.endsWith('/dev-role')) return json({ role: 'ENGINEER' });
    if (path.endsWith('/auth/me')) return json({ role: 'ENGINEER' });
    await wait;
    return json({ ok: true });
  });
  await client.login(credentials);
  const pending = client.request('/obras');
  const profile = await client.switchDevelopmentRole('ENGINEER');
  assert.equal(profile.role, 'ENGINEER');
  release();
  assert.deepEqual(await pending, { ok: true });
  assert.equal(client.hasSession, true);
});

test('late requests from an old account are identifiable and cannot replace a newly authenticated session', async () => {
  let release!: () => void;
  let started!: () => void;
  let logins = 0;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = new AuthClient(async (url, init) => {
    if (String(url).endsWith('/login')) {
      logins++;
      return json({ accessToken: 'account-' + logins, refreshToken: 'refresh-' + logins });
    }
    if (String(url).endsWith('/old')) {
      started();
      await wait;
      return json({}, 401);
    }
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer account-2');
    return json({ account: 2 });
  });
  await client.login(credentials);
  const pending = client.request('/old');
  await ready;
  await client.login(credentials);
  release();
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof ApiError && error.code === 'SESSION_SUPERSEDED',
  );
  assert.deepEqual(await client.request('/new'), { account: 2 });
  assert.equal(client.hasSession, true);
});

test('test access availability never creates a session; explicit entry can repeat after logout', async () => {
  let sessions = 0;
  const client = new AuthClient(async (url) => {
    if (String(url).endsWith('/dev-status')) return json({ enabled: true });
    if (String(url).endsWith('/dev-session')) {
      sessions++;
      return json({ accessToken: 'test-access', refreshToken: 'test-refresh' });
    }
    return new Response(null, { status: 204 });
  });
  assert.equal(await client.developmentAvailable(), true);
  assert.equal(client.hasSession, false);
  assert.equal(sessions, 0);
  assert.equal(await client.developmentLogin(), true);
  assert.equal(client.isDevelopmentSession, true);
  await client.logout();
  assert.equal(client.hasSession, false);
  assert.equal(await client.developmentLogin(), true);
  assert.equal(sessions, 2);
});

const signedIn = (respond: (url: string) => Response | Promise<Response>) =>
  new AuthClient(async (url) =>
    String(url).endsWith('/login')
      ? json({ accessToken: 'token', refreshToken: 'refresh' })
      : respond(String(url)),
  );

test('wrong current password keeps the session and does not attempt a token renewal', async () => {
  let renewals = 0;
  const client = signedIn((url) => {
    if (url.endsWith('/refresh')) renewals++;
    return json({ code: 'PASSWORD_INVALID' }, 401);
  });
  await client.login(credentials);
  await assert.rejects(
    client.request('/auth/password', { method: 'POST', body: '{}' }),
    (error) =>
      error instanceof ApiError &&
      error.code === 'PASSWORD_INVALID' &&
      error.message === 'A senha atual não confere. Sua sessão continua ativa.',
  );
  assert.equal(renewals, 0);
  assert.equal(client.hasSession, true);
});

test('successful password change keeps the current session', async () => {
  const client = signedIn(() => new Response(null, { status: 204 }));
  await client.login(credentials);
  assert.equal(await client.request('/auth/password', { method: 'POST', body: '{}' }), undefined);
  assert.equal(client.hasSession, true);
});

test('too large uploads explain the limit', async () => {
  const client = signedIn(() => json({}, 413));
  await client.login(credentials);
  await assert.rejects(
    client.request('/upload', { method: 'POST' }),
    (error) => error instanceof ApiError && error.message.includes('8 MB'),
  );
});

test('timeouts become a Portuguese message while connecting and while reading the body', async () => {
  const timeout = new DOMException('The operation timed out.', 'TimeoutError');
  const expected = (error: unknown) =>
    error instanceof ApiError && error.status === 0 && error.message.includes('demorou demais');
  const connecting = signedIn(() => Promise.reject(timeout));
  await connecting.login(credentials);
  await assert.rejects(connecting.request('/pdf'), expected);

  const stalled = () =>
    new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(timeout);
        },
      }),
    );
  const reading = signedIn(stalled);
  await reading.login(credentials);
  await assert.rejects(
    reading.request<Blob>('/pdf', {}, (response) => response.blob()),
    expected,
  );
  await assert.rejects(reading.request('/json'), expected);
});

test('network failures keep the connection message', async () => {
  const client = signedIn(() => Promise.reject(new TypeError('Failed to fetch')));
  await client.login(credentials);
  await assert.rejects(
    client.request('/pdf'),
    (error) => error instanceof ApiError && error.message.startsWith('Não foi possível conectar'),
  );
});
