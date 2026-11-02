import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { Identity } from './token.service';

export const Public = () => SetMetadata('public', true);
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  identity: Identity & {
    role: import('@prisma/client').MembershipRole;
    additionalRoles: import('@prisma/client').MembershipRole[];
    canDownloadReports: boolean;
  };
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !/^Bearer [^ ]+$/.test(authorization))
      throw new UnauthorizedException('Invalid session');
    request.identity = await this.auth.authenticate(authorization.slice(7));
    return true;
  }
}
