import type { Prisma } from '@prisma/client';
export const workStatuses = ['NOT_STARTED', 'IN_FIELD', 'IN_REVIEW', 'APPROVED'] as const;
export function statusFilter(status?: string): Prisma.WorkWhereInput {
  if (status === 'NOT_STARTED') return { boreholes: { none: { deletedAt: null } } };
  if (status === 'IN_REVIEW')
    return { boreholes: { some: { deletedAt: null, reviewState: 'IN_REVIEW' } } };
  if (status === 'APPROVED')
    return {
      boreholes: {
        some: { deletedAt: null },
        every: { OR: [{ deletedAt: { not: null } }, { reviewState: 'APPROVED' }] },
      },
    };
  if (status === 'IN_FIELD')
    return {
      AND: [
        { boreholes: { some: { deletedAt: null, reviewState: 'DRAFT' } } },
        { boreholes: { none: { deletedAt: null, reviewState: 'IN_REVIEW' } } },
      ],
    };
  return {};
}
