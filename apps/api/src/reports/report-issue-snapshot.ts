import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, Report } from '@prisma/client';
import type { ReportComposition } from '@spt/api-contracts';
import { SOIL_STATE_RULE_VERSION } from '@spt/geotechnical-engine';
import { ReportSnapshot, TEMPLATE_VERSION } from '@spt/report-templates';
import { TenantContext } from '../database/tenant-database.service';
import { validateReportEligibility } from './report-eligibility';
import { reportCompany } from './report-identity';
import { reportMap } from './report-map';
import { reportSoilDescription } from './report-soil-description';

/**
 * Freezes everything a report issue prints: the approved boreholes, the selected photos, the
 * company, the work and the technical map. Throws when the selection cannot be issued.
 */
export async function issueSnapshot(
  tx: Prisma.TransactionClient,
  c: TenantContext,
  workId: string,
  report: Report,
  composition: ReportComposition,
  version: number,
): Promise<ReportSnapshot> {
  const holes = await tx.borehole.findMany({
    where: { tenantId: c.tenantId, workId, id: { in: composition.holeIds }, deletedAt: null },
    include: {
      sptTests: { orderBy: { depthM: 'asc' } },
      soilLayers: { orderBy: { fromM: 'asc' } },
      coordinates: true,
    },
  });
  validateReportEligibility(holes, composition.holeIds.length);
  if (holes.reduce((n, h) => n + h.sptTests.length + h.soilLayers.length, 0) > 1000)
    throw new BadRequestException('Report size limit exceeded');
  const photoRecords = await tx.boreholePhoto.findMany({
    where: {
      tenantId: c.tenantId,
      workId,
      id: { in: composition.photoIds },
      processingState: 'READY',
      boreholeId: { in: composition.holeIds },
      deletedAt: null,
    },
  });
  if (photoRecords.length !== composition.photoIds.length)
    throw new NotFoundException('Selected photos unavailable');
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: c.tenantId } }),
    work = await tx.work.findUniqueOrThrow({ where: { id: workId } });
  const ordered = composition.holeIds.map((id) => holes.find((h) => h.id === id)!);
  const map = (await reportMap(
    tx,
    c,
    workId,
    composition.holeIds,
    composition.showOtherBoreholes,
    composition.mapView,
  ))!;
  return {
    schemaVersion: 1,
    soilStateRuleVersion: SOIL_STATE_RULE_VERSION,
    templateVersion: TEMPLATE_VERSION,
    createdAt: new Date().toISOString(),
    issueNumber: report.issueCounter + 1,
    tenant: reportCompany(tenant),
    work: {
      id: work.id,
      name: work.name,
      clientName: work.clientName,
      city: work.city,
      state: work.state,
      address: work.address,
    },
    report: { id: report.id, title: report.title, notes: report.notes, version },
    holes: ordered.map((h) => ({
      id: h.id,
      code: h.code,
      technicalVersion: h.technicalVersion,
      executedDepthM: String(h.executedDepthM),
      waterLevelM: h.waterLevelM === null ? null : String(h.waterLevelM),
      fieldDate: h.fieldDate!.toISOString(),
      reviewerName: h.reviewerName!,
      reviewerRegistration: h.reviewerRegistration!,
      reviewedAt: h.reviewedAt!.toISOString(),
      reviewNote: h.reviewNote,
      officialCoordinate: JSON.parse(
        JSON.stringify(h.coordinates.find((c) => c.id === h.officialCoordinateId)),
      ),
      tests: JSON.parse(JSON.stringify(h.sptTests)),
      layers: JSON.parse(
        JSON.stringify(
          h.soilLayers.map((layer) => ({
            ...layer,
            description: reportSoilDescription(layer),
          })),
        ),
      ),
    })),
    photos: composition.photoIds.map((id) => {
      const p = photoRecords.find((v) => v.id === id)!;
      return {
        id: p.id,
        boreholeId: p.boreholeId,
        caption: p.caption,
        objectKey: p.objectKey,
        sha256: p.sha256,
        version: p.version,
        crop: p.crop as ReportSnapshot['photos'][number]['crop'],
      };
    }),
    map,
  };
}
