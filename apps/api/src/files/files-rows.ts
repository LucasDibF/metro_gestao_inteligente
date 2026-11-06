import type { BoreholeCoordinate, Prisma } from '@prisma/client';

/** The photo columns that a borehole file listing exposes. */
export const photoListSelect = {
  id: true,
  caption: true,
  purpose: true,
  version: true,
  gpsLatitude: true,
  gpsLongitude: true,
  crop: true,
  processingState: true,
  width: true,
  height: true,
  mime: true,
  sizeBytes: true,
  createdAt: true,
} as const;

export type PhotoListRow = Prisma.BoreholePhotoGetPayload<{ select: typeof photoListSelect }> & {
  distanceM: number | null;
  gpsWarning: boolean;
};

/** Database rows behind BoreholeFiles; tests/api-contracts.test.ts checks their JSON form. */
export interface BoreholeFilesRows {
  technicalVersion: number;
  officialCoordinateId: string | null;
  coordinates: BoreholeCoordinate[];
  photos: PhotoListRow[];
}
