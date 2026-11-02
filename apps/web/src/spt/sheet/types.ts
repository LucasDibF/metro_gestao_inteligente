import type { FieldDetails } from '../field-types';
export interface SheetTest {
  id: string;
  depthM: string;
  advances: Array<{ blows: number; penetrationMm: number }>;
  fieldDetails: FieldDetails | null;
  interruptionReason: string | null;
  result: { status: string; nSpt: number | null };
  version: number;
  engineVersion: string;
}
export interface SheetLayer {
  id: string;
  fromM: string;
  toM: string;
  soilType: string;
  description: string;
  soilColor: string | null;
  soilMoisture: string | null;
  version: number;
}
export interface SheetPhoto {
  id: string;
  caption: string;
  purpose: string | null;
  processingState: string;
}
export interface SheetData {
  technicalVersion: number;
  templateVersion: string;
  termination: { depth: number; row: number; partial: boolean };
  warnings: string[];
  hole: {
    id: string;
    code: string;
    executedDepthM: string | null;
    waterLevelM: string | null;
    fieldDate: string | null;
    reviewState: string;
    reviewerName: string | null;
    reviewerRegistration: string | null;
  };
  tests: SheetTest[];
  layers: SheetLayer[];
  photos: SheetPhoto[];
  coordinate: {
    eastingM: string;
    northingM: string;
    zone: number;
    hemisphere: string;
    datum: string;
    altitudeM: string | null;
  } | null;
}
export type SheetSelection =
  { kind: 'test'; depth: string } | { kind: 'layer'; from: string; to: string } | null;
export const resultLabels: Record<string, string> = {
  NOT_TESTED: 'Primeiro metro · sem ensaio SPT',
  CONVENTIONAL: 'Convencional',
  INCOMPLETE: 'Incompleto',
  INTERRUPTED: 'Interrompido',
  REQUIRES_REVIEW: 'Requer revisão técnica',
};
export const number = (value: string | number) =>
  Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
