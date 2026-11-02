import { lockWork } from './work-lock';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { hierarchyInput } from './hierarchy-input';

@Injectable()
export class HierarchyService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  private async parent(tx: Prisma.TransactionClient, context: TenantContext, workId: string) {
    await lockWork(tx, context, workId);
  }
  list(context: TenantContext, workId: string, borehole: boolean, page: number, folderId?: string) {
    return this.db.run(context, async (tx) => {
      await this.parent(tx, context, workId);
      if (
        borehole &&
        folderId &&
        folderId !== 'root' &&
        !(await tx.folder.findFirst({
          where: { id: folderId, workId, tenantId: context.tenantId, deletedAt: null },
        }))
      )
        throw new NotFoundException('Folder not found');
      const where = {
        workId,
        tenantId: context.tenantId,
        deletedAt: null,
        ...(borehole && folderId !== undefined
          ? { folderId: folderId === 'root' ? null : folderId }
          : {}),
      };
      const query = {
        where,
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        skip: (page - 1) * 20,
        take: 20,
      };
      return {
        items: borehole ? await tx.borehole.findMany(query) : await tx.folder.findMany(query),
        total: borehole ? await tx.borehole.count({ where }) : await tx.folder.count({ where }),
        page,
        pageSize: 20,
      };
    });
  }
  async save(
    context: TenantContext,
    workId: string,
    borehole: boolean,
    input: ReturnType<typeof hierarchyInput>,
    id?: string,
  ) {
    try {
      return await this.db.run(context, async (tx) => {
        await this.parent(tx, context, workId);
        if (
          borehole &&
          input.folderId &&
          !(await tx.folder.findFirst({
            where: { id: input.folderId, workId, tenantId: context.tenantId, deletedAt: null },
          }))
        )
          throw new NotFoundException('Folder not found');
        const base = { workId, tenantId: context.tenantId };
        if (!id)
          return borehole
            ? tx.borehole.create({
                data: {
                  ...base,
                  code: input.code,
                  folderId: input.folderId,
                  plannedDepthM: input.plannedDepthM,
                },
              })
            : tx.folder.create({ data: { ...base, name: input.name } });
        const where = { ...base, id, version: input.version, deletedAt: null };
        const result = borehole
          ? await tx.borehole.updateMany({
              where,
              data: {
                code: input.code,
                folderId: input.folderId,
                plannedDepthM: input.plannedDepthM,
                version: { increment: 1 },
              },
            })
          : await tx.folder.updateMany({
              where,
              data: { name: input.name, version: { increment: 1 } },
            });
        if (!result.count) {
          const found = borehole
            ? await tx.borehole.findFirst({ where: { ...base, id, deletedAt: null } })
            : await tx.folder.findFirst({ where: { ...base, id, deletedAt: null } });
          if (!found) throw new NotFoundException('Record not found');
          throw new ConflictException({
            code: 'RECORD_VERSION_CONFLICT',
            message: 'Record changed; reload before saving',
          });
        }
        return borehole
          ? tx.borehole.findUniqueOrThrow({ where: { id } })
          : tx.folder.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException({
          code: 'DUPLICATE_RECORD',
          message: 'Name or code already exists in this work',
        });
      throw error;
    }
  }
}
