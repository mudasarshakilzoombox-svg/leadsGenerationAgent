import type { EmailTemplate } from '@lga/contracts';
import { APP_NAME } from '@lga/shared';

export interface TemplateData {
  name?: string | null;
  link?: string;
  workspaceName?: string;
  inviterName?: string | null;
  roleLabel?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

interface Content {
  subject: string;
  paragraphs: string[];
  action?: { label: string; link: string };
  footer?: string;
}

function content(template: EmailTemplate, d: TemplateData): Content {
  const hello = d.name ? `Hi ${d.name},` : 'Hi,';
  switch (template) {
    case 'auth.verify_email':
      return {
        subject: `Confirm your email for ${APP_NAME}`,
        paragraphs: [hello, 'Confirm your email address to finish setting up your account.'],
        action: { label: 'Confirm email', link: d.link! },
        footer: 'This link expires in 24 hours. If you did not sign up, you can ignore this email.',
      };
    case 'auth.signup_existing':
      return {
        subject: `Someone tried to sign up with your email`,
        paragraphs: [
          hello,
          `Someone tried to create a ${APP_NAME} account with this email address, which already has an account.`,
          'If that was you, sign in instead. If you forgot your password, you can reset it.',
        ],
        action: { label: 'Reset password', link: d.link! },
        footer: 'If it was not you, no action is needed. Your account is unchanged.',
      };
    case 'auth.password_reset':
      return {
        subject: `Reset your ${APP_NAME} password`,
        paragraphs: [hello, 'We received a request to reset your password.'],
        action: { label: 'Choose a new password', link: d.link! },
        footer:
          'This link expires in 30 minutes and works once. If you did not ask for it, ignore this email.',
      };
    case 'auth.password_changed':
      return {
        subject: `Your ${APP_NAME} password was changed`,
        paragraphs: [
          hello,
          'Your password was just changed and every device was signed out.',
          'If you did not do this, reset your password immediately and contact support.',
        ],
        action: { label: 'Reset password', link: d.link! },
      };
    case 'auth.new_device':
      return {
        subject: `New sign-in to your ${APP_NAME} account`,
        paragraphs: [
          hello,
          'Your account was just signed in to from a device or location we have not seen recently.',
          'If this was you, no action is needed. If not, reset your password and sign out other sessions.',
        ],
        action: { label: 'Reset password', link: d.link! },
      };
    case 'auth.account_locked':
      return {
        subject: `Sign-in to your ${APP_NAME} account is paused`,
        paragraphs: [
          hello,
          'There were many failed sign-in attempts on your account, so sign-in is paused for one hour.',
          'Resetting your password unlocks the account right away.',
        ],
        action: { label: 'Reset password', link: d.link! },
      };
    case 'workspace.invitation':
      return {
        subject: `${d.inviterName ?? 'A teammate'} invited you to ${d.workspaceName} on ${APP_NAME}`,
        paragraphs: [
          'Hi,',
          `${d.inviterName ?? 'A teammate'} invited you to join ${d.workspaceName} as ${d.roleLabel}.`,
        ],
        action: { label: 'Accept invitation', link: d.link! },
        footer:
          'This invitation expires in 7 days. If you were not expecting it, you can ignore this email.',
      };
  }
}

/** Plain-text and HTML versions. All variables are escaped in HTML. */
export function renderEmail(template: EmailTemplate, data: TemplateData): RenderedEmail {
  const c = content(template, data);
  const text = [
    ...c.paragraphs,
    ...(c.action ? [`${c.action.label}: ${c.action.link}`] : []),
    ...(c.footer ? [c.footer] : []),
    `- ${APP_NAME}`,
  ].join('\n\n');
  const html = [
    '<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#171717">',
    ...c.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    ...(c.action
      ? [
          `<p><a href="${escapeHtml(c.action.link)}" style="display:inline-block;padding:10px 16px;background:#171717;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(c.action.label)}</a></p>`,
          `<p style="font-size:12px;color:#525252">Or paste this link into your browser: ${escapeHtml(c.action.link)}</p>`,
        ]
      : []),
    ...(c.footer ? [`<p style="font-size:12px;color:#525252">${escapeHtml(c.footer)}</p>`] : []),
    '</body></html>',
  ].join('');
  // Defense in depth against header injection: subjects never contain control characters.
  return { subject: c.subject.replace(/\p{Cc}+/gu, ' '), text, html };
}
