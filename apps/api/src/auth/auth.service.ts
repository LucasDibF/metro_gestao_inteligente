import { MfaService } from './mfa.service';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { dummyHash, verifyPassword } from './password';
import { Identity, TokenService } from './token.service';

const refreshDays = 7;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const newRefresh = () => randomBytes(32).toString('base64url');
const invalid = () => new UnauthorizedException('Invalid credentials or session');

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(TenantDatabaseService) private readonly tenants: TenantDatabaseService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(MfaService) private readonly mfa: MfaService,
  ) {}

  async login(email: string, password: string, tenantId: string, mfaCode?: string) {
    const user = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const matches = await verifyPassword(password, user?.passwordHash ?? dummyHash);
    if (!matches || !user?.active) throw invalid();
    const identity = { userId: user.id, tenantId, sessionId: randomUUID() };
    const refreshToken = newRefresh();
    await this.tenants.run(identity, async (tx) => {
      await this.mfa.lock(tx, user.id);
      const membership = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
      });
      if (!membership) throw invalid();
      try {
        await this.mfa.consume(tx, user.id, mfaCode);
      } catch (error) {
        if (error instanceof UnauthorizedException) throw invalid();
        throw error;
      }
      await tx.authSession.create({
        data: {
          familyId: identity.sessionId,
          userId: user.id,
          tenantId,
          refreshHash: digest(refreshToken),
          expiresAt: new Date(Date.now() + refreshDays * 86400000),
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

  async refresh(refreshToken: string) {
    const refreshHash = digest(refreshToken);
    const nextToken = newRefresh();
    const identity = await this.db.$transaction(async (tx) => {
      // Lock the entire family: rotation, replay revocation and logout serialize.
      const candidate = await tx.authSession.findUnique({ where: { refreshHash } });
      if (!candidate) return null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.familyId}, 0))`;
      await this.mfa.lock(tx, candidate.userId);
      const session = await tx.authSession.findUniqueOrThrow({ where: { refreshHash } });
      const now = new Date();
      if (session.rotatedAt || session.revokedAt || session.expiresAt <= now) {
        await tx.authSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        return null; // Commit replay revocation before returning an HTTP error.
      }
      await tx.$queryRaw`SELECT set_config('app.user_id', ${session.userId}, true), set_config('app.tenant_id', ${session.tenantId}, true)`;
      const membership = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } },
      });
      if (!membership) {
        await tx.authSession.updateMany({
          where: { familyId: session.familyId },
          data: { revokedAt: now },
        });
        return null;
      }
      await tx.authSession.update({ where: { id: session.id }, data: { rotatedAt: now } });
      await tx.authSession.create({
        data: {
          familyId: session.familyId,
          userId: session.userId,
          tenantId: session.tenantId,
          refreshHash: digest(nextToken),
          expiresAt: session.expiresAt,
        },
      });
      return { userId: session.userId, tenantId: session.tenantId, sessionId: session.familyId };
    });
    if (!identity) throw invalid();
    return {
      accessToken: await this.tokens.sign(identity),
      refreshToken: nextToken,
      tokenType: 'Bearer',
      expiresIn: 900,
    };
  }

  async authenticate(
    token: string,
  ): Promise<
    Identity & {
      role: import('@prisma/client').MembershipRole;
      additionalRoles: import('@prisma/client').MembershipRole[];
      canDownloadReports: boolean;
    }
  > {
    const identity = await this.tokens.verify(token);
    const session = await this.db.authSession.findFirst({
      where: {
        familyId: identity.sessionId,
        userId: identity.userId,
        tenantId: identity.tenantId,
        revokedAt: null,
        rotatedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!session) throw invalid();
    const membership = await this.tenants.run(identity, (tx) =>
      tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: identity.tenantId, userId: identity.userId } },
      }),
    );
    if (!membership) throw invalid();
    return {
      ...identity,
      role: membership.role,
      additionalRoles: membership.additionalRoles,
      canDownloadReports: membership.canDownloadReports,
    };
  }

  async logout(identity: Identity) {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity.sessionId}, 0))`;
      await tx.authSession.updateMany({
        where: { familyId: identity.sessionId, userId: identity.userId },
        data: { revokedAt: new Date() },
      });
    });
  }
}
