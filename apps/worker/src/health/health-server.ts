import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Liveness, PROBLEM_CONTENT_TYPE, problemType } from '@lga/contracts';
import { APP_CONFIG, type WorkerEnv } from '@lga/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { WorkerHealthService } from './worker-health.service.js';

/**
 * Minimal internal HTTP server for container healthchecks (port WORKER_HEALTH_PORT).
 * Never published outside the Docker network.
 */
@Injectable()
export class HealthServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: Server | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly env: WorkerEnv,
    private readonly health: WorkerHealthService,
    @InjectPinoLogger(HealthServer.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        this.logger.error({ err: error }, 'Health request failed');
        if (!res.headersSent) send(res, 500, { status: 'error' });
      });
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.env.WORKER_HEALTH_PORT, this.env.WORKER_HEALTH_HOST, () => resolve());
    });
    this.logger.info(
      { port: this.env.WORKER_HEALTH_PORT },
      `Health server on http://${this.env.WORKER_HEALTH_HOST}:${this.env.WORKER_HEALTH_PORT}`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method !== 'GET') return send(res, 405, problem(405, 'NOT_FOUND', path));
    if (path === '/health/live') {
      const body: Liveness = { status: 'ok', service: 'worker' };
      return send(res, 200, body);
    }
    if (path === '/health/ready') {
      const report = await this.health.ready();
      return send(res, report.status === 'ok' ? 200 : 503, report);
    }
    return send(res, 404, problem(404, 'NOT_FOUND', path), PROBLEM_CONTENT_TYPE);
  }
}

function problem(status: number, code: 'NOT_FOUND', instance: string | undefined) {
  return { type: problemType(code), title: 'Not found', status, code, instance };
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  contentType = 'application/json',
): void {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
