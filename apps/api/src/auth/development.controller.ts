import { AuthRequest } from './auth.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Public } from './auth.guard';
import { TokenService } from './token.service';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { developmentBypassEnabled } from './development-access';

@Controller('auth')
export class DevelopmentController {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(TenantDatabaseService) private readonly tenants: TenantDatabaseService,
  ) {
    developmentBypassEnabled();
  }
  @Public()
  @Header('Cache-Control', 'no-store')
  @Get('dev-status')
  status() {
    if (!developmentBypassEnabled()) throw new NotFoundException();
    return { enabled: true };
  }
  @Public()
  @Post('dev-session')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async session(@Req() request: { ip?: string }, @Body() body?: unknown) {
    if (
      !developmentBypassEnabled() ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip ?? '')
    )
      throw new NotFoundException();
    if (
      body !== undefined &&
      (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
    )
      throw new BadRequestException('Invalid development session input');
    const userId = process.env.DEV_AUTH_USER_ID;
    const tenantId = process.env.DEV_AUTH_TENANT_ID;
    if (!userId || !tenantId) throw new NotFoundException();
    const user = await this.db.user.findFirst({
      where: { id: userId, email: 'dev-bypass@example.invalid', active: true },
    });
    if (!user) throw new NotFoundException();
    const identity = { userId, tenantId, sessionId: randomUUID() };
    const refreshToken = randomBytes(32).toString('base64url');
    await this.tenants.run(identity, async (tx) => {
      if (!(await tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } } })))
        throw new NotFoundException();
      await tx.authSession.create({
        data: {
          userId,
          tenantId,
          familyId: identity.sessionId,
          refreshHash: createHash('sha256').update(refreshToken).digest('hex'),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    });
    return {
      accessToken: await this.tokens.sign(identity),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
    };
  }
  @Post('dev-role')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async role(@Req() request: AuthRequest & { ip?: string }, @Body() body: unknown) {
    if (
      !developmentBypassEnabled() ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip ?? '') ||
      request.identity.userId !== process.env.DEV_AUTH_USER_ID ||
      request.identity.tenantId !== process.env.DEV_AUTH_TENANT_ID
    )
      throw new NotFoundException();
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((k) => k !== 'role')
    )
      throw new BadRequestException('Invalid test profile');
    const role = (body as { role?: unknown }).role;
    if (
      typeof role !== 'string' ||
      !['ADMIN', 'ENGINEER', 'OPERATOR', 'COMMERCIAL', 'VIEWER'].includes(role)
    )
      throw new BadRequestException('Invalid test profile');
    await this.tenants.run(
      request.identity,
      (tx) =>
        tx.$queryRaw`SELECT 1 AS changed FROM set_local_test_role(${request.identity.userId}::uuid,${request.identity.tenantId}::uuid,${role})`,
    );
    return { role };
  }
}
