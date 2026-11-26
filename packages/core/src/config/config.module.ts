import { type DynamicModule, Module } from '@nestjs/common';
import type { BaseServerEnv } from './env.js';

/** Injection token for the validated, frozen environment of the current process. */
export const APP_CONFIG = Symbol.for('lga.APP_CONFIG');

/**
 * Provides the already-validated environment. Validation happens in `main.ts`
 * before Nest boots, so a bad config fails fast with a readable message.
 */
@Module({})
export class AppConfigModule {
  static forRoot<T extends BaseServerEnv>(config: T): DynamicModule {
    return {
      module: AppConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: Object.freeze({ ...config }) }],
      exports: [APP_CONFIG],
    };
  }
}
