import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { object } from '../auth/auth-input';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { hierarchyPage } from '../works/hierarchy-input';
function parse(value: unknown, edit = false) {
  const v = object(value),
    lengths = { name: 200, document: 40, email: 254, phone: 40, address: 500 };
  if (
    Object.keys(v).some(
      (key) => !Object.keys(lengths).includes(key) && !(edit && key === 'version'),
    )
  )
    throw new BadRequestException('Unknown client field');
  const fields = Object.fromEntries(
    Object.entries(lengths).map(([key, max]) => {
      const value = v[key];
      if (
        value !== undefined &&
        value !== null &&
        (typeof value !== 'string' || value.trim().length > max)
      )
        throw new BadRequestException('Invalid client field');
      return [key, typeof value === 'string' ? value.trim() || null : null];
    }),
  );
  if (!fields.name || (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)))
    throw new BadRequestException('Invalid client');
  if (edit && (!Number.isSafeInteger(v.version) || Number(v.version) < 1))
    throw new BadRequestException('Expected version required');
  return {
    name: fields.name,
    document: fields.document,
    email: fields.email,
    phone: fields.phone,
    address: fields.address,
    version: Number(v.version),
  };
}
@Controller('clientes')
export class ClientsController {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  @Get()
  @Roles('ADMIN', 'ENGINEER', 'COMMERCIAL', 'VIEWER')
  list(@Req() r: AuthRequest, @Query('q') q = '', @Query('page') page?: string) {
    if (typeof q !== 'string' || q.length > 100) throw new BadRequestException('Invalid search');
    const current = hierarchyPage(page);
    return this.db.run(r.identity, async (tx) => {
      const where = {
        tenantId: r.identity.tenantId,
        name: { contains: q.trim(), mode: 'insensitive' as const },
      };
      return {
        items: await tx.client.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: 20,
          skip: (current - 1) * 20,
        }),
        total: await tx.client.count({ where }),
        page: current,
        pageSize: 20,
      };
    });
  }
  @Post()
  @Roles('COMMERCIAL', 'ENGINEER')
  create(@Req() r: AuthRequest, @Body() body: unknown) {
    const { version, ...data } = parse(body);
    return this.db.run(r.identity, (tx) =>
      tx.client.create({ data: { ...data, tenantId: r.identity.tenantId } }),
    );
  }
  @Put(':id')
  @Roles('COMMERCIAL', 'ENGINEER')
  update(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { version, ...data } = parse(body, true);
    return this.db.run(r.identity, async (tx) => {
      const where = { id, tenantId: r.identity.tenantId };
      if (!(await tx.client.findFirst({ where })))
        throw new NotFoundException('Client unavailable');
      const updated = await tx.client.updateMany({
        where: { ...where, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!updated.count)
        throw new ConflictException({ code: 'RECORD_VERSION_CONFLICT', message: 'Client changed' });
      return tx.client.findFirstOrThrow({ where });
    });
  }
}
