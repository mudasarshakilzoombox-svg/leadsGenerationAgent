/** Token and session lifetimes (08-authentication.md §2, PRD AUTH-02/04/05, WS-03). */
export const AUTH_TOKEN_TTL = {
  emailVerifySeconds: 24 * 60 * 60,
  passwordResetSeconds: 30 * 60,
  invitationSeconds: 7 * 24 * 60 * 60,
} as const;

export const SESSION_TTL = {
  idleSeconds: 7 * 24 * 60 * 60,
  absoluteSeconds: 30 * 24 * 60 * 60,
  /** Sliding `idle_expires_at` is written at most this often. */
  touchIntervalSeconds: 10 * 60,
  /** Valkey cache of resolved sessions. Revocation deletes the entry immediately. */
  cacheSeconds: 60,
  /** Window used by `@RequireRecentAuth()` for sensitive actions. */
  recentAuthSeconds: 10 * 60,
} as const;
