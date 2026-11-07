import type { Borehole, BoreholeCoordinate } from '@prisma/client';
import type { BoreholeFilesRows } from '../files/files-rows';
import type { SptMetreRows, TechnicalDetailRows } from '../technical/technical-rows';

/** Database rows behind MobileSnapshot; tests/api-contracts.test.ts checks their JSON form. */
export interface MobileSnapshotRows {
  technical: Omit<TechnicalDetailRows, 'events' | 'hole'> & {
    events: never[];
    hole: Omit<Borehole, 'reviewerName' | 'reviewerRegistration' | 'reviewerTitle'> & {
      reviewerName: null;
      reviewerRegistration: null;
      reviewerTitle: null;
    };
  };
  files: BoreholeFilesRows;
}

/** What one mobile operation returns before it is stored as JSON in its receipt. */
export type MobileOperationResultRows = SptMetreRows | Borehole | BoreholeCoordinate;

export interface MobileReceiptRows<Result> {
  result: Result;
  technicalVersion: number;
  reviewState: string;
}
