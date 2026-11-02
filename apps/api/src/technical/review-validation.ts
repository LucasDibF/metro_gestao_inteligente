import { BadRequestException } from '@nestjs/common';

type Depth = string | number | { toString(): string } | null;
export function validateReviewData(
  hole: { fieldDate: unknown; executedDepthM: Depth },
  tests: Array<{ depthM: Depth; advances: unknown; result: unknown }>,
  layerCount: number,
) {
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
        !t.advances.length),
  );
  if (incomplete.length)
    fail(
      'SPT_READINGS_INCOMPLETE',
      incomplete.map((t) => String(t.depthM)),
    );
  // The depth labels identify the report's metre rows. Penetrations belong to
  // that test and are not added again to the executed depth during review.
  const outside = tests.filter((t) => Number(t.depthM) > Number(hole.executedDepthM));
  if (outside.length)
    fail(
      'SPT_DEPTH_OUTSIDE',
      outside.map((t) => String(t.depthM)),
    );
}
