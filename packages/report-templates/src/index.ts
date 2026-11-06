import { templateSince } from './template-version';
export { companyLogoFromProfile } from './company-brand';
export { profileTermination } from './engineering-profile';
export { renderInteractiveProfile } from './interactive-profile';
export { PRINT_LAYOUT } from './print-layout';
export { technicalMap } from './technical-map';
import { engineeringProfiles } from './engineering-profile';
import { escapeHtml } from './html';
import { sheetCss } from './sheet-layout';
import { reportCover, coverCss } from './report-cover';
import { metroReportCss } from './metro-brand';
import { photographicSheets, locationSheets } from './report-sections';
export { escapeHtml } from './html';
export {
  TEMPLATE_VERSION,
  SUPPORTED_TEMPLATE_VERSIONS,
  isSupportedTemplateVersion,
  templateSince,
} from './template-version';
export type { ReportSnapshot, MapBackground } from './types';
import type { ReportSnapshot, MapBackground } from './types';
export function renderReport(
  snapshot: ReportSnapshot,
  photos: Record<string, string> = {},
  imagery?: MapBackground,
) {
  let body =
    (templateSince(snapshot.templateVersion, '0.8.10') ? reportCover(snapshot) : '') +
    (templateSince(snapshot.templateVersion, '0.8.15')
      ? snapshot.holes
          .map(
            (hole) =>
              engineeringProfiles(snapshot, hole) + photographicSheets(snapshot, photos, hole.id),
          )
          .join('')
      : snapshot.holes.map((hole) => engineeringProfiles(snapshot, hole)).join('') +
        photographicSheets(snapshot, photos)) +
    locationSheets(snapshot, imagery);
  const total = (body.match(/__SHEET__/g) || []).length;
  let page = 0;
  body = body.replace(/__SHEET__/g, () => String(++page)).replace(/__TOTAL__/g, String(total));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(snapshot.report.title)}</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><style>${sheetCss}${coverCss}${templateSince(snapshot.templateVersion, '0.8.12') ? '.metro-report .folio { display: none; }' : ''}${templateSince(snapshot.templateVersion, '0.8.11') ? metroReportCss : ''}</style></head><body${templateSince(snapshot.templateVersion, '0.8.11') ? ' class="metro-report"' : ''}>${body}</body></html>`;
}

export function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(normalize)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, normalize(x)]),
          )
        : v;
  return JSON.stringify(normalize(JSON.parse(JSON.stringify(value))));
}
