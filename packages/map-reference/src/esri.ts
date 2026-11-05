import proj4 from 'proj4';
import sharp from 'sharp';
import { inpeProjection, type InpeMapData } from './inpe-geometry';

/** Attribution required by Esri for static maps (printed or PDF) built from World Imagery. */
export const ESRI_ATTRIBUTION =
  'Esri, Vantor, Earthstar Geographics e a comunidade de usuários GIS';
export const ESRI_TERMS = 'https://doc.arcgis.com/en/arcgis-online/reference/static-maps.htm';
const PUBLIC_TILES =
  'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile';
const KEYED_TILES =
  'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile';
const WIDTH = 1200,
  HEIGHT = 1040,
  TILE = 256,
  MAX_ZOOM = 19,
  MAX_TILES = 100,
  MAX_TILE_BYTES = 1024 * 1024,
  MAX_DOWNLOAD = 32 * 1024 * 1024,
  ZOOM_FALLBACKS = 3,
  GRID_STEP = 20;

export interface EsriBackground {
  provider: 'esri';
  image: string;
  zoom: number;
  pixelSizeM: number;
  attribution: string;
}
export type EsriResult =
  | { state: 'ready'; background: EsriBackground }
  | { state: 'unavailable'; reason: 'coverage' | 'service' | 'extent' | 'busy' }
  | { state: 'disabled' };

class MissingTile extends Error {}

/** Ground resolution (m/pixel) of a Web Mercator zoom level at a latitude. */
export function esriGroundResolution(latitude: number, zoom: number) {
  return (156543.03392804097 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Output pixel → Web Mercator world pixel at zoom 0 (multiply by 2^z).
 * Exact proj4 transforms on a 20 px control grid, bilinear inside each cell:
 * over at most 1.5 km the residual is far below one source pixel.
 */
export function esriSourceGrid(map: InpeMapData) {
  const p = inpeProjection(map);
  const geographic = proj4(p.utm, 'EPSG:4326');
  const world = (x: number, y: number) => {
    const [lon, lat] = geographic.forward(p.utmAt(x / 2, y / 2));
    const s = Math.sin((lat * Math.PI) / 180);
    return [
      ((lon + 180) / 360) * TILE,
      (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE,
      lat,
    ];
  };
  const cols = WIDTH / GRID_STEP + 1,
    rows = HEIGHT / GRID_STEP + 1;
  const grid = new Float64Array(cols * rows * 2);
  let minLat = 90,
    maxLat = -90;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const [wx, wy, lat] = world(i * GRID_STEP, j * GRID_STEP);
      grid[(j * cols + i) * 2] = wx;
      grid[(j * cols + i) * 2 + 1] = wy;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  const at = (x: number, y: number) => {
    const gx = Math.min(x / GRID_STEP, cols - 1.000001),
      gy = Math.min(y / GRID_STEP, rows - 1.000001);
    const i = Math.floor(gx),
      j = Math.floor(gy),
      fx = gx - i,
      fy = gy - j;
    const v = (ii: number, jj: number, c: number) => grid[(jj * cols + ii) * 2 + c];
    return [0, 1].map(
      (c) =>
        (v(i, j, c) * (1 - fx) + v(i + 1, j, c) * fx) * (1 - fy) +
        (v(i, j + 1, c) * (1 - fx) + v(i + 1, j + 1, c) * fx) * fy,
    );
  };
  const corners = [
    [0, 0],
    [WIDTH, 0],
    [0, HEIGHT],
    [WIDTH, HEIGHT],
  ].map(([x, y]) => at(x, y));
  // Output pixel size on the ground, from the sheet scale (420 SVG units = span).
  const outputPixelM = p.view.spanM / 840;
  return { at, corners, outputPixelM, latitude: (minLat + maxLat) / 2, world };
}

/** Highest zoom that does not exceed MAX_TILES and is not finer than needed. */
export function esriZoom(map: InpeMapData) {
  const g = esriSourceGrid(map);
  let zoom = MAX_ZOOM;
  while (zoom > 1 && esriGroundResolution(g.latitude, zoom - 1) <= g.outputPixelM) zoom--;
  while (zoom > 1 && tileRange(g.corners, zoom).count > MAX_TILES) zoom--;
  return zoom;
}

function tileRange(corners: number[][], zoom: number) {
  const n = 2 ** zoom;
  const xs = corners.map((c) => c[0] * n),
    ys = corners.map((c) => c[1] * n);
  const left = Math.floor(Math.min(...xs) / TILE - 0.01),
    top = Math.floor(Math.min(...ys) / TILE - 0.01),
    right = Math.floor(Math.max(...xs) / TILE + 0.01),
    bottom = Math.floor(Math.max(...ys) / TILE + 0.01);
  return { left, top, right, bottom, count: (right - left + 1) * (bottom - top + 1) };
}

class EsriHttp {
  private received = 0;
  readonly signal = AbortSignal.timeout(18000);
  constructor(
    private readonly transport: typeof fetch,
    private readonly key: string | undefined,
  ) {}
  async tile(z: number, y: number, x: number) {
    const url = new URL(`${this.key ? KEYED_TILES : PUBLIC_TILES}/${z}/${y}/${x}`);
    url.searchParams.set('blankTile', 'false');
    if (this.key) url.searchParams.set('token', this.key);
    const response = await this.transport(url, { redirect: 'error', signal: this.signal });
    if (response.status === 404) {
      await response.body?.cancel();
      throw new MissingTile();
    }
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/^image\/(jpeg|png)/.test(type) || !response.body) {
      await response.body?.cancel();
      throw Error('Imagery request failed');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        this.received += value.byteLength;
        if (size > MAX_TILE_BYTES || this.received > MAX_DOWNLOAD) {
          await reader.cancel();
          throw Error('Imagery download limit');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const { data, info } = await sharp(Buffer.concat(chunks, size))
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== TILE || info.height !== TILE || info.channels !== 3)
      throw Error('Unexpected Esri tile');
    return data;
  }
}

async function mosaic(
  grid: ReturnType<typeof esriSourceGrid>,
  zoom: number,
  http: EsriHttp,
): Promise<string> {
  const range = tileRange(grid.corners, zoom);
  if (range.count > MAX_TILES) throw Error('Tile limit');
  const cols = range.right - range.left + 1,
    rows = range.bottom - range.top + 1,
    width = cols * TILE,
    height = rows * TILE;
  const pixels = Buffer.alloc(width * height * 3);
  const jobs: Array<[number, number]> = [];
  for (let ty = range.top; ty <= range.bottom; ty++)
    for (let tx = range.left; tx <= range.right; tx++) jobs.push([tx, ty]);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, jobs.length) }, async () => {
      while (next < jobs.length) {
        const [tx, ty] = jobs[next++];
        const n = 2 ** zoom;
        if (ty < 0 || ty >= n) throw new MissingTile();
        const tile = await http.tile(zoom, ty, ((tx % n) + n) % n);
        const ox = (tx - range.left) * TILE,
          oy = (ty - range.top) * TILE;
        for (let row = 0; row < TILE; row++)
          tile.copy(pixels, ((oy + row) * width + ox) * 3, row * TILE * 3, (row + 1) * TILE * 3);
      }
    }),
  );
  const scale = 2 ** zoom,
    originX = range.left * TILE,
    originY = range.top * TILE;
  const output = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    http.signal.throwIfAborted();
    for (let x = 0; x < WIDTH; x++) {
      const [wx, wy] = grid.at(x + 0.5, y + 0.5);
      const sx = Math.min(Math.max(wx * scale - originX - 0.5, 0), width - 1.001),
        sy = Math.min(Math.max(wy * scale - originY - 0.5, 0), height - 1.001);
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        dx = sx - x0,
        dy = sy - y0;
      const a = (y0 * width + x0) * 3,
        b = a + 3,
        c = a + width * 3,
        d = c + 3;
      for (let k = 0; k < 3; k++)
        output[(y * WIDTH + x) * 3 + k] = Math.round(
          (pixels[a + k] * (1 - dx) + pixels[b + k] * dx) * (1 - dy) +
            (pixels[c + k] * (1 - dx) + pixels[d + k] * dx) * dy,
        );
    }
  }
  const jpeg = await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
  return 'data:image/jpeg;base64,' + jpeg.toString('base64');
}

