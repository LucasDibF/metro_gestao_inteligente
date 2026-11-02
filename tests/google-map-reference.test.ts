import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleMapReference } from '@spt/map-reference';
import { technicalMap } from '@spt/report-templates';
const map = {
  zone: 25,
  hemisphere: 'S',
  view: { centerX: 500000, centerY: 10000000, spanM: 390 },
  points: [{ x: 500000, y: 10000000, code: 'PRIVATE-CODE', selected: true }],
};
test('Google reference uses the official UTM center and works as a link without a key', () => {
  const original = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  try {
    const reference = googleMapReference(map)!;
    assert.equal(reference.embedUrl, null);
    const url = new URL(reference.externalUrl);
    assert.equal(url.origin, 'https://www.google.com');
    assert.equal(url.searchParams.get('query'), '0.0000000,-33.0000000');
  } finally {
    if (original !== undefined) process.env.GOOGLE_MAPS_API_KEY = original;
  }
});
test('Google Embed URL is restricted to the official host, encodes the browser key and sends no tenant or hole identifiers', () => {
  const original = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'synthetic key&value';
  try {
    const reference = googleMapReference(map)!;
    const url = new URL(reference.embedUrl!);
    assert.equal(url.origin, 'https://www.google.com');
    assert.equal(url.pathname, '/maps/embed/v1/view');
    assert.equal(url.searchParams.get('key'), 'synthetic key&value');
    assert.equal(url.searchParams.get('maptype'), 'satellite');
    assert.equal(url.searchParams.get('center'), '0.0000000,-33.0000000');
    assert.ok(!reference.embedUrl?.includes('PRIVATE-CODE'));
    assert.ok(!reference.externalUrl.includes('synthetic'));
  } finally {
    if (original === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = original;
  }
});
test('Google reference is absent without official coordinates', () =>
  assert.equal(googleMapReference({ ...map, points: [] }), null));
test('technical PDF map ignores legacy providers and contains only vectors, labels and metre scale', () => {
  const svg = technicalMap({ ...map, baseMap: 'satellite' } as typeof map);
  assert.ok(svg.includes('cx="300" cy="260"'));
  assert.ok(svg.includes('SIRGAS2000'));
  assert.ok(svg.includes('Croqui técnico'));
  assert.ok(!/<image|iframe|google|arcgis|openstreet|openfree/i.test(svg));
});
