import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySoilState,
  soilGroup,
  SOIL_STATE_RULE_VERSION,
} from '../packages/geotechnical-engine/src/soil-classification';
import { stateForMetre } from '../apps/web/src/spt/soil-state';
const result = (nSpt: number | null, status = 'CONVENTIONAL') => ({ nSpt, status });
test('granular state exactly follows every supplied threshold, including zero and values above forty', () => {
  for (const [n, label] of [
    [0, 'Fofa'],
    [4, 'Fofa'],
    [5, 'Pouco compacta'],
    [8, 'Pouco compacta'],
    [9, 'Medianamente compacta'],
    [18, 'Medianamente compacta'],
    [19, 'Compacta'],
    [40, 'Compacta'],
    [41, 'Muito compacta'],
  ] as const) {
    const state = classifySoilState('Areia argilosa', result(n));
    assert.equal(state.status, 'CLASSIFIED');
    if (state.status === 'CLASSIFIED') {
      assert.equal(state.designation, label);
      assert.equal(state.property, 'Compacidade');
      assert.equal(state.ruleVersion, SOIL_STATE_RULE_VERSION);
    }
  }
});
test('cohesive state includes the twenty-to-thirty very-stiff range', () => {
  for (const [n, label] of [
    [0, 'Muito mole'],
    [2, 'Muito mole'],
    [3, 'Mole'],
    [5, 'Mole'],
    [6, 'Média'],
    [10, 'Média'],
    [11, 'Rija'],
    [19, 'Rija'],
    [20, 'Muito rija'],
    [30, 'Muito rija'],
    [31, 'Dura'],
  ] as const) {
    const state = classifySoilState('Argila arenosa', result(n));
    assert.equal(state.status, 'CLASSIFIED');
    if (state.status === 'CLASSIFIED') {
      assert.equal(state.designation, label);
      assert.equal(state.property, 'Consistência');
    }
  }
});
test('soil family uses the declared dominant type, leaves unknown or ambiguous silts unclassified and never uses prose descriptions', () => {
  assert.equal(soilGroup('Argila arenosa'), 'COHESIVE');
  assert.equal(soilGroup('Areia fina argilosa'), 'GRANULAR');
  assert.equal(soilGroup('Silte arenoso'), 'GRANULAR');
  assert.equal(soilGroup('Silte argiloso'), 'COHESIVE');
  for (const value of [
    'Silte',
    'Aterro',
    'Rocha',
    'Areia / Argila',
    'Argila ou areia',
    'Silte arenoso e argiloso',
    '',
  ])
    assert.equal(soilGroup(value), null);
});
test('partial, interrupted, missing, invalid and non-integer NSPT do not receive soil classification', () => {
  for (const r of [
    result(null),
    result(10, 'REQUIRES_REVIEW'),
    result(10, 'INCOMPLETE'),
    result(10, 'INTERRUPTED'),
    result(-1),
    result(4.5),
    result(Infinity),
  ])
    assert.equal(classifySoilState('Argila', r).status, 'UNAVAILABLE');
  assert.equal(
    stateForMetre({ depthM: '1', result: result(14) }, [
      { fromM: '0', toM: '0.5', soilType: 'Areia' },
      { fromM: '0.5', toM: '1', soilType: 'Argila' },
    ]),
    null,
  );
});