/**
 * Esri World Imagery, reprojected into the croqui's UTM frame. Only tile coordinates
 * (and the optional ArcGIS key) are sent; no borehole codes or tenant data.
 */
export async function renderEsriMap(
  map: InpeMapData,
  transport: typeof fetch = fetch,
  key = process.env.ESRI_API_KEY?.trim() || undefined,
): Promise<EsriResult> {
  let grid: ReturnType<typeof esriSourceGrid>, zoom: number;
  try {
    grid = esriSourceGrid(map);
    zoom = esriZoom(map);
  } catch {
    return { state: 'unavailable', reason: 'extent' };
  }
  const http = new EsriHttp(transport, key);
  for (let z = zoom; z >= Math.max(1, zoom - ZOOM_FALLBACKS); z--) {
    try {
      const image = await mosaic(grid, z, http);
      return {
        state: 'ready',
        background: {
          provider: 'esri',
          image,
          zoom: z,
          pixelSizeM: Math.round(esriGroundResolution(grid.latitude, z) * 100) / 100,
          attribution: ESRI_ATTRIBUTION,
        },
      };
    } catch (error) {
      if (!(error instanceof MissingTile)) return { state: 'unavailable', reason: 'service' };
    }
  }
  return { state: 'unavailable', reason: 'coverage' };
}

const cache = new Map<string, { expires: number; value: Promise<EsriResult> }>();
let active = 0;
export async function esriMapBackground(map: InpeMapData): Promise<EsriResult> {
  if (process.env.ESRI_MAP_ENABLED !== 'true') return { state: 'disabled' };
  const key = JSON.stringify([
    map.zone,
    map.hemisphere,
    map.view,
    map.points.map((p) => [p.x, p.y]),
  ]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (active >= 2) return { state: 'unavailable', reason: 'busy' };
  if (cache.size >= 12) cache.delete(cache.keys().next().value!);
  active++;
  const value = renderEsriMap(map).finally(() => {
    active--;
  });
  const entry = { expires: Date.now() + 15 * 60 * 1000, value };
  cache.set(key, entry);
  void value.then((result) => {
    if (result.state !== 'ready') entry.expires = Date.now() + 10000;
  });
  return value;
}
