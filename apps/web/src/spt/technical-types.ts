import type { ChecklistItem } from './FieldChecklist';

export interface Layer {
  id: string;
  fromM: string;
  toM: string;
  soilType: string;
  description: string;
  soilColor?: string | null;
  soilMoisture?: string | null;
  version: number;
}
export interface TechnicalData {
  checklist: ChecklistItem[];
  tests: Array<{ id: string; depthM: string; result: { nSpt: number | null; status: string } }>;
  hole: {
    id: string;
    code: string;
    version: number;
    folderId: string | null;
    plannedDepthM: string | null;
    technicalVersion: number;
    reviewState: 'DRAFT' | 'IN_REVIEW' | 'APPROVED';
    executedDepthM: string | null;
    waterLevelM: string | null;
    fieldDate: string | null;
    reviewerName: string | null;
    reviewerRegistration: string | null;
    reviewNote: string | null;
  };
  layers: Layer[];
  events: Array<{ id: string; action: string; technicalVersion: number; createdAt: string }>;
}
/** Review endpoint suffix: submit for review, approve or return for correction. */
export type ReviewAction = 'enviar-revisao' | 'aprovar' | 'devolver';
export type TechnicalForm = 'fields' | 'layer' | 'review';
export const reviewStateLabels: Record<TechnicalData['hole']['reviewState'], string> = {
  DRAFT: 'Em preparação',
  IN_REVIEW: 'Aguardando revisão',
  APPROVED: 'Aprovado tecnicamente',
};
export const technicalEventNames: Record<string, string> = {
  SPT_SOIL_SAVED: 'Ensaio e solo salvos juntos',
  FIELD_DATA_UPDATED: 'Dados de campo atualizados',
  spt_tests_INSERT: 'Ensaio registrado',
  spt_tests_UPDATE: 'Ensaio alterado',
  soil_layers_INSERT: 'Camada registrada',
  soil_layers_UPDATE: 'Camada alterada',
  REVIEW_SUBMIT: 'Enviado para revisão',
  REVIEW_APPROVE: 'Aprovado pelo engenheiro',
  REVIEW_REJECT: 'Devolvido para correção',
};
