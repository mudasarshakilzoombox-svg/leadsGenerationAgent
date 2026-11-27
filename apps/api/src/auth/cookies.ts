import type { CookieOptions, Request, Response } from 'express';
import { SESSION_TTL } from '@lga/core';

/**
 * `__Host-` prefix: the browser only accepts it with Secure, Path=/ and no Domain, so the cookie
 * can never be scoped to a sibling domain (08-authentication.md §6). Browsers treat
 * http://localhost as secure, so the same attributes work in local development.
 */
export const SESSION_COOKIE = '__Host-lga_session';

const baseOptions: CookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions, maxAge: SESSION_TTL.absoluteSeconds * 1000 });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, baseOptions);
}

/** Minimal RFC 6265 cookie-header parsing for one name (no cookie-parser dependency). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function readSessionToken(req: Request): string | undefined {
  return readCookie(req.headers.cookie, SESSION_COOKIE);
}
