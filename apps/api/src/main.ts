import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadApiEnv } from '@lga/core';
import { EnvValidationError } from '@lga/shared';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap(): Promise<void> {
  const env = loadApiEnv(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
    bodyParser: false,
  });
  configureApp(app, env);
  await app.listen(env.API_PORT, env.API_HOST);
  app.get(Logger).log(`API listening on http://${env.API_HOST}:${env.API_PORT}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  // Config errors list variable names only (never values).
  const message = error instanceof EnvValidationError ? error.message : String(error);
  process.stderr.write(`API failed to start: ${message}\n`);
  if (!(error instanceof EnvValidationError) && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exit(1);
});
