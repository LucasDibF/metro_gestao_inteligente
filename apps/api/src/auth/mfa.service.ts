import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { verifyPassword } from './password';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const denied = () =>
  new UnauthorizedException({
    message: 'Invalid credentials or session',
    code: 'MFA_VERIFICATION_FAILED',
  });

@Injectable()
export class MfaService {
  private readonly key: Buffer;
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {
    const value = process.env.MFA_ENCRYPTION_KEY;
    if (!value || !/^[0-9a-f]{64}$/i.test(value))
      throw new Error('MFA_ENCRYPTION_KEY must be a 32-byte hex key');
    this.key = Buffer.from(value, 'hex');
  }

  async lock(tx: Prisma.TransactionClient, userId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 1))`;
  }

  private encrypt(userId: string, secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(userId));
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      encrypted.toString('hex'),
    ].join('.');
  }

  private decrypt(userId: string, value: string) {
    const [version, iv, tag, encrypted] = value.split('.');
    if (version !== 'v1') throw new Error('Unsupported MFA secret version');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'hex'));
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }

  private async password(tx: Prisma.TransactionClient, userId: string, password: string) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user?.active || !(await verifyPassword(password, user.passwordHash))) throw denied();
    return user;
  }

  // Caller must hold the per-user lock, including when checking a recovery code.
  async consume(tx: Prisma.TransactionClient, userId: string, code?: string) {
    const credential = await tx.mfaCredential.findUnique({ where: { userId } });
    if (!credential?.enabledAt) return;
    if (!code) throw denied();
    if (/^[0-9a-f]{32}$/.test(code)) {
      const hash = digest(code);
      if (!credential.recoveryHashes.includes(hash)) throw denied();
      await tx.mfaCredential.update({
        where: { userId },
        data: { recoveryHashes: credential.recoveryHashes.filter((value) => value !== hash) },
      });
      return;
    }
    if (!/^\d{6}$/.test(code)) throw denied();
    const result = await verify({
      secret: this.decrypt(userId, credential.secretCipher),
      token: code,
      epochTolerance: 30,
    });
    if (
      !result.valid ||
      !('timeStep' in result) ||
      (credential.lastUsedStep !== null && BigInt(result.timeStep) <= credential.lastUsedStep)
    )
      throw denied();
    await tx.mfaCredential.update({
      where: { userId },
      data: { lastUsedStep: BigInt(result.timeStep) },
    });
  }

  async setup(userId: string, password: string) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const user = await this.password(tx, userId, password);
      const current = await tx.mfaCredential.findUnique({ where: { userId } });
      if (current?.enabledAt) throw new ConflictException('MFA already enabled');
      const secret = generateSecret();
      const data = {
        secretCipher: this.encrypt(userId, secret),
        pendingExpiresAt: new Date(Date.now() + 300000),
        recoveryHashes: [],
      };
      await tx.mfaCredential.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      return {
        secret,
        uri: generateURI({ issuer: 'Metro', label: user.email, secret }),
        expiresIn: 300,
      };
    });
  }

  async enable(userId: string, password: string, code: string) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      await this.password(tx, userId, password);
      const credential = await tx.mfaCredential.findUnique({ where: { userId } });
      if (
        !credential ||
        credential.enabledAt ||
        !credential.pendingExpiresAt ||
        credential.pendingExpiresAt <= new Date()
      )
        throw new BadRequestException('MFA setup expired or unavailable');
      if (!/^\d{6}$/.test(code)) throw denied();
      const result = await verify({
        secret: this.decrypt(userId, credential.secretCipher),
        token: code,
        epochTolerance: 30,
      });
      if (!result.valid || !('timeStep' in result)) throw denied();
      const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'));
      await tx.mfaCredential.update({
        where: { userId },
        data: {
          enabledAt: new Date(),
          pendingExpiresAt: null,
          lastUsedStep: BigInt(result.timeStep),
          recoveryHashes: recoveryCodes.map(digest),
        },
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { recoveryCodes };
    });
  }

  async disable(userId: string, password: string, code: string) {
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      await this.password(tx, userId, password);
      const current = await tx.mfaCredential.findUnique({ where: { userId } });
      if (!current?.enabledAt) throw new BadRequestException('MFA not enabled');
      await this.consume(tx, userId, code);
      await tx.mfaCredential.delete({ where: { userId } });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
