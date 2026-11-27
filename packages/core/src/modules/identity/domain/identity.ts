// Pure identity logic (no I/O): normalization, tokens, password-hash policy, throttling schedule.
import { createHash, createHmac, randomBytes } from 'node:crypto';

/** Canonical form used for uniqueness and lookups (08-authentication.md §11). */
export function normalizeEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}

/** Passwords are hashed in NFKC so the same password typed on any keyboard matches. */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

/** 32 random bytes, base64url: the only form a token ever has outside the database. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Email tokens (verification, reset, invitation) are stored as sha256(token). */
export function hashToken(token: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHash('sha256').update(token, 'utf8').digest());
}

/** Session tokens are stored as sha256(token || pepper) (ADR-0007). */
export function hashSessionToken(token: string, pepper: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    createHash('sha256').update(token, 'utf8').update(pepper, 'utf8').digest(),
  );
}

/** Keyed hash of an email for rate-limit keys, so Valkey never holds addresses. */
export function emailKey(normalizedEmail: string, pepper: string): string {
  return createHmac('sha256', pepper)
    .update(normalizedEmail, 'utf8')
    .digest('base64url')
    .slice(0, 32);
}

export interface Argon2Params {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

/** OWASP 2024 argon2id baseline (08-authentication.md §3). */
export const ARGON2_PARAMS: Readonly<Argon2Params> = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/** True when a stored PHC hash is not argon2id or uses weaker parameters than the current ones. */
export function needsRehash(phc: string, current: Argon2Params = ARGON2_PARAMS): boolean {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(phc);
  if (!match) return true;
  const [, m, t, p] = match.map(Number);
  return m! < current.memoryCost || t! < current.timeCost || p! < current.parallelism;
}

/** Login throttling thresholds (08-authentication.md §5). */
export const LOGIN_THROTTLE = {
  windowSeconds: 15 * 60,
  /** Failures in the window before each further attempt is delayed. */
  delayAfter: 5,
  /** Failures (account or IP scope) before Turnstile is required. */
  captchaAfterAccount: 3,
  captchaAfterIp: 30,
  maxDelaySeconds: 30,
  lockWindowSeconds: 24 * 60 * 60,
  lockAfter: 20,
  lockSeconds: 60 * 60,
} as const;

/** Progressive delay after the 5th failure: 1 s, 2 s, 4 s, ... capped at 30 s. */
export function loginDelaySeconds(failuresInWindow: number): number {
  const over = failuresInWindow - LOGIN_THROTTLE.delayAfter;
  if (over < 0) return 0;
  return Math.min(2 ** over, LOGIN_THROTTLE.maxDelaySeconds);
}

/** Coarse device fingerprint for new-device notices: browser family + OS + IPv4 /16 (or IPv6 /32). */
export function deviceKey(userAgent: string | undefined, ip: string | undefined): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'edge'
    : /Firefox\//.test(ua)
      ? 'firefox'
      : /Chrome\//.test(ua)
        ? 'chrome'
        : /Safari\//.test(ua)
          ? 'safari'
          : 'other';
  const os = /Windows/.test(ua)
    ? 'windows'
    : /Android/.test(ua)
      ? 'android'
      : /iPhone|iPad/.test(ua)
        ? 'ios'
        : /Mac OS X/.test(ua)
          ? 'macos'
          : /Linux/.test(ua)
            ? 'linux'
            : 'other';
  return `${browser}:${os}:${ipPrefix(ip)}`;
}

export function ipPrefix(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}`;
  return ip.split(':').slice(0, 2).join(':').toLowerCase();
}

/** `jane.doe@example.com` -> `j***@example.com` (invitation lookups). */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** URL-safe workspace slug base from a name. Uniqueness suffixes are added by the service. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base || 'workspace';
}
