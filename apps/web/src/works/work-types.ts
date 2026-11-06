export interface Work {
  id: string;
  name: string;
  clientName: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  version: number;
  holeCount?: number;
  approvedHoleCount?: number;
  status?: string;
}
export interface WorkList {
  items: Work[];
  total: number;
  page: number;
  pageSize: number;
}
export interface WorkSummary {
  total: number;
  counts: Record<string, number>;
}
export const workStates: Record<string, string> = {
  NOT_STARTED: 'Sem furos',
  IN_FIELD: 'Em preparação / campo',
  IN_REVIEW: 'Aguardando revisão',
  APPROVED: 'Furos aprovados',
};
export const brazilianStates: readonly string[] =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
/** Client and "city / state" of a work, or a placeholder when none was informed. */
export function workLocationLine(work: Work): string {
  return (
    [work.clientName, [work.city, work.state].filter(Boolean).join(' / ')]
      .filter(Boolean)
      .join(' · ') || 'Sem informações complementares'
  );
}
