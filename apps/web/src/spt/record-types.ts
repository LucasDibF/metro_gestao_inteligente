import type { FieldDetails } from './field-types';
export interface Advance {
  blows: number;
  penetrationMm: number;
}
export interface Result {
  status: 'NOT_TESTED' | 'CONVENTIONAL' | 'INCOMPLETE' | 'INTERRUPTED' | 'REQUIRES_REVIEW';
  nSpt: number | null;
  reason: string;
}
export interface SptRecord {
  id: string;
  depthM: string;
  advances: Advance[];
  fieldDetails?: FieldDetails | null;
  interruptionReason: string | null;
  result: Result;
  version: number;
  soil: Array<{
    id: string;
    fromM: string;
    toM: string;
    soilType: string;
    description: string;
    soilColor?: string | null;
    soilMoisture?: string | null;
  }>;
}
export interface SptPage {
  reviewState: string;
  reviewNote: string | null;
  navigation: Array<{ id: string; depthM: string }>;
  nextDepth: string;
  technicalVersion: number;
  items: SptRecord[];
  total: number;
  page: number;
  pageSize: number;
}
export const sptResultLabels = {
  NOT_TESTED: 'Primeiro metro · registro de solo, sem ensaio SPT',
  CONVENTIONAL: 'Cálculo convencional',
  INCOMPLETE: 'Ensaio incompleto',
  INTERRUPTED: 'Ensaio interrompido',
  REQUIRES_REVIEW: 'Revisão técnica necessária',
};
