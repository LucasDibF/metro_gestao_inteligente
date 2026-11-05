import { fromCustomClient } from 'geotiff';
import sharp from 'sharp';
import { InpeHttp, InpeRangeClient, INPE_COLLECTION } from './inpe-source';
import { inpeProjection, sourceGrid, type InpeMapData } from './inpe-geometry';
export { inpeProjection, sourceGrid } from './inpe-geometry';
export { INPE_COLLECTION, INPE_LICENSE } from './inpe-source';
export interface InpeBackground {
  provider?: 'inpe';
  image: string;
  scene: string;
  date: string;
  pixelSizeM: number;
}
export type InpeResult =
  | { state: 'ready'; background: InpeBackground }
  | { state: 'unavailable'; reason: 'coverage' | 'service' | 'extent' | 'busy' }
  | { state: 'disabled' };
interface Scene {
  id: string;
  date: string;
  url: string;
}
function scenes(value: unknown): Scene[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('features' in value) ||
    !Array.isArray(value.features)
  )
    throw Error('Invalid imagery catalog');
  return value.features
    .slice(0, 6)
    .flatMap((item: unknown) => {
      if (typeof item !== 'object' || item === null) return [];
      const f = item as {
        id?: unknown;
        properties?: { datetime?: unknown };
        assets?: { tci?: { href?: unknown }; rgb?: { href?: unknown } };
      };
      const date = f.properties?.datetime,
        url = (f.assets?.tci ?? f.assets?.rgb)?.href;
      if (
        typeof f.id !== 'string' ||
        !/^CBERS4A_WPM_PCA_RGB321_\d{8}_\d{3}_\d{3}$/.test(f.id) ||
        typeof date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        typeof url !== 'string'
      )
        return [];
      return [{ id: f.id, date: date.slice(0, 10), url }];
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
async function crop(map: InpeMapData, scene: Scene, http: InpeHttp): Promise<string | undefined> {
  const options = { allowFullFile: false, blockSize: 65536, cacheSize: 64, maxRanges: 0 };
  const tiff = await fromCustomClient(new InpeRangeClient(scene.url, http), options, http.signal);
  try {
    const image = await tiff.getImage();
    const epsg = Number(image.getGeoKeys()?.ProjectedCSTypeGeoKey);
    const grid = sourceGrid(map, epsg);
    const origin = image.getOrigin(),
      resolution = image.getResolution();
    if (resolution[0] !== 2 || resolution[1] !== -2 || image.getSamplesPerPixel() !== 3)
      throw Error('Unexpected INPE raster');
    const cols = grid.corners.map((p) => (p[0] - origin[0]) / 2 - 0.5),
      rows = grid.corners.map((p) => (p[1] - origin[1]) / -2 - 0.5);
    const left = Math.floor(Math.min(...cols)),
      top = Math.floor(Math.min(...rows)),
      right = Math.ceil(Math.max(...cols)) + 1,
      bottom = Math.ceil(Math.max(...rows)) + 1;
    if (left < 0 || top < 0 || right > image.getWidth() || bottom > image.getHeight())
      return undefined;
    const width = right - left,
      height = bottom - top;
    if (width * height > 4500000) throw Error('Raster window limit');
    const pixels = await image.readRasters({
      window: [left, top, right, bottom],
      samples: [0, 1, 2],
      interleave: true,
      signal: http.signal,
    });
    if (!(pixels instanceof Uint8Array)) throw Error('Unexpected INPE bit depth');
    const output = Buffer.alloc(1200 * 1040 * 3);
    for (let y = 0; y < 1040; y++) {
      http.signal.throwIfAborted();
      for (let x = 0; x < 1200; x++) {
        const point = grid.at((x + 0.5) / 2, (y + 0.5) / 2),
          sx = (point[0] - origin[0]) / 2 - 0.5 - left,
          sy = (point[1] - origin[1]) / -2 - 0.5 - top;
        const x0 = Math.floor(sx),
          y0 = Math.floor(sy),
          dx = sx - x0,
          dy = sy - y0;
        const neighbors = [
          [x0, y0, (1 - dx) * (1 - dy)],
          [x0 + 1, y0, dx * (1 - dy)],
          [x0, y0 + 1, (1 - dx) * dy],
          [x0 + 1, y0 + 1, dx * dy],
        ];
        for (const [px, py, weight] of neighbors) {
          if (weight < 1e-8) continue;
          const index = (py * width + px) * 3;
          if (
            px < 0 ||
            py < 0 ||
            px >= width ||
            py >= height ||
            !pixels[index] ||
            !pixels[index + 1] ||
            !pixels[index + 2]
          )
            return undefined;
        }
        for (let c = 0; c < 3; c++)
          output[(y * 1200 + x) * 3 + c] = Math.round(
            neighbors.reduce(
              (sum, [px, py, weight]) => sum + (pixels[(py * width + px) * 3 + c] ?? 0) * weight,
              0,
            ),
          );
      }
    }
    return (
      'data:image/jpeg;base64,' +
      (
        await sharp(output, { raw: { width: 1200, height: 1040, channels: 3 } })
          .jpeg({ quality: 92 })
          .toBuffer()
      ).toString('base64')
    );
  } finally {
    await tiff.close();
  }
}
/** No credentials or tenant identifiers are sent. Only a bounded geographic search and TIFF ranges. */
export async function renderInpeMap(
  map: InpeMapData,
  transport: typeof fetch = fetch,
): Promise<InpeResult> {
  let projection: ReturnType<typeof inpeProjection>;
  try {
    projection = inpeProjection(map);
  } catch {
    return { state: 'unavailable', reason: 'extent' };
  }
  const http = new InpeHttp(transport);
  try {
    const collection = (await http.json(INPE_COLLECTION)) as { license?: unknown };
    if (
      !['CC-BY-4.0', 'cc-by-4.0', 'Creative-Commons-Attribution-4.0-International'].includes(
        String(collection?.license),
      )
    )
      throw Error('Unsupported imagery license');
    const url = new URL('https://data.inpe.br/bdc/stac/v1/search');
    url.search = new URLSearchParams({
      collections: 'CB4A-WPM-PCA-FUSED-1',
      bbox: projection.bbox.join(','),
      limit: '6',
    }).toString();
    const candidates = scenes(await http.json(url.toString()));
    let failed = false;
    for (const scene of candidates) {
      try {
        const image = await crop(map, scene, http);
        if (image)
          return {
            state: 'ready',
            background: {
              provider: 'inpe',
              image,
              scene: scene.id,
              date: scene.date,
              pixelSizeM: 2,
            },
          };
      } catch {
        failed = true;
        if (http.signal.aborted) break;
      }
    }
    return { state: 'unavailable', reason: failed ? 'service' : 'coverage' };
  } catch {
    return { state: 'unavailable', reason: 'service' };
  }
}
const cache = new Map<string, { expires: number; value: Promise<InpeResult> }>();
let active = 0;
export async function inpeMapBackground(map: InpeMapData): Promise<InpeResult> {
  if (process.env.INPE_MAP_ENABLED === 'false') return { state: 'disabled' };
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
  const value = renderInpeMap(map).finally(() => {
    active--;
  });
  const entry = { expires: Date.now() + 15 * 60 * 1000, value };
  cache.set(key, entry);
  void value.then((result) => {
    if (result.state !== 'ready')
      entry.expires =
        Date.now() +
        (result.state === 'unavailable' && result.reason === 'coverage' ? 5 * 60 * 1000 : 10000);
  });
  return value;
}
