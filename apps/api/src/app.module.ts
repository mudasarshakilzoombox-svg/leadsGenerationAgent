import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import {
  type ApiEnv,
  AppConfigModule,
  DatabaseModule,
  IdentityModule,
  LoggingModule,
  OriginCheckMiddleware,
  PlatformServicesModule,
  ProblemDetailsFilter,
  QueueModule,
  RedisModule,
} from '@lga/core';
import { AuthApiModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { SystemModule } from './system/system.module.js';

@Module({})
export class AppModule implements NestModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(env),
        LoggingModule.forRoot('api'),
        DatabaseModule.forRoot(),
        RedisModule.forRoot(),
        QueueModule.forRoot(),
        PlatformServicesModule.forRoot(),
        IdentityModule.forRoot(),
        HealthModule,
        SystemModule,
        AuthApiModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    // Before routing, so unmatched routes are covered too (CSRF, TM-05).
    consumer.apply(OriginCheckMiddleware).forRoutes('{*path}');
  }
}
