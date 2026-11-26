import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG } from '../config/config.module.js';
import type { BaseServerEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Base Prisma client (app role, DML only). Connects lazily on first query, so the process
 * starts even while the database is down. Readiness reports the outage instead.
 * Tenant scoping is added as a client extension in Phase 0 auth/tenancy work (ADR-0006).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) env: BaseServerEnv) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: env.DATABASE_POOL_MAX,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        application_name: `lga-${env.APP_ENV}`,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
