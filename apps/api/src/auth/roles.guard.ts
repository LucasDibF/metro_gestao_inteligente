import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { AuthRequest } from './auth.guard';

export const Roles = (...roles: MembershipRole[]) => SetMetadata('roles', roles);
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<MembershipRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const identity = context.switchToHttp().getRequest<AuthRequest>().identity;
    if (
      !identity ||
      ![identity.role, ...(identity.additionalRoles ?? [])].some((role) => roles.includes(role))
    )
      throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
