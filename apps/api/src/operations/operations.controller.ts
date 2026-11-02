import { Controller, Get, Inject, Req } from '@nestjs/common';
import { AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { TenantDatabaseService } from '../database/tenant-database.service';
@Controller('operacao')
export class OperationsController {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  @Get('fila') @Roles('ADMIN') queue(@Req() req: AuthRequest) {
    return this.db.run(req.identity, async (tx) => {
      const where = { tenantId: req.identity.tenantId };
      const jobs = await tx.reportIssue.groupBy({ by: ['state'], where, _count: { _all: true } });
      const oldest = await tx.reportIssue.findFirst({
        where: { ...where, state: { in: ['PENDING', 'PROCESSING'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      return {
        counts: Object.fromEntries(jobs.map((j) => [j.state, j._count._all])),
        oldestPendingAt: oldest?.createdAt ?? null,
      };
    });
  }
}
