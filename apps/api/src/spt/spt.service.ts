import { testEndDepth } from '@spt/geotechnical-engine';
import { requireFieldWrite } from '../auth/field-access';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { lockWork, readWork } from '../works/work-lock';
import { metreInterval, saveMetreSoil } from './spt-soil';
import { parseSpt } from './spt-input';
@Injectable()
export class SptService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  private async parent(
    tx: Prisma.TransactionClient,
    context: TenantContext,
    workId: string,
    boreholeId: string,
  ) {
    await lockWork(tx, context, workId);
    await tx.$queryRaw`SELECT id FROM boreholes WHERE id=${boreholeId}::uuid AND work_id=${workId}::uuid AND tenant_id=${context.tenantId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const hole = await tx.borehole.findFirst({
      where: { id: boreholeId, workId, tenantId: context.tenantId, deletedAt: null },
    });
    if (!hole) throw new NotFoundException('Borehole not found');
    return hole;
  }
  private async visibleParent(
    tx: Prisma.TransactionClient,
    context: TenantContext,
    workId: string,
    boreholeId: string,
  ) {
    await readWork(tx, context, workId);
    const hole = await tx.borehole.findFirst({
      where: { id: boreholeId, workId, tenantId: context.tenantId, deletedAt: null },
    });
    if (!hole) throw new NotFoundException('Borehole not found');
    return hole;
  }
  list(context: TenantContext, workId: string, boreholeId: string, page: number) {
    return this.db.run(context, async (tx) => {
      const hole = await this.visibleParent(tx, context, workId, boreholeId);
      const where = { workId, boreholeId, tenantId: context.tenantId };
      const layers = await tx.soilLayer.findMany({ where, orderBy: { fromM: 'asc' } });
      const items = await tx.sptTest.findMany({
        where,
        take: 20,
        skip: (page - 1) * 20,
        orderBy: [{ depthM: 'asc' }, { id: 'asc' }],
      });
      const last = await tx.sptTest.aggregate({ where, _max: { depthM: true } });
      return {
        nextDepth: String(last._max.depthM === null ? 1 : Number(last._max.depthM) + 1),
        technicalVersion: hole.technicalVersion,
        reviewState: hole.reviewState,
        reviewNote: hole.reviewNote,
        navigation: (
          await tx.sptTest.findMany({
            where,
            select: { id: true, depthM: true },
            orderBy: { depthM: 'asc' },
          })
        ).map((test) => ({ id: test.id, depthM: String(test.depthM) })),
        items: items.map((record) => {
          const interval = metreInterval(String(record.depthM));
          return {
            ...record,
            soil: layers.filter(
              (l) =>
                Number(l.fromM) < Number(interval.toM) && Number(l.toM) > Number(interval.fromM),
            ),
          };
        }),
        total: await tx.sptTest.count({ where }),
        page,
        pageSize: 20,
      };
    });
  }
  get(context: TenantContext, workId: string, boreholeId: string, depth: string) {
    return this.db.run(context, async (tx) => {
      await this.visibleParent(tx, context, workId, boreholeId);
      const where = { workId, boreholeId, tenantId: context.tenantId };
      const record = await tx.sptTest.findFirst({ where: { ...where, depthM: depth } });
      if (!record) return null;
      const interval = metreInterval(depth);
      return {
        ...record,
        soil: await tx.soilLayer.findMany({
          where: { ...where, fromM: { lt: interval.toM }, toM: { gt: interval.fromM } },
          orderBy: { fromM: 'asc' },
        }),
      };
    });
  }
  async save(
    context: TenantContext,
    workId: string,
    boreholeId: string,
    input: ReturnType<typeof parseSpt>,
    id?: string,
    transaction?: Prisma.TransactionClient,
  ) {
    try {
      return await this.db.run(
        context,
        async (tx) => {
          const hole = await this.parent(tx, context, workId, boreholeId);
          await requireFieldWrite(tx, context, hole.reviewState, workId);
          if (input.soil && hole.technicalVersion !== input.technicalVersion)
            throw new ConflictException({
              code: 'RECORD_VERSION_CONFLICT',
              message: 'Technical data changed; reload',
            });
          if (input.soil && id) {
            const previous = await tx.sptTest.findFirst({
              where: { id, boreholeId, workId, tenantId: context.tenantId },
            });
            if (!previous) throw new NotFoundException('SPT test not found');
            if (Number(previous.depthM) !== Number(input.depthM))
              throw new BadRequestException('Depth cannot change in the combined metre editor');
          }
          if (hole.executedDepthM !== null && testEndDepth(input) > Number(hole.executedDepthM))
            throw new BadRequestException({
              code: 'SPT_DEPTH_OUTSIDE',
              message: 'SPT exceeds executed depth',
            });
          const data = {
            depthM: input.depthM,
            ...(input.fieldDetails !== undefined ? { fieldDetails: input.fieldDetails } : {}),
            advances: input.advances as Prisma.InputJsonValue,
            interruptionReason: input.interruptionReason,
            result: JSON.parse(JSON.stringify(input.result)) as Prisma.InputJsonValue,
            engineVersion: input.engineVersion,
            updatedBy: context.userId,
          };
          const base = { tenantId: context.tenantId, workId, boreholeId };
          let record;
          if (id) {
            const changed = await tx.sptTest.updateMany({
              where: { ...base, id, version: input.version },
              data: { ...data, version: { increment: 1 } },
            });
            if (!changed.count) {
              if (!(await tx.sptTest.findFirst({ where: { ...base, id } })))
                throw new NotFoundException('SPT test not found');
              throw new ConflictException({
                code: 'RECORD_VERSION_CONFLICT',
                message: 'SPT test changed',
              });
            }
            record = await tx.sptTest.findUniqueOrThrow({ where: { id } });
          } else
            record = await tx.sptTest.create({
              data: { ...base, ...data, createdBy: context.userId },
            });
          if (input.soil)
            await saveMetreSoil(
              tx,
              context,
              workId,
              boreholeId,
              input.depthM,
              input.soil,
              hole.executedDepthM,
            );
          await tx.borehole.update({
            where: { id: boreholeId },
            data: { version: { increment: 1 } },
          });
          const interval = metreInterval(String(record.depthM));
          return {
            ...record,
            soil: await tx.soilLayer.findMany({
              where: { ...base, fromM: { lt: interval.toM }, toM: { gt: interval.fromM } },
              orderBy: { fromM: 'asc' },
            }),
          };
        },
        transaction,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException({
          code: 'SPT_DEPTH_EXISTS',
          message: 'SPT test already exists at this depth',
        });
      throw error;
    }
  }
}
