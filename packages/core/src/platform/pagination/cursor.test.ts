import { computeMetrics, rate, relativeChange } from '@lga/contracts';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../errors/domain-error.js';
import { afterDesc, decodeCursor, encodeCursor, pageOf } from './cursor.js';

const SECRET = 'cursor-test-secret-0123456789abcdef';

describe('cursor', () => {
  it('round-trips a signed position', () => {
    const cursor = encodeCursor({ k: '2026-11-01T00:00:00.000Z', id: 'abc' }, SECRET);
    expect(decodeCursor(cursor, SECRET)).toEqual({ k: '2026-11-01T00:00:00.000Z', id: 'abc' });
    expect(decodeCursor(undefined, SECRET)).toBeUndefined();
  });

  it.each([
    'garbage',
    'a.b',
    `${Buffer.from('{"k":"x","id":"y"}').toString('base64url')}.forged-signature-xx`,
  ])('rejects a tampered or foreign cursor (%s)', (cursor) => {
    expect(() => decodeCursor(cursor, SECRET)).toThrow(DomainError);
  });

  it('rejects a cursor signed with another secret', () => {
    const cursor = encodeCursor(
      { k: '2026-11-01T00:00:00.000Z', id: 'abc' },
      'another-secret-0123456789abcdefgh',
    );
    expect(() => decodeCursor(cursor, SECRET)).toThrow(DomainError);
  });

  it('builds the next page and the keyset filter', () => {
    const rows = [3, 2, 1].map((n) => ({
      id: `id${n}`,
      createdAt: new Date(Date.UTC(2026, 10, n)),
    }));
    const { rows: page, nextCursor } = pageOf(rows, 2, (r) => r.createdAt, SECRET);
    expect(page.map((r) => r.id)).toEqual(['id3', 'id2']);
    const position = decodeCursor(nextCursor!, SECRET)!;
    expect(afterDesc('createdAt', position)).toEqual({
      OR: [
        { createdAt: { lt: new Date(Date.UTC(2026, 10, 2)) } },
        { createdAt: new Date(Date.UTC(2026, 10, 2)), id: { lt: 'id2' } },
      ],
    });
    expect(pageOf(rows, 5, (r) => r.createdAt, SECRET).nextCursor).toBeNull();
  });
});

describe('metric formulas (11-analytics §3)', () => {
  it('uses distinct enrollments for rates and null for empty denominators', () => {
    const m = computeMetrics(
      {
        sent: 10,
        hardBounced: 1,
        unsubscribed: 1,
        meetingsBooked: 2,
        enrollmentsSent: 5,
        enrollmentsReplied: 2,
        enrollmentsPositive: 1,
      },
      4,
    );
    expect(m).toEqual({
      emailsSent: 10,
      replyRate: 0.4,
      positiveReplyRate: 0.2,
      meetingsBooked: 2,
      hardBounceRate: 0.1,
      unsubscribeRate: 0.2,
      newLeads: 4,
    });
    expect(rate(1, 0)).toBeNull();
    expect(relativeChange(12, 10)).toBeCloseTo(0.2);
    expect(relativeChange(5, 0)).toBeNull();
    expect(relativeChange(null, 3)).toBeNull();
  });
});
