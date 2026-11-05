import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { PrivateStorage } from '@spt/private-storage';
import { apiFixture, jpeg, type ApiFixture } from '../helpers/api-fixture';

const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex');

/** Records every storage write and delete made by the API in this process. */
function spyStorage(onPut?: (key: string) => Promise<void>) {
  const puts: string[] = [];
  const removes: string[] = [];
  const put = PrivateStorage.prototype.put;
  const remove = PrivateStorage.prototype.remove;
  PrivateStorage.prototype.put = async function (key, body, mime) {
    puts.push(key);
    await onPut?.(key);
    return put.call(this, key, body, mime);
  };
  PrivateStorage.prototype.remove = async function (key) {
    removes.push(key);
    return remove.call(this, key);
  };
  return {
    puts,
    removes,
    restore() {
      PrivateStorage.prototype.put = put;
      PrivateStorage.prototype.remove = remove;
    },
  };
}
const fields = (operationId: string, version: number) => ({
  operationId,
  caption: '',
  purpose: 'SITE',
  expectedTechnicalVersion: String(version),
});
async function assertGone(storage: PrivateStorage, key: string) {
  await assert.rejects(storage.head(key));
}

test('a reused operation ID cannot overwrite or delete the stored photo, and the new object is removed', async () => {
  const fx: ApiFixture = await apiFixture([{ role: 'OPERATOR' }, { role: 'OPERATOR' }]);
  const storage = new PrivateStorage();
  const [first, second] = fx.users;
  const route = `/obras/${fx.work.id}/furos/${fx.hole.id}/mobile/fotografias`;
  let spy: ReturnType<typeof spyStorage> | undefined;
  try {
    await fx.db.workAssignment.create({
      data: {
        tenantId: fx.tenantId,
        workId: fx.work.id,
        operatorId: first.id,
        assignedBy: first.id,
      },
    });
    const original = await jpeg('#b68c64');
    const operationId = randomUUID();
    const created = await fx.sendPhoto(first, route, original, fields(operationId, 1));
    assert.equal(created.status, 201, await created.clone().text());
    const stored = await fx.db.boreholePhoto.findUniqueOrThrow({ where: { id: operationId } });
    assert.ok(!stored.objectKey.includes(operationId), 'key must not derive from the operation');
    assert.ok(!stored.thumbnailKey.includes(operationId));

    await fx.db.workAssignment.update({
      where: { workId: fx.work.id },
      data: { operatorId: second.id },
    });
    spy = spyStorage();
    const replaced = await jpeg('#102030');
    const reuse = await fx.sendPhoto(second, route, replaced, fields(operationId, 1));
    assert.equal(reuse.status, 409, await reuse.clone().text());
    assert.equal(((await reuse.json()) as { code: string }).code, 'PHOTO_ID_CONFLICT');

    assert.equal(spy.puts.length, 1);
    assert.notEqual(spy.puts[0], stored.objectKey);
    assert.ok(!spy.removes.includes(stored.objectKey), 'existing original must survive');
    assert.ok(!spy.removes.includes(stored.thumbnailKey), 'existing preview must survive');
    assert.ok(spy.removes.includes(spy.puts[0]), 'the new object must be removed');
    assert.equal(sha(await storage.get(stored.objectKey)), sha(original));
    await assertGone(storage, spy.puts[0]);
    const after = await fx.db.boreholePhoto.findUniqueOrThrow({ where: { id: operationId } });
    assert.equal(after.objectKey, stored.objectKey);
    assert.equal(after.sha256, sha(original));
  } finally {
    spy?.restore();
    storage.close();
    await fx.close();
  }
});

