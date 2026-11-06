import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { isUuid } from '../common/uuid';
import { PoolSettings, poolSettings } from './pool-settings';

export interface TenantContext {
  userId: string;
  tenantId: string;
}

@Injectable()
export class TenantDatabaseService {
  private readonly settings: PoolSettings = poolSettings();
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  // Call only with an authenticated identity. RLS additionally checks active membership.
  run<T>(
    context: TenantContext,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    transaction?: Prisma.TransactionClient,
  ): Promise<T> {
    if (!isUuid(context.userId) || !isUuid(context.tenantId)) {
      throw new Error('Invalid tenant context');
    }
    if (transaction) return operation(transaction);
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.user_id', ${context.userId.toLowerCase()}, true),
        set_config('app.tenant_id', ${context.tenantId.toLowerCase()}, true),
        set_config('lock_timeout', ${this.settings.lockTimeoutMs + 'ms'}, true)`;
        return operation(tx);
      },
      { timeout: 20000, maxWait: this.settings.maxWaitMs },
    );
  }
}
