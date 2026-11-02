import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../database/tenant-database.service';
export async function lockWork(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  workId: string,
  includeDeleted = false,
) {
  await tx.$queryRaw`SELECT id FROM works WHERE id=${workId}::uuid AND tenant_id=${context.tenantId}::uuid FOR UPDATE`;
  const work = await tx.work.findFirst({
    where: {
      id: workId,
      tenantId: context.tenantId,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
  });
  if (!work) throw new NotFoundException('Work not found');
  return work;
}
