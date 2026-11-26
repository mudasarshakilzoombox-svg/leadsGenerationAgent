import 'server-only';
import { parseEnv } from '@lga/shared';
import { webEnvSchema } from './env-schema';

/** Validated at first import on the server. Importing this from a Client Component fails the build. */
export const serverEnv = parseEnv(webEnvSchema, process.env, 'web');
