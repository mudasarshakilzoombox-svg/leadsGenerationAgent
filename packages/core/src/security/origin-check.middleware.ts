import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG } from '../config/config.module.js';
import type { BaseServerEnv } from '../config/env.js';
import { DomainError } from '../errors/domain-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Signature- or token-authenticated endpoints that legitimately receive cross-site POSTs. */
const EXEMPT_PREFIXES = ['/webhooks/', '/u/'];

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'lga-web';

/**
 * CSRF defense (docs/architecture/08-authentication.md §8): state-changing requests must
 * come from our own origin AND carry `X-Requested-With: lga-web`. A custom header cannot
 * be sent cross-origin without a CORS preflight, and we never answer preflights.
 * Runs as middleware (before routing) so it also covers unmatched routes.
 */
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly allowedOrigin: string;

  constructor(@Inject(APP_CONFIG) env: BaseServerEnv) {
    this.allowedOrigin = new URL(env.APP_ORIGIN).origin;
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();
    const path = req.originalUrl || req.url;
    if (EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();

    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    const originOk = origin ? origin === this.allowedOrigin : fetchSite === 'same-origin';
    const headerOk = req.headers[CSRF_HEADER] === CSRF_HEADER_VALUE;

    if (!originOk || !headerOk) {
      throw new DomainError(
        'ORIGIN_REJECTED',
        'State-changing requests must come from the application origin.',
      );
    }
    next();
  }
}
