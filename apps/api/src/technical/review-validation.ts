import { testEndDepth } from '@spt/geotechnical-engine';
import { BadRequestException } from '@nestjs/common';

type Depth = string | number | { toString(): string } | null;
/**
 * Each record covers the metre row ending at its depth, so rows must be continuous from zero.
 * A hole that ends inside a metre (10.45 m) only owes the whole metres before it (1..10); a
 * partial terminal row (11) stays optional.
 */
export function missingMetres(executedDepthM: Depth, tests: Array<{ depthM: Depth }>): string[] {
  const missing: string[] = [];
  let covered = 0;
  const addUntil = (lastMetre: number) => {
    for (let metre = Math.floor(covered) + 1; metre <= lastMetre; metre++)
      missing.push(String(metre));
  };
  for (const depth of tests.map((t) => Number(t.depthM)).sort((a, b) => a - b)) {
    const from = Math.max(0, depth - 1);
    if (from > covered + 1e-9) addUntil(Math.ceil(from));
    covered = Math.max(covered, depth);
  }
  const lastWholeMetre = Math.floor(Number(executedDepthM));
  if (lastWholeMetre > covered + 1e-9) addUntil(lastWholeMetre);
  return missing;
}
export function validateReviewData(
  hole: { fieldDate: unknown; executedDepthM: Depth },
  tests: Array<{ depthM: Depth; advances: unknown; result: unknown }>,
  layerCount: number,
): void {
  const fail = (code: string, depths?: string[]) => {
    throw new BadRequestException({ code, message: code, ...(depths ? { depths } : {}) });
  };
  if (!hole.fieldDate) fail('FIELD_DATE_REQUIRED');
  if (hole.executedDepthM === null || Number(hole.executedDepthM) <= 0)
    fail('EXECUTED_DEPTH_REQUIRED');
  if (!tests.length) fail('SPT_REQUIRED');
  if (!layerCount) fail('SOIL_DESCRIPTION_REQUIRED');
  const incomplete = tests.filter(
    (t) =>
      !(
        Number(t.depthM) === 1 &&
        (t.result as { status?: string }).status === 'NOT_TESTED' &&
        Array.isArray(t.advances) &&
        t.advances.length === 0
      ) &&
      ((t.result as { status?: string }).status === 'INCOMPLETE' ||
        !Array.isArray(t.advances) ||
        (!t.advances.length && (t.result as { status?: string }).status !== 'INTERRUPTED')),
  );
  if (incomplete.length)
    fail(
      'SPT_READINGS_INCOMPLETE',
      incomplete.map((t) => String(t.depthM)),
    );
  // The depth labels identify the report's metre rows. Penetrations belong to
  // that test and are not added again to the executed depth during review.
  const outside = tests.filter((t) => testEndDepth(t) > Number(hole.executedDepthM));
  if (outside.length)
    fail(
      'SPT_DEPTH_OUTSIDE',
      outside.map((t) => String(t.depthM)),
    );
  const missing = missingMetres(hole.executedDepthM, tests);
  if (missing.length) fail('SPT_METRES_MISSING', missing);
}
