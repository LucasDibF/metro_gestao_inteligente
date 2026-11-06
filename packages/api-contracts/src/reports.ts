import type { JsonValue } from './json';

export interface ReportMapView {
  centerX: number;
  centerY: number;
  spanM: number;
}

/** The selection saved in a report. */
export interface ReportComposition {
  holeIds: string[];
  photoIds: string[];
  showOtherBoreholes: boolean;
  mapView?: ReportMapView;
}

export interface ReportRecord {
  id: string;
  tenantId: string;
  workId: string;
  title: string;
  notes: string;
  /** A ReportComposition, stored as JSON. */
  composition: JsonValue;
  version: number;
  issueCounter: number;
  currentIssueId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportIssueSummary {
  id: string;
  reportId: string;
  /** PENDING, PROCESSING, READY or FAILED. */
  state: string;
  issueNumber: number;
  compositionVersion: number;
  pdfSha256: string | null;
  errorCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ReportBoreholeOption {
  id: string;
  code: string;
  photos: Array<{ id: string; caption: string }>;
}

/** GET .../relatorios/opcoes */
export interface ReportOptionsPage {
  items: ReportBoreholeOption[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET .../relatorios/:id/emissoes */
export interface ReportHistory {
  report: ReportRecord;
  selection: ReportBoreholeOption[];
  issues: ReportIssueSummary[];
}

export interface ReportMapData {
  view: ReportMapView;
  zone: number;
  hemisphere: string;
  points: Array<{ code: string; x: number; y: number; selected: boolean }>;
}

export interface GoogleMapReference {
  embedUrl: string | null;
  externalUrl: string;
}

export type ReportMapImagery =
  | { state: 'ready'; scene: string; date: string; pixelSizeM: number }
  | { state: 'unavailable'; reason: 'coverage' | 'service' | 'extent' | 'busy' }
  | { state: 'disabled' };

/** GET .../relatorios/:id/croqui. Without an official coordinate, map and imagery are absent. */
export interface ReportMapPreview {
  version: number;
  map: ReportMapData | null;
  svg: string | null;
  google: GoogleMapReference | null;
  imagery?: ReportMapImagery;
}
