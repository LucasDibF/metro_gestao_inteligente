/** Fixed, versioned table. The soil type is supplied in the field; NSPT does not identify soil. */
export const SOIL_STATE_RULE_VERSION = 'NBR6484-2020-A1-v1' as const;
export const SOIL_STATE_REFERENCE = 'ABNT NBR 6484:2020 · Tabela A.1' as const;
export type SoilGroup = 'GRANULAR' | 'COHESIVE';
export const SOIL_STATE_BANDS = {
  GRANULAR: [
    { maximum: 4, designation: 'Fofa' },
    { maximum: 8, designation: 'Pouco compacta' },
    { maximum: 18, designation: 'Medianamente compacta' },
    { maximum: 40, designation: 'Compacta' },
    { maximum: Infinity, designation: 'Muito compacta' },
  ],
  COHESIVE: [
    { maximum: 2, designation: 'Muito mole' },
    { maximum: 5, designation: 'Mole' },
    { maximum: 10, designation: 'Média' },
    { maximum: 19, designation: 'Rija' },
    { maximum: 30, designation: 'Muito rija' },
    { maximum: Infinity, designation: 'Dura' },
  ],
} as const;
export type SoilState =
  | {
      status: 'CLASSIFIED';
      group: SoilGroup;
      property: 'Compacidade' | 'Consistência';
      designation: string;
      nSpt: number;
      ruleVersion: typeof SOIL_STATE_RULE_VERSION;
      reference: typeof SOIL_STATE_REFERENCE;
    }
  | {
      status: 'UNAVAILABLE';
      reason: 'SOIL_GROUP_UNDEFINED' | 'NSPT_UNAVAILABLE';
      ruleVersion: typeof SOIL_STATE_RULE_VERSION;
    };
export function soilGroup(soilType: string): SoilGroup | null {
  const type = soilType
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const bases = new Set(type.match(/\b(?:areias?|argilas?|siltes?)\b/g) ?? []);
  if (bases.size > 1 && /(?:\bou\b|\be\b|\/)/.test(type)) return null;
  if (/^siltes?\b/.test(type) && /\barenosos?\b/.test(type) && /\bargilosos?\b/.test(type))
    return null;
  // Use only unambiguous leading types, never the occurrence of a modifier anywhere in free text.
  if (/^areia(?:s)?\b/.test(type)) return 'GRANULAR';
  if (/^argila(?:s)?\b/.test(type)) return 'COHESIVE';
  if (/^silte(?:s)?\s+arenoso(?:s)?\b/.test(type)) return 'GRANULAR';
  if (/^silte(?:s)?\s+argiloso(?:s)?\b/.test(type)) return 'COHESIVE';
  return null;
}
export function classifySoilState(
  soilType: string,
  result: { status: string; nSpt: number | null },
): SoilState {
  const group = soilGroup(soilType);
  if (!group)
    return {
      status: 'UNAVAILABLE',
      reason: 'SOIL_GROUP_UNDEFINED',
      ruleVersion: SOIL_STATE_RULE_VERSION,
    };
  if (
    result.status !== 'CONVENTIONAL' ||
    result.nSpt === null ||
    !Number.isSafeInteger(result.nSpt) ||
    result.nSpt < 0
  )
    return {
      status: 'UNAVAILABLE',
      reason: 'NSPT_UNAVAILABLE',
      ruleVersion: SOIL_STATE_RULE_VERSION,
    };
  const band = SOIL_STATE_BANDS[group].find((band) => result.nSpt! <= band.maximum)!;
  return {
    status: 'CLASSIFIED',
    group,
    property: group === 'GRANULAR' ? 'Compacidade' : 'Consistência',
    designation: band.designation,
    nSpt: result.nSpt,
    ruleVersion: SOIL_STATE_RULE_VERSION,
    reference: SOIL_STATE_REFERENCE,
  };
}
