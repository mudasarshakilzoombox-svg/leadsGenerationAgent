import { type DynamicModule, Module } from '@nestjs/common';
import { WorkspaceAccessService } from '../tenancy/workspace-access.service.js';
import { PrismaService } from './prisma.service.js';

@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [PrismaService, WorkspaceAccessService],
      exports: [PrismaService, WorkspaceAccessService],
    };
  }
}
