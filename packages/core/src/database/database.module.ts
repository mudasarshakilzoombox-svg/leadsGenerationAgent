import { type DynamicModule, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [PrismaService],
      exports: [PrismaService],
    };
  }
}
