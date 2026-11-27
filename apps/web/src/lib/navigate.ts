'use client';

/**
 * Full-page navigation after the session changes (sign in, sign out, joining or leaving a
 * workspace, ownership transfer). A document load re-runs the Server Components with the new
 * cookie and drops every client cache, which a soft `router.push` would keep.
 */
export function hardNavigate(path: string): void {
  window.location.assign(path);
}
