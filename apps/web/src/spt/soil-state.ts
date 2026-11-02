export { formatSoilDescription } from '../../../../packages/geotechnical-engine/src/soil-description';
// One pure rule implementation shared with the API/report engine; Vite compiles this TS module.
export {
  classifySoilState,
  soilGroup,
  SOIL_STATE_RULE_VERSION,
  SOIL_STATE_REFERENCE,
  SOIL_STATE_BANDS,
} from '../../../../packages/geotechnical-engine/src/soil-classification';
import {
  classifySoilState,
  soilGroup,
} from '../../../../packages/geotechnical-engine/src/soil-classification';
export function stateForMetre(
  test: { depthM: string; result: { status: string; nSpt: number | null } },
  layers: Array<{ fromM: string; toM: string; soilType: string }>,
) {
  const depth = Number(test.depthM),
    from = Math.max(0, depth - 1),
    to = depth === 0 ? 1 : depth;
  const matching = layers.filter((layer) => Number(layer.fromM) < to && Number(layer.toM) > from);
  const groups = matching.map((layer) => soilGroup(layer.soilType));
  if (!matching.length || groups.some((group) => group === null) || new Set(groups).size !== 1)
    return null;
  return classifySoilState(matching[0].soilType, test.result);
}
