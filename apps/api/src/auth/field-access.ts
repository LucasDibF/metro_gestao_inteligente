import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenantContext } from '../database/tenant-database.service';
const locked = () =>
  new ForbiddenException({
    code: 'FIELD_EXECUTION_LOCKED',
    message: 'Field execution is locked or unavailable to this profile',
  });
async function memberRoles(tx: Prisma.TransactionClient, c: TenantContext): Promise<string[]> {
  const member = await tx.membership.findUnique({
    where: { tenantId_userId: { tenantId: c.tenantId, userId: c.userId } },
  });
  return member ? [member.role, ...member.additionalRoles] : [];
}
async function activelyAssigned(
  tx: Prisma.TransactionClient,
  c: TenantContext,
  workId: string,
): Promise<boolean> {
  const assignment = await tx.workAssignment.findFirst({
    where: { workId, tenantId: c.tenantId, operatorId: c.userId, active: true },
    select: { workId: true },
  });
  return assignment !== null;
}
/** Combined profiles can see every work, so visibility alone does not grant field access. */
export async function requireFieldAssignment(
  tx: Prisma.TransactionClient,
  c: TenantContext,
  workId: string,
): Promise<void> {
  const roles = await memberRoles(tx, c);
  if (roles.includes('ENGINEER') || !roles.includes('OPERATOR')) return;
  if (!(await activelyAssigned(tx, c, workId))) throw locked();
}
export async function requireFieldWrite(
  tx: Prisma.TransactionClient,
  c: TenantContext,
  state: string,
  workId: string,
  engineeringOnly = false,
): Promise<void> {
  const roles = await memberRoles(tx, c);
  if (roles.includes('ENGINEER')) return;
  if (
    engineeringOnly ||
    !roles.includes('OPERATOR') ||
    state !== 'DRAFT' ||
    !(await activelyAssigned(tx, c, workId))
  )
    throw locked();
}
