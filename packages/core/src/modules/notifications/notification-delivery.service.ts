import { Inject, Injectable } from '@nestjs/common';
import { type EmailTemplate, type JobEnvelope, NotifyEmailArgsSchema } from '@lga/contracts';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { APP_CONFIG } from '../../config/config.module.js';
import type { BaseServerEnv } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { generateToken, hashToken } from '../identity/domain/identity.js';
import { AUTH_TOKEN_TTL } from '../identity/domain/token-ttl.js';
import { SYSTEM_MAILER, type SystemMailer } from './system-mailer.js';
import { renderEmail, type TemplateData } from './templates.js';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'an Admin',
  MEMBER: 'a Member',
  READ_ONLY: 'a read-only member',
};

export type DeliveryOutcome = 'sent' | 'skipped';

/**
 * Renders and sends one `notify.email` job (runs in the worker; tests call it directly).
 * Tokens are minted here, at send time, so raw tokens never sit in the database or the queue
 * (ADR-0034). Minting a new token invalidates the previous one, so only the newest link works.
 */
@Injectable()
export class NotificationDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYSTEM_MAILER) private readonly mailer: SystemMailer,
    @Inject(APP_CONFIG) private readonly env: BaseServerEnv,
    @InjectPinoLogger(NotificationDeliveryService.name) private readonly logger: PinoLogger,
  ) {}

  private link(path: string, token?: string): string {
    const url = new URL(path, this.env.APP_ORIGIN);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }

  async deliver(envelope: JobEnvelope): Promise<DeliveryOutcome> {
    const { template } = NotifyEmailArgsSchema.parse(envelope.args);
    const outcome =
      envelope.entity.type === 'invitation'
        ? await this.deliverInvitation(template, envelope.entity.id)
        : await this.deliverToUser(template, envelope.entity.id);
    this.logger.info(
      { template, entityType: envelope.entity.type, entityId: envelope.entity.id, outcome },
      'System email processed',
    );
    return outcome;
  }

  private async deliverToUser(template: EmailTemplate, userId: string): Promise<DeliveryOutcome> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, emailVerifiedAt: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return 'skipped';

    const data: TemplateData = { name: user.name };
    const now = Date.now();
    switch (template) {
      case 'auth.verify_email': {
        if (user.emailVerifiedAt) return 'skipped';
        const token = generateToken();
        await this.prisma.$transaction([
          this.prisma.verificationToken.deleteMany({
            where: { userId, purpose: 'EMAIL_VERIFY', usedAt: null },
          }),
          this.prisma.verificationToken.create({
            data: {
              userId,
              purpose: 'EMAIL_VERIFY',
              tokenHash: hashToken(token),
              expiresAt: new Date(now + AUTH_TOKEN_TTL.emailVerifySeconds * 1000),
            },
          }),
        ]);
        data.link = this.link('/verify-email', token);
        break;
      }
      case 'auth.password_reset': {
        const token = generateToken();
        await this.prisma.$transaction([
          this.prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } }),
          this.prisma.passwordReset.create({
            data: {
              userId,
              tokenHash: hashToken(token),
              expiresAt: new Date(now + AUTH_TOKEN_TTL.passwordResetSeconds * 1000),
            },
          }),
        ]);
        data.link = this.link('/reset-password', token);
        break;
      }
      case 'auth.signup_existing':
      case 'auth.password_changed':
      case 'auth.new_device':
      case 'auth.account_locked':
        data.link = this.link('/forgot-password');
        break;
      case 'workspace.invitation':
        return 'skipped';
    }
    await this.send(template, user.email, data);
    return 'sent';
  }

  private async deliverInvitation(
    template: EmailTemplate,
    invitationId: string,
  ): Promise<DeliveryOutcome> {
    if (template !== 'workspace.invitation') return 'skipped';
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        emailNormalized: true,
        roleKey: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        invitedBy: { select: { name: true } },
        workspace: { select: { name: true, deletedAt: true, status: true } },
      },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.workspace.deletedAt ||
      invitation.workspace.status === 'CLOSED'
    ) {
      return 'skipped';
    }
    const token = generateToken();
    // Rotating the hash invalidates any earlier link for this invitation.
    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { tokenHash: hashToken(token) },
    });
    await this.send(template, invitation.emailNormalized, {
      workspaceName: invitation.workspace.name,
      inviterName: invitation.invitedBy?.name ?? null,
      roleLabel: ROLE_LABELS[invitation.roleKey] ?? 'a member',
      link: this.link('/invitations/accept', token),
    });
    return 'sent';
  }

  private async send(template: EmailTemplate, to: string, data: TemplateData): Promise<void> {
    const rendered = renderEmail(template, data);
    await this.mailer.send({ to, template, ...rendered });
  }
}
