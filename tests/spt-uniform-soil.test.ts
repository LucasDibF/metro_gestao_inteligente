import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniformSoilOf } from '../apps/web/src/spt/metre-soil';
import type { SptRecord } from '../apps/web/src/spt/record-types';

const layer = (id: string, overrides: Partial<SptRecord['soil'][number]> = {}) => ({
  id,
  fromM: '1',
  toM: '2',
  soilType: 'Argila siltosa',
  description: 'mole',
  soilColor: 'Cinza',
  soilMoisture: 'Úmida',
  ...overrides,
});
const record = (soil: SptRecord['soil']): SptRecord => ({
  id: 'record-1',
  depthM: '2',
  advances: [],
  interruptionReason: null,
  result: { status: 'CONVENTIONAL', nSpt: 4, reason: '' },
  version: 1,
  soil,
});

test('a metre without a record or without layers has no description to prefill', () => {
  assert.equal(uniformSoilOf(null), null);
  assert.equal(uniformSoilOf(record([])), null);
});

test('layers that agree on type, description, colour and moisture prefill the first one', () => {
  const first = layer('a');
  assert.equal(uniformSoilOf(record([first, layer('b', { fromM: '1.5' })])), first);
});

test('any difference between layers leaves the soil fields empty', () => {
  for (const change of [
    { soilType: 'Areia fina' },
    { description: 'rija' },
    { soilColor: 'Marrom' },
    { soilMoisture: null },
  ])
    assert.equal(uniformSoilOf(record([layer('a'), layer('b', change)])), null);
});
