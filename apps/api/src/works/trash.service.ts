import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { lockWork } from './work-lock';
export type TrashKind = 'obras' | 'pastas' | 'furos';
const conflict = (code: string) =>
  new ConflictException({ code, message: 'Record changed or parent unavailable' });
@Injectable()
export class TrashService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  list(context: TenantContext, kind: TrashKind, page: number) {
    return this.db.run(context, async (tx) => {
      const where = { tenantId: context.tenantId, deletedAt: { not: null } };
      const query = {
        where,
        take: 20,
        skip: (page - 1) * 20,
        orderBy: [{ deletedAt: 'desc' as const }, { id: 'asc' as const }],
      };
      const items =
        kind === 'obras'
          ? await tx.work.findMany(query)
          : kind === 'pastas'
            ? await tx.folder.findMany({ ...query, include: { work: { select: { name: true } } } })
            : await tx.borehole.findMany({
                ...query,
                include: { work: { select: { name: true } }, folder: { select: { name: true } } },
              });
      const total =
        kind === 'obras'
          ? await tx.work.count({ where })
          : kind === 'pastas'
            ? await tx.folder.count({ where })
            : await tx.borehole.count({ where });
      return {
        items: items.map((item) => ({
          ...item,
          label: 'name' in item ? item.name : item.code,
          workName: 'work' in item ? item.work.name : null,
          folderName: 'folder' in item ? (item.folder?.name ?? null) : null,
        })),
        total,
        page,
        pageSize: 20,
      };
    });
  }
  change(
    context: TenantContext,
    kind: TrashKind,
    id: string,
    version: number,
    restore: boolean,
    workId?: string,
  ) {
    return this.db.run(context, async (tx) => {
      const where = { id, tenantId: context.tenantId, ...(workId ? { workId } : {}) };
      const record =
        kind === 'obras'
          ? await tx.work.findFirst({ where: { id, tenantId: context.tenantId } })
          : kind === 'pastas'
            ? await tx.folder.findFirst({ where })
            : await tx.borehole.findFirst({ where });
      if (!record) throw new NotFoundException('Record not found');
      const parentId = 'workId' in record ? record.workId : record.id;
      const parent = await lockWork(tx, context, parentId, true);
      if (kind !== 'obras' && parent.deletedAt) throw conflict('PARENT_IN_TRASH');
      const current =
        kind === 'obras'
          ? await tx.work.findFirstOrThrow({ where: { id, tenantId: context.tenantId } })
          : kind === 'pastas'
            ? await tx.folder.findFirstOrThrow({ where })
            : await tx.borehole.findFirstOrThrow({ where });
      if (current.version !== version || Boolean(current.deletedAt) !== restore)
        throw conflict('RECORD_VERSION_CONFLICT');
      if (!restore) {
        const active = { tenantId: context.tenantId, workId: parentId, deletedAt: null };
        const count =
          kind === 'obras'
            ? (await tx.folder.count({ where: active })) +
              (await tx.borehole.count({ where: active }))
            : kind === 'pastas'
              ? await tx.borehole.count({ where: { ...active, folderId: id } })
              : 0;
        if (count) throw conflict('ACTIVE_CHILDREN');
      } else if ('folderId' in current && current.folderId) {
        if (
          !(await tx.folder.findFirst({
            where: {
              id: current.folderId,
              workId: parentId,
              tenantId: context.tenantId,
              deletedAt: null,
            },
          }))
        )
          throw conflict('PARENT_IN_TRASH');
      }
      const data = {
        deletedAt: restore ? null : new Date(),
        deletedBy: restore ? null : context.userId,
        version: { increment: 1 },
      };
      const target = { id, tenantId: context.tenantId, version };
      const result =
        kind === 'obras'
          ? await tx.work.updateMany({ where: target, data })
          : kind === 'pastas'
            ? await tx.folder.updateMany({ where: target, data })
            : await tx.borehole.updateMany({ where: target, data });
      if (result.count !== 1) throw conflict('RECORD_VERSION_CONFLICT');
      return { id, version: version + 1 };
    });
  }
}
