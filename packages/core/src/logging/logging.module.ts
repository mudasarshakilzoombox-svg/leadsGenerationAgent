import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type DynamicModule, Module } from '@nestjs/common';
import { isValidRequestId, stripQuery } from '@lga/shared';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG } from '../config/config.module.js';
import type { BaseServerEnv } from '../config/env.js';
import { type BackendService, buildLoggerOptions } from './logger-options.js';

const REQUEST_ID_HEADER = 'x-request-id';

/** Reuse a well-formed upstream request id (set by nginx) or create one, and echo it back. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = isValidRequestId(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

@Module({})
export class LoggingModule {
  static forRoot(service: BackendService): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [APP_CONFIG],
          useFactory: (env: BaseServerEnv) => ({
            pinoHttp: {
              ...buildLoggerOptions(service, env),
              genReqId: resolveRequestId,
              autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
              customLogLevel: (_req, res, err) => {
                if (err || res.statusCode >= 500) return 'error';
                if (res.statusCode >= 400) return 'warn';
                return 'info';
              },
              serializers: {
                // Only method, path and id. No headers (cookies) and no query strings (tokens).
                req: (req: { id?: unknown; method?: string; url?: string }) => ({
                  id: req.id,
                  method: req.method,
                  url: stripQuery(req.url),
                }),
                res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
              },
            },
          }),
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
