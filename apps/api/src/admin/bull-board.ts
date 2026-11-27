// Bull Board queue dashboard (06-background-jobs §12, ADR-0038) at /admin/queues.
// Placeholder platform-admin guard until P6.1: Super Admin + IP allowlist, and production-like
// environments always deny until MFA exists (08-authentication §10). Everything else gets a plain
// 404 so the dashboard's existence is not revealed.
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { QUEUE_NAMES } from '@lga/contracts';
import { type ApiEnv, type ActiveSession, QueueRegistry, SessionService } from '@lga/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response, Router } from 'express';
import { readSessionToken } from '../auth/cookies.js';

export const BULL_BOARD_PATH = '/admin/queues';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** `::ffff:127.0.0.1` and `127.0.0.1` are the same client. */
export function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function isPlatformAdmin(
  session: Pick<ActiveSession, 'user'> | null,
  clientIp: string | undefined,
  env: Pick<ApiEnv, 'APP_ENV' | 'ADMIN_IP_ALLOWLIST'>,
): boolean {
  // MFA (required for platform admins) is not built yet: deny where it would be enforced.
  if (env.APP_ENV === 'production' || env.APP_ENV === 'staging') return false;
  if (!session || session.user.platformRole !== 'SUPER_ADMIN') return false;
  const ip = normalizeIp(clientIp);
  return ip !== '' && env.ADMIN_IP_ALLOWLIST.map(normalizeIp).includes(ip);
}

export function mountBullBoard(app: NestExpressApplication, env: ApiEnv): void {
  const sessions = app.get(SessionService);
  const queues = app.get(QueueRegistry);

  // Built on the first authorised request, so API processes (and tests) that never open the
  // dashboard do not create queue connections for it.
  let router: Router | undefined;
  const board = (req: Request, res: Response, next: NextFunction): void => {
    if (!router) {
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath(BULL_BOARD_PATH);
      createBullBoard({
        queues: Object.values(QUEUE_NAMES).map((name) => new BullMQAdapter(queues.get(name))),
        serverAdapter,
        options: { uiConfig: { boardTitle: 'LGA queues' } },
      });
      router = serverAdapter.getRouter() as Router;
    }
    router(req, res, next);
  };

  const guard = (req: Request, res: Response, next: NextFunction): void => {
    const deny = () => {
      res.status(404).type('text/plain').send('Not Found');
    };
    sessions
      .resolve(readSessionToken(req))
      .then((session) => {
        if (!isPlatformAdmin(session, req.ip, env)) return deny();
        // Retry/remove are same-origin XHRs from the dashboard itself (CSRF defence: browsers
        // always send Sec-Fetch-Site, and a cross-site form cannot fake it).
        if (!SAFE_METHODS.has(req.method) && req.headers['sec-fetch-site'] !== 'same-origin') {
          res.status(403).type('text/plain').send('Forbidden');
          return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex');
        next();
      })
      .catch(next);
  };

  app.use(BULL_BOARD_PATH, guard, board);
}
