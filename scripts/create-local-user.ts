import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../apps/api/src/auth/password';

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  const email = process.env.LOCAL_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.LOCAL_USER_PASSWORD;
  const name = process.env.LOCAL_TENANT_NAME?.trim();
  if (!connectionString || !email || !password || !name)
    throw new Error('Missing local provisioning inputs');
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local databases only');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length > 200)
    throw new Error('Invalid local provisioning inputs');
  const passwordHash = await hashPassword(password);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const tenant = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash } });
      return tx.tenant.create({
        data: { name, memberships: { create: { userId: user.id, role: 'ADMIN' } } },
      });
    });
    console.log(`Local administrator created. Tenant ID: ${tenant.id}`);
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Local user creation failed; verify inputs and duplicate email');
  process.exitCode = 1;
});
