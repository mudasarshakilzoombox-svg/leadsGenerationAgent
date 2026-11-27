import { type DynamicModule, Module } from '@nestjs/common';
import {
  AiModule,
  AppConfigModule,
  DatabaseModule,
  LoggingModule,
  MaintenanceModule,
  PlatformServicesModule,
  QueueModule,
  RedisModule,
  type WorkerEnv,
} from '@lga/core';
import { HealthServer } from './health/health-server.js';
import { WorkerHealthService } from './health/worker-health.service.js';
import { AiSelftestProcessor } from './processors/ai-selftest.processor.js';
import { HeartbeatProcessor } from './processors/heartbeat.processor.js';
import { MaintenanceProcessor } from './processors/maintenance.processor.js';
import { WorkerRuntime } from './runtime/worker-runtime.js';

@Module({})
export class WorkerModule {
  static forRoot(env: WorkerEnv, options: { healthServer?: boolean } = {}): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        AppConfigModule.forRoot(env),
        LoggingModule.forRoot('worker'),
        DatabaseModule.forRoot(),
        RedisModule.forRoot(),
        QueueModule.forRoot(),
        PlatformServicesModule.forRoot(),
        AiModule.forRoot(),
        MaintenanceModule.forRoot(),
      ],
      providers: [
        HeartbeatProcessor,
        AiSelftestProcessor,
        MaintenanceProcessor,
        WorkerRuntime,
        WorkerHealthService,
        ...(options.healthServer === false ? [] : [HealthServer]),
      ],
      exports: [WorkerHealthService, WorkerRuntime],
    };
  }
}
