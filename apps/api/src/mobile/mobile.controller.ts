import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Param,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { type AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { boreholeSelectFor } from '../works/borehole-select';
import { hierarchyPage } from '../works/hierarchy-input';
@Roles('OPERATOR')
@Controller('mobile/obras')
export class MobileController {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  @Get() list(@Req() req: AuthRequest, @Query('page') rawPage?: string) {
    const c = req.identity,
      page = hierarchyPage(rawPage),
      pageSize = 20;
    return this.db.run(c, async (tx) => {
      const where = {
        tenantId: c.tenantId,
        deletedAt: null,
        fieldAssignment: { is: { operatorId: c.userId, active: true } },
      };
      return {
        items: await tx.work.findMany({
          where,
          select: { id: true, name: true, city: true, state: true, version: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: pageSize,
          skip: (page - 1) * pageSize,
        }),
        total: await tx.work.count({ where }),
        page,
        pageSize,
      };
    });
  }
  @Get(':workId/:resource') contents(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('resource') resource: string,
    @Query('page') rawPage?: string,
  ) {
    if (!['pastas', 'furos'].includes(resource)) throw new BadRequestException('Invalid resource');
    const c = req.identity,
      page = hierarchyPage(rawPage);
    return this.db.run(c, async (tx) => {
      if (
        !(await tx.workAssignment.findFirst({
          where: { workId, tenantId: c.tenantId, operatorId: c.userId, active: true },
        }))
      )
        throw new NotFoundException('Work unavailable');
      if (
        !(await tx.work.findFirst({ where: { id: workId, tenantId: c.tenantId, deletedAt: null } }))
      )
        throw new NotFoundException('Work unavailable');
      const where = { workId, tenantId: c.tenantId, deletedAt: null };
      const query = {
        where,
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        skip: (page - 1) * 20,
        take: 20,
      };
      return resource === 'pastas'
        ? { items: await tx.folder.findMany(query), total: await tx.folder.count({ where }), page }
        : {
            items: await tx.borehole.findMany({ ...query, select: boreholeSelectFor(c) }),
            total: await tx.borehole.count({ where }),
            page,
          };
    });
  }
}
