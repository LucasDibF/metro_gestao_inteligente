import type { SptRecord } from './record-types';

export type SoilLayer = SptRecord['soil'][number];
/** Type and colour of the deepest layer of the metre above, offered for repetition. */
export interface PreviousSoil {
  soilType: string;
  soilColor?: string | null;
}

export const soilTypeSuggestions: readonly string[] = [
  'Areia fina',
  'Areia fina argilosa',
  'Areia fina siltosa',
  'Areia média argilosa',
  'Areia média siltosa',
  'Areia grossa argilosa',
  'Areia grossa siltosa',
  'Areia fina a média',
  'Areia média',
  'Areia média a grossa',
  'Areia grossa',
  'Areia siltosa',
  'Areia argilosa',
  'Argila arenosa',
  'Argila siltosa',
  'Argila silto-arenosa',
  'Silte argiloso',
  'Silte arenoso',
];
export const soilColorSuggestions: readonly string[] = [
  'Marrom',
  'Cinza',
  'Avermelhado',
  'Amarelado',
  'Esbranquiçado',
  'Preto',
];
export const soilMoistureOptions: readonly string[] = ['Seca', 'Úmida', 'Saturada'];

/**
 * The single soil description of a metre whose layers all agree, or null when the metre has
 * no layer or its layers differ. Only a uniform description can prefill the editor.
 */
export function uniformSoilOf(record: SptRecord | null): SoilLayer | null {
  const first = record?.soil[0];
  if (!record || !first) return null;
  return record.soil.every(
    (layer) =>
      layer.soilType === first.soilType &&
      layer.description === first.description &&
      layer.soilColor === first.soilColor &&
      layer.soilMoisture === first.soilMoisture,
  )
    ? first
    : null;
}
