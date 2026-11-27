/**
 * Per-(provider, model) circuit breaker (05-ai-orchestration §7): opens after 5 consecutive
 * failures or a >50% error rate over the last 20 calls, half-opens after 60 s (one trial call),
 * closes on success. In-process state: each worker protects itself.
 */
export interface BreakerOptions {
  consecutiveFailures: number;
  window: number;
  errorRate: number;
  openMs: number;
}

const DEFAULTS: BreakerOptions = {
  consecutiveFailures: 5,
  window: 20,
  errorRate: 0.5,
  openMs: 60_000,
};

interface State {
  consecutive: number;
  recent: boolean[];
  openedAt: number | null;
  trialInFlight: boolean;
}

export class CircuitBreaker {
  private readonly states = new Map<string, State>();
  private readonly options: BreakerOptions;

  constructor(
    options: Partial<BreakerOptions> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  private state(key: string): State {
    let s = this.states.get(key);
    if (!s) {
      s = { consecutive: 0, recent: [], openedAt: null, trialInFlight: false };
      this.states.set(key, s);
    }
    return s;
  }

  /** True when a call may go through (closed, or half-open with no trial running). */
  allow(key: string): boolean {
    const s = this.state(key);
    if (s.openedAt === null) return true;
    if (this.now() - s.openedAt < this.options.openMs || s.trialInFlight) return false;
    s.trialInFlight = true; // half-open: let exactly one trial through
    return true;
  }

  isOpen(key: string): boolean {
    return this.state(key).openedAt !== null;
  }

  success(key: string): void {
    const s = this.state(key);
    s.consecutive = 0;
    s.openedAt = null;
    s.trialInFlight = false;
    this.push(s, true);
  }

  failure(key: string): void {
    const s = this.state(key);
    s.consecutive += 1;
    this.push(s, false);
    const failures = s.recent.filter((ok) => !ok).length;
    const rateTripped =
      s.recent.length >= this.options.window && failures / s.recent.length > this.options.errorRate;
    if (s.trialInFlight || s.consecutive >= this.options.consecutiveFailures || rateTripped) {
      s.openedAt = this.now();
    }
    s.trialInFlight = false;
  }

  private push(s: State, ok: boolean): void {
    s.recent.push(ok);
    if (s.recent.length > this.options.window) s.recent.shift();
  }
}
