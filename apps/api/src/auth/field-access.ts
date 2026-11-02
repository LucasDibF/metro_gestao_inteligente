import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenantContext } from '../database/tenant-database.service';
export async function requireFieldWrite(
  tx: Prisma.TransactionClient,
  c: TenantContext,
  state: string,
  engineeringOnly = false,
) {
  const member = await tx.membership.findUnique({
    where: { tenantId_userId: { tenantId: c.tenantId, userId: c.userId } },
  });
  const roles = member ? [member.role, ...member.additionalRoles] : [];
  if (
    !roles.includes('ENGINEER') &&
    !(!engineeringOnly && roles.includes('OPERATOR') && state === 'DRAFT')
  )
    throw new ForbiddenException({
      code: 'FIELD_EXECUTION_LOCKED',
      message: 'Field execution is locked or unavailable to this profile',
    });
}
