import { Logger } from '@nestjs/common';

/** Port: bot check for signup and repeated login failures (Cloudflare Turnstile, 08 §4.1). */
export interface HumanVerifier {
  verify(token: string, remoteIp: string | undefined): Promise<boolean>;
}
export const HUMAN_VERIFIER = Symbol.for('lga.HumanVerifier');

// Fixed provider host, not a user-influenced URL. Moves to the provider HTTP client in Phase 2.
type Fetch = typeof fetch;

/** Server-side Turnstile siteverify. Fails closed: an unverifiable token is rejected. */
export class TurnstileHumanVerifier implements HumanVerifier {
  private readonly logger = new Logger('TurnstileHumanVerifier');

  constructor(
    private readonly secret: string,
    // eslint-disable-next-line no-restricted-globals -- fixed-host provider call (ADR-0022)
    private readonly fetchImpl: Fetch = fetch,
    private readonly timeoutMs = 5_000,
  ) {}

  async verify(token: string, remoteIp: string | undefined): Promise<boolean> {
    const form = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp) form.set('remoteip', remoteIp);
    try {
      const res = await this.fetchImpl(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { success?: unknown };
      return body.success === true;
    } catch (error) {
      this.logger.warn(`Turnstile verification failed closed: ${(error as Error).message}`);
      return false;
    }
  }
}

/** Offline fake: every token passes except the literal `fake-fail`. */
export class FakeHumanVerifier implements HumanVerifier {
  static readonly FAILING_TOKEN = 'fake-fail';

  verify(token: string): Promise<boolean> {
    return Promise.resolve(token !== FakeHumanVerifier.FAILING_TOKEN);
  }
}