test('field permission is checked before any storage write on both upload routes', async () => {
  const fx = await apiFixture([{ role: 'OPERATOR' }]);
  const [operator] = fx.users;
  const spy = spyStorage();
  try {
    await fx.db.workAssignment.create({
      data: {
        tenantId: fx.tenantId,
        workId: fx.work.id,
        operatorId: operator.id,
        assignedBy: operator.id,
      },
    });
    await fx.db.borehole.update({
      where: { id: fx.hole.id },
      data: { reviewState: 'IN_REVIEW' },
    });
    const image = await jpeg('#405060');
    const base = `/obras/${fx.work.id}/furos/${fx.hole.id}`;
    const mobile = await fx.sendPhoto(
      operator,
      base + '/mobile/fotografias',
      image,
      fields(randomUUID(), 1),
    );
    assert.equal(mobile.status, 403);
    assert.equal(((await mobile.json()) as { code: string }).code, 'FIELD_EXECUTION_LOCKED');
    const web = await fx.sendPhoto(operator, base + '/arquivos/fotografias', image, {});
    assert.equal(web.status, 403);
    assert.deepEqual(spy.puts, []);
  } finally {
    spy.restore();
    await fx.close();
  }
});

test('mobile upload holds no work lock during storage, and cleans up when the transaction loses', async () => {
  const fx = await apiFixture([{ role: 'OPERATOR' }]);
  const [operator] = fx.users;
  const storage = new PrivateStorage();
  const route = `/obras/${fx.work.id}/furos/${fx.hole.id}/mobile/fotografias`;
  const onPutActions: Array<() => Promise<void>> = [];
  const spy = spyStorage(async () => {
    await onPutActions.shift()?.();
  });
  try {
    await fx.db.workAssignment.create({
      data: {
        tenantId: fx.tenantId,
        workId: fx.work.id,
        operatorId: operator.id,
        assignedBy: operator.id,
      },
    });
    // While the object is written, another connection must get the work's row lock right away.
    let lockedDuringStorage = false;
    onPutActions.push(async () => {
      await fx.db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout='1s'`;
        await tx.$queryRaw`SELECT id FROM works WHERE id=${fx.work.id}::uuid FOR UPDATE`;
        lockedDuringStorage = true;
      });
    });
    const image = await jpeg('#607080');
    const saved = await fx.sendPhoto(operator, route, image, fields(randomUUID(), 1));
    assert.equal(saved.status, 201, await saved.clone().text());
    assert.equal(lockedDuringStorage, true);

    // Concurrent retries of one operation: one receipt, one row and no orphan object.
    spy.puts.length = 0;
    spy.removes.length = 0;
    const retryId = randomUUID();
    const retries = await Promise.all([
      fx.sendPhoto(operator, route, image, fields(retryId, 1)),
      fx.sendPhoto(operator, route, image, fields(retryId, 1)),
    ]);
    for (const response of retries) assert.equal(response.status, 201);
    const [one, other] = await Promise.all(retries.map((r) => r.json()));
    assert.deepEqual(one, other);
    const row = await fx.db.boreholePhoto.findUniqueOrThrow({ where: { id: retryId } });
    assert.equal(await storage.head(row.objectKey).then(() => true), true);
    for (const key of spy.puts.filter((k) => k !== row.objectKey)) {
      assert.ok(spy.removes.includes(key));
      await assertGone(storage, key);
    }

    // The version changes while the object is being written: the receipt transaction refuses it.
    spy.puts.length = 0;
    spy.removes.length = 0;
    onPutActions.push(async () => {
      await fx.db.borehole.update({
        where: { id: fx.hole.id },
        data: { technicalVersion: { increment: 1 } },
      });
    });
    const staleId = randomUUID();
    const stale = await fx.sendPhoto(operator, route, image, fields(staleId, 1));
    assert.equal(stale.status, 409);
    assert.equal(await fx.db.boreholePhoto.count({ where: { id: staleId } }), 0);
    assert.equal(spy.puts.length, 1);
    assert.ok(spy.removes.includes(spy.puts[0]));
    await assertGone(storage, spy.puts[0]);

    // An invalid image never reaches storage.
    spy.puts.length = 0;
    const invalid = await fx.sendPhoto(
      operator,
      route,
      Buffer.from('not an image'),
      fields(randomUUID(), 2),
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(spy.puts, []);
  } finally {
    spy.restore();
    storage.close();
    await fx.close();
  }
});
