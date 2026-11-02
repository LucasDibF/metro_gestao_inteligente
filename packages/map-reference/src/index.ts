export {
  inpeMapBackground,
  renderInpeMap,
  inpeProjection,
  sourceGrid,
  INPE_COLLECTION,
  INPE_LICENSE,
} from './inpe';
export type { InpeBackground, InpeResult } from './inpe';
import proj4 from 'proj4';
interface MapData {
  zone: number;
  hemisphere: string;
  view?: { centerX: number; centerY: number; spanM: number };
  points: Array<{ x: number; y: number }>;
}
/** Google is a browser reference only. No Google content enters report snapshots or PDFs. */
export function googleMapReference(map: MapData) {
  if (!map.points.length) return null;
  const centerX =
    map.view?.centerX ??
    (Math.min(...map.points.map((p) => p.x)) + Math.max(...map.points.map((p) => p.x))) / 2;
  const centerY =
    map.view?.centerY ??
    (Math.min(...map.points.map((p) => p.y)) + Math.max(...map.points.map((p) => p.y))) / 2;
  const utm = `+proj=utm +zone=${map.zone} ${map.hemisphere === 'S' ? '+south' : ''} +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs`;
  const [longitude, latitude] = proj4(utm, 'EPSG:4326', [centerX, centerY]);
  if (
    ![longitude, latitude].every(Number.isFinite) ||
    Math.abs(latitude) > 85 ||
    Math.abs(longitude) > 180
  )
    return null;
  const center = `${latitude.toFixed(7)},${longitude.toFixed(7)}`;
  const external = new URL('https://www.google.com/maps/search/');
  external.search = new URLSearchParams({ api: '1', query: center }).toString();
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  let embedUrl: string | null = null;
  if (key) {
    const zoom = Math.max(
      0,
      Math.min(
        21,
        Math.floor(
          Math.log2(
            (156543.03392 * Math.cos((latitude * Math.PI) / 180) * 420) / (map.view?.spanM ?? 390),
          ),
        ),
      ),
    );
    const embed = new URL('https://www.google.com/maps/embed/v1/view');
    embed.search = new URLSearchParams({
      key,
      center,
      zoom: String(zoom),
      maptype: 'satellite',
      language: 'pt-BR',
    }).toString();
    embedUrl = embed.toString();
  }
  return { embedUrl, externalUrl: external.toString() };
}
