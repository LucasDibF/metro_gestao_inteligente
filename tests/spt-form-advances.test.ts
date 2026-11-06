import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAdvances } from '../apps/web/src/spt/read-advances';
const form = (...pairs: string[][]) => {
  const data = new FormData();
  pairs.forEach(([blows, penetration], index) => {
    data.set(`blows-${index}`, blows);
    data.set(`penetration-${index}`, penetration);
  });
  return data;
};
test('field form preserves normal, partial and absent advances in integer millimetres', () => {
  assert.deepEqual(readAdvances(form()), []);
  assert.deepEqual(readAdvances(form(['4', '15'], ['6', '15'], ['8', '15'])), [
    { blows: 4, penetrationMm: 150 },
    { blows: 6, penetrationMm: 150 },
    { blows: 8, penetrationMm: 150 },
  ]);
  assert.deepEqual(readAdvances(form(['30', '1.4'])), [{ blows: 30, penetrationMm: 14 }]);
  assert.deepEqual(readAdvances(form(['0', '0'])), [{ blows: 0, penetrationMm: 0 }]);
});
test('field form rejects skipped pairs, incomplete pairs, excess precision and unsafe integers', () => {
  for (const data of [
    form(['', ''], ['3', '15']),
    form(['3', '']),
    form(['', '15']),
    form(['1.2', '15']),
    form(['3', '1.45']),
    form(['9007199254740992', '15']),
  ])
    assert.throws(() => readAdvances(data));
});
