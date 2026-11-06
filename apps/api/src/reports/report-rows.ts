import type { Prisma, Report } from '@prisma/client';
import type { googleMapReference } from '@spt/map-reference';
import type { ReportMapImagery } from '@spt/api-contracts';
import type { ReportSnapshot } from '@spt/report-templates';
import type { MapView } from './report-map';

/** The issue columns every report issue response exposes. */
export const issueSelect = {
  id: true,
  reportId: true,
  state: true,
  issueNumber: true,
  compositionVersion: true,
  pdfSha256: true,
  errorCode: true,
  createdAt: true,
  finishedAt: true,
} as const;

export type ReportIssueRow = Prisma.ReportIssueGetPayload<{ select: typeof issueSelect }>;

/** A borehole that can be selected for a report, with its ready photos. */
export const reportBoreholeSelect = {
  id: true,
  code: true,
  photos: {
    where: { deletedAt: null, processingState: 'READY' },
    select: { id: true, caption: true },
  },
} as const;

export type ReportBoreholeRow = Prisma.BoreholeGetPayload<{ select: typeof reportBoreholeSelect }>;

export interface ReportOptionsRows {
  items: ReportBoreholeRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportHistoryRows {
  report: Report;
  selection: ReportBoreholeRow[];
  issues: ReportIssueRow[];
}

/** A technical map always carries the view it was drawn with. */
export type ReportMapRows = ReportSnapshot['map'] & { view: MapView };

export interface ReportMapPreviewRows {
  version: number;
  map: ReportMapRows | null;
  svg: string | null;
  google: ReturnType<typeof googleMapReference>;
  imagery: ReportMapImagery | undefined;
}

export interface IssuedPdf {
  body: Buffer;
  sha256: string;
  issueNumber: number;
}
