/** Pure geotechnical rules. A calculation never represents technical approval. */
export const ENGINE_VERSION = '0.1.0' as const;
export interface SptAdvance {
  readonly blows: number;
  readonly penetrationMm: number;
}
export interface SptIssue {
  readonly path: string;
  readonly code:
    'INVALID_SHAPE' | 'UNKNOWN_FIELD' | 'INVALID_INTEGER' | 'INVALID_REASON' | 'UNSAFE_SUM';
}
type Reason =
  | 'CONVENTIONAL_45_CM'
  | 'INSUFFICIENT_ADVANCES'
  | 'NON_STANDARD_PENETRATION'
  | 'INTERRUPTION_RECORDED'
  | 'ZERO_BLOWS';
interface ValidData {
  readonly engineVersion: typeof ENGINE_VERSION;
  readonly advances: readonly SptAdvance[];
  readonly interruptionReason: string | null;
  readonly totalPenetrationMm: number;
}
export type SptResult =
  | (ValidData & {
      readonly status: 'CONVENTIONAL';
      readonly reason: 'CONVENTIONAL_45_CM';
      readonly nSpt: number;
    })
  | (ValidData & {
      readonly status: 'INCOMPLETE' | 'INTERRUPTED' | 'REQUIRES_REVIEW';
      readonly reason: Exclude<Reason, 'CONVENTIONAL_45_CM'>;
      readonly nSpt: null;
    })
  | {
      readonly engineVersion: typeof ENGINE_VERSION;
      readonly status: 'INVALID';
      readonly nSpt: null;
      readonly issues: readonly SptIssue[];
    };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalid(issues: SptIssue[]): SptResult {
  return Object.freeze({
    engineVersion: ENGINE_VERSION,
    status: 'INVALID',
    nSpt: null,
    issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
  });
}

/** Units are integer millimetres. Partial penetration is never extrapolated. */
export function evaluateSpt(input: unknown): SptResult {
  if (!record(input) || !Array.isArray(input.advances) || input.advances.length > 3) {
    return invalid([{ path: 'advances', code: 'INVALID_SHAPE' }]);
  }
  const issues: SptIssue[] = [];
  for (const key of Object.keys(input)) {
    if (!['advances', 'interruptionReason'].includes(key))
      issues.push({ path: key, code: 'UNKNOWN_FIELD' });
  }
  if (
    input.interruptionReason !== undefined &&
    input.interruptionReason !== null &&
    (typeof input.interruptionReason !== 'string' ||
      !input.interruptionReason.trim() ||
      input.interruptionReason.trim().length > 500)
  ) {
    issues.push({ path: 'interruptionReason', code: 'INVALID_REASON' });
  }
  for (let index = 0; index < input.advances.length; index++) {
    const advance: unknown = input.advances[index];
    if (!record(advance)) {
      issues.push({ path: `advances.${index}`, code: 'INVALID_SHAPE' });
      continue;
    }
    for (const key of Object.keys(advance)) {
      if (!['blows', 'penetrationMm'].includes(key))
        issues.push({ path: `advances.${index}.${key}`, code: 'UNKNOWN_FIELD' });
    }
    for (const key of ['blows', 'penetrationMm']) {
      if (!Number.isSafeInteger(advance[key]) || Number(advance[key]) < 0)
        issues.push({ path: `advances.${index}.${key}`, code: 'INVALID_INTEGER' });
    }
  }
  if (issues.length) return invalid(issues);
  const advances = Object.freeze(
    input.advances.map((advance: SptAdvance) =>
      Object.freeze({ blows: advance.blows, penetrationMm: advance.penetrationMm }),
    ),
  );
  const totalPenetrationMm = advances.reduce((sum, advance) => sum + advance.penetrationMm, 0);
  if (!Number.isSafeInteger(totalPenetrationMm))
    return invalid([{ path: 'advances', code: 'UNSAFE_SUM' }]);
  const data: ValidData = {
    engineVersion: ENGINE_VERSION,
    advances,
    interruptionReason:
      typeof input.interruptionReason === 'string' ? input.interruptionReason.trim() : null,
    totalPenetrationMm,
  };
  if (data.interruptionReason)
    return Object.freeze({
      ...data,
      status: 'INTERRUPTED',
      reason: 'INTERRUPTION_RECORDED',
      nSpt: null,
    });
  if (advances.length !== 3)
    return Object.freeze({
      ...data,
      status: 'INCOMPLETE',
      reason: 'INSUFFICIENT_ADVANCES',
      nSpt: null,
    });
  if (advances.some((advance) => advance.penetrationMm !== 150))
    return Object.freeze({
      ...data,
      status: 'REQUIRES_REVIEW',
      reason: 'NON_STANDARD_PENETRATION',
      nSpt: null,
    });
  if (advances.some((advance) => advance.blows === 0))
    return Object.freeze({ ...data, status: 'REQUIRES_REVIEW', reason: 'ZERO_BLOWS', nSpt: null });
  const nSpt = advances[1].blows + advances[2].blows;
  if (!Number.isSafeInteger(nSpt)) return invalid([{ path: 'nSpt', code: 'UNSAFE_SUM' }]);
  return Object.freeze({ ...data, status: 'CONVENTIONAL', reason: 'CONVENTIONAL_45_CM', nSpt });
}

export {
  classifySoilState,
  soilGroup,
  SOIL_STATE_BANDS,
  SOIL_STATE_RULE_VERSION,
  SOIL_STATE_REFERENCE,
} from './soil-classification';
export type { SoilState, SoilGroup } from './soil-classification';

export { formatSoilDescription } from './soil-description';

export { sptGraphReading } from './graph-reading';
