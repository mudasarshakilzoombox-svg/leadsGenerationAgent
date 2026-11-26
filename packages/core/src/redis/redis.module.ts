import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../config/config.module.js';
import type { BaseServerEnv } from '../config/env.js';
import { closeRedis, createRedis } from './redis.js';

/** Injection token for the shared `commands` Valkey client. */
export const REDIS = Symbol.for('lga.REDIS');

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await closeRedis(this.redis);
  }
}

@Module({})
export class RedisModule {
  static forRoot(): DynamicModule {
    return {
      module: RedisModule,
      global: true,
      providers: [
        {
          provide: REDIS,
          inject: [APP_CONFIG],
          useFactory: (env: BaseServerEnv) => createRedis(env.VALKEY_URL, 'commands'),
        },
        RedisLifecycle,
      ],
      exports: [REDIS],
    };
  }
}
