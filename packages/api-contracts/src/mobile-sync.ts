import type { BoreholeFiles, CoordinateRecord, PhotoReference } from './files';
import type { BoreholeRecord, SptMetreRecord, TechnicalDetail } from './technical';

/** GET .../mobile/snapshot: the field view, without the review history or the reviewer. */
export interface MobileSnapshot {
  technical: Omit<TechnicalDetail, 'events' | 'hole'> & {
    events: never[];
    hole: Omit<BoreholeRecord, 'reviewerName' | 'reviewerRegistration' | 'reviewerTitle'> & {
      reviewerName: null;
      reviewerRegistration: null;
      reviewerTitle: null;
    };
  };
  files: BoreholeFiles;
}

export type MobileOperationKind = 'METRE' | 'FIELDS' | 'COORDINATE' | 'SUBMIT';

/** What each operation kind returns in `result`. */
export interface MobileOperationResults {
  METRE: SptMetreRecord;
  FIELDS: BoreholeRecord;
  COORDINATE: CoordinateRecord;
  SUBMIT: BoreholeRecord;
}

/**
 * The receipt of POST .../mobile/operacoes and .../mobile/fotografias. A repeated operation ID
 * returns the stored receipt of the first request unchanged.
 */
export interface MobileOperationReceipt<Result = MobileOperationResult> {
  result: Result;
  technicalVersion: number;
  reviewState: string;
}

export type MobileOperationResult = MobileOperationResults[MobileOperationKind];
export type MobilePhotoReceipt = MobileOperationReceipt<PhotoReference>;

/** GET .../mobile/operacoes/:operationId: the stored receipt, or null when never applied. */
export interface MobileOperationLookup {
  receipt: MobileOperationReceipt | MobilePhotoReceipt | null;
}
