import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compositionJson, readComposition } from '../apps/api/src/reports/report-composition';

const holeIds = ['3f2b8c1e-9d4a-4b6f-8e2a-1c5d7f9b0a3e'];
const photoIds = ['0b5e7a2c-4d1f-4c3a-9e8b-2f6d1a7c5e90'];

test('a stored composition reads back with or without a saved map view', () => {
  assert.deepEqual(readComposition({ holeIds, photoIds, showOtherBoreholes: true }), {
    holeIds,
    photoIds,
    showOtherBoreholes: true,
  });
  const mapView = { centerX: 250000, centerY: 7400000.5, spanM: 300 };
  assert.deepEqual(readComposition({ photoIds, holeIds, showOtherBoreholes: false, mapView }), {
    holeIds,
    photoIds,
    showOtherBoreholes: false,
    mapView,
  });
});

test('compositionJson writes the same keys that save and saveMap stored before', () => {
  assert.deepEqual(compositionJson({ holeIds, photoIds: [], showOtherBoreholes: false }), {
    holeIds,
    photoIds: [],
    showOtherBoreholes: false,
  });
  const mapView = { centerX: 1, centerY: 2, spanM: 3 };
  const stored = compositionJson({ holeIds, photoIds, showOtherBoreholes: true, mapView });
  assert.deepEqual(stored, { holeIds, photoIds, showOtherBoreholes: true, mapView });
  assert.deepEqual(readComposition(JSON.parse(JSON.stringify(stored))), {
    holeIds,
    photoIds,
    showOtherBoreholes: true,
    mapView,
  });
});

test('a malformed stored composition is refused instead of being trusted', () => {
  for (const value of [
    null,
    [],
    'composition',
    { photoIds, showOtherBoreholes: true },
    { holeIds: [1], photoIds, showOtherBoreholes: true },
    { holeIds, photoIds, showOtherBoreholes: 'yes' },
    { holeIds, photoIds, showOtherBoreholes: true, mapView: null },
    { holeIds, photoIds, showOtherBoreholes: true, mapView: { centerX: 1, centerY: 2 } },
  ])
    assert.throws(
      () => readComposition(value),
      /Stored report composition is invalid/,
      JSON.stringify(value),
    );
});
