import { formatSoilDescription } from '@spt/geotechnical-engine';
import { SOIL_STATE_RULE_VERSION } from '@spt/geotechnical-engine';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { validateReportEligibility } from './report-eligibility';
import { googleMapReference, mapBackground } from '@spt/map-reference';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { parseMapView, reportMap, MapView } from './report-map';
import { PrivateStorage } from '@spt/private-storage';
import {
  ReportSnapshot,
  TEMPLATE_VERSION,
  canonicalJson,
  technicalMap,
} from '@spt/report-templates';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { lockWork } from '../works/work-lock';
import { expectedVersion, technicalInput, text } from '../technical/technical-input';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const issueSelect = {
  id: true,
  reportId: true,
  state: true,
  issueNumber: true,
  compositionVersion: true,
  pdfSha256: true,
  errorCode: true,
  createdAt: true,
  finishedAt: true,
} as const;
@Injectable()
export class ReportsService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  list(c: TenantContext, workId: string) {
    return this.db.run(c, async (tx) => {
      await lockWork(tx, c, workId);
      return tx.report.findMany({
        where: { workId, tenantId: c.tenantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
    });
  }
  options(c: TenantContext, workId: string, page: number) {
    return this.db.run(c, async (tx) => {
      await lockWork(tx, c, workId);
      const where = { tenantId: c.tenantId, workId, deletedAt: null };
      return {
        items: await tx.borehole.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 20,
          skip: (page - 1) * 20,
          select: {
            id: true,
            code: true,
            photos: {
              where: { deletedAt: null, processingState: 'READY' },
              select: { id: true, caption: true },
            },
          },
        }),
        total: await tx.borehole.count({ where }),
        page,
        pageSize: 20,
      };
    });
  }
  private async parent(tx: Prisma.TransactionClient, c: TenantContext, workId: string, id: string) {
    await lockWork(tx, c, workId);
    const report = await tx.report.findFirst({ where: { id, workId, tenantId: c.tenantId } });
    if (!report) throw new NotFoundException('Report unavailable');
    return report;
  }
  private ids(value: unknown, max: number, required = false) {
    if (
      !Array.isArray(value) ||
      value.length > max ||
      (required && !value.length) ||
      value.some((v) => typeof v !== 'string' || !uuid.test(v)) ||
      new Set(value).size !== value.length
    )
      throw new BadRequestException('Invalid selected records');
    return value as string[];
  }
  save(c: TenantContext, workId: string, body: unknown, id?: string) {
    const v = technicalInput(body, [
        'title',
        'notes',
        'holeIds',
        'photoIds',
        'showOtherBoreholes',
        ...(id ? ['version'] : []),
      ]),
      title = text(v.title, 200),
      notes = v.notes === '' ? '' : text(v.notes, 4000),
      holeIds = this.ids(v.holeIds, 20, true),
      photoIds = this.ids(v.photoIds, 40);
    if (typeof v.showOtherBoreholes !== 'boolean')
      throw new BadRequestException('Map option required');
    const version = id ? expectedVersion(v.version) : undefined;
    return this.db.run(c, async (tx) => {
      await lockWork(tx, c, workId);
      const where = { workId, tenantId: c.tenantId };
      if (
        (await tx.borehole.count({ where: { ...where, id: { in: holeIds }, deletedAt: null } })) !==
        holeIds.length
      )
        throw new NotFoundException('Selected borehole unavailable');
      if (
        (await tx.boreholePhoto.count({
          where: {
            ...where,
            id: { in: photoIds },
            processingState: 'READY',
            boreholeId: { in: holeIds },
            deletedAt: null,
          },
        })) !== photoIds.length
      )
        throw new NotFoundException('Selected photo unavailable');
      const existing = id ? await this.parent(tx, c, workId, id) : null;
      const previousComposition = existing?.composition as
        { holeIds: string[]; mapView?: MapView } | undefined;
      const mapView =
        previousComposition && canonicalJson(previousComposition.holeIds) === canonicalJson(holeIds)
          ? previousComposition.mapView
          : undefined;
      const data = {
        title,
        notes,
        composition: {
          holeIds,
          photoIds,
          showOtherBoreholes: v.showOtherBoreholes,
          ...(mapView ? { mapView } : {}),
        } as Prisma.InputJsonObject,
      };
      if (!id) {
        if ((await tx.report.count({ where })) >= 100)
          throw new BadRequestException('Report limit reached');
        return tx.report.create({ data: { ...where, ...data } });
      }
      const changed = await tx.report.updateMany({
        where: { ...where, id, version },
        data: { ...data, currentIssueId: null, version: { increment: 1 } },
      });
      if (!changed.count) {
        await this.parent(tx, c, workId, id);
        throw new ConflictException({ code: 'RECORD_VERSION_CONFLICT', message: 'Report changed' });
      }
      return tx.report.findUniqueOrThrow({ where: { id } });
    });
  }
  history(c: TenantContext, workId: string, id: string) {
    return this.db.run(c, async (tx) => {
      const report = await this.parent(tx, c, workId, id);
      return {
        report,
        selection: await tx.borehole.findMany({
          where: {
            tenantId: c.tenantId,
            workId,
            id: { in: (report.composition as { holeIds: string[] }).holeIds },
            deletedAt: null,
          },
          select: {
            id: true,
            code: true,
            photos: {
              where: { deletedAt: null, processingState: 'READY' },
              select: { id: true, caption: true },
            },
          },
        }),
        issues: await tx.reportIssue.findMany({
          where: { tenantId: c.tenantId, workId, reportId: id },
          orderBy: { issueNumber: 'desc' },
          take: 100,
          select: issueSelect,
        }),
      };
    });
  }
  issue(c: TenantContext, workId: string, id: string, body: unknown) {
    const v = technicalInput(body, ['version', 'idempotencyKey']),
      version = expectedVersion(v.version);
    if (typeof v.idempotencyKey !== 'string' || !uuid.test(v.idempotencyKey))
      throw new BadRequestException('Idempotency key must be UUID');
    const idempotencyKey = v.idempotencyKey,
      requestHash = hash(JSON.stringify({ version }));
    return this.db.run(c, async (tx) => {
      const report = await this.parent(tx, c, workId, id);
      const where = { tenantId: c.tenantId, workId, reportId: id };
      const previous = await tx.reportIssue.findFirst({
        where: { ...where, requestedBy: c.userId, idempotencyKey },
      });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Key already used for another request',
          });
        return tx.reportIssue.findUniqueOrThrow({
          where: { id: previous.id },
          select: issueSelect,
        });
      }
      if (report.version !== version)
        throw new ConflictException({ code: 'RECORD_VERSION_CONFLICT', message: 'Report changed' });
      if (
        (await tx.reportIssue.count({
          where: { tenantId: c.tenantId, state: { in: ['PENDING', 'PROCESSING'] } },
        })) >= 50
      )
        throw new ConflictException({ code: 'QUEUE_LIMIT', message: 'Too many pending jobs' });
      const composition = report.composition as {
        holeIds: string[];
        photoIds: string[];
        showOtherBoreholes: boolean;
      };
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
        (composition as typeof composition & { mapView?: MapView }).mapView,
      ))!;
      const snapshot: ReportSnapshot = {
        schemaVersion: 1,
        soilStateRuleVersion: SOIL_STATE_RULE_VERSION,
        templateVersion: TEMPLATE_VERSION,
        createdAt: new Date().toISOString(),
        issueNumber: report.issueCounter + 1,
        tenant: { id: tenant.id, name: tenant.name },
        work: {
          id: work.id,
          name: work.name,
          clientName: work.clientName,
          city: work.city,
          state: work.state,
          address: work.address,
        },
        report: { id, title: report.title, notes: report.notes, version },
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
                description: formatSoilDescription([
                  layer.soilColor,
                  layer.soilMoisture,
                  layer.description,
                ]),
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
      const frozen = JSON.stringify(snapshot);
      const issue = await tx.reportIssue.create({
        data: {
          ...where,
          requestedBy: c.userId,
          idempotencyKey,
          requestHash,
          compositionVersion: version,
          issueNumber: snapshot.issueNumber,
          snapshot: JSON.parse(frozen),
          snapshotHash: hash(canonicalJson(snapshot)),
        },
        select: issueSelect,
      });
      await tx.report.update({ where: { id }, data: { issueCounter: { increment: 1 } } });
      return issue;
    });
  }
  async map(c: TenantContext, workId: string, id: string) {
    const result = await this.db.run(c, async (tx) => {
      const report = await this.parent(tx, c, workId, id),
        composition = report.composition as {
          holeIds: string[];
          showOtherBoreholes: boolean;
          mapView?: MapView;
        };
      const map = await reportMap(
        tx,
        c,
        workId,
        composition.holeIds,
        composition.showOtherBoreholes,
        composition.mapView,
      );
      return {
        version: report.version,
        map,
      };
    });
    const imagery = result.map ? await mapBackground(result.map) : undefined;
    return {
      ...result,
      svg: result.map ? technicalMap(result.map, imagery) : null,
      google: result.map ? googleMapReference(result.map) : null,
      imagery:
        imagery?.state === 'ready'
          ? imagery.background.provider === 'esri'
            ? {
                state: 'ready',
                provider: 'esri',
                zoom: imagery.background.zoom,
                pixelSizeM: imagery.background.pixelSizeM,
                attribution: imagery.background.attribution,
              }
            : {
                state: 'ready',
                provider: 'inpe',
                scene: imagery.background.scene,
                date: imagery.background.date,
                pixelSizeM: imagery.background.pixelSizeM,
              }
          : imagery,
    };
  }

  saveMap(c: TenantContext, workId: string, id: string, body: unknown) {
    const v = technicalInput(body, ['version', 'view']),
      version = expectedVersion(v.version),
      view = parseMapView(v.view);
    return this.db.run(c, async (tx) => {
      const report = await this.parent(tx, c, workId, id);
      if (report.version !== version)
        throw new ConflictException({ code: 'RECORD_VERSION_CONFLICT', message: 'Report changed' });
      const composition = report.composition as {
        holeIds: string[];
        photoIds: string[];
        showOtherBoreholes: boolean;
        mapView?: MapView;
      };
      await reportMap(tx, c, workId, composition.holeIds, composition.showOtherBoreholes, view);
      const updated = { ...composition } as typeof composition & { mapBase?: unknown };
      delete updated.mapBase;
      if (view) updated.mapView = view;
      else delete updated.mapView;
      return tx.report.update({
        where: { id },
        data: {
          composition: updated as unknown as Prisma.InputJsonObject,
          version: { increment: 1 },
          currentIssueId: null,
        },
      });
    });
  }
  async download(c: TenantContext, workId: string, id: string, issueId: string) {
    const issue = await this.db.run(c, async (tx) => {
      await this.parent(tx, c, workId, id);
      return tx.reportIssue.findFirst({
        where: { id: issueId, reportId: id, workId, tenantId: c.tenantId, state: 'READY' },
      });
    });
    if (!issue?.objectKey || !issue.pdfSha256)
      throw new NotFoundException('Issued PDF unavailable');
    let storage: PrivateStorage;
    try {
      storage = new PrivateStorage();
    } catch {
      throw new ServiceUnavailableException('Private storage unavailable');
    }
    try {
      const body = await storage.get(issue.objectKey);
      if (hash(body) !== issue.pdfSha256)
        throw new ServiceUnavailableException('PDF integrity check failed');
      return { body, sha256: issue.pdfSha256, issueNumber: issue.issueNumber };
    } finally {
      storage.close();
    }
  }
}
