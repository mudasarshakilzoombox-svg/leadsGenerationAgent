import { createHash } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import {
  APP_CONFIG,
  type BaseServerEnv,
  DomainError,
  REDIS,
  type ValkeyClient,
  valkeyKey,
} from '@lga/core';
import type { Response } from 'express';
import { from, type Observable, of, switchMap, tap } from 'rxjs';
import type { AuthedRequest } from '../auth/request-context.js';

/** Metadata key written by `@HttpCode()` (stable across NestJS majors). */
const HTTP_CODE_METADATA = '__httpCode__';
const TTL_SECONDS = 24 * 60 * 60;
const MAX_STORED_BODY = 64 * 1024;
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,128}$/;

interface Stored {
  state: 'IN_PROGRESS' | 'DONE';
  fingerprint: string;
  status?: number;
  body?: unknown;
}

/**
 * `Idempotency-Key` for endpoints with external effects (03-api.md §6): the first request runs,
 * repeats within 24 h replay its response with `Idempotent-Replayed: true`, a different body under
 * the same key is a 409. Keys are scoped per workspace (or user) and route.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(REDIS) private readonly redis: ValkeyClient,
    @Inject(APP_CONFIG) private readonly env: BaseServerEnv,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const res = http.getResponse<Response>();
    const header = req.headers['idempotency-key'];
    if (typeof header !== 'string' || !KEY_FORMAT.test(header)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Send an Idempotency-Key header (8-128 URL-safe characters).',
        {
          errors: [
            {
              pointer: '/headers/idempotency-key',
              code: 'required',
              message: 'Idempotency-Key header is required.',
            },
          ],
        },
      );
    }
    const scope = req.workspaceAccess?.workspaceId ?? req.auth?.userId ?? 'anonymous';
    const route = `${req.method} ${req.route ? String((req.route as { path: unknown }).path) : req.path}`;
    const key = valkeyKey(
      this.env,
      'idem',
      scope,
      createHash('sha256').update(route).digest('hex').slice(0, 16),
      header,
    );
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(req.body ?? null))
      .digest('hex');
    const successStatus =
      (Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler()) as number | undefined) ??
      (req.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    return from(
      this.redis.set(
        key,
        JSON.stringify({ state: 'IN_PROGRESS', fingerprint } satisfies Stored),
        'EX',
        TTL_SECONDS,
        'NX',
      ),
    ).pipe(
      switchMap((acquired) => {
        if (acquired === 'OK') {
          return next.handle().pipe(
            tap({
              next: (body: unknown) => {
                const json = JSON.stringify(body ?? null);
                const stored: Stored = {
                  state: 'DONE',
                  fingerprint,
                  status: successStatus,
                  body: json.length <= MAX_STORED_BODY ? body : undefined,
                };
                void this.redis.set(key, JSON.stringify(stored), 'EX', TTL_SECONDS);
              },
              // A failed attempt may be retried with the same key.
              error: () => void this.redis.del(key),
            }),
          );
        }
        return from(this.redis.get(key)).pipe(
          switchMap((raw) => {
            const stored = raw ? (JSON.parse(raw) as Stored) : undefined;
            if (!stored || stored.fingerprint !== fingerprint) {
              throw new DomainError(
                'IDEMPOTENCY_CONFLICT',
                'This Idempotency-Key was already used for a different request.',
              );
            }
            if (stored.state === 'IN_PROGRESS') {
              throw new DomainError(
                'IDEMPOTENCY_IN_PROGRESS',
                'The original request is still being processed.',
              );
            }
            res.setHeader('Idempotent-Replayed', 'true');
            res.status(stored.status ?? successStatus);
            return of(stored.body ?? null);
          }),
        );
      }),
    );
  }
}
