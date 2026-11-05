import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthRequest, Public } from './auth.guard';
import { TenantDatabaseService } from '../database/tenant-database.service';

import { newPassword, object, text } from './auth-input';

@Controller('auth')
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TenantDatabaseService) private readonly tenants: TenantDatabaseService,
  ) {}

  @Public()
  @Header('Cache-Control', 'no-store')
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const input = object(body);
    const email = text(input.email, 254);
    const password = text(input.password, 1024);
    const tenantId = text(input.tenantId, 36).toLowerCase();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tenantId) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    )
      throw new BadRequestException('Invalid request');
    const mfaCode = input.mfaCode === undefined ? undefined : text(input.mfaCode, 32);
    return this.auth.login(email, password, tenantId, mfaCode);
  }

  @Public()
  @Header('Cache-Control', 'no-store')
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    const token = text(object(body).refreshToken, 128);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new BadRequestException('Invalid request');
    return this.auth.refresh(token);
  }

  @Header('Cache-Control', 'no-store')
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: AuthRequest) {
    await this.auth.logout(request.identity);
  }

  @Header('Cache-Control', 'no-store')
  @Post('password')
  @HttpCode(204)
  async changePassword(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = object(body);
    const replacement = newPassword(input.newPassword);
    await this.auth.changePassword(
      request.identity,
      text(input.currentPassword, 1024),
      replacement,
    );
  }

  @Header('Cache-Control', 'no-store')
  @Get('me')
  async me(@Req() request: AuthRequest) {
    const identity = request.identity;
    return this.tenants.run(identity, async (tx) => {
      const membership = await tx.membership.findUniqueOrThrow({
        where: {
          tenantId_userId: {
            tenantId: identity.tenantId,
            userId: identity.userId,
          },
        },
      });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: identity.tenantId } });
      const mfa = await tx.mfaCredential.findUnique({
        where: { userId: identity.userId },
        select: { enabledAt: true },
      });
      return {
        userId: identity.userId,
        mfaEnabled: Boolean(mfa?.enabledAt),
        tenant: {
          id: tenant.id,
          name: tenant.name,
          ...(tenant.profile ? { profile: tenant.profile } : {}),
        },
        role: membership.role,
        additionalRoles: membership.additionalRoles,
        canDownloadReports: membership.canDownloadReports,
      };
    });
  }
}
