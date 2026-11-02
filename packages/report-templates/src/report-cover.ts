import type { ReportSnapshot } from './index';
import { metroWordmark } from './metro-brand';
import { escapeHtml as e } from './html';

/** Based on the centered cover in sondagem; uses only immutable issue data. */
export function reportCover(s: ReportSnapshot): string {
  const issued = new Date(s.createdAt);
  const options = { timeZone: 'America/Sao_Paulo' };
  const date = issued.toLocaleDateString('pt-BR', options);
  const year = issued.toLocaleDateString('pt-BR', { ...options, year: 'numeric' });
  const city = [s.work.city, s.work.state].filter(Boolean).join(' - ') || 'Local não informado';
  return `<section class="page report-cover" aria-label="Capa do relatório SPT">
    <div class="cover-company">${e(s.tenant.name)}</div>
    <div class="cover-main">
      <h1>RELATÓRIO DE SONDAGEM<br>À PERCUSSÃO - SPT</h1>
      <dl class="cover-details">
        <div><dt>Cliente</dt><dd>${e(s.work.clientName?.trim() || 'Não informado')}</dd></div>
        <div><dt>Obra / Projeto</dt><dd>${e(s.work.name)}</dd></div>
        <div><dt>Data do relatório</dt><dd>${e(date)}</dd></div>
      </dl>
    </div>
    <div class="cover-bottom">${s.templateVersion === '0.8.11' ? `<span class="report-platform">${metroWordmark}</span>` : ''}<p class="cover-location">${e(city)}</p><p class="cover-year">${e(year)}</p>
      <p class="cover-trace">Emissão ${s.issueNumber} · Composição ${s.report.version} · Modelo ${e(s.templateVersion)} · Folha __SHEET__ / __TOTAL__</p>
    </div>
  </section>`;
}

/** Scoped to the new cover so approved profile geometry remains untouched. */
export const coverCss = `
.report-cover { min-height: 244mm; padding: 22mm 14mm 10mm; text-align: center; justify-content: space-between; font-family: "Times New Roman", Times, serif; }
.cover-company { font-size: 15pt; font-weight: 700; line-height: 1.3; text-transform: uppercase; overflow-wrap: anywhere; }
.cover-main { padding: 10mm 0; }
.cover-main h1 { margin: 0 0 14mm; font-size: 20pt; line-height: 1.45; font-weight: 700; }
.cover-details { margin: 0; font-size: 12pt; line-height: 1.45; }
.cover-details > div { margin-top: 4mm; }
.cover-details dt { font-weight: 700; }
.cover-details dd { margin: 1mm 0 0; overflow-wrap: anywhere; }
.cover-location { margin: 0; font-size: 12pt; text-transform: uppercase; }
.cover-year { margin: 2mm 0 0; font-size: 12pt; }
.cover-trace { margin: 8mm 0 0; font-family: Arial, sans-serif; font-size: 7pt; color: #555; }
`;
