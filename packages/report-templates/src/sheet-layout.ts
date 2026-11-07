import { templateSince } from './template-version';
import { snapshotCompanyLogo } from './company-brand';
import { metroIcon } from './metro-brand';
import { PRINT_LAYOUT } from './print-layout';
import type { ReportSnapshot } from './types';
import { escapeHtml as e } from './html';
import { missingFieldWording } from './missing-field';
export const numeric = (n: string | number) =>
  Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export function sheetHeader(
  s: ReportSnapshot,
  subtitle: string,
  h?: ReportSnapshot['holes'][number],
  preview?: { fieldDateLabel?: string },
) {
  const logo = snapshotCompanyLogo(s);
  const company = templateSince(s.templateVersion, '0.8.13')
    ? logo
      ? `<img class="report-company-header-logo" src="${logo}" alt="${e(s.tenant.name)}">`
      : `<strong>${e(s.tenant.name)}</strong>`
    : null;
  const notInformed = (wording: string) => missingFieldWording(s.templateVersion, wording);
  return `<header class="brand-header"><div class="brand">${company ?? `${templateSince(s.templateVersion, '0.8.11') ? metroIcon : `<svg viewBox="0 0 46 46" width="39" height="39" aria-hidden="true"><path d="M4 16L23 5l19 11-19 11z" fill="none" stroke="#ed7900" stroke-width="3"/><path d="M4 24l19 11 19-11M4 32l19 11 19-11" fill="none" stroke="#303030" stroke-width="3"/></svg>`}<strong>${e(s.tenant.name)}</strong>`}</div><div class="report-heading"><b>RELATÓRIO DE SONDAGEM SPT</b><span>${e(subtitle)}</span></div><div class="folio">Folha<br><b>__SHEET__ / __TOTAL__</b></div></header><div class="identification"><table><tr><td><b>Cliente:</b> ${e(s.work.clientName ?? notInformed('Não informado'))}</td></tr><tr><td><b>Obra:</b> ${e(s.work.name)}</td></tr><tr><td><b>Local:</b> ${e([s.work.city, s.work.state, s.work.address].filter(Boolean).join(' · ') || notInformed('Não informado'))}</td></tr></table><table class="hole-id"><tr><td><b>${h ? 'Furo: ' + e(h.code) : 'Locação dos furos'}</b></td></tr><tr><td><b>${h ? 'Data de campo:' : 'Data de emissão:'}</b> ${e(h ? (preview?.fieldDateLabel ?? h.fieldDate.slice(0, 10).split('-').reverse().join('/')) : new Date(s.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</td></tr><tr><td><b>${h ? 'Cota (m):' : 'Cotas:'}</b> ${h ? (h.officialCoordinate.altitudeM != null ? numeric(h.officialCoordinate.altitudeM) : notInformed('Não informada')) : 'Conforme perfis dos furos'}</td></tr></table></div>`;
}
export function sheetFooter(
  s: ReportSnapshot,
  h?: ReportSnapshot['holes'][number],
  summary = false,
) {
  return `<div class="document-footer"><footer class="responsibility"><div><b>Responsável técnico pelos dados</b><br>${h ? e(h.reviewerName) : 'Conforme aprovação individual dos furos'}<br>${h ? e(h.reviewerRegistration) : summary ? 'Identificação individual nas folhas dos furos e no quadro de responsabilidade.' : s.holes.map((h) => e(h.code) + ' — ' + e(h.reviewerRegistration)).join('<br>')}</div><div><b>Emissão ${s.issueNumber}</b><br>Sem assinatura digital<br>ART: não cadastrada</div></footer><div class="trace">${e(s.report.id)} · Composição ${s.report.version} · Modelo ${e(s.templateVersion)}${h ? ' · Versão técnica ' + h.technicalVersion : ''}</div></div>`;
}
export const sheetCss = `
@page { size: A4; margin: ${PRINT_LAYOUT.margins.top}mm ${PRINT_LAYOUT.margins.right}mm ${PRINT_LAYOUT.margins.bottom}mm ${PRINT_LAYOUT.margins.left}mm; }
* { box-sizing: border-box; }
body { width: ${PRINT_LAYOUT.contentWidthMm}mm; margin: 0; font: 9pt/1.3 Arial, sans-serif; color: #262626; }
p { overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8pt; }
td, th { border: 1px solid #999; padding: 5px 7px; overflow-wrap: anywhere; text-align: left; }
th { background: #f3f3f3; font-weight: 700; }
.page { display: flex; flex-direction: column; min-height: 244mm; break-before: page; break-after: page; }
.page:first-child { break-before: auto; }
.page:last-child { break-after: auto; }
.brand-header { display: flex; align-items: center; gap: 12px; min-height: 48px; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #ddd; }
.brand { display: flex; align-items: center; gap: 7px; width: 38%; min-width: 0; }
.brand strong { font-size: 12pt; line-height: 1.1; overflow-wrap: anywhere; }
.brand svg { flex-shrink: 0; }
.report-company-header-logo { display: block; width: auto; max-width: 100%; height: 39px; object-fit: contain; object-position: left center; }
.report-heading { flex: 1; min-width: 0; padding-left: 12px; border-left: 1px solid #aaa; font-size: 8.5pt; }
.report-heading b { font-size: 9pt; }
.report-heading span { display: block; margin-top: 4px; }
.folio { display: flex; flex-direction: column; justify-content: center; align-self: stretch; min-width: 70px; padding: 8px 10px; background: #ed7900; color: #111; text-align: center; font-size: 8pt; clip-path: polygon(24% 0, 100% 0, 100% 100%, 0 100%); }
.folio b { font-size: 11pt; }
.identification { display: flex; gap: 8px; margin-bottom: 6px; }
.identification > table:first-child { width: 68%; }
.identification .hole-id { width: 32%; }
.identification td { padding: 3px 5px; font-size: 8pt; }
.hole-id tr:first-child { background: #fff1db; }
.hole-id tr:first-child td { font-size: 9pt; font-weight: 700; }
.section-title { margin: 14px 0 0; padding: 6px 9px; background: #ed7900; color: #171717; font-size: 9.5pt; line-height: 1.25; font-weight: 700; }
.profile-chart { display: block; width: 100%; flex-shrink: 0; }
.excel-meta td, .excel-limit td { padding: 2px 4px; font-size: 7pt; }
.excel-bottom { display: grid; grid-template-columns: 1.12fr .9fr 1fr; gap: 5px; margin-top: 5px; }
.excel-bottom table { font-size: 7pt; }
.excel-bottom td, .excel-bottom th { padding: 2px 4px; }
.excel-bottom th { background: #fff0dc; }
.excel-legend { padding: 4px; border: 1px solid #999; font-size: 7pt; }
.excel-legend p { margin: 4px 0; }
.excel-note { margin: 1px 0; font-size: 7pt; line-height: 1.25; white-space: pre-wrap; }
.document-footer { margin-top: auto; break-inside: avoid; }
.responsibility { display: flex; justify-content: space-between; gap: 15px; margin-top: 0; padding: 7px 5px 0; border-top: 2px solid #ed7900; font-size: 8pt; break-inside: avoid; }
.responsibility > div:first-child { flex: 1; }
.responsibility > div + div { width: 30%; padding-left: 20px; border-left: 1px solid #aaa; }
.excel-profile .responsibility { padding-top: 4px; font-size: 7.5pt; }
.trace { margin-top: 3px; font-size: 6pt; color: #555; overflow-wrap: anywhere; }
.note { font-size: 7.5pt; line-height: 1.4; white-space: pre-wrap; }
.photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
.photo-grid.single-photo { grid-template-columns: 1fr; }
.photo-card { border: 1px solid #999; border-radius: 5px; overflow: hidden; break-inside: avoid; }
.photo-caption { display: flex; align-items: center; min-height: 36px; background: #f4f4f4; font-size: 9pt; line-height: 1.35; font-weight: 700; }
.photo-caption strong { align-self: stretch; margin-right: 8px; padding: 8px 10px; background: #ed7900; color: #111; }
.photo-caption span { min-width: 0; padding: 6px; overflow-wrap: anywhere; white-space: pre-wrap; }
.photo-card img { display: block; width: 100%; height: 205px; object-fit: contain; background: #fafafa; }
.photo-card .missing { display: flex; align-items: center; justify-content: center; height: 205px; }
.single-photo .photo-card img, .single-photo .photo-card .missing { height: 330px; }
.photo-meta { padding: 7px; background: #fafafa; text-align: center; font-size: 7.5pt; line-height: 1.35; }
.map-visual { margin-top: 15px; }
.map-visual svg { display: block; max-height: 390px; }
.map-bottom { display: flex; gap: 14px; align-items: start; margin-top: 14px; }
.map-bottom > table { width: 70%; }
.legend { flex: 1; border: 1px solid #999; font-size: 8pt; }
.legend h3 { margin: 0; padding: 6px; background: #ed7900; font-size: 9.5pt; line-height: 1.25; }
.legend p { margin: 8px; }
.report-note { padding-top: 8px; border-top: 1px solid #ddd; font-size: 7.5pt; line-height: 1.4; white-space: pre-wrap; }
.coordinate-continuation table { margin-top: 12px; }
.coordinate-table tbody tr { break-inside: avoid; }
.coordinate-table thead { display: table-header-group; }
.continuation-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 9pt; line-height: 1.5; }
.responsible-continuation table { margin-top: 15px; }
.responsible-continuation td { padding: 8px 6px; }
`;
