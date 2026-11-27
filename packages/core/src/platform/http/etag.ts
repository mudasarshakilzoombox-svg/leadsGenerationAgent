// Optimistic locking for editable aggregates (03-api §7): GET returns `ETag: W/"<row_version>"`,
// PATCH must send it back in `If-Match`. Missing → 428, malformed or stale → 412.
import { DomainError } from '../../errors/domain-error.js';

export function formatEtag(rowVersion: number): string {
  return `W/"${rowVersion}"`;
}

const ETAG = /^(?:W\/)?"(\d{1,9})"$/;

/** The row version the client last saw. Accepts `W/"7"` and `"7"`; rejects lists and `*`. */
export function parseIfMatch(header: string | string[] | undefined): number {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (value === undefined || value.trim() === '') {
    throw new DomainError(
      'PRECONDITION_REQUIRED',
      'Send the If-Match header with the ETag you last read.',
    );
  }
  const match = ETAG.exec(value.trim());
  const version = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(version) || version < 1) throw staleVersion();
  return version;
}

export function staleVersion(): DomainError {
  return new DomainError(
    'PRECONDITION_FAILED',
    'Someone else changed this since you loaded it. Reload to see the latest version.',
  );
}
