import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface SystemEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Template key, for logs and tests (never the content). */
  template: string;
}

/**
 * Port for system (transactional) email: verification, resets, invitations, notices.
 * Never used for outreach (ADR-0008). Recipients are users or invitees only.
 */
export interface SystemMailer {
  send(email: SystemEmail): Promise<void>;
}
export const SYSTEM_MAILER = Symbol.for('lga.SystemMailer');

/**
 * SMTP relay: Mailpit locally, the Amazon SES or Resend SMTP endpoint in production (ADR-0034).
 * `smtps://` uses implicit TLS; `smtp://` upgrades with STARTTLS when the server offers it.
 */
export class SmtpSystemMailer implements SystemMailer {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    const parsed = new URL(url);
    const secure = parsed.protocol === 'smtps:';
    this.transport = createTransport({
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : secure ? 465 : 587,
      secure,
      ...(parsed.username
        ? {
            auth: {
              user: decodeURIComponent(parsed.username),
              pass: decodeURIComponent(parsed.password),
            },
          }
        : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(email: SystemEmail): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: { 'X-LGA-Template': email.template },
    });
  }
}

/** Keeps emails in memory (tests) and logs only the template key (local runs without SMTP). */
export class CaptureSystemMailer implements SystemMailer {
  private readonly logger = new Logger('CaptureSystemMailer');
  readonly outbox: SystemEmail[] = [];

  send(email: SystemEmail): Promise<void> {
    this.outbox.push(email);
    this.logger.log(`System email captured (template ${email.template}); no SMTP_URL configured`);
    return Promise.resolve();
  }

  /** Messages for one recipient, newest last. */
  to(address: string): SystemEmail[] {
    return this.outbox.filter((m) => m.to.toLowerCase() === address.toLowerCase());
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
