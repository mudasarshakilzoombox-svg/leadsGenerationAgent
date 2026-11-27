// pnpm db:seed                  -> sync catalogs + development data (refused in production)
// pnpm db:seed --catalogs-only  -> sync plans and roles only (safe on every deploy)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { syncCatalogs } from '../platform/catalog-sync.js';
import { seedDevData } from './dev-seed.js';

const out = (line: string) => process.stdout.write(`${line}\n`);
const fail = (line: string) => process.stderr.write(`${line}\n`);

const rootEnv = path.resolve(import.meta.dirname, '../../../../.env');
if (existsSync(rootEnv)) {
  const before = { ...process.env };
  process.loadEnvFile(rootEnv);
  Object.assign(process.env, before);
}

const catalogsOnly = process.argv.includes('--catalogs-only');
if (!catalogsOnly && process.env.APP_ENV === 'production') {
  fail('Refusing to load development seed data with APP_ENV=production.');
  process.exit(1);
}
const connectionString = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  fail('DATABASE_MIGRATOR_URL or DATABASE_URL must be set.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2, application_name: 'lga-seed' }),
});
try {
  const catalogs = await syncCatalogs(prisma);
  out(`Catalogs synced: ${catalogs.plans} plans, ${catalogs.roles} roles.`);
  if (!catalogsOnly) {
    const summary = await seedDevData(prisma);
    out(
      `Development data: ${summary.workspaces} workspaces, ${summary.users} users, ${summary.inserted} rows inserted.`,
    );
  }
} catch (error) {
  // Error messages name constraints and fields, never row values.
  fail(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
