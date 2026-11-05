/** End of a measured metre row, without extrapolating incomplete penetration. */
export function testEndDepth(test: {
  depthM: unknown;
  advances: unknown;
  result: unknown;
  interruptionReason?: unknown;
}): number {
  const nominal = Number(test.depthM);
  const advances = Array.isArray(test.advances) ? test.advances : [];
  const penetration = advances.reduce((sum, advance) => {
    const mm = advance?.penetrationMm;
    return Number.isSafeInteger(mm) && mm > 0 ? sum + mm : NaN;
  }, 0);
  const result = test.result as { nSpt?: unknown } | null;
  if (penetration > 0 && penetration < 450 && (test.interruptionReason || result?.nSpt === null))
    return Math.round((Math.max(0, nominal - 1) + penetration / 1000) * 1000) / 1000;
  return nominal;
}
