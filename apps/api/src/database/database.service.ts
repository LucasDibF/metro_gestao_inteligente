import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class DatabaseService extends PrismaClient implements OnApplicationShutdown, OnModuleInit {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    super({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }) });
  }

  async onModuleInit() {
    const [role] = await this.$queryRaw<Array<{ unsafe: boolean }>>`
      SELECT (r.rolsuper OR r.rolbypassrls OR EXISTS (
        SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = current_user
      )) AS unsafe FROM pg_roles r WHERE r.rolname = current_user`;
    if (!role || role.unsafe) {
      await this.$disconnect();
      throw new Error('API requires a non-owner database role without RLS bypass');
    }
  }

  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
