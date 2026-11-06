import 'reflect-metadata';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { apiFixture } from '../helpers/api-fixture';

test('changing the password checks the current one, keeps this session and ends the others', async () => {
  const fx = await apiFixture([{ role: 'ENGINEER' }, { role: 'ENGINEER' }]);
  const [user, bystander] = fx.users;
  const warnings = mock.method(console, 'warn', () => undefined);
  try {
    const route = '/auth/password';
    const replacement = 'Replacement password 9876';
    const otherLogin = await fx.login(user);
    const other = (await otherLogin.json()) as { accessToken: string; refreshToken: string };
    const unauthenticated = await fetch(fx.base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: fx.password, newPassword: replacement }),
    });
    assert.equal(unauthenticated.status, 401);

    const wrongSecret = 'Wrong current secret value';
    const wrong = await fx.call(user, route, {
      currentPassword: wrongSecret,
      newPassword: replacement,
    });
    assert.equal(wrong.status, 401);
    assert.equal(((await wrong.json()) as { code: string }).code, 'PASSWORD_INVALID');
    const logged = warnings.mock.calls.map((c) => String(c.arguments[0])).join('\n');
    assert.match(logged, /password_change_failed/);
    assert.ok(!logged.includes(wrongSecret) && !logged.includes(replacement));
    assert.ok(!logged.includes(fx.password));
    // A failed attempt keeps every session.
    const me = (token: string) =>
      fetch(fx.base + '/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal((await me(other.accessToken)).status, 200);

    for (const newPassword of ['short', 'x'.repeat(11), 'x'.repeat(129), 42]) {
      const invalid = await fx.call(user, route, { currentPassword: fx.password, newPassword });
      assert.equal(invalid.status, 400);
      assert.equal(((await invalid.json()) as { code: string }).code, 'PASSWORD_LENGTH');
    }
    assert.equal((await fx.call(user, route, { newPassword: replacement })).status, 400);
    assert.equal((await fx.login(user, replacement)).status, 401);

    const changed = await fx.call(user, route, {
      currentPassword: fx.password,
      newPassword: replacement,
    });
    assert.equal(changed.status, 204, await changed.clone().text());
    assert.equal(await changed.text(), '');

    assert.equal((await me(user.token)).status, 200, 'this session stays active');
    assert.equal((await me(other.accessToken)).status, 401, 'other sessions end at once');
    const refreshed = await fetch(fx.base + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: other.refreshToken }),
    });
    assert.equal(refreshed.status, 401);
    assert.equal((await me(bystander.token)).status, 200, 'other users are untouched');
    assert.equal((await fx.login(user)).status, 401, 'old password stops working');
    assert.equal((await fx.login(user, replacement)).status, 200);
    assert.equal((await fx.login(bystander)).status, 200);

    // The old password cannot authorize a second change, and boundary lengths are accepted.
    const stale = await fx.call(user, route, {
      currentPassword: fx.password,
      newPassword: 'y'.repeat(128),
    });
    assert.equal(stale.status, 401);
    const longest = await fx.call(user, route, {
      currentPassword: replacement,
      newPassword: 'y'.repeat(128),
    });
    assert.equal(longest.status, 204);
    const shortest = await fx.call(user, route, {
      currentPassword: 'y'.repeat(128),
      newPassword: 'z'.repeat(12),
    });
    assert.equal(shortest.status, 204);

    // Shares the throttle of the auth controller.
    let last = 0;
    for (let i = 0; i < 31 && last !== 429; i++)
      last = (await fx.call(user, route, { newPassword: 'short' })).status;
    assert.equal(last, 429);
  } finally {
    warnings.mock.restore();
    await fx.close();
  }
});
