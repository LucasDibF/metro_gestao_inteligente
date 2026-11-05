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
export const TEMPLATE_VERSION = '0.8.11';
export interface ReportSnapshot {
  schemaVersion: 1;
  soilStateRuleVersion?: string;
  templateVersion: string;
  createdAt: string;
  issueNumber: number;
  tenant: { id: string; name: string };
  work: {
    id: string;
    name: string;
    clientName: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
  };
  report: { id: string; title: string; notes: string; version: number };
  holes: Array<{
    id: string;
    code: string;
    technicalVersion: number;
    executedDepthM: string;
    waterLevelM: string | null;
    fieldDate: string;
    reviewerName: string;
    reviewerRegistration: string;
    reviewedAt: string;
    reviewNote: string | null;
    officialCoordinate: {
      eastingM: string;
      northingM: string;
      zone: number;
      hemisphere: string;
      datum: string;
      latitude: number;
      longitude: number;
      reference: string;
      altitudeM: string | null;
    };
    tests: Array<{
      depthM: string;
      advances: Array<{ blows: number; penetrationMm: number }>;
      result: { nSpt: number | null; status: string };
      interruptionReason: string | null;
      engineVersion: string;
      fieldDetails?: { executionMethod?: string | null; sampleRecovery?: string | null } | null;
    }>;
    layers: Array<{ fromM: string; toM: string; soilType: string; description: string }>;
  }>;
  photos: Array<{
    id: string;
    boreholeId: string;
    caption: string;
    objectKey: string;
    sha256: string;
    version: number;
    crop: { x: number; y: number; width: number; height: number };
  }>;
  map: {
    view?: { centerX: number; centerY: number; spanM: number };
    zone: number;
    hemisphere: string;
    points: Array<{ code: string; x: number; y: number; selected: boolean }>;
  };
}
export type MapBackground =
  | {
      state: 'ready';
      background:
        | {
            provider?: 'inpe';
            image: string;
            scene: string;
            date: string;
            pixelSizeM: number;
          }
        | {
            provider: 'esri';
            image: string;
            zoom: number;
            pixelSizeM: number;
            attribution: string;
          };
    }
  | { state: 'unavailable'; reason: 'coverage' | 'service' | 'extent' | 'busy' }
  | { state: 'disabled' };
export function renderReport(
  snapshot: ReportSnapshot,
  photos: Record<string, string> = {},
  imagery?: MapBackground,
) {
  let body =
    (['0.8.10', '0.8.11'].includes(snapshot.templateVersion) ? reportCover(snapshot) : '') +
    snapshot.holes.map((h) => engineeringProfiles(snapshot, h)).join('') +
    photographicSheets(snapshot, photos) +
    locationSheets(snapshot, imagery);
  const total = (body.match(/__SHEET__/g) || []).length;
  let page = 0;
  body = body.replace(/__SHEET__/g, () => String(++page)).replace(/__TOTAL__/g, String(total));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(snapshot.report.title)}</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><style>${sheetCss}${coverCss}${snapshot.templateVersion === '0.8.11' ? metroReportCss : ''}</style></head><body${snapshot.templateVersion === '0.8.11' ? ' class="metro-report"' : ''}>${body}</body></html>`;
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
