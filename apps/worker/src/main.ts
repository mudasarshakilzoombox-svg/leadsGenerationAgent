import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { flushSentry, initSentry, loadWorkerEnv } from '@lga/core';
import { EnvValidationError } from '@lga/shared';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  const env = loadWorkerEnv(process.env);
  initSentry('worker', env);
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.flushLogs();
  // SIGTERM/SIGINT: stop taking jobs, finish active ones, close connections (06-background-jobs §10).
  app.enableShutdownHooks();
  await app.init();
  app.get(Logger).log('Worker started', 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof EnvValidationError ? error.message : String(error);
  process.stderr.write(`Worker failed to start: ${message}\n`);
  if (!(error instanceof EnvValidationError) && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  void flushSentry().finally(() => process.exit(1));
});
