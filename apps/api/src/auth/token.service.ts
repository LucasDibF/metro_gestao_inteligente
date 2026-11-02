import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';

export interface Identity {
  userId: string;
  tenantId: string;
  sessionId: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32)
      throw new Error('JWT_SECRET must contain at least 32 bytes');
    this.key = new TextEncoder().encode(secret);
  }
  sign(identity: Identity) {
    return new SignJWT({ tenant: identity.tenantId, sid: identity.sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(identity.userId)
      .setIssuer('spt-api')
      .setAudience('spt-api')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.key);
  }
  async verify(token: string): Promise<Identity> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: 'spt-api',
        audience: 'spt-api',
        typ: 'JWT',
        requiredClaims: ['sub', 'tenant', 'sid', 'iat', 'exp'],
        maxTokenAge: '15m',
      });
      if (
        ![payload.sub, payload.tenant, payload.sid].every(
          (value) => typeof value === 'string' && uuid.test(value),
        )
      )
        throw new Error();
      return {
        userId: payload.sub!,
        tenantId: payload.tenant as string,
        sessionId: payload.sid as string,
      };
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
  }
}
