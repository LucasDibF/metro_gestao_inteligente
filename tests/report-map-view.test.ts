import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { parseMapView } from '../apps/api/src/reports/report-map';

const refusal = (message: string) => (error: unknown) =>
  error instanceof BadRequestException && error.message === message;

test('parseMapView keeps a valid view and clears it with null', () => {
  assert.equal(parseMapView(null), null);
  assert.deepEqual(parseMapView({ spanM: 300, centerX: 250000.5, centerY: -7400000 }), {
    centerX: 250000.5,
    centerY: -7400000,
    spanM: 300,
  });
  assert.deepEqual(parseMapView({ centerX: 20000000, centerY: 0, spanM: 20000000 }), {
    centerX: 20000000,
    centerY: 0,
    spanM: 20000000,
  });
});

test('parseMapView refuses malformed views', () => {
  for (const value of [
    undefined,
    'view',
    [],
    {},
    { centerX: 1, centerY: 2 },
    { centerX: 1, centerY: 2, spanM: 300, zoom: 3 },
    { centerX: '1', centerY: 2, spanM: 300 },
    { centerX: Number.NaN, centerY: 2, spanM: 300 },
    { centerX: 1, centerY: Number.POSITIVE_INFINITY, spanM: 300 },
  ])
    assert.throws(() => parseMapView(value), refusal('Invalid map view'), JSON.stringify(value));
});

test('parseMapView refuses views outside the supported extent', () => {
  for (const value of [
    { centerX: 20000001, centerY: 0, spanM: 300 },
    { centerX: 0, centerY: -20000001, spanM: 300 },
    { centerX: 0, centerY: 0, spanM: 0.5 },
    { centerX: 0, centerY: 0, spanM: 20000001 },
  ])
    assert.throws(() => parseMapView(value), refusal('Invalid map extent'), JSON.stringify(value));
});
