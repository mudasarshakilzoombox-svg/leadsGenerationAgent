import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { normalizePassword } from '../domain/identity.js';

/** Port: is this password in a known breach corpus? (PRD AUTH-01 AC1) */
export interface BreachedPasswordChecker {
  isBreached(password: string): Promise<boolean>;
}
export const BREACHED_PASSWORD_CHECKER = Symbol.for('lga.BreachedPasswordChecker');

// Fixed provider host, not a user-influenced URL. Moves to the provider HTTP client in Phase 2.
type Fetch = typeof fetch;

/**
 * Have I Been Pwned range API with k-anonymity: only the first 5 hex chars of the SHA-1 leave
 * the server, with response padding on. Fails open on timeout or error (SECURITY.md §3.1).
 */
export class HibpBreachedPasswordChecker implements BreachedPasswordChecker {
  private readonly logger = new Logger('HibpBreachedPasswordChecker');

  constructor(
    // eslint-disable-next-line no-restricted-globals -- fixed-host provider call (ADR-0022)
    private readonly fetchImpl: Fetch = fetch,
    private readonly timeoutMs = 2_000,
  ) {}

  async isBreached(password: string): Promise<boolean> {
    const sha1 = createHash('sha1')
      .update(normalizePassword(password), 'utf8')
      .digest('hex')
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await this.fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'lead-generation-agent' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      return body.split('\n').some((line) => {
        const [lineSuffix, count] = line.trim().split(':');
        return lineSuffix === suffix && Number(count) > 0;
      });
    } catch (error) {
      this.logger.warn(
        `Breached-password check unavailable, failing open: ${(error as Error).message}`,
      );
      return false;
    }
  }
}

/** Offline fake (INTEGRATIONS_MODE=fake): a small fixed list of well-known breached passwords. */
export class FakeBreachedPasswordChecker implements BreachedPasswordChecker {
  static readonly BREACHED = [
    'password1234',
    'qwertyuiop123',
    'iloveyou12345',
    'correcthorsebatterystaple',
  ];

  isBreached(password: string): Promise<boolean> {
    return Promise.resolve(
      FakeBreachedPasswordChecker.BREACHED.includes(normalizePassword(password).toLowerCase()),
    );
  }
}
