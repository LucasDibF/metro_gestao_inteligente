import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { object } from '../auth/auth-input';
import { hashPassword } from '../auth/password';
import { TenantDatabaseService } from '../database/tenant-database.service';
const ordered: MembershipRole[] = ['ADMIN', 'ENGINEER', 'COMMERCIAL', 'OPERATOR', 'VIEWER'];
function input(
  value: unknown,
  create: boolean,
): Record<string, unknown> & { roles: MembershipRole[] } {
  const v = object(value);
  const allowed = create
    ? ['email', 'password', 'roles', 'canDownloadReports']
    : ['roles', 'active', 'canDownloadReports', 'version'];
  if (
    Object.keys(v).some((key) => !allowed.includes(key)) ||
    !Array.isArray(v.roles) ||
    !v.roles.length ||
    v.roles.length > 5 ||
    v.roles.some((role) => !ordered.includes(role as MembershipRole)) ||
    new Set(v.roles).size !== v.roles.length ||
    typeof v.canDownloadReports !== 'boolean'
  )
    throw new BadRequestException('Invalid access configuration');
  if (
    !create &&
    (typeof v.active !== 'boolean' || !Number.isSafeInteger(v.version) || Number(v.version) < 1)
  )
    throw new BadRequestException('Invalid access version');
  if (
    create &&
    (typeof v.email !== 'string' ||
      v.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()) ||
      typeof v.password !== 'string' ||
      v.password.length < 12 ||
      v.password.length > 128)
  )
    throw new BadRequestException({
      code: 'ACCESS_INPUT_INVALID',
      message: 'Email and password required',
    });
  return { ...v, roles: ordered.filter((role) => (v.roles as unknown[]).includes(role)) };
}
function databaseError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
    const driver = error.meta?.driverAdapterError as
      { cause?: { originalCode?: string } } | undefined;
    const code = String(error.meta?.code ?? driver?.cause?.originalCode);
    if (code === '23505')
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Email already registered',
      });
    if (code === '23514')
      throw new BadRequestException({
        code: 'ADMIN_ACCESS_PROTECTED',
        message: 'Administration access must remain active',
      });
    if (code === 'P0002') throw new NotFoundException('Member unavailable');
    if (code === '42501') throw new ForbiddenException('Administration required');
  }
  throw error;
}
@Controller('acessos')
@Roles('ADMIN')
export class AccessController {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() r: AuthRequest) {
    return this.db.run(r.identity, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ items: unknown }>
      >`SELECT admin_members_list() AS items`;
      return { items: rows[0].items };
    });
  }
  @Post()
  async create(@Req() r: AuthRequest, @Body() body: unknown) {
    const v = input(body, true);
    const hash = await hashPassword(String(v.password));
    try {
      return await this.db.run(r.identity, async (tx) => {
        const roles = v.roles.join(',');
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT admin_member_create(${String(v.email).trim().toLowerCase()},${hash},string_to_array(${roles},',')::"MembershipRole"[],${v.canDownloadReports as boolean}) AS id`;
        return { userId: rows[0].id };
      });
    } catch (e) {
      databaseError(e);
    }
  }
  @Put(':id')
  async update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const v = input(body, false);
    try {
      return await this.db.run(r.identity, async (tx) => {
        const roles = v.roles.join(',');
        const rows = await tx.$queryRaw<
          Array<{ changed: boolean }>
        >`SELECT admin_member_update(${id}::uuid,string_to_array(${roles},',')::"MembershipRole"[],${v.active as boolean},${v.canDownloadReports as boolean},${Number(v.version)}::int) AS changed`;
        if (!rows[0].changed)
          throw new ConflictException({
            code: 'RECORD_VERSION_CONFLICT',
            message: 'Access changed',
          });
        return { changed: true };
      });
    } catch (e) {
      databaseError(e);
    }
  }
}
