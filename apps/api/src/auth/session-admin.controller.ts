import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from './auth.guard';
import { Roles } from './roles.guard';

@Controller('auth/tenant-sessions')
@Roles('ADMIN')
export class SessionAdminController {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthRequest) {
    return this.db.authSession.findMany({
      where: {
        tenantId: request.identity.tenantId,
        rotatedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { familyId: true, userId: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post(':sessionId/revoke')
  @HttpCode(204)
  async revoke(@Req() request: AuthRequest, @Param('sessionId', ParseUUIDPipe) familyId: string) {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}, 0))`;
      const session = await tx.authSession.findFirst({
        where: { familyId, tenantId: request.identity.tenantId },
      });
      if (!session) throw new NotFoundException('Session not found');
      await tx.authSession.updateMany({
        where: { familyId, tenantId: request.identity.tenantId },
        data: { revokedAt: new Date() },
      });
    });
  }
}
