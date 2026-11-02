import { Public } from './auth/auth.guard';
import { SkipThrottle } from '@nestjs/throttler';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}
  @Get('live')
  live() {
    return { status: 'ok' };
  }
  @Get('ready')
  async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
