/** Measured graph coordinates only. Never normalizes penetration or assigns NSPT. */
export function sptGraphReading(
  test: {
    advances: readonly { blows: number; penetrationMm: number }[];
    result: { nSpt: number | null; status: string };
    interruptionReason?: string | null;
  },
  series: number,
): { value: number; penetrationMm: number; conventional: boolean; label: string } | null {
  if (series !== 0 && series !== 1) return null;
  if (test.result.status === 'INVALID' || test.result.status === 'NOT_TESTED') return null;
  const conventional =
    test.result.nSpt !== null &&
    !test.interruptionReason &&
    test.advances.length === 3 &&
    test.advances.every((a) => a.penetrationMm === 150);
  // A single executed advance belongs only to the initial series, not to a fabricated final pair.
  const values =
    test.advances.length === 1 && series === 0
      ? test.advances
      : test.advances.slice(series, series + 2);
  if (
    !values.length ||
    (values.length !== 2 && test.advances.length !== 1) ||
    (test.advances.length === 1 && series === 1) ||
    values.some(
      (a) =>
        !Number.isSafeInteger(a.blows) ||
        a.blows < 0 ||
        !Number.isSafeInteger(a.penetrationMm) ||
        a.penetrationMm <= 0,
    )
  )
    return null;
  const value = values.reduce((n, a) => n + a.blows, 0);
  const penetrationMm = values.reduce((n, a) => n + a.penetrationMm, 0);
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(penetrationMm)) return null;
  return {
    value,
    penetrationMm,
    conventional,
    label: conventional
      ? String(value)
      : `${value}/${Number((penetrationMm / 10).toFixed(1)).toLocaleString('pt-BR')}`,
  };
}
