import { TenantDatabaseService } from '../database/tenant-database.service';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  NotFoundException,
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
    @Inject(TenantDatabaseService) private readonly tenants: TenantDatabaseService,
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
    // Enforce work visibility before any nested controller can read or write a child.
    const roles = [request.identity.role, ...request.identity.additionalRoles];
    const incoming = context
      .switchToHttp()
      .getRequest<{ path: string; params: Record<string, string> }>();
    const workId =
      incoming.params.workId ??
      (/^\/api\/v1\/obras\//i.test(incoming.path) ? incoming.params.id : undefined);
    if (workId && roles.every((role) => role === 'OPERATOR')) {
      const visible = await this.tenants.run(request.identity, (tx) =>
        tx.work.findFirst({
          where: { id: workId, tenantId: request.identity.tenantId, deletedAt: null },
          select: { id: true },
        }),
      );
      if (!visible) throw new NotFoundException('Work unavailable');
    }

    return true;
  }
}
