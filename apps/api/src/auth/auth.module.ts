import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  InvitationAcceptController,
  InvitationsController,
  MembersController,
  WorkspacesController,
} from '../workspaces/workspaces.controller.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './session.guard.js';
import { TenantGuard } from './tenant.guard.js';

/** HTTP surface for identity and workspaces. Business logic lives in @lga/core (ADR-0032). */
@Module({
  controllers: [
    AuthController,
    WorkspacesController,
    MembersController,
    InvitationsController,
    InvitationAcceptController,
  ],
  providers: [TenantGuard, { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AuthApiModule {}
