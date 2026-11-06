import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUuid } from '../apps/api/src/common/uuid';

test('isUuid accepts canonical UUIDs in any letter case', () => {
  assert.equal(isUuid('3f2b8c1e-9d4a-4b6f-8e2a-1c5d7f9b0a3e'), true);
  assert.equal(isUuid('3F2B8C1E-9D4A-4B6F-8E2A-1C5D7F9B0A3E'), true);
  assert.equal(isUuid('00000000-0000-0000-0000-000000000000'), true);
});

test('isUuid refuses non-strings and malformed identifiers', () => {
  for (const value of [
    undefined,
    null,
    42,
    {},
    '',
    'root',
    '3f2b8c1e9d4a4b6f8e2a1c5d7f9b0a3e',
    '{3f2b8c1e-9d4a-4b6f-8e2a-1c5d7f9b0a3e}',
    ' 3f2b8c1e-9d4a-4b6f-8e2a-1c5d7f9b0a3e',
    '3f2b8c1e-9d4a-4b6f-8e2a-1c5d7f9b0a3e\n',
    '3f2b8c1e-9d4a-4b6f-8e2a-1c5d7f9b0a3g',
  ])
    assert.equal(isUuid(value), false, JSON.stringify(value));
});
