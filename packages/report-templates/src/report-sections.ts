import { templateSince } from './template-version';
import type { ReportSnapshot, MapBackground } from './types';
import { renderTechnicalMap } from './technical-map';
import { escapeHtml as e } from './html';
import { numeric, sheetHeader, sheetFooter } from './sheet-layout';

/** Content chunks are explicit pages; they are never clipped to manufacture a fit. */
function chunks<T>(values: T[], count: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / count) }, (_, i) =>
    values.slice(i * count, (i + 1) * count),
  );
}
export function photographicSheets(s: ReportSnapshot, photos: Record<string, string>) {
  const sheets: string[] = [];
  for (const h of s.holes) {
    const selected = s.photos.filter((p) => p.boreholeId === h.id);
    let offset = 0;
    while (offset < selected.length) {
      // Long captions require a single row. Ordinary four-photo sheets remain unchanged.
      const capacity = selected.slice(offset, offset + 4).some((p) => p.caption.length > 160)
        ? 2
        : 4;
      const group = selected.slice(offset, offset + capacity);
      sheets.push(
        `<section class="page photographic">${sheetHeader(s, 'Registro fotográfico', h)}<div class="photo-grid${group.length === 1 ? ' single-photo' : ''}">${group.map((p, i) => `<article class="photo-card"><div class="photo-caption"><strong>${String(offset + i + 1).padStart(2, '0')}</strong><span>${e(p.caption || 'Registro de campo')}</span></div>${photos[p.id] && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photos[p.id]) ? `<img src="${photos[p.id]}" alt="${e(p.caption)}">` : '<div class="missing">Imagem indisponível</div>'}<div class="photo-meta">${e(h.code)} · UTM oficial do furo (${e(h.officialCoordinate.datum)} — ${h.officialCoordinate.zone}${e(h.officialCoordinate.hemisphere)})<br>E = ${numeric(h.officialCoordinate.eastingM)} m · N = ${numeric(h.officialCoordinate.northingM)} m</div></article>`).join('')}</div>${sheetFooter(s, h)}</section>`,
      );
      offset += group.length;
    }
  }
  return sheets.join('');
}
const coordinates = (points: ReportSnapshot['map']['points'], all = points, indexed = false) =>
  `<table class="coordinate-table"><thead><tr>${indexed ? '<th style="width:12%">Ref.</th>' : ''}<th>Furo</th><th>E (m)</th><th>N (m)</th></tr></thead><tbody>${points.map((p) => `<tr>${indexed ? `<td>[${all.indexOf(p) + 1}]</td>` : ''}<td>${e(p.code)}</td><td>${numeric(p.x)}</td><td>${numeric(p.y)}</td></tr>`).join('')}</tbody></table>`;
export function locationSheets(s: ReportSnapshot, imagery?: MapBackground) {
  const imageCredits =
    imagery?.state === 'ready'
      ? `<p class="note">Fonte: <a href="https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-PCA-FUSED-1">Instituto Nacional de Pesquisas Espaciais (INPE) / CBERS-4A</a> · ${e(imagery.background.date.split('-').reverse().join('/'))} · pixel de 2 m. Imagem recortada, reprojetada e reamostrada. <a href="https://creativecommons.org/licenses/by/4.0/" style="white-space:nowrap">CC BY 4.0</a> · Cena: ${e(imagery.background.scene)}.</p>`
      : imagery?.state === 'unavailable'
        ? `<p class="note">${imagery.reason === 'coverage' ? 'Não foi encontrada imagem INPE com cobertura útil completa nas cenas consultadas.' : imagery.reason === 'extent' ? 'Imagem INPE não disponível para esta abrangência. Para tentar carregá-la, use abrangência de até 1.500 m.' : 'Não foi possível carregar a imagem INPE nesta emissão.'} Croqui técnico preservado, sem fundo de imagem.</p>`
        : '';
  const summary = s.holes.length > 3;
  const mapScene = renderTechnicalMap(
    s.map,
    imagery,
    templateSince(s.templateVersion, '0.8.11') ? 'metro' : 'legacy',
  );
  const firstCount = s.map.points.some((p) => p.code.length > 24) ? 0 : 6;
  const first = s.map.points.slice(0, firstCount),
    remaining = s.map.points.slice(firstCount);
  const notes = s.report.notes;
  const inlineNotes = notes.length <= 600 ? notes : '';
  const legend = `<aside class="legend"><h3>Legenda</h3><p>● ${templateSince(s.templateVersion, '0.8.11') ? 'Azul' : 'Laranja'}: furo incluído</p><p>● Cinza: furo de referência</p><p>UTM ${s.map.zone}${e(s.map.hemisphere)}<br>SIRGAS2000</p>${mapScene.references ? '<p>Rótulos [n]: referência na tabela de coordenadas.</p>' : ''}${mapScene.omitted ? '<p>Furos de referência sem rótulo por densidade: consultar a tabela.</p>' : ''}</aside>`;
  const main = `<section class="page location">${sheetHeader(s, 'Croqui de localização')}<div class="map-visual">${mapScene.svg}</div>${imageCredits}<div class="map-bottom">${first.length ? coordinates(first, s.map.points, mapScene.references) : '<p class="note">Coordenadas na folha de continuação.</p>'}${legend}</div><p class="note">Croqui técnico baseado nas coordenadas oficiais dos furos. Limites do terreno e vias não foram cadastrados.</p>${inlineNotes ? `<p class="report-note">${e(inlineNotes)}</p>` : ''}${sheetFooter(s, undefined, summary)}</section>`;
  const tables = chunks(remaining, firstCount === 0 ? 8 : 12)
    .map(
      (group, i) =>
        `<section class="page location coordinate-continuation">${sheetHeader(s, `Coordenadas dos furos · Continuação ${i + 1}`)}<h3 class="section-title">Coordenadas UTM — ${s.map.zone}${e(s.map.hemisphere)} · SIRGAS2000</h3>${coordinates(group, s.map.points, mapScene.references)}${sheetFooter(s, undefined, summary)}</section>`,
    )
    .join('');
  const notePages =
    notes.length > 600
      ? chunks(Array.from(notes), 1000)
          .map(
            (part, i) =>
              `<section class="page report-notes">${sheetHeader(s, `Observações do relatório · Continuação ${i + 1}`)}<h3 class="section-title">Observações do relatório</h3><p class="continuation-text">${e(part.join(''))}</p>${sheetFooter(s, undefined, summary)}</section>`,
          )
          .join('')
      : '';
  const responsible = summary
    ? chunks(s.holes, 6)
        .map(
          (group, i) =>
            `<section class="page responsible-continuation">${sheetHeader(s, `Responsabilidade técnica · Continuação ${i + 1}`)}<table><thead><tr><th>Furo</th><th>Responsável técnico</th><th>Registro profissional</th></tr></thead><tbody>${group.map((h) => `<tr><td>${e(h.code)}</td><td>${e(h.reviewerName)}</td><td>${e(h.reviewerRegistration)}</td></tr>`).join('')}</tbody></table>${sheetFooter(s, undefined, true)}</section>`,
        )
        .join('')
    : '';
  return main + tables + notePages + responsible;
}
