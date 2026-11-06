import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFolders } from '../apps/web/src/works/hierarchy-types';

const folder = (id: string, name = id) => ({ id, name, version: 1 });

test('loading another page of folders appends only folders not seen yet', () => {
  const current = [folder('a'), folder('b')];
  const merged = mergeFolders(current, [folder('b', 'renamed'), folder('c')]);
  assert.deepEqual(
    merged.map((item) => `${item.id}:${item.name}`),
    ['a:a', 'b:b', 'c:c'],
  );
  assert.equal(current.length, 2);
});
