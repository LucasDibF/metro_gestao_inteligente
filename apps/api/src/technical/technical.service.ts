import { testEndDepth } from '@spt/geotechnical-engine';
import { requireFieldAssignment, requireFieldWrite } from '../auth/field-access';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Borehole, Prisma, SoilLayer } from '@prisma/client';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { lockWork, readWork } from '../works/work-lock';
import { fieldChecklist } from './field-checklist';
import { TechnicalDetailRows } from './technical-rows';
import { validateReviewData, validateSoilCoverage } from './review-validation';
import { reviewerFromProfile } from '../professional-profile/professional-profile';
import {
  depth,
  expectedVersion,
  fieldDataInput,
  optionalText,
  technicalInput,
  text,
} from './technical-input';
@Injectable()
export class TechnicalService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  async parent(
    tx: Prisma.TransactionClient,
    c: TenantContext,
    workId: string,
    boreholeId: string,
  ): Promise<Borehole> {
    await lockWork(tx, c, workId);
    await tx.$queryRaw`SELECT id FROM boreholes WHERE id=${boreholeId}::uuid AND work_id=${workId}::uuid AND tenant_id=${c.tenantId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const hole = await tx.borehole.findFirst({
      where: { id: boreholeId, workId, tenantId: c.tenantId, deletedAt: null },
    });
    if (!hole) throw new NotFoundException('Borehole unavailable');
    return hole;
  }
  /** Read paths: same visibility as `parent`, without row locks. */
  async visibleParent(
    tx: Prisma.TransactionClient,
    c: TenantContext,
    workId: string,
    boreholeId: string,
  ): Promise<Borehole> {
    await readWork(tx, c, workId);
    const hole = await tx.borehole.findFirst({
      where: { id: boreholeId, workId, tenantId: c.tenantId, deletedAt: null },
    });
    if (!hole) throw new NotFoundException('Borehole unavailable');
    return hole;
  }
  private conflict() {
    throw new ConflictException({
      code: 'RECORD_VERSION_CONFLICT',
      message: 'Technical data changed; reload',
    });
  }
  private event(
    tx: Prisma.TransactionClient,
    c: TenantContext,
    workId: string,
    boreholeId: string,
    technicalVersion: number,
    action: string,
    details: Prisma.InputJsonObject = {},
  ) {
    return tx.technicalEvent.create({
      data: {
        tenantId: c.tenantId,
        workId,
        boreholeId,
        actorId: c.userId,
        technicalVersion,
        action,
        details,
      },
    });
  }
  get(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<TechnicalDetailRows> {
    return this.db.run(
      c,
      async (tx) => {
        const hole = await this.visibleParent(tx, c, workId, boreholeId);
        const scope = { boreholeId, workId, tenantId: c.tenantId };
        const tests = await tx.sptTest.findMany({ where: scope, orderBy: { depthM: 'asc' } });
        const layers = await tx.soilLayer.findMany({ where: scope, orderBy: { fromM: 'asc' } });
        const readyPhotos = await tx.boreholePhoto.count({
          where: { ...scope, deletedAt: null, processingState: 'READY' },
        });
        return {
          hole,
          tests,
          checklist: fieldChecklist(hole, tests, layers, readyPhotos),
          layers,
          events: await tx.technicalEvent.findMany({
            where: { boreholeId, workId, tenantId: c.tenantId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 50,
          }),
        };
      },
      transaction,
    );
  }
  fields(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    body: unknown,
    transaction?: Prisma.TransactionClient,
  ): Promise<Borehole> {
    const { version, executedDepthM, waterLevelM, fieldDate } = fieldDataInput(body);
    return this.db.run(
      c,
      async (tx) => {
        const hole = await this.parent(tx, c, workId, boreholeId);
        await requireFieldWrite(tx, c, hole.reviewState, workId);
        if (hole.technicalVersion !== version) this.conflict();
        const layers = await tx.soilLayer.findMany({
          where: { boreholeId, workId, tenantId: c.tenantId },
        });
        const tests = await tx.sptTest.findMany({
          where: { boreholeId, workId, tenantId: c.tenantId },
        });
        if (executedDepthM !== null) {
          const executed = Number(executedDepthM);
          const last = [...tests].sort((a, b) => Number(a.depthM) - Number(b.depthM)).at(-1);
          const partialTail =
            last &&
            testEndDepth(last) < Number(last.depthM) &&
            testEndDepth(last) <= executed &&
            executed < Number(last.depthM);
          const overhanging = layers.filter((layer) => Number(layer.toM) > executed);
          if (
            tests.some((test) => testEndDepth(test) > executed) ||
            overhanging.some(
              (layer) =>
                !partialTail ||
                Number(layer.fromM) >= executed ||
                Number(layer.toM) > Number(last!.depthM),
            )
          )
            throw new BadRequestException({
              code: 'EXECUTED_DEPTH_EXCLUDES_DATA',
              message: 'Executed depth excludes existing data',
              minimumDepthM: String(Math.max(0, ...tests.map(testEndDepth))),
            });
          // The combined editor initially stores the full metre interval. On an
          // explicit physical-depth save, retain its soil text and close only
          // the terminal interval at the declared end of that partial row.
          for (const layer of overhanging)
            await tx.soilLayer.update({
              where: { id: layer.id },
              data: { toM: executedDepthM, version: { increment: 1 } },
            });
        }
        const updated = await tx.borehole.update({
          where: { id: boreholeId },
          data: { executedDepthM, waterLevelM, fieldDate, version: { increment: 1 } },
        });
        await this.event(tx, c, workId, boreholeId, updated.technicalVersion, 'FIELD_DATA_UPDATED');
        return updated;
      },
      transaction,
    );
  }
  async layer(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    body: unknown,
    id?: string,
  ): Promise<SoilLayer> {
    const v = technicalInput(body, [
      'fromM',
      'toM',
      'soilType',
      'description',
      ...(id ? ['version'] : []),
    ]);
    const fromM = depth(v.fromM)!,
      toM = depth(v.toM)!,
      soilType = text(v.soilType, 120),
      description = optionalText(v.description, 2000);
    if (Number(toM) <= Number(fromM)) throw new BadRequestException('Invalid layer interval');
    const version = id ? expectedVersion(v.version) : undefined;
    try {
      return await this.db.run(c, async (tx) => {
        const hole = await this.parent(tx, c, workId, boreholeId);
        await requireFieldWrite(tx, c, hole.reviewState, workId);
        if (hole.executedDepthM !== null && Number(toM) > Number(hole.executedDepthM))
          throw new BadRequestException('Layer exceeds executed depth');
        const where = { boreholeId, workId, tenantId: c.tenantId };
        const others = await tx.soilLayer.findMany({
          where: { ...where, ...(id ? { id: { not: id } } : {}) },
        });
        if (others.some((l) => Number(fromM) < Number(l.toM) && Number(toM) > Number(l.fromM)))
          throw new ConflictException({
            code: 'SOIL_LAYER_OVERLAP',
            message: 'Layer overlaps an existing interval',
          });
        if (id) {
          const changed = await tx.soilLayer.updateMany({
            where: { ...where, id, version },
            data: { fromM, toM, soilType, description, version: { increment: 1 } },
          });
          if (!changed.count) {
            if (!(await tx.soilLayer.findFirst({ where: { ...where, id } })))
              throw new NotFoundException('Layer unavailable');
            this.conflict();
          }
        } else await tx.soilLayer.create({ data: { ...where, fromM, toM, soilType, description } });
        await tx.borehole.update({
          where: { id: boreholeId },
          data: { version: { increment: 1 } },
        });
        return tx.soilLayer.findFirstOrThrow({ where: { ...where, fromM } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException({ code: 'SOIL_LAYER_OVERLAP', message: 'Depth already used' });
      throw error;
    }
  }
  review(
    c: TenantContext,
    workId: string,
    boreholeId: string,
    body: unknown,
    action: 'submit' | 'approve' | 'reject',
    transaction?: Prisma.TransactionClient,
  ): Promise<Borehole> {
    // The reviewer identity comes only from the approver's professional profile, never the body.
    const v = technicalInput(body, ['technicalVersion', 'note']);
    const version = expectedVersion(v.technicalVersion),
      note = text(v.note, 2000);
    return this.db.run(
      c,
      async (tx) => {
        const hole = await this.parent(tx, c, workId, boreholeId);
        if (action === 'submit') await requireFieldAssignment(tx, c, workId);
        if (hole.technicalVersion !== version) this.conflict();
        if (
          (action === 'submit' && hole.reviewState !== 'DRAFT') ||
          (action !== 'submit' && hole.reviewState !== 'IN_REVIEW')
        )
          throw new ConflictException({
            code: 'REVIEW_STATE_CONFLICT',
            message: 'Review state changed',
          });
        if (action !== 'reject') {
          const tests = await tx.sptTest.findMany({
            where: { boreholeId, workId, tenantId: c.tenantId },
            orderBy: { depthM: 'asc' },
          });
          const layers = await tx.soilLayer.findMany({
            where: { boreholeId, workId, tenantId: c.tenantId },
            orderBy: { fromM: 'asc' },
          });
          validateReviewData(hole, tests, layers.length);
          validateSoilCoverage(hole.executedDepthM, layers);
        }
        const reviewer =
          action === 'approve'
            ? await reviewerFromProfile(tx, c)
            : { reviewerName: null, reviewerRegistration: null, reviewerTitle: null };
        const updated = await tx.borehole.update({
          where: { id: boreholeId },
          data: {
            reviewState:
              action === 'submit' ? 'IN_REVIEW' : action === 'approve' ? 'APPROVED' : 'DRAFT',
            approvedVersion: action === 'approve' ? version : null,
            reviewedBy: action === 'approve' ? c.userId : null,
            reviewedAt: action === 'approve' ? new Date() : null,
            ...reviewer,
            reviewNote: note,
            version: { increment: 1 },
          },
        });
        await this.event(tx, c, workId, boreholeId, version, `REVIEW_${action.toUpperCase()}`, {
          note,
          ...(action === 'approve' ? reviewer : {}),
        });
        return updated;
      },
      transaction,
    );
  }
}
