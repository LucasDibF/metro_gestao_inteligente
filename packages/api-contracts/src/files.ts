import type { JsonValue } from './json';

export interface CoordinateRecord {
  id: string;
  boreholeId: string;
  workId: string;
  tenantId: string;
  /** PLANNED or EXECUTED. */
  kind: string;
  eastingM: string;
  northingM: string;
  zone: number;
  hemisphere: string;
  datum: string;
  altitudeM: string | null;
  reference: string;
  latitude: number;
  longitude: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoListItem {
  id: string;
  caption: string;
  purpose: string | null;
  version: number;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  crop: JsonValue;
  processingState: string;
  width: number;
  height: number;
  mime: string;
  sizeBytes: number;
  createdAt: string;
  /** Distance to the official coordinate, when both are known. */
  distanceM: number | null;
  gpsWarning: boolean;
}

/** GET .../furos/:boreholeId/arquivos */
export interface BoreholeFiles {
  technicalVersion: number;
  officialCoordinateId: string | null;
  coordinates: CoordinateRecord[];
  photos: PhotoListItem[];
}

/** A photo row created by an upload. */
export interface PhotoReference {
  id: string;
  version: number;
}
