import {
  sptGraphReading,
  classifySoilState,
  formatSoilDescription,
} from '@spt/geotechnical-engine';
import type { ReportSnapshot } from './index';
import { escapeHtml as e } from './html';
import { numeric as n, sheetHeader, sheetFooter } from './sheet-layout';
type Hole = ReportSnapshot['holes'][number];
export function advanceLabel(a: { blows: number; penetrationMm: number } | undefined) {
  return !a
    ? '—'
    : a.penetrationMm === 150
      ? String(a.blows)
      : `${a.blows}/${n(a.penetrationMm / 10)}`;
}
function aggregate(a: Hole['tests'][number]['advances'], i: number) {
  const pair = a.slice(i, i + 2);
  if (pair.length !== 2) return '—';
  const blows = pair.reduce((s, a) => s + a.blows, 0),
    mm = pair.reduce((s, a) => s + a.penetrationMm, 0);
  return mm === 300 ? String(blows) : `${blows}/${n(mm / 10)}`;
}
// Arial 10 px advances measured in the supported Chromium renderer, ASCII 32–126.
// Round upward and reserve full ems for unknown graphemes; never split a grapheme.
const arialAdvances = [
  2.778, 2.778, 3.55, 5.562, 5.562, 8.892, 6.67, 1.909, 3.33, 3.33, 3.892, 5.84, 2.778, 3.33, 2.778,
  2.778, 5.562, 5.562, 5.562, 5.562, 5.562, 5.562, 5.562, 5.562, 5.562, 5.562, 2.778, 2.778, 5.84,
  5.84, 5.84, 5.562, 10.151, 6.67, 6.67, 7.222, 7.222, 6.67, 6.108, 7.778, 7.222, 2.778, 5, 6.67,
  5.562, 8.33, 7.222, 7.778, 6.67, 7.778, 7.222, 6.67, 6.108, 7.222, 6.67, 9.438, 6.67, 6.67, 6.108,
  2.778, 2.778, 2.778, 4.692, 5.562, 3.33, 5.562, 5.562, 5, 5.562, 5.562, 2.778, 5.562, 5.562,
  2.222, 2.222, 5, 2.222, 8.33, 5.562, 5.562, 5.562, 5.562, 3.33, 5, 2.778, 5.562, 5, 7.222, 5, 5,
  5, 3.34, 2.598, 3.34, 5.84,
];
const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
function advanceWidth(value: string): number {
  const base = value.normalize('NFD').replace(/\p{Mark}/gu, '');
  const code = base.codePointAt(0) ?? 32;
  return base.length === 1 && code >= 32 && code <= 126
    ? arialAdvances[code - 32] + 0.02
    : Math.max(1, Array.from(base).length) * 10;
}
function measureText(value: string): number {
  return Array.from(segmenter.segment(value), (part) => advanceWidth(part.segment)).reduce(
    (a, b) => a + b,
    0,
  );
}
function wrap(value: string, maxWidth: number, maxCharacters = Infinity) {
  const lines: string[] = [];
  let line = '',
    width = 0,
    characters = 0;
  const flush = () => {
    if (line) lines.push(line);
    line = '';
    width = 0;
    characters = 0;
  };
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const graphemes = Array.from(segmenter.segment(word), (part) => part.segment);
    const wordWidth = graphemes.reduce((sum, part) => sum + advanceWidth(part), 0);
    if (
      line &&
      (width + advanceWidth(' ') + wordWidth > maxWidth ||
        characters + 1 + graphemes.length > maxCharacters)
    )
      flush();
    if (line) {
      line += ' ';
      width += advanceWidth(' ');
      characters++;
    }
    for (const part of graphemes) {
      const partWidth = advanceWidth(part);
      if (line && (width + partWidth > maxWidth || characters + 1 > maxCharacters)) flush();
      line += part;
      width += partWidth;
      characters++;
    }
  }
  flush();
  return lines;
}
/** Display only sampled metre intervals, joining adjacent identical classifications.
 * Raw geological layers remain unchanged in the report snapshot.
 */
