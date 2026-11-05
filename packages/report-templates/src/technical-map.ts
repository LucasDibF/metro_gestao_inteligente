import { METRO_BLUE } from './metro-brand';
import { placeMapLabels } from './map-labels';
import type { ReportSnapshot, MapBackground } from './index';
import { escapeHtml } from './html';
export function renderTechnicalMap(
  map: ReportSnapshot['map'],
  imagery?: MapBackground,
  palette: 'metro' | 'legacy' = 'metro',
) {
  const background = imagery?.state === 'ready' ? imagery.background : undefined;
  if (
    background &&
    (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(background.image) ||
      (background.provider === 'esri'
        ? !Number.isInteger(background.zoom) ||
          background.zoom < 1 ||
          background.zoom > 23 ||
          !(background.pixelSizeM > 0 && background.pixelSizeM < 100) ||
          !background.attribution.trim()
        : !/^\d{4}-\d{2}-\d{2}$/.test(background.date) ||
          !/^CBERS4A_WPM_PCA_RGB321_\d{8}_\d{3}_\d{3}$/.test(background.scene) ||
          background.pixelSizeM !== 2))
  )
    throw Error(
      background.provider === 'esri'
        ? 'Invalid Esri map background'
        : 'Invalid INPE map background',
    );
  const p = map.points;
  if (!p.length) return { svg: '<p>Sem coordenadas oficiais.</p>', references: false, omitted: 0 };
  const minX = Math.min(...p.map((v) => v.x)),
    maxX = Math.max(...p.map((v) => v.x)),
    minY = Math.min(...p.map((v) => v.y)),
    maxY = Math.max(...p.map((v) => v.y));
  const span = map.view?.spanM ?? Math.max(maxX - minX, maxY - minY, 20) * 1.3,
    centerX = map.view?.centerX ?? (minX + maxX) / 2,
    centerY = map.view?.centerY ?? (minY + maxY) / 2;
  const x = (n: number) => 300 + ((n - centerX) / span) * 420,
    y = (n: number) => 260 - ((n - centerY) / span) * 420;
  const scaleBase = Math.pow(10, Math.floor(Math.log10(span / 5)));
  const scale = ([5, 2, 1].find((value) => value * scaleBase <= span / 5) ?? 1) * scaleBase;
  const scalePx = (scale / span) * 420;
  const projected = p.map((v) => ({ ...v, x: x(v.x), y: y(v.y) }));
  const labels = placeMapLabels(projected);
  const omitted = projected.length - labels.length;
  const references = omitted > 0 || labels.some((l) => l.reference);
  const leaders = labels
    .filter((l) => l.moved)
    .map((l) => {
      const point = projected[l.index];
      const endX = Math.max(l.x, Math.min(point.x, l.x + l.width));
      return `<path d="M${point.x} ${point.y}L${endX} ${l.y - 5}" fill="none" stroke="#747b77" stroke-width=".8"/>`;
    })
    .join('');
  const markers = projected
    .map(
      (v) =>
        `<circle cx="${v.x}" cy="${v.y}" r="6" fill="${v.selected ? (palette === 'metro' ? METRO_BLUE : '#c45a16') : '#87948e'}" stroke="white" stroke-width="1.5"><title>${escapeHtml(v.code)}</title></circle>`,
    )
    .join('');
  const texts = labels
    .map(
      (l) =>
        `<g class="map-point-label" data-point-index="${l.index}" data-reference="${l.reference}"><rect x="${l.x - 2}" y="${l.y - 13}" width="${l.width + 4}" height="${l.height + 2}" fill="white"/><text x="${l.x}" y="${l.y}" font-size="13" fill="#262626">${l.lines.map((line, i) => `<tspan x="${l.x}" dy="${i ? 16 : 0}">${escapeHtml(line)}</tspan>`).join('')}</text></g>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Croqui técnico de locação" viewBox="0 0 600 520" style="width:100%;height:auto"><rect width="600" height="520" fill="white" stroke="#9daaa4"/>${background ? `<image href="${background.image}" width="600" height="520" preserveAspectRatio="none"/><rect x="0" y="468" width="600" height="52" fill="white" fill-opacity=".96"/><rect x="540" y="5" width="50" height="75" fill="white" fill-opacity=".96"/>` : ''}<path d="M555 70V25l-6 12m6-12 6 12" fill="none" stroke="#233a32"/><text x="549" y="19" font-size="13">N</text>${leaders}${markers}${texts}<path d="M30 478v8h${scalePx}v-8" fill="none" stroke="#233a32"/><text x="30" y="505" font-size="12">${scale} m · UTM ${map.zone}${map.hemisphere} · SIRGAS2000</text><text x="30" y="517" font-size="10">${background ? (background.provider === 'esri' ? `Imagem: ${escapeHtml(background.attribution)}` : `INPE / CBERS-4A · ${escapeHtml(background.date.split('-').reverse().join('/'))} · pixel de 2 m`) : imagery?.state === 'unavailable' ? 'Imagem de satélite indisponível; croqui preservado.' : 'Croqui técnico · coordenadas oficiais dos furos.'}</text><rect x=".5" y=".5" width="599" height="519" fill="none" stroke="#9daaa4" stroke-width=".8"/></svg>`;
  return { svg, references, omitted };
}

export function technicalMap(map: ReportSnapshot['map'], imagery?: MapBackground) {
  return renderTechnicalMap(map, imagery).svg;
}
