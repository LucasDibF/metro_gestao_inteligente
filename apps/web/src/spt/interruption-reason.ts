import type { Advance } from './record-types';

export const defaultInterruptionReason = 'Encerramento registrado em campo';
/** Below the standard three 15 cm advances the metre genuinely stopped short. */
const fullTestPenetrationMm = 450;

/**
 * Any recorded reason marks the test as interrupted and discards its N-SPT, so the default
 * reason applies only when the last metre really ended before full penetration.
 */
export function resolveInterruptionReason(input: {
  typed: string;
  ending: boolean;
  advances: readonly Advance[];
}): string | null {
  const typed = input.typed.trim();
  if (typed && typed !== defaultInterruptionReason) return typed;
  const penetrationMm = input.advances.reduce((total, advance) => total + advance.penetrationMm, 0);
  return input.ending && penetrationMm < fullTestPenetrationMm ? defaultInterruptionReason : null;
}
