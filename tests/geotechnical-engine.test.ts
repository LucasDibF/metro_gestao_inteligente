import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpt, ENGINE_VERSION } from '../packages/geotechnical-engine/src';
const full = (blows = [4, 6, 8]) => ({
  advances: blows.map((value) => ({ blows: value, penetrationMm: 150 })),
});

test('reference 4/6/8 yields conventional N-SPT 14 and records engine version', () => {
  const result = evaluateSpt(full());
  assert.equal(result.status, 'CONVENTIONAL');
  assert.equal(result.nSpt, 14);
  assert.equal(result.engineVersion, ENGINE_VERSION);
  assert.equal(result.totalPenetrationMm, 450);
});
test('first seating advance does not contribute to the conventional sum', () => {
  for (const first of [1, 4, 20]) assert.equal(evaluateSpt(full([first, 6, 8])).nSpt, 14);
});
test('zero, one or two advances cannot produce a definitive N-SPT', () => {
  for (const count of [0, 1, 2]) {
    const result = evaluateSpt({ advances: full().advances.slice(0, count) });
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(result.nSpt, null);
  }
});
test('partial, zero and overlong penetrations are preserved without extrapolation', () => {
  for (const penetrationMm of [0, 50, 149, 151, 200]) {
    const input = full();
    input.advances[2].penetrationMm = penetrationMm;
    const result = evaluateSpt(input);
    assert.equal(result.status, 'REQUIRES_REVIEW');
    assert.equal(result.nSpt, null);
    assert.equal(result.advances[2].penetrationMm, penetrationMm);
  }
});
test('interruption keeps original advances and overrides an otherwise complete calculation', () => {
  const result = evaluateSpt({ ...full(), interruptionReason: 'Interrupção registrada em campo' });
  assert.equal(result.status, 'INTERRUPTED');
  assert.equal(result.nSpt, null);
  assert.equal(result.interruptionReason, 'Interrupção registrada em campo');
});
test('zero blows is a special case requiring review, not an inferred free-fall rule', () => {
  assert.equal(evaluateSpt(full([0, 6, 8])).status, 'REQUIRES_REVIEW');
  assert.equal(evaluateSpt(full([4, 0, 0])).nSpt, null);
});
test('runtime validation rejects non-finite, negative, fractional and coerced numbers', () => {
  for (const value of [-1, 1.5, NaN, Infinity, '4', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    for (const key of ['blows', 'penetrationMm']) {
      const input = { advances: [{ blows: 4, penetrationMm: 150, [key]: value }] };
      assert.equal(evaluateSpt(input).status, 'INVALID');
    }
  }
});
test('malformed records, excess advances, unknown fields and invalid reasons are rejected', () => {
  for (const input of [
    null,
    [],
    {},
    { advances: 'invalid' },
    { advances: [null] },
    { advances: Array(3) },
    { advances: Array(4).fill({ blows: 1, penetrationMm: 150 }) },
    { ...full(), extra: true },
    { advances: [{ blows: 1, penetrationMm: 150, extra: true }] },
    { ...full(), interruptionReason: '' },
    { ...full(), interruptionReason: 'x'.repeat(501) },
  ]) {
    assert.equal(evaluateSpt(input).status, 'INVALID');
  }
});
test('unsafe arithmetic cannot become a valid result', () => {
  assert.equal(evaluateSpt(full([1, Number.MAX_SAFE_INTEGER, 1])).status, 'INVALID');
  assert.equal(
    evaluateSpt({
      advances: [
        { blows: 1, penetrationMm: Number.MAX_SAFE_INTEGER },
        { blows: 1, penetrationMm: 150 },
      ],
    }).status,
    'INVALID',
  );
});
test('results are immutable snapshots, inputs are unchanged and recalculation is deterministic', () => {
  const input = full();
  const before = structuredClone(input);
  const first = evaluateSpt(input);
  assert.deepEqual(input, before);
  assert.deepEqual(evaluateSpt(input), first);
  input.advances[2].blows = 10;
  assert.equal(first.nSpt, 14);
  assert.equal(evaluateSpt(input).nSpt, 16);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.advances));
  assert.ok(Object.isFrozen(first.advances[0]));
});
