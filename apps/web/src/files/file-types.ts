export interface Coordinate {
  id: string;
  kind: CoordinateKind;
  eastingM: string;
  northingM: string;
  zone: number;
  hemisphere: string;
  datum: string;
  altitudeM: string | null;
  reference: string;
  version: number;
}
export type CoordinateKind = 'PLANNED' | 'EXECUTED';
/** What the coordinate form submits; the version is added when an existing one is edited. */
export interface CoordinateInput {
  eastingM: string;
  northingM: string;
  zone: number;
  hemisphere: string;
  datum: 'SIRGAS2000';
  altitudeM: string | null;
  reference: string;
}
export interface Photo {
  processingState: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  id: string;
  caption: string;
  purpose: string | null;
  version: number;
  gpsLatitude: number | null;
  distanceM: number | null;
  gpsWarning: boolean;
  crop: { x: number; y: number; width: number; height: number };
}
/** What the photo editor submits: caption, purpose and crop as fractions of the image. */
export interface PhotoChanges {
  caption: string;
  purpose: string;
  crop: { [key: string]: number };
}
export interface BoreholeFiles {
  technicalVersion: number;
  officialCoordinateId: string | null;
  coordinates: Coordinate[];
  photos: Photo[];
}
export const photoPurposes: Record<string, string> = {
  SITE: 'Local da sondagem',
  EXECUTION: 'Execução da sondagem',
  SAMPLE_1: 'Amostra 1',
  SAMPLE_2: 'Amostra 2',
  OTHER: 'Outras fotografias',
};
export const maxPhotoBytes = 8 * 1024 * 1024;
export function coordinateKindLabel(kind: CoordinateKind): string {
  return kind === 'PLANNED' ? 'planejada' : 'executada';
}
/** Photos ordered by purpose, as the report lists them; the input is left untouched. */
export function sortPhotosByPurpose(photos: Photo[]): Photo[] {
  const order = Object.keys(photoPurposes);
  return [...photos].sort(
    (a, b) => order.indexOf(a.purpose ?? 'OTHER') - order.indexOf(b.purpose ?? 'OTHER'),
  );
}
