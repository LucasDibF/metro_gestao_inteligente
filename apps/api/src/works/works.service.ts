import { statusFilter } from './work-status';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { WorkInput } from './work-input';

@Injectable()
export class WorksService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  list(context: TenantContext, page: number, search: string, status?: string) {
    return this.db.run(context, async (tx) => {
      const where = {
        tenantId: context.tenantId,
        deletedAt: null,
        ...statusFilter(status),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { clientName: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const items = await tx.work.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        skip: (page - 1) * 20,
      });
      const groups = await tx.borehole.groupBy({
        by: ['workId', 'reviewState'],
        where: {
          tenantId: context.tenantId,
          deletedAt: null,
          workId: { in: items.map((w) => w.id) },
        },
        _count: true,
      });
      const enriched = items.map((work) => {
        const rows = groups.filter((g) => g.workId === work.id),
          total = rows.reduce((n, g) => n + g._count, 0),
          approved = rows.find((g) => g.reviewState === 'APPROVED')?._count ?? 0;
        return {
          ...work,
          holeCount: total,
          approvedHoleCount: approved,
          status: !total
            ? 'NOT_STARTED'
            : rows.some((g) => g.reviewState === 'IN_REVIEW')
              ? 'IN_REVIEW'
              : approved === total
                ? 'APPROVED'
                : 'IN_FIELD',
        };
      });
      return { items: enriched, total: await tx.work.count({ where }), page, pageSize: 20 };
    });
  }
  get(context: TenantContext, id: string) {
    return this.db.run(context, async (tx) => {
      const work = await tx.work.findFirst({
        where: { id, tenantId: context.tenantId, deletedAt: null },
      });
      if (!work) throw new NotFoundException('Work not found');
      return work;
    });
  }
  create(context: TenantContext, input: WorkInput) {
    return this.db.run(context, async (tx) => {
      const { initialBoreholeCount = 0, initialFolderName = null, ...data } = input;
      if (!initialBoreholeCount)
        return tx.work.create({ data: { ...data, tenantId: context.tenantId } });
      const [created] = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT create_work_with_boreholes(${data.name},${data.clientName},${data.city},${data.state},${data.address},${initialBoreholeCount}::integer,${initialFolderName}) AS id`;
      return tx.work.findUniqueOrThrow({ where: { id: created.id } });
    });
  }
  update(context: TenantContext, id: string, input: WorkInput & { version: number }) {
    return this.db.run(context, async (tx) => {
      const { version, initialBoreholeCount: _count, initialFolderName: _folder, ...data } = input;
      const result = await tx.work.updateMany({
        where: { id, tenantId: context.tenantId, deletedAt: null, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count) {
        if (
          !(await tx.work.findFirst({ where: { id, tenantId: context.tenantId, deletedAt: null } }))
        )
          throw new NotFoundException('Work not found');
        throw new ConflictException({
          code: 'WORK_VERSION_CONFLICT',
          message: 'Work changed; reload before saving',
        });
      }
      return tx.work.findUniqueOrThrow({ where: { id } });
    });
  }
}
