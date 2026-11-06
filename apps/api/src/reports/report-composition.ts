import { Prisma } from '@prisma/client';
import type { ReportComposition, ReportMapView } from '@spt/api-contracts';

/** Reads the selection stored in a report. Every stored composition was written by `compositionJson`. */
export function readComposition(value: Prisma.JsonValue): ReportComposition {
  if (!isJsonObject(value)) throw invalidComposition();
  const { holeIds, photoIds, showOtherBoreholes, mapView } = value;
  if (!isIdList(holeIds) || !isIdList(photoIds) || typeof showOtherBoreholes !== 'boolean')
    throw invalidComposition();
  return {
    holeIds,
    photoIds,
    showOtherBoreholes,
    ...(mapView === undefined ? {} : { mapView: readMapView(mapView) }),
  };
}

/** The JSON stored for a composition; a missing map view keeps the automatic framing. */
export function compositionJson(composition: ReportComposition): Prisma.InputJsonObject {
  const { holeIds, photoIds, showOtherBoreholes, mapView } = composition;
  return {
    holeIds,
    photoIds,
    showOtherBoreholes,
    ...(mapView ? { mapView: { ...mapView } } : {}),
  };
}

function readMapView(value: Prisma.JsonValue): ReportMapView {
  if (!isJsonObject(value)) throw invalidComposition();
  const { centerX, centerY, spanM } = value;
  if (!isFiniteNumber(centerX) || !isFiniteNumber(centerY) || !isFiniteNumber(spanM))
    throw invalidComposition();
  return { centerX, centerY, spanM };
}

function isJsonObject(value: Prisma.JsonValue | undefined): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdList(value: Prisma.JsonValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isFiniteNumber(value: Prisma.JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function invalidComposition(): Error {
  return new Error('Stored report composition is invalid');
}
