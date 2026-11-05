import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../database/tenant-database.service';
/** Visibility check for read paths: RLS and the tenant filter apply, no row lock is taken. */
export async function readWork(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  workId: string,
  includeDeleted = false,
) {
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
/** Write paths only: serializes every change to the work until the transaction ends. */
export async function lockWork(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  workId: string,
  includeDeleted = false,
) {
  await tx.$queryRaw`SELECT id FROM works WHERE id=${workId}::uuid AND tenant_id=${context.tenantId}::uuid FOR UPDATE`;
  return readWork(tx, context, workId, includeDeleted);
}
