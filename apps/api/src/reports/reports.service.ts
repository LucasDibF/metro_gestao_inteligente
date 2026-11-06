import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { googleMapReference, inpeMapBackground } from '@spt/map-reference';
import { Prisma, Report } from '@prisma/client';
import { createHash } from 'node:crypto';
import { compositionJson, readComposition } from './report-composition';
import { issueSnapshot } from './report-issue-snapshot';
import { parseMapView, reportMap } from './report-map';
import {
  IssuedPdf,
  ReportHistoryRows,
  ReportIssueRow,
  ReportMapPreviewRows,
  ReportOptionsRows,
  issueSelect,
  reportBoreholeSelect,
} from './report-rows';
import { canonicalJson, technicalMap } from '@spt/report-templates';
import { isUuid } from '../common/uuid';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { lockWork, readWork } from '../works/work-lock';
import { privateStorage } from '../files/shared-storage';
import { expectedVersion, technicalInput, text } from '../technical/technical-input';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
@Injectable()
export class ReportsService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  list(c: TenantContext, workId: string): Promise<Report[]> {
    return this.db.run(c, async (tx) => {
      await readWork(tx, c, workId);
      return tx.report.findMany({
        where: { workId, tenantId: c.tenantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
    });
  }
  options(c: TenantContext, workId: string, page: number): Promise<ReportOptionsRows> {
    return this.db.run(c, async (tx) => {
      await readWork(tx, c, workId);
      const where = { tenantId: c.tenantId, workId, deletedAt: null };
      return {
        items: await tx.borehole.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 20,
          skip: (page - 1) * 20,
          select: reportBoreholeSelect,
        }),
        total: await tx.borehole.count({ where }),
        page,
        pageSize: 20,
      };
    });
  }
  private async parent(
    tx: Prisma.TransactionClient,
    c: TenantContext,
    workId: string,
    id: string,
  ): Promise<Report> {
    await lockWork(tx, c, workId);
    const report = await tx.report.findFirst({ where: { id, workId, tenantId: c.tenantId } });
    if (!report) throw new NotFoundException('Report unavailable');
    return report;
  }
  private async visibleReport(
    tx: Prisma.TransactionClient,
    c: TenantContext,
    workId: string,
    id: string,
  ): Promise<Report> {
    await readWork(tx, c, workId);
    const report = await tx.report.findFirst({ where: { id, workId, tenantId: c.tenantId } });
    if (!report) throw new NotFoundException('Report unavailable');
    return report;
  }
  private ids(value: unknown, max: number, required = false): string[] {
    if (
      !Array.isArray(value) ||
      value.length > max ||
      (required && !value.length) ||
      value.some((v) => !isUuid(v)) ||
      new Set(value).size !== value.length
    )
      throw new BadRequestException('Invalid selected records');
    return value as string[];
  }
  save(c: TenantContext, workId: string, body: unknown, id?: string): Promise<Report> {
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
    const showOtherBoreholes = v.showOtherBoreholes;
    if (typeof showOtherBoreholes !== 'boolean')
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
      const previousComposition = existing ? readComposition(existing.composition) : undefined;
      const mapView =
        previousComposition && canonicalJson(previousComposition.holeIds) === canonicalJson(holeIds)
          ? previousComposition.mapView
          : undefined;
      const data = {
        title,
        notes,
        composition: compositionJson({
          holeIds,
          photoIds,
          showOtherBoreholes,
          ...(mapView ? { mapView } : {}),
        }),
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
  history(c: TenantContext, workId: string, id: string): Promise<ReportHistoryRows> {
    return this.db.run(c, async (tx) => {
      const report = await this.visibleReport(tx, c, workId, id);
      return {
        report,
        selection: await tx.borehole.findMany({
          where: {
            tenantId: c.tenantId,
            workId,
            id: { in: readComposition(report.composition).holeIds },
            deletedAt: null,
          },
          select: reportBoreholeSelect,
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
  issue(c: TenantContext, workId: string, id: string, body: unknown): Promise<ReportIssueRow> {
    const v = technicalInput(body, ['version', 'idempotencyKey']),
      version = expectedVersion(v.version);
    if (!isUuid(v.idempotencyKey)) throw new BadRequestException('Idempotency key must be UUID');
    const idempotencyKey = v.idempotencyKey,
      requestHash = hash(JSON.stringify({ version }));
    return this.db.run(c, async (tx) => {
      const report = await this.parent(tx, c, workId, id);
      const where = { tenantId: c.tenantId, workId, reportId: id };
      const previous = await tx.reportIssue.findFirst({
        where: { ...where, requestedBy: c.userId, idempotencyKey },
        select: { id: true, requestHash: true },
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
      const snapshot = await issueSnapshot(
        tx,
        c,
        workId,
        report,
        readComposition(report.composition),
        version,
      );
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
  async map(c: TenantContext, workId: string, id: string): Promise<ReportMapPreviewRows> {
    const result = await this.db.run(c, async (tx) => {
      const report = await this.visibleReport(tx, c, workId, id),
        composition = readComposition(report.composition);
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
    const imagery = result.map ? await inpeMapBackground(result.map) : undefined;
    return {
      ...result,
      svg: result.map ? technicalMap(result.map, imagery) : null,
      google: result.map ? googleMapReference(result.map) : null,
      imagery:
        imagery?.state === 'ready'
          ? {
              state: 'ready',
              scene: imagery.background.scene,
              date: imagery.background.date,
              pixelSizeM: imagery.background.pixelSizeM,
            }
          : imagery,
    };
  }

  saveMap(c: TenantContext, workId: string, id: string, body: unknown): Promise<Report> {
    const v = technicalInput(body, ['version', 'view']),
      version = expectedVersion(v.version),
      view = parseMapView(v.view);
    return this.db.run(c, async (tx) => {
      const report = await this.parent(tx, c, workId, id);
      if (report.version !== version)
        throw new ConflictException({ code: 'RECORD_VERSION_CONFLICT', message: 'Report changed' });
      const { holeIds, photoIds, showOtherBoreholes } = readComposition(report.composition);
      await reportMap(tx, c, workId, holeIds, showOtherBoreholes, view);
      return tx.report.update({
        where: { id },
        data: {
          composition: compositionJson({
            holeIds,
            photoIds,
            showOtherBoreholes,
            ...(view ? { mapView: view } : {}),
          }),
          version: { increment: 1 },
          currentIssueId: null,
        },
      });
    });
  }
  async download(
    c: TenantContext,
    workId: string,
    id: string,
    issueId: string,
  ): Promise<IssuedPdf> {
    const issue = await this.db.run(c, async (tx) => {
      await this.visibleReport(tx, c, workId, id);
      return tx.reportIssue.findFirst({
        where: { id: issueId, reportId: id, workId, tenantId: c.tenantId, state: 'READY' },
        select: { objectKey: true, pdfSha256: true, issueNumber: true },
      });
    });
    if (!issue?.objectKey || !issue.pdfSha256)
      throw new NotFoundException('Issued PDF unavailable');
    const body = await privateStorage().get(issue.objectKey);
    if (hash(body) !== issue.pdfSha256)
      throw new ServiceUnavailableException('PDF integrity check failed');
    return { body, sha256: issue.pdfSha256, issueNumber: issue.issueNumber };
  }
}
