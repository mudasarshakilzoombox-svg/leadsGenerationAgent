import {
  DEFAULT_SEND_WINDOW,
  PhysicalAddressSchema,
  SendWindowSchema,
  UpdateWorkspaceRequestSchema,
  WorkspaceSettingsSchema,
} from '@lga/contracts';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../errors/domain-error.js';
import { formatEtag, parseIfMatch } from '../../../platform/http/etag.js';
import { parseWorkspaceSettings } from '../../../tenancy/workspace-settings.js';
import { launchReadiness } from './launch-readiness.js';
import { type ForeignKeyEdge, planPurge } from './purge-plan.js';

const ws = (child: string): ForeignKeyEdge => ({
  child,
  parent: 'workspaces',
  columns: ['workspace_id'],
  onDelete: 'c',
});
const fk = (child: string, parent: string, onDelete = 'c'): ForeignKeyEdge => ({
  child,
  parent,
  columns: ['workspace_id', `${parent}_id`],
  onDelete,
});

describe('planPurge (ADR-0038)', () => {
  it('deletes children before parents', () => {
    const plan = planPurge(
      [
        ws('contacts'),
        ws('companies'),
        ws('messages'),
        fk('contacts', 'companies'),
        fk('messages', 'contacts', 'a'),
      ],
      new Set(),
    );
    expect(plan.batched).toEqual(['messages', 'contacts', 'companies']);
    expect(plan.viaCascade).toEqual([]);
  });

  it('leaves append-only tables and everything they reference to the final cascade', () => {
    const plan = planPurge(
      [
        ws('credit_grants'),
        ws('usage_ledger'),
        ws('subscriptions'),
        ws('leads'),
        fk('usage_ledger', 'credit_grants'),
        fk('credit_grants', 'subscriptions', 'a'),
      ],
      new Set(['credit_grants', 'usage_ledger']),
    );
    expect(plan.batched).toEqual(['leads']);
    expect(plan.viaCascade).toEqual(['credit_grants', 'subscriptions', 'usage_ledger']);
  });

  it('leaves self-referencing and cyclic tables to the cascade', () => {
    const plan = planPurge(
      [
        ws('messages'),
        ws('a'),
        ws('b'),
        ws('c'),
        fk('messages', 'messages'),
        fk('a', 'b'),
        fk('b', 'a'),
        fk('c', 'a'),
      ],
      new Set(),
    );
    expect(plan.viaCascade).toEqual(['a', 'b', 'messages']);
    expect(plan.batched).toEqual(['c']);
  });

  it('ignores tables whose workspace FK does not cascade (e.g. SET NULL webhook events)', () => {
    const plan = planPurge(
      [
        ws('leads'),
        { child: 'webhook_events', parent: 'workspaces', columns: ['workspace_id'], onDelete: 'n' },
      ],
      new Set(),
    );
    expect(plan.batched).toEqual(['leads']);
  });

  it('refuses identifiers it could not safely quote', () => {
    expect(() => planPurge([ws('bad"; drop')], new Set())).toThrow(/Unexpected table name/);
  });
});

describe('ETag / If-Match (03-api §7)', () => {
  it('formats weak ETags and parses them back', () => {
    expect(formatEtag(7)).toBe('W/"7"');
    expect(parseIfMatch('W/"7"')).toBe(7);
    expect(parseIfMatch('"12"')).toBe(12);
  });

  it('answers 428 when missing and 412 when malformed', () => {
    for (const missing of [undefined, '', '  ']) {
      expect(() => parseIfMatch(missing)).toThrow(
        expect.objectContaining({ code: 'PRECONDITION_REQUIRED', status: 428 }) as DomainError,
      );
    }
    for (const bad of ['*', 'W/"a"', '7', '"1", "2"', 'W/"0"']) {
      expect(() => parseIfMatch(bad)).toThrow(
        expect.objectContaining({ code: 'PRECONDITION_FAILED', status: 412 }) as DomainError,
      );
    }
  });
});

