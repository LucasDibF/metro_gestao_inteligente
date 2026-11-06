import { formatSoilDescription } from '@spt/geotechnical-engine';
/** Moisture remains field evidence, not an automatic part of the report description. */
export function reportSoilDescription(layer: { soilColor?: string | null; description: string }) {
  return formatSoilDescription([layer.soilColor, layer.description]);
}
