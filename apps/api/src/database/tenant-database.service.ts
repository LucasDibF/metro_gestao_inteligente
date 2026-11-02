import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export interface TenantContext {
  userId: string;
  tenantId: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantDatabaseService {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  // Call only with an authenticated identity. RLS additionally checks active membership.
  run<T>(
    context: TenantContext,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!uuid.test(context.userId) || !uuid.test(context.tenantId)) {
      throw new Error('Invalid tenant context');
    }
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.user_id', ${context.userId.toLowerCase()}, true),
        set_config('app.tenant_id', ${context.tenantId.toLowerCase()}, true)`;
      return operation(tx);
    });
  }
}
