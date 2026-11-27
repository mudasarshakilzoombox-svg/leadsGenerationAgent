import { Inject, Injectable } from '@nestjs/common';
import { type EmailTemplate, type JobEnvelope, NotifyEmailArgsSchema } from '@lga/contracts';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { APP_CONFIG } from '../../config/config.module.js';
import type { BaseServerEnv } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AUTH_TOKEN_TTL, generateToken, hashToken, maskEmail } from '../identity/domain/index.js';
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
        : envelope.entity.type === 'verification_token'
          ? await this.deliverVerificationToken(template, envelope.entity.id)
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
          // ownership-exempt: ADR-0034 token minted at send time
          this.prisma.verificationToken.deleteMany({
            where: { userId, purpose: 'EMAIL_VERIFY', usedAt: null },
          }),
          // ownership-exempt: ADR-0034 token minted at send time
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
          // ownership-exempt: ADR-0034 token minted at send time
          this.prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } }),
          // ownership-exempt: ADR-0034 token minted at send time
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
      case 'auth.email_change_verify':
      case 'auth.email_changed':
      case 'auth.identity_link':
        return 'skipped';
    }
    await this.send(template, user.email, data);
    return 'sent';
  }

  /**
   * Email change, its revert notice and identity-link confirmation (08-authentication §4.3, §4.5).
   * The API stores the request with an unusable placeholder hash; the real token is minted here,
   * at send time, and only its hash is stored (ADR-0034).
   */
  private async deliverVerificationToken(
    template: EmailTemplate,
    id: string,
  ): Promise<DeliveryOutcome> {
    const plan = {
      'auth.email_change_verify': { purpose: 'EMAIL_CHANGE', path: '/email/confirm' },
      'auth.email_changed': { purpose: 'EMAIL_CHANGE_REVERT', path: '/email/revert' },
      'auth.identity_link': { purpose: 'IDENTITY_LINK', path: '/login/link/confirm' },
    } as const;
    if (!(template in plan)) return 'skipped';
    const { purpose, path } = plan[template as keyof typeof plan];
    const row = await this.prisma.verificationToken.findUnique({
      where: { id },
      select: {
        id: true,
        purpose: true,
        newEmail: true,
        payload: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { email: true, name: true, deletedAt: true } },
      },
    });
    if (
      !row ||
      row.purpose !== purpose ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      row.user.deletedAt
    ) {
      return 'skipped';
    }
    const token = generateToken();
    // ownership-exempt: ADR-0034 token minted at send time
    const updated = await this.prisma.verificationToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { tokenHash: hashToken(token) },
    });
    if (updated.count !== 1) return 'skipped';

    const data: TemplateData = { name: row.user.name, link: this.link(path, token) };
    let to = row.user.email;
    if (purpose === 'EMAIL_CHANGE') {
      // Verification goes to the NEW address.
      if (!row.newEmail) return 'skipped';
      to = row.newEmail;
    } else if (purpose === 'EMAIL_CHANGE_REVERT') {
      // The notice goes to the OLD address (stored in new_email), naming the new one masked.
      if (!row.newEmail) return 'skipped';
      to = row.newEmail;
      data.maskedEmail = maskEmail(row.user.email);
    } else {
      const provider = (row.payload as { provider?: string } | null)?.provider;
      data.providerLabel = provider === 'microsoft' ? 'Microsoft' : 'Google';
    }
    await this.send(template, to, data);
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
    // ownership-exempt: ADR-0034 invitation token minted at send time
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