describe('launchReadiness (WS-06 AC1)', () => {
  const address = { line1: '1 Example Street', city: 'London', country: 'GB' };
  it('needs a postal address and an https privacy link', () => {
    expect(launchReadiness({ physicalAddress: null, privacyNoticeUrl: null })).toEqual({
      ready: false,
      missing: ['physicalAddress', 'privacyNoticeUrl'],
    });
    expect(
      launchReadiness({ physicalAddress: address, privacyNoticeUrl: 'http://x.example/privacy' }),
    ).toEqual({ ready: false, missing: ['privacyNoticeUrl'] });
    expect(
      launchReadiness({ physicalAddress: address, privacyNoticeUrl: 'https://x.example/privacy' }),
    ).toEqual({ ready: true, missing: [] });
  });

  it('treats an incomplete address as missing', () => {
    expect(
      launchReadiness({
        physicalAddress: { line1: '1 Example Street' },
        privacyNoticeUrl: 'https://x.example/privacy',
      }).missing,
    ).toEqual(['physicalAddress']);
  });
});

describe('workspace settings contracts (WS-06)', () => {
  it('validates and normalises the postal address', () => {
    expect(
      PhysicalAddressSchema.parse({ line1: ' 1 Road ', city: 'Austin', country: 'us' }),
    ).toEqual({
      line1: '1 Road',
      city: 'Austin',
      country: 'US',
    });
    expect(
      PhysicalAddressSchema.safeParse({ line1: '1 Road', city: 'X', country: 'USA' }).success,
    ).toBe(false);
    expect(
      PhysicalAddressSchema.safeParse({ line1: '1 Road', city: 'X', country: 'US', extra: 1 })
        .success,
    ).toBe(false);
  });

  it('validates the send window', () => {
    expect(SendWindowSchema.parse({ days: [3, 1], start: '08:00', end: '18:30' }).days).toEqual([
      1, 3,
    ]);
    for (const bad of [
      { days: [], start: '09:00', end: '17:00' },
      { days: [1, 1], start: '09:00', end: '17:00' },
      { days: [8], start: '09:00', end: '17:00' },
      { days: [1], start: '17:00', end: '09:00' },
      { days: [1], start: '9:00', end: '17:00' },
    ]) {
      expect(SendWindowSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('rejects empty and mass-assignment updates, and http privacy links', () => {
    expect(UpdateWorkspaceRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateWorkspaceRequestSchema.safeParse({ status: 'ACTIVE' }).success).toBe(false);
    expect(UpdateWorkspaceRequestSchema.safeParse({ planKey: 'agency' }).success).toBe(false);
    expect(
      UpdateWorkspaceRequestSchema.safeParse({ privacyNoticeUrl: 'http://x.example' }).success,
    ).toBe(false);
    expect(UpdateWorkspaceRequestSchema.safeParse({ defaultTimezone: 'Mars/Base' }).success).toBe(
      false,
    );
    expect(UpdateWorkspaceRequestSchema.parse({ legalName: null })).toEqual({ legalName: null });
  });

  it('falls back to safe defaults field by field and keeps unknown keys', () => {
    expect(WorkspaceSettingsSchema.parse({})).toEqual({
      launchRequiresApproval: true,
      defaultSendWindow: DEFAULT_SEND_WINDOW,
    });
    const parsed = parseWorkspaceSettings({
      launchRequiresApproval: false,
      defaultSendWindow: { days: 'weekdays' },
      websiteUrl: 'https://x.example',
    });
    expect(parsed.launchRequiresApproval).toBe(false);
    expect(parsed.defaultSendWindow).toEqual(DEFAULT_SEND_WINDOW);
    expect(parsed.websiteUrl).toBe('https://x.example');
    expect(parseWorkspaceSettings('nonsense').launchRequiresApproval).toBe(true);
  });
});
