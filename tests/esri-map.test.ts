import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  renderEsriMap,
  esriMapBackground,
  esriSourceGrid,
  esriZoom,
  mapBackground,
  ESRI_ATTRIBUTION,
} from '@spt/map-reference';
import { technicalMap, renderReport } from '@spt/report-templates';

const map = {
  zone: 25,
  hemisphere: 'S',
  view: { centerX: 255000, centerY: 9359000, spanM: 120 },
  points: [{ code: 'PRIVATE-CODE', x: 255000, y: 9359000, selected: true }],
};

function esriFixture(options: { maxZoom?: number; status?: number; type?: string } = {}) {
  const calls: URL[] = [];
  let tile: Buffer | undefined;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    assert.equal(init?.redirect, 'error');
    if (!['services.arcgisonline.com', 'ibasemaps-api.arcgis.com'].includes(url.hostname))
      throw Error('Unexpected external host');
    if (options.status) return new Response('x', { status: options.status });
    const z = Number(url.pathname.split('/').at(-3));
    if (z > (options.maxZoom ?? 19)) return new Response('missing', { status: 404 });
    tile ??= await sharp({
      create: { width: 256, height: 256, channels: 3, background: { r: 40, g: 150, b: 80 } },
    })
      .jpeg()
      .toBuffer();
    return new Response(new Uint8Array(tile), {
      headers: { 'content-type': options.type ?? 'image/jpeg' },
    });
  };
  return { calls, transport };
}

test('Esri picks a lot-level zoom for small extents and a coarser one for wide extents', () => {
  assert.equal(esriZoom(map), 19);
  const wide = esriZoom({ ...map, view: { ...map.view, spanM: 1200 } });
  assert.ok(wide >= 16 && wide <= 17, String(wide));
  const grid = esriSourceGrid(map);
  // Centre of the sheet (x=600,y=520 output px) is the UTM view centre.
  const centre = grid.at(600, 520);
  const exact = grid.world(600, 520);
  assert.ok(Math.abs(centre[0] - exact[0]) * 2 ** 19 < 0.05);
  assert.ok(Math.abs(centre[1] - exact[1]) * 2 ** 19 < 0.05);
});

test('Esri builds a 1200×1040 UTM-aligned background without sending borehole data', async () => {
  const fixture = esriFixture();
  const result = await renderEsriMap(map, fixture.transport, undefined);
  assert.equal(result.state, 'ready');
  if (result.state !== 'ready') return;
  assert.equal(result.background.provider, 'esri');
  assert.equal(result.background.zoom, 19);
  assert.ok(result.background.pixelSizeM > 0.25 && result.background.pixelSizeM < 0.35);
  assert.equal(result.background.attribution, ESRI_ATTRIBUTION);
  const image = Buffer.from(result.background.image.split(',')[1], 'base64');
  const meta = await sharp(image).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 1040);
  const stats = await sharp(image).stats();
  assert.ok(Math.abs(stats.channels[1].mean - 150) < 4);
  assert.ok(fixture.calls.length > 0 && fixture.calls.length <= 100);
  for (const call of fixture.calls) {
    assert.equal(call.hostname, 'services.arcgisonline.com');
    assert.equal(call.searchParams.get('blankTile'), 'false');
    assert.ok(!call.href.includes('PRIVATE-CODE'));
    assert.equal(call.searchParams.get('token'), null);
  }
  const svg = technicalMap(map, result);
  assert.ok(svg.indexOf('<image') < svg.indexOf('<circle'));
  assert.ok(svg.includes('Imagem: Esri, Vantor'));
});

test('Esri uses the keyed ArcGIS endpoint when a key is configured', async () => {
  const fixture = esriFixture();
  const result = await renderEsriMap(map, fixture.transport, 'synthetic-key');
  assert.equal(result.state, 'ready');
  assert.ok(fixture.calls.every((c) => c.hostname === 'ibasemaps-api.arcgis.com'));
  assert.ok(fixture.calls.every((c) => c.searchParams.get('token') === 'synthetic-key'));
});

test('Esri steps down zoom where high-resolution tiles are missing, then reports coverage', async () => {
  const lower = await renderEsriMap(map, esriFixture({ maxZoom: 17 }).transport, undefined);
  assert.equal(lower.state, 'ready');
  if (lower.state === 'ready') assert.equal(lower.background.zoom, 17);
  assert.deepEqual(await renderEsriMap(map, esriFixture({ maxZoom: 10 }).transport, undefined), {
    state: 'unavailable',
    reason: 'coverage',
  });
});

test('Esri redacts provider failures, refuses non-images and bounds extents before network', async () => {
  for (const options of [{ status: 500 }, { type: 'text/html' }])
    assert.deepEqual(await renderEsriMap(map, esriFixture(options).transport, undefined), {
      state: 'unavailable',
      reason: 'service',
    });
  const fixture = esriFixture();
  assert.deepEqual(
    await renderEsriMap({ ...map, view: { ...map.view, spanM: 2000 } }, fixture.transport),
    { state: 'unavailable', reason: 'extent' },
  );
  assert.equal(fixture.calls.length, 0);
});

test('Esri is opt-in and the combined background falls back to INPE settings', async () => {
  const esri = process.env.ESRI_MAP_ENABLED,
    inpe = process.env.INPE_MAP_ENABLED;
  try {
    delete process.env.ESRI_MAP_ENABLED;
    process.env.INPE_MAP_ENABLED = 'false';
    assert.deepEqual(await esriMapBackground(map), { state: 'disabled' });
    assert.deepEqual(await mapBackground(map), { state: 'disabled' });
  } finally {
    if (esri === undefined) delete process.env.ESRI_MAP_ENABLED;
    else process.env.ESRI_MAP_ENABLED = esri;
    if (inpe === undefined) delete process.env.INPE_MAP_ENABLED;
    else process.env.INPE_MAP_ENABLED = inpe;
  }
});

test('PDF refuses malformed Esri metadata and credits Esri in the location sheet', async () => {
  const fixture = esriFixture();
  const result = await renderEsriMap(map, fixture.transport, undefined);
  assert.equal(result.state, 'ready');
  if (result.state !== 'ready') return;
  for (const background of [
    { ...result.background, image: 'https://example.com/a.jpg' },
    { ...result.background, zoom: 40 },
    { ...result.background, attribution: ' ' },
  ])
    assert.throws(
      () => technicalMap(map, { state: 'ready', background }),
      /Invalid Esri map background/,
    );
  const html = renderReport(
    {
      work: { name: 'Obra', clientName: null, address: null, city: null, state: null },
      tenant: { id: 'tenant', name: 'Empresa de teste' },
      report: { id: 'report', version: 1, notes: '' },
      templateVersion: '0.4.0',
      issueNumber: 1,
      createdAt: '2026-11-05',
      holes: [],
      photos: [],
      map: { ...map },
    } as unknown as Parameters<typeof renderReport>[0],
    {},
    result,
  );
  assert.ok(html.includes('Imagem de satélite: Esri, Vantor'));
  assert.ok(html.includes('Esri World Imagery'));
  assert.ok(html.includes('0,3 m por pixel'));
});
