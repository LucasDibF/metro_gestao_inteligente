import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import type { Borehole, BoreholeCoordinate, Report, SoilLayer } from '@prisma/client';
import type {
  BoreholeFiles,
  BoreholeRecord,
  CoordinateRecord,
  Jsonified,
  MobileOperationLookup,
  MobileOperationReceipt,
  MobilePhotoReceipt,
  MobileSnapshot,
  ReportHistory,
  ReportIssueSummary,
  ReportMapPreview,
  ReportOptionsPage,
  ReportRecord,
  SoilLayerRecord,
  SptMetreRecord,
  TechnicalDetail,
} from '@spt/api-contracts';
import type { BoreholeFilesRows } from '../apps/api/src/files/files-rows';
import type { PhotoStagingService } from '../apps/api/src/files/photo-staging.service';
import type {
  MobileOperationResultRows,
  MobileReceiptRows,
  MobileSnapshotRows,
} from '../apps/api/src/mobile/mobile-rows';
import type {
  ReportHistoryRows,
  ReportIssueRow,
  ReportMapPreviewRows,
  ReportOptionsRows,
} from '../apps/api/src/reports/report-rows';
import type { SptMetreRows, TechnicalDetailRows } from '../apps/api/src/technical/technical-rows';

/** What the photo route commits; its receipt is stored and replayed as JSON. */
type PhotoCommitRows = Awaited<ReturnType<PhotoStagingService['commit']>>;
/** A stored receipt is the JSON of the operation or photo receipt it answered first. */
interface MobileLookupRows {
  receipt:
    | Jsonified<MobileReceiptRows<MobileOperationResultRows>>
    | Jsonified<MobileReceiptRows<PhotoCommitRows>>
    | null;
}

/** True only when each type is assignable to the other. */
type Same<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
/** Compiles only for `true`, so a contract that drifts from the rows breaks the typecheck. */
function contractMatches<Check extends true>(): Check | undefined {
  return undefined;
}

contractMatches<Same<Jsonified<Borehole>, BoreholeRecord>>();
contractMatches<Same<Jsonified<SoilLayer>, SoilLayerRecord>>();
contractMatches<Same<Jsonified<BoreholeCoordinate>, CoordinateRecord>>();
contractMatches<Same<Jsonified<TechnicalDetailRows>, TechnicalDetail>>();
contractMatches<Same<Jsonified<SptMetreRows>, SptMetreRecord>>();
contractMatches<Same<Jsonified<BoreholeFilesRows>, BoreholeFiles>>();
contractMatches<Same<Jsonified<MobileSnapshotRows>, MobileSnapshot>>();
contractMatches<
  Same<Jsonified<MobileReceiptRows<MobileOperationResultRows>>, MobileOperationReceipt>
>();
contractMatches<Same<Jsonified<MobileReceiptRows<PhotoCommitRows>>, MobilePhotoReceipt>>();
contractMatches<Same<Jsonified<MobileLookupRows>, MobileOperationLookup>>();
contractMatches<Same<Jsonified<Report>, ReportRecord>>();
contractMatches<Same<Jsonified<ReportIssueRow>, ReportIssueSummary>>();
contractMatches<Same<Jsonified<ReportOptionsRows>, ReportOptionsPage>>();
contractMatches<Same<Jsonified<ReportHistoryRows>, ReportHistory>>();
contractMatches<Same<Jsonified<ReportMapPreviewRows>, ReportMapPreview>>();

test('dates and decimals reach the client as the strings the contracts declare', () => {
  const sent = JSON.parse(
    JSON.stringify({
      depthM: new Prisma.Decimal('1.50'),
      waterLevelM: null,
      fieldDate: new Date('2026-11-04T00:00:00.000Z'),
      imagery: undefined,
    }),
  ) as Record<string, unknown>;
  assert.deepEqual(sent, {
    depthM: '1.5',
    waterLevelM: null,
    fieldDate: '2026-11-04T00:00:00.000Z',
  });
});
