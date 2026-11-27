import { createHmac, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../../errors/domain-error.js';

/**
 * Keyset cursors for `{ data, nextCursor }` lists (03-api.md §5). The cursor is opaque and
 * HMAC-signed so clients cannot craft SQL-relevant values; a tampered cursor is a 400.
 * Position: the sort value (ISO date or number) plus the row id as a tie-breaker.
 */
export interface CursorPosition {
  /** Sort key value: ISO timestamp for date sorts. */
  k: string;
  id: string;
}

function signingKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('lga-cursor-v1').digest();
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', signingKey(secret)).update(payload).digest('base64url').slice(0, 22);
}

export function encodeCursor(position: CursorPosition, secret: string): string {
  const payload = Buffer.from(JSON.stringify(position)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeCursor(
  cursor: string | undefined,
  secret: string,
): CursorPosition | undefined {
  if (!cursor) return undefined;
  const invalid = () =>
    new DomainError(
      'VALIDATION_FAILED',
      'The page cursor is invalid. Start again from the first page.',
      {
        errors: [{ pointer: '/cursor', code: 'cursor_invalid', message: 'Invalid cursor.' }],
      },
    );
  const [payload, signature] = cursor.split('.');
  if (!payload || !signature) throw invalid();
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid();
  try {
    const value = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<CursorPosition>;
    if (typeof value.k !== 'string' || typeof value.id !== 'string') throw new Error('shape');
    return { k: value.k, id: value.id };
  } catch {
    throw invalid();
  }
}

/**
 * `where` fragment for a descending keyset over `field` + `id`:
 * rows strictly after the cursor position.
 */
export function afterDesc<F extends string>(field: F, position: CursorPosition | undefined) {
  if (!position) return {};
  const at = new Date(position.k);
  return { OR: [{ [field]: { lt: at } }, { [field]: at, id: { lt: position.id } }] };
}

/** Trim the extra row fetched to detect a next page and build its cursor. */
export function pageOf<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortValue: (row: T) => Date,
  secret: string,
): { rows: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { rows, nextCursor: null };
  const page = rows.slice(0, limit);
  const last = page[page.length - 1]!;
  return {
    rows: page,
    nextCursor: encodeCursor({ k: sortValue(last).toISOString(), id: last.id }, secret),
  };
}
