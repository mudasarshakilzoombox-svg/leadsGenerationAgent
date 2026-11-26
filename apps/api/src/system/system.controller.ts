import { Controller, Get, Inject } from '@nestjs/common';
import type { SystemInfo } from '@lga/contracts';
import { type ApiEnv, APP_CONFIG } from '@lga/core';
import { APP_NAME } from '@lga/shared';

@Controller('system')
export class SystemController {
  constructor(@Inject(APP_CONFIG) private readonly env: ApiEnv) {}

  /** Public, non-sensitive build information. */
  @Get('info')
  info(): SystemInfo {
    return {
      name: APP_NAME,
      service: 'api',
      version: this.env.RELEASE,
      environment: this.env.APP_ENV,
      apiVersion: 'v1',
    };
  }
}