export function sampledLayers(
  h: Hole,
  classify = false,
  commas = false,
  includeInitialSoil = false,
): Hole['layers'] {
  const intervals = h.tests
    .filter(
      (t) =>
        t.advances.some((a) => a.penetrationMm > 0) ||
        (includeInitialSoil && Number(t.depthM) === 1 && t.result.status === 'NOT_TESTED'),
    )
    .map((t) => {
      const depth = Number(t.depthM);
      return { from: Math.max(0, depth - 1), to: depth === 0 ? 1 : depth, result: t.result };
    })
    .sort((a, b) => a.from - b.from);
  const pieces: Hole['layers'] = [];
  for (const layer of h.layers) {
    for (const interval of intervals) {
      const from = Math.max(Number(layer.fromM), interval.from);
      const to = Math.min(Number(layer.toM), interval.to, Number(h.executedDepthM));
      if (to > from) {
        const state = classify ? classifySoilState(layer.soilType, interval.result) : null;
        pieces.push({
          ...layer,
          description:
            state?.status === 'CLASSIFIED'
              ? commas
                ? formatSoilDescription([state.designation, layer.description])
                : `${state.designation}. ${layer.description}`
              : layer.description,
          fromM: String(from),
          toM: String(to),
        });
      }
    }
  }
  pieces.sort((a, b) => Number(a.fromM) - Number(b.fromM));
  return pieces.reduce<Hole['layers']>((result, piece) => {
    const last = result.at(-1);
    if (
      last &&
      Number(piece.fromM) <= Number(last.toM) &&
      last.soilType === piece.soilType &&
      last.description === piece.description
    )
      last.toM = String(Math.max(Number(last.toM), Number(piece.toM)));
    else result.push({ ...piece });
    return result;
  }, []);
}
/** Partial terminal advance is measured from the beginning of its metre row. */
export function profileTermination(h: Hole) {
  const last = [...h.tests].sort((a, b) => Number(a.depthM) - Number(b.depthM)).at(-1);
  const penetration = last?.advances.reduce((sum, a) => sum + a.penetrationMm, 0) ?? 0;
  const partial =
    last &&
    penetration > 0 &&
    penetration < 450 &&
    (last.interruptionReason || last.result.nSpt === null);
  const recorded = Number(h.executedDepthM);
  if (!partial) return { depth: recorded, row: recorded, partial: false };
  const measured =
    Math.round((Math.max(0, Number(last.depthM) - 1) + penetration / 1000) * 1000) / 1000;
  return measured <= recorded
    ? { depth: measured, row: Number(last.depthM), partial: true }
    : { depth: recorded, row: recorded, partial: false };
}
/** The Excel's depth window is fixed: 0–20 m, then 20–40 m, independently of executed depth. */
export interface ProfileViewOptions {
  interactive?: boolean;
  coordinateMissing?: boolean;
  fieldDateMissing?: boolean;
}
export function engineeringProfiles(s: ReportSnapshot, h: Hole, options: ProfileViewOptions = {}) {
  const header = (subtitle: string) =>
    sheetHeader(
      s,
      subtitle,
      h,
      options.fieldDateMissing ? { fieldDateLabel: 'Não informada' } : undefined,
    );
  const footer = () =>
    options.interactive
      ? `<div class="document-footer"><footer class="responsibility"><div><b>CONFERÊNCIA INTERATIVA — SEM EMISSÃO</b><br>Dados da versão técnica ${h.technicalVersion}. Consulte os registros e pendências antes da aprovação.</div></footer></div>`
      : sheetFooter(s, h);

  const coloredSums = [
    '0.8.4',
    '0.8.5',
    '0.8.6',
    '0.8.7',
    '0.8.8',
    '0.8.9',
    '0.8.10',
    '0.8.11',
  ].includes(s.templateVersion);
  const initialColor = '#2155b5';
  const finalColor = coloredSums ? '#c62828' : '#cf6500';
  const termination = profileTermination(h);
  const pageCount = Math.max(1, Math.ceil(termination.row / 20));
  return Array.from({ length: pageCount }, (_, page) => {
    const from = page * 20,
      to = from + 20,
      top = 80,
      height = 510,
      bottom = top + height;
    const y = (d: number) => top + ((d - from) / 20) * height;
    const text = (x: number, y: number, v: unknown, anchor = 'middle', extra = '') =>
      `<text x="${x}" y="${y}" text-anchor="${anchor}" ${extra}>${e(v)}</text>`;
    const tests = [...h.tests].sort((a, b) => Number(a.depthM) - Number(b.depthM));
    // Boundary records belong to the preceding sheet; only the first includes zero.
    const inWindow = (depth: number) => (page === 0 ? depth >= from : depth > from) && depth <= to;
    const visible = tests.filter((t) => inWindow(Number(t.depthM)));
    const depthBaseline = (depth: number) => y(depth) - 8;
    const recordBaseline = (depth: number) => (depth === 0 ? top + 9 : depthBaseline(depth));
    const endRow = Math.min(to, termination.row);
    const fullGrid = ['0.8.7', '0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion);
    const activeBottom = fullGrid ? bottom : y(endRow);
    const ticks = Array.from({ length: 20 }, (_, i) => from + i + 1).filter((d) => d <= endRow);
    const displayDepth = (d: number) =>
      termination.partial && d === termination.row ? termination.depth : d;
    const layers = sampledLayers(
      h,
      ['0.8.5', '0.8.6', '0.8.7', '0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion),
      ['0.8.6', '0.8.7', '0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion),
      ['0.8.7', '0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion),
    ).filter((l) => Number(l.fromM) < to && Number(l.toM) > from);
    const continuousGraph = ['0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion);
    const partialGraph = ['0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion);
    const largest = Math.max(
      50,
      ...(partialGraph
        ? visible.flatMap((t) => [
            sptGraphReading(t, 0)?.value ?? 0,
            sptGraphReading(t, 1)?.value ?? 0,
          ])
        : []),
      ...visible.map((t) => t.result.nSpt ?? 0),
      ...visible
        .filter((t) => t.result.nSpt !== null)
        .map((t) => t.advances[0].blows + t.advances[1].blows),
    );
    const rawStep = largest / 6;
    const power = 10 ** Math.floor(Math.log10(rawStep));
    const step = ([1, 2, 5, 10].find((value) => value * power >= rawStep) ?? 10) * power;
    const maxGraph = Math.ceil(largest / step) * step;
    const majorTicks = Array.from({ length: Math.round(maxGraph / step) + 1 }, (_, i) => i * step);
    const minorTicks = Array.from(
      { length: Math.round(maxGraph / (step / 2)) + 1 },
      (_, i) => (i * step) / 2,
    );
    const gx = (v: number) => 338 + (v / maxGraph) * 128;
    const curves = [0, 1].map((start) => {
      let previous: { x: number; y: number; depth: number } | undefined;
      return tests
        .map((t) => {
          const depth = Number(t.depthM);
          const measured = partialGraph ? sptGraphReading(t, start) : null;
          const legacyValid =
            t.result.nSpt !== null &&
            !t.interruptionReason &&
            t.advances.length === 3 &&
            t.advances.every((a) => a.penetrationMm === 150);
          if (!inWindow(depth) || (partialGraph ? !measured : !legacyValid)) {
            previous = undefined;
            return '';
          }
          const value =
            measured?.value ??
            (start === 1 ? t.result.nSpt! : t.advances[0].blows + t.advances[1].blows);
          const p = { x: gx(value), y: y(depth), depth };
          const segment =
            (continuousGraph || !measured || measured.conventional) &&
            previous &&
            depth - previous.depth <= 1.01
              ? `<path d="M${previous.x} ${previous.y}L${p.x} ${p.y}"/>`
              : '';
          previous = !continuousGraph && measured && !measured.conventional ? undefined : p;
          if (!continuousGraph && measured && !measured.conventional) {
            const r = start === 0 ? 3.8 : 2.2;
            const labelY =
              p.y + 10 > bottom
                ? p.y - (start === 0 ? 16 : 5)
                : p.y - 8 < top
                  ? p.y + (start === 0 ? 10 : 21)
                  : p.y + (start === 0 ? -6 : 9);
            return `<g class="partial-reading" data-reading="${e(measured.label)}"><title>${e(measured.label)} golpes/cm; leitura parcial, sem N-SPT convencional</title><path d="M${p.x} ${p.y - r}l${r} ${r}l-${r} ${r}l-${r} -${r}Z" fill="white" stroke-dasharray="none"/>${text(p.x > 437 ? p.x - 6 : p.x + 6, labelY, measured.label, p.x > 437 ? 'end' : 'start', 'font-size="7" stroke="none"')}</g>`;
          }
          return continuousGraph
            ? `<g class="continuous-reading" data-depth-m="${depth}">${segment}<circle cx="${p.x}" cy="${p.y}" r="2"/></g>`
            : `${segment}<circle cx="${p.x}" cy="${p.y}" r="2"/>`;
        })
        .join('');
    });
    const overflows: Hole['layers'] = [];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="profile-chart" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" role="${options.interactive ? 'group' : 'img'}" aria-label="Perfil SPT de ${from} a ${to} m com nível d’água, revestimento e método" viewBox="0 0 720 ${bottom + 6}" style="font:8.25px Arial;fill:#252525"><defs><pattern id="sand" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#f7e6c5"/><circle cx="2" cy="3" r=".7" fill="#9d7946"/></pattern><pattern id="clay" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#efd0b5"/><path d="M0 7L7 0" stroke="#ba8155" stroke-width=".7"/></pattern><pattern id="other" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#eee"/><path d="M0 3h7" stroke="#999" stroke-width=".5"/></pattern></defs><rect x=".5" y=".5" width="719" height="${bottom}" fill="white"/><rect x="1" y="1" width="718" height="${top - 1}" fill="#f6f6f6"/>
 ${[
   [14, 'COTA (m)'],
   [42, 'PERFIL'],
   [73, 'PROF. (m)'],
   [646, 'REVEST.'],
   [704, 'MÉTODO'],
 ]
   .map(([x, v]) => text(Number(x), 42, v, 'middle', `transform="rotate(-90 ${x} 42)"`))
   .join('')}
 ${text(208, 14, 'PESO: NI · QUEDA: NI', 'middle', 'font-size="9"')}${text(208, 28, 'REVESTIMENTO (DIÂMETRO): NI', 'middle', 'font-size="9"')}${text(208, 42, 'AMOSTRADOR / Ø INT. / Ø EXT.: NI', 'middle', 'font-size="9"')}${text(208, 68, 'CLASSIFICAÇÃO DAS CAMADAS', 'middle', 'font-size="9.5" font-weight="bold"')}
 ${text(403, 16, 'RESISTÊNCIA À', 'middle', 'font-size="10" font-weight="bold"')}${text(403, 30, 'PENETRAÇÃO — N', 'middle', 'font-size="10" font-weight="bold"')}${text(403, 48, 'GOLPES / 30 cm', 'middle', 'font-size="9.5"')}${text(556, 17, 'ENSAIO SPT', 'middle', 'font-size="10" font-weight="bold"')}${text(556, 34, 'GOLPES / PENETRAÇÃO', 'middle', 'font-size="9.5"')}${text(672, 42, 'NÍVEL D’ÁGUA (m)', 'middle', 'transform="rotate(-90 672 42)"')}
 ${[
   [491, '1º'],
   [521, '2º'],
   [551, '3º'],
   [583, '1º+2º'],
   [618, '2º+3º'],
 ]
   .map(([x, v]) =>
     text(
       Number(x),
       66,
       v,
       'middle',
       `font-size="9.5" font-weight="bold"${coloredSums && (x === 583 || x === 618) ? ` fill="${x === 583 ? initialColor : finalColor}"` : ''}`,
     ),
   )
   .join('')}
 <g stroke="#999" stroke-width=".55" fill="none">${Array.from({ length: 21 }, (_, i) => from + i)
   .filter((d) => fullGrid || d <= endRow)
   .map(
     (d) =>
       `<path d="M330 ${y(d)}H${fullGrid && d > endRow ? 476 : 636}"/>${fullGrid ? `<path class="method-grid" d="M688 ${y(d)}H720"/>` : ''}`,
   )
   .join(
     '',
   )}${minorTicks.map((value) => `<path class="n-grid" d="M${gx(value)} ${top}V${activeBottom}"/>`).join('')}</g>
 <g stroke="#777" stroke-width=".7" fill="none">${[28, 56, 90, 330, 476, 636, 656, 688].map((x) => `<path d="M${x} 0V${bottom}"/>`).join('')}${[506, 536, 566, 601].map((x) => `<path d="M${x} 46V${bottom}"/>`).join('')}<path d="M90 51H330M476 46H636M0 ${top}H720"/></g>
 ${majorTicks.map((value) => text(gx(value), 72, value, 'middle', 'class="n-tick" font-size="9.5"')).join('')}
 ${ticks.map((d) => text(73, depthBaseline(d), displayDepth(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'middle', `class="depth-tick" data-depth-m="${displayDepth(d)}" font-size="9.5"`)).join('')}
 ${(h.officialCoordinate.altitudeM === null ? [from] : ticks)
   .map((depth) => {
     const label =
       h.officialCoordinate.altitudeM === null
         ? 'NI'
         : n(Number(h.officialCoordinate.altitudeM) - displayDepth(depth));
     const size = Math.min(9.5, (25 / measureText(label)) * 10);
     return text(
       14,
       depthBaseline(depth),
       label,
       'middle',
       `class="cota-tick" data-depth-m="${depth}" font-size="${size}"`,
     );
   })
   .join('')}
 ${layers
   .map((l) => {
     const soil = l.soilType.toLowerCase();
     const pattern = soil.startsWith('areia')
       ? 'sand'
       : soil.startsWith('argila')
         ? 'clay'
         : 'other';
     const yy = y(Math.max(from, Number(l.fromM))),
       end = y(Math.min(to, Number(l.toM)));
     const words = wrap(
         ['0.8.6', '0.8.7', '0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion)
           ? formatSoilDescription([l.soilType, l.description])
           : `${l.soilType}. ${l.description}`,
         230,
       ),
       limit = Math.max(0, 1 + Math.floor((end - yy - 13) / 12));
     const shown = words.slice(0, limit);
     if (words.length > limit) {
       overflows.push(l);
       if (limit > 0) shown[limit - 1] = 'Descrição integral: ver complemento.';
     }
     return `<g class="sampled-layer" data-from-m="${l.fromM}" data-to-m="${l.toM}"${options.interactive ? ` data-sheet-selection="layer" role="button" tabindex="0" aria-label="Consultar camada de ${e(l.fromM)} a ${e(l.toM)} m"` : ''}>${options.interactive ? `<rect class="interaction-hit" x="29" y="${yy}" width="301" height="${end - yy}" fill="transparent"/>` : ''}<rect x="29" y="${yy}" width="26" height="${end - yy}" fill="url(#${pattern})"/><path d="M28 ${end}H56M90 ${end}H330" stroke="#777" stroke-width=".7"/>${shown.map((line, i) => text(210, ['0.8.3', '0.8.4', '0.8.5', '0.8.6', '0.8.7', '0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion) ? (yy + end) / 2 + (i - (shown.length - 1) / 2) * 12 : yy + 11 + i * 12, line, 'middle', `font-size="10"${['0.8.3', '0.8.4', '0.8.5', '0.8.6', '0.8.7', '0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion) ? ' dominant-baseline="central"' : ''}`)).join('')}</g>`;
   })
   .join('')}
 ${visible
   .map((t) => {
     const baseline = recordBaseline(Number(t.depthM));
     const cell = (x: number, label: string, width: number, color?: string) =>
       text(
         x,
         baseline,
         label,
         'middle',
         `font-size="${Math.min(10, (width / measureText(label)) * 10)}"${color ? ` fill="${color}"` : ''}`,
       );
     return (
       `<g class="spt-record" data-depth-m="${e(t.depthM)}"${options.interactive ? ` data-sheet-selection="test" role="button" tabindex="0" aria-label="Consultar ensaio a ${e(t.depthM)} m"` : ''}>` +
       (options.interactive
         ? `<rect class="interaction-hit" x="330" y="${Number(t.depthM) === 0 ? top : y(Math.max(from, Number(t.depthM) - 1))}" width="388" height="${Number(t.depthM) === 0 ? 14 : Math.max(1, y(Number(t.depthM)) - y(Math.max(from, Number(t.depthM) - 1)))}" fill="transparent"/>`
         : '') +
       [0, 1, 2].map((i) => cell(491 + i * 30, advanceLabel(t.advances[i]), 26)).join('') +
       cell(583, aggregate(t.advances, 0), 30, coloredSums ? initialColor : undefined) +
       cell(618, aggregate(t.advances, 1), 30, coloredSums ? finalColor : undefined) +
       '</g>'
     );
   })
   .join('')}

 ${([
   '0.8.2',
   '0.8.3',
   '0.8.4',
   '0.8.5',
   '0.8.6',
   '0.8.7',
   '0.8.8',
   '0.8.9',
   '0.8.10',
   '0.8.11',
 ].includes(s.templateVersion)
   ? []
   : visible
 )
   .filter((t) => t.result.nSpt === null)
   .map((t) =>
     text(
       343,
       Math.max(top + 9, y(Number(t.depthM)) - 5),
       'ND',
       'start',
       'class="non-definitive-result" font-size="9" font-weight="bold" fill="#555"',
     ),
   )
   .join('')}
 <g fill="${initialColor}" stroke="${initialColor}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3">${curves[0]}</g><g fill="${finalColor}" stroke="${finalColor}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${curves[1]}</g>
 ${
   h.waterLevelM !== null && inWindow(Number(h.waterLevelM))
     ? (() => {
         const waterY = y(Number(h.waterLevelM));
         const rises = waterY + 8 > bottom;
         const labelY = rises ? waterY - 12 : waterY - 5 < top + 8 ? waterY + 20 : waterY - 5;
         return `<g class="water-marker" data-depth-m="${e(h.waterLevelM)}"><title>NA ${n(h.waterLevelM)} m</title><path class="water-symbol" d="M660 ${waterY}H684l-12 ${rises ? -8 : 8}z" fill="#2155b5"/>${text(672, labelY, n(h.waterLevelM), 'middle', 'fill="#2155b5" font-weight="bold" font-size="10"')}</g>`;
       })()
     : ''
 }

 ${text(646, top + 25, 'NI')}${
   [
     '0.8.1',
     '0.8.2',
     '0.8.3',
     '0.8.4',
     '0.8.5',
     '0.8.6',
     '0.8.7',
     '0.8.8',
     '0.8.9',
     '0.8.10',
     '0.8.11',
   ].includes(s.templateVersion) && visible.some((t) => t.fieldDetails?.executionMethod)
     ? visible
         .map((t) => {
           const label =
             (
               { TC: 'TC', TH: 'TH', SP_TH: 'SP+TH', CA: 'CA', SP_CA: 'SP+CA' } as Record<
                 string,
                 string
               >
             )[t.fieldDetails?.executionMethod ?? ''] ?? 'NI';
           return text(
             704,
             Math.min(bottom - 4, Math.max(top + 9, y(Number(t.depthM)) - 5)),
             label,
             'middle',
             'font-size="7"',
           );
         })
         .join('')
     : text(704, top + 25, 'NI')
 }

 <rect class="profile-frame" x=".6" y=".6" width="718.8" height="${bottom - 0.6}" fill="none" stroke="#666" stroke-width="1.1"/>
 </svg>`;
    const water =
      h.waterLevelM === null
        ? 'Não informado (não equivale a NE)'
        : n(h.waterLevelM) + ' m — horário não registrado';
    const observations = visible
      .filter((t) => t.interruptionReason)
      .map(
        (t) =>
          `${n(displayDepth(Number(t.depthM)))} m — ${t.interruptionReason} (N-SPT ${t.result.nSpt === null ? 'não definido' : t.result.nSpt}).`,
      );
    const moveObservations = observations.length > 2 || observations.join('').length > 180;
    const supplementNotice =
      overflows.length || moveObservations
        ? '<p class="excel-note">Descrições e observações integrais: ver complemento técnico identificado por intervalo de profundidade.</p>'
        : '';
    const body = `${header(`Perfil individual · ${from}–${to} m · Trecho ${page + 1}/${pageCount}`)}<table class="excel-meta"><tr><td colspan="2"><b>Coordenadas UTM:</b> ${options.coordinateMissing ? 'Não informadas' : `E ${n(h.officialCoordinate.eastingM)} · N ${n(h.officialCoordinate.northingM)} · ${h.officialCoordinate.zone}${e(h.officialCoordinate.hemisphere)} · ${e(h.officialCoordinate.datum)}`}</td><td>Início: NI · Término: NI</td></tr><tr><td>Tipologia: NI · Km: NI · Lote: NI</td><td>Posição / eixo: NI · Desloc.: NI</td><td>Fiscal: NI</td></tr></table>${svg}${supplementNotice}<table class="excel-limit"><tr><td style="width:30%"><b>Limite:</b> ${n(termination.depth)} m</td><td><b>Motivo da paralisação:</b> não registrado</td></tr></table><div class="excel-bottom"><table><thead><tr><th colspan="3">PROFUNDIDADE DO NÍVEL D’ÁGUA</th></tr><tr><th>Leitura</th><th>Data / hora</th><th>Prof. (m)</th></tr></thead><tbody><tr><td>Cadastrada*</td><td>NI</td><td>${h.waterLevelM === null ? 'NI' : n(h.waterLevelM)}</td></tr><tr><td>Inicial</td><td>NI</td><td>NI</td></tr><tr><td>Após 12/24 h</td><td>NI</td><td>NI</td></tr></tbody></table><div class="excel-legend"><b>LEGENDA / AVANÇOS</b><p><span style="color:#2155b5">– – 30 cm iniciais</span><br><span style="color:${coloredSums ? finalColor : '#b95600'}">— 30 cm finais (N-SPT)</span><br>Trado: NI · Lavagem: NI<br>Prof. revestimento: NI</p></div><table><thead><tr><th colspan="2">LAVAGEM POR TEMPO (30 min)</th></tr><tr><th>Tempo</th><th>Avanço (cm)</th></tr></thead><tbody>${['0 a 10 min', '10 a 20 min', '20 a 30 min'].map((t) => `<tr><td>${t}</td><td>NI</td></tr>`).join('')}</tbody></table></div><p class="excel-note">* Nível d’água cadastrado: ${water}. O cadastro atual não identifica o momento da leitura.</p><p class="excel-note">NI = não informado; NE = não encontrado (não inferido). SP: percussão · TC: trado concha · TH: trado helicoidal · CA: circulação de água. Avanços normais: golpes; especiais: golpes/cm. ${partialGraph && !continuousGraph ? 'Losangos: leituras parciais em golpes/cm, sem normalização.' : ''} ${['0.8.2', '0.8.3', '0.8.4', '0.8.5', '0.8.6', '0.8.7', '0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion) ? '' : 'ND: N-SPT não definido. '}Hachuras representativas, sem indicar mineralogia ou cor real. Equipamento e conformidade normativa: não confirmados.</p>${moveObservations ? '' : observations.map((note) => `<p class="excel-note">${e(note)}</p>`).join('')}${footer()}`;
    // Fixed line budgets make each continuation an explicit, identified sheet.
    // Full descriptions are repeated here, never truncated to the profile interval.
    const continuationLines = overflows.flatMap((l) => [
      ...wrap(
        `${n(l.fromM)}–${n(l.toM)} m: ${['0.8.6', '0.8.7', '0.8.8', '0.8.9', '0.8.10', '0.8.11'].includes(s.templateVersion) ? formatSoilDescription([l.soilType, l.description]) : `${l.soilType}. ${l.description}`}`,
        610,
      ),
      '',
    ]);
    if (moveObservations)
      continuationLines.push(
        'Observações integrais dos ensaios',
        ...observations.flatMap((note) => [...wrap(note, 610), '']),
      );
    const continuationTitle = moveObservations
      ? 'Complemento técnico'
      : 'Complemento de descrições';
    const sectionTitle = moveObservations
      ? 'Descrições e observações integrais'
      : 'Descrição integral das camadas';
    const continuationCount = Math.ceil(continuationLines.length / 40);
    const continuation = Array.from(
      { length: continuationCount },
      (_, i) =>
        `<section class="page engineering description-continuation"><div>${header(`${continuationTitle} · ${from}–${to} m · ${i + 1}/${continuationCount}`)}<h3 class="section-title">${sectionTitle}</h3><div style="font:10px Arial;line-height:13px">${continuationLines
          .slice(i * 40, (i + 1) * 40)
          .map(
            (line) =>
              `<div style="min-height:13px;white-space:pre-wrap;overflow-wrap:anywhere">${e(line)}</div>`,
          )
          .join('')}</div></div>${footer()}</section>`,
    ).join('');
    return `<section class="page engineering excel-profile" data-depth-from="${from}" data-depth-to="${to}">${body}</section>${continuation}`;
  }).join('');
}
export const engineeringCss = '';
