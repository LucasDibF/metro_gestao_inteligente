import { sptGraphReading } from '../../../../../packages/geotechnical-engine/src/graph-reading';
export { sptGraphReading };
import type { SheetData, SheetTest } from './types';
export const ROW_HEIGHT = 64;
export function curveValue(test: SheetTest, series: number): number | null {
  if (
    test.result.nSpt === null ||
    test.interruptionReason ||
    test.advances.length !== 3 ||
    test.advances.some((a) => a.penetrationMm !== 150)
  )
    return null;
  return series === 0 ? test.advances[0].blows + test.advances[1].blows : test.result.nSpt;
}
export function profileExtent(data: SheetData) {
  return data.termination.depth > 0
    ? Math.max(1, data.termination.depth)
    : Math.max(
        1,
        ...data.tests.map((test) => Number(test.depthM)),
        ...data.layers.map((layer) => Number(layer.toM)),
      );
}
export function graphMaximum(tests: SheetTest[]) {
  const max = Math.max(
    50,
    ...tests.flatMap((test) => [
      sptGraphReading(test, 0)?.value ?? 0,
      sptGraphReading(test, 1)?.value ?? 0,
    ]),
  );
  return Math.ceil(max / 10) * 10;
}
export function displayDepth(test: SheetTest, data: SheetData) {
  return data.termination.partial && Number(test.depthM) === data.termination.row
    ? data.termination.depth
    : Number(test.depthM);
}

/** Metre d occupies the geological band d−1..d, not a row centered on its lower boundary. */
export function sampleBand(depth: number, windowFrom: number, windowTo: number) {
  const from = Math.max(windowFrom, 0, depth - 1);
  const to = Math.max(from, Math.min(windowTo, depth));
  return { from, to, center: (from + to) / 2 };
}
