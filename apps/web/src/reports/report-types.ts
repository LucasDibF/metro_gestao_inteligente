export interface Hole {
  id: string;
  code: string;
  photos: Array<{ id: string; caption: string }>;
}
export interface Report {
  id: string;
  title: string;
  notes: string;
  version: number;
  currentIssueId: string | null;
  composition: { holeIds: string[]; photoIds: string[]; showOtherBoreholes: boolean };
}
export interface Issue {
  id: string;
  state: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  issueNumber: number;
  compositionVersion: number;
  pdfSha256: string | null;
  errorCode: string | null;
}
export interface History {
  report: Report;
  issues: Issue[];
  selection: Hole[];
}
/** What the editor submits when a composition is saved. */
export interface CompositionInput {
  title: string;
  notes: string;
  holeIds: string[];
  photoIds: string[];
  showOtherBoreholes: boolean;
}
export const issueStateLabels: Record<Issue['state'], string> = {
  PENDING: 'Na fila',
  PROCESSING: 'Gerando PDF',
  READY: 'PDF disponível',
  FAILED: 'Geração não concluída',
};
export function hasPendingIssue(issues: Issue[]): boolean {
  return issues.some((issue) => issue.state === 'PENDING' || issue.state === 'PROCESSING');
}
