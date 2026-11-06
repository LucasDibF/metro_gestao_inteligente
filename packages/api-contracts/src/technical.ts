import type { JsonValue } from './json';

/** Dates travel as ISO 8601 strings and decimal metres as decimal strings. */
export interface BoreholeRecord {
  id: string;
  workId: string;
  tenantId: string;
  folderId: string | null;
  code: string;
  plannedDepthM: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  executedDepthM: string | null;
  waterLevelM: string | null;
  fieldDate: string | null;
  technicalVersion: number;
  /** DRAFT, IN_REVIEW or APPROVED. */
  reviewState: string;
  approvedVersion: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  reviewerRegistration: string | null;
  reviewerTitle: string | null;
  reviewNote: string | null;
  officialCoordinateId: string | null;
}

export interface SptTestRecord {
  id: string;
  boreholeId: string;
  workId: string;
  tenantId: string;
  depthM: string;
  advances: JsonValue;
  fieldDetails: JsonValue | null;
  interruptionReason: string | null;
  result: JsonValue;
  engineVersion: string;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SoilLayerRecord {
  id: string;
  boreholeId: string;
  workId: string;
  tenantId: string;
  fromM: string;
  toM: string;
  soilType: string;
  soilColor: string | null;
  soilMoisture: string | null;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicalEventRecord {
  id: string;
  tenantId: string;
  workId: string;
  boreholeId: string;
  actorId: string;
  action: string;
  technicalVersion: number;
  details: JsonValue;
  createdAt: string;
}

export interface FieldChecklistItem {
  id: string;
  label: string;
  complete: boolean;
  stage: 'review' | 'issue' | 'recommended';
}

/** GET .../furos/:boreholeId/tecnico */
export interface TechnicalDetail {
  hole: BoreholeRecord;
  tests: SptTestRecord[];
  checklist: FieldChecklistItem[];
  layers: SoilLayerRecord[];
  events: TechnicalEventRecord[];
}

/** A saved SPT metre with the soil layers that overlap it. */
export interface SptMetreRecord extends SptTestRecord {
  soil: SoilLayerRecord[];
}
