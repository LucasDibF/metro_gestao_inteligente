import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderInpeMap, inpeMapBackground, inpeProjection, sourceGrid } from '@spt/map-reference';
import { technicalMap } from '@spt/report-templates';
import { inpeFixture } from './helpers/inpe-fixture';
const map = {
  zone: 23,
  hemisphere: 'S',
  view: { centerX: 500000, centerY: 9400000, spanM: 390 },
  points: [{ code: 'PRIVATE-CODE', x: 500000, y: 9400000, selected: true }],
};
test('INPE uses the shared UTM sheet geometry and verifies source projection within two centimetres', () => {
  const p = inpeProjection({ ...map, view: { ...map.view, spanM: 100 } });
  assert.deepEqual(p.utmAt(342, 218), [500010, 9400010]);
  const g = sourceGrid({ ...map, view: { ...map.view, spanM: 100 } }, 32723);
  const source = g.at(342, 218);
  assert.ok(Math.abs(source[0] - 500010) < 0.001);
  assert.ok(Math.abs(source[1] - 9400010) < 0.001);
  assert.throws(() => sourceGrid(map, 4326), /Unsupported image CRS/);
});
test('INPE skips an empty scene, reads bounded TIFF ranges and retains date, pixels and credits', async () => {
  const fixture = inpeFixture();
  const result = await renderInpeMap(map, fixture.transport);
  assert.equal(result.state, 'ready');
  if (result.state !== 'ready') return;
  assert.equal(result.background.date, '2026-09-23');
  assert.equal(result.background.pixelSizeM, 2);
  const image = Buffer.from(result.background.image.split(',')[1], 'base64');
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 1040);
  const stats = await sharp(image).stats();
  assert.ok(Math.abs(stats.channels[1].mean - 130) < 3);
  assert.ok(fixture.calls.filter((c) => c.url.endsWith('.tif')).every((c) => c.range));
  assert.ok(fixture.calls.every((c) => !c.url.includes('PRIVATE-CODE')));
  const svg = technicalMap(map, result);
  assert.ok(svg.includes('<image'));
  assert.ok(svg.indexOf('<image') < svg.indexOf('<circle'));
  assert.ok(svg.includes('23/09/2026'));
  assert.ok(svg.includes('cx="300" cy="260"'));
});
test('INPE missing coverage keeps a truthful vector croqui, with no substituted location', async () => {
  const fixture = inpeFixture({ missing: true });
  const result = await renderInpeMap(map, fixture.transport);
  assert.deepEqual(result, { state: 'unavailable', reason: 'coverage' });
  const svg = technicalMap(map, result);
  assert.ok(!svg.includes('<image'));
  assert.ok(svg.includes('Imagem INPE indisponível'));
});
test('INPE refuses unlicensed data, foreign assets and servers that ignore byte ranges', async () => {
  for (const options of [{ unlicensed: true }, { unsafe: true }, { fullFile: true }]) {
    const fixture = inpeFixture(options);
    assert.deepEqual(await renderInpeMap(map, fixture.transport), {
      state: 'unavailable',
      reason: 'service',
    });
    assert.ok(fixture.calls.every((c) => new URL(c.url).hostname === 'data.inpe.br'));
  }
});
test('INPE bounds large extents before network access and redacts provider errors', async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    throw Error('PRIVATE provider credentials');
  };
  assert.deepEqual(await renderInpeMap({ ...map, view: { ...map.view, spanM: 2000 } }, transport), {
    state: 'unavailable',
    reason: 'extent',
  });
  assert.equal(calls, 0);
  const result = await renderInpeMap(map, transport);
  assert.deepEqual(result, { state: 'unavailable', reason: 'service' });
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('INPE deduplicates simultaneous requests for the same view and can be disabled without a key', async () => {
  const original = process.env.INPE_MAP_ENABLED;
  process.env.INPE_MAP_ENABLED = 'true';
  const fixture = inpeFixture();
  mock.method(globalThis, 'fetch', fixture.transport);
  try {
    const [a, b] = await Promise.all([inpeMapBackground(map), inpeMapBackground(map)]);
    assert.equal(a.state, 'ready');
    assert.strictEqual(a, b);
    assert.equal(fixture.calls.filter((c) => c.url.includes('/search?')).length, 1);
    process.env.INPE_MAP_ENABLED = 'false';
    assert.deepEqual(await inpeMapBackground(map), { state: 'disabled' });
  } finally {
    mock.restoreAll();
    if (original === undefined) delete process.env.INPE_MAP_ENABLED;
    else process.env.INPE_MAP_ENABLED = original;
  }
});
test('PDF refuses remote or malformed INPE image metadata', () => {
  assert.throws(
    () =>
      technicalMap(map, {
        state: 'ready',
        background: {
          image: 'https://untrusted.invalid/image.jpg',
          scene: 'CBERS4A_WPM_PCA_RGB321_20260924_206_133',
          date: '2026-09-24',
          pixelSizeM: 2,
        },
      }),
    /Invalid INPE/,
  );
});

test('INPE rejects a missing colour channel as NoData rather than displaying a corrupt raster', async () => {
  const fixture = inpeFixture({ partialNoData: true });
  assert.deepEqual(await renderInpeMap(map, fixture.transport), {
    state: 'unavailable',
    reason: 'coverage',
  });
});
