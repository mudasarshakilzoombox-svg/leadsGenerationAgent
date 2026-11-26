import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common';
import type { HealthReport, Liveness } from '@lga/contracts';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up and the event loop responds. No dependency checks. */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): Liveness {
    return { status: 'ok', service: 'api' };
  }

  /** Readiness: 200 when every dependency check passes, otherwise 503. */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.ready();
    if (report.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
