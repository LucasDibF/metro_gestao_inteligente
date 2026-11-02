import { Body, Controller, Header, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthRequest } from './auth.guard';
import { object, text } from './auth-input';
import { MfaService } from './mfa.service';

@Controller('auth/mfa')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class MfaController {
  constructor(@Inject(MfaService) private readonly mfa: MfaService) {}

  @Post('setup')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  setup(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.mfa.setup(request.identity.userId, text(object(body).password, 1024));
  }

  @Post('enable')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  enable(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = object(body);
    return this.mfa.enable(
      request.identity.userId,
      text(input.password, 1024),
      text(input.code, 32),
    );
  }

  @Post('disable')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  disable(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = object(body);
    return this.mfa.disable(
      request.identity.userId,
      text(input.password, 1024),
      text(input.code, 32),
    );
  }
}
