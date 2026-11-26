import { Inject, Injectable } from '@nestjs/common';
import type { HealthReport } from '@lga/contracts';
import {
  type ApiEnv,
  APP_CONFIG,
  buildHealthReport,
  countLocalMigrations,
  databaseCheck,
  migrationsCheck,
  PrismaService,
  REDIS,
  valkeyCheck,
  type ValkeyClient,
} from '@lga/core';

@Injectable()
export class HealthService {
  private readonly expectedMigrations = countLocalMigrations();

  constructor(
    @Inject(APP_CONFIG) private readonly env: ApiEnv,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: ValkeyClient,
  ) {}

  /** Readiness: database reachable, all shipped migrations applied, Valkey reachable. */
  ready(): Promise<HealthReport> {
    return buildHealthReport('api', this.env, {
      database: databaseCheck(this.prisma),
      migrations: migrationsCheck(this.prisma, this.expectedMigrations),
      valkey: valkeyCheck(this.redis),
    });
  }
}
