import { z } from 'zod';

/**
 * Metric definitions: the single source for dashboards (docs/architecture/11-analytics.md §3).
 * Rates use distinct enrollments (per contact, not per email), so they are computed for the
 * whole range at once and never summed across days.
 */
export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
export const RangeKeySchema = z.enum(['7d', '30d', '90d']).default('30d');
export type RangeKey = keyof typeof RANGE_DAYS;

export const METRIC_KEYS = [
  'emailsSent',
  'replyRate',
  'positiveReplyRate',
  'meetingsBooked',
  'hardBounceRate',
  'unsubscribeRate',
  'newLeads',
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRICS: Record<
  MetricKey,
  { label: string; format: 'count' | 'percent'; higherIsBetter: boolean }
> = {
  emailsSent: { label: 'Emails sent', format: 'count', higherIsBetter: true },
  replyRate: { label: 'Reply rate', format: 'percent', higherIsBetter: true },
  positiveReplyRate: { label: 'Positive reply rate', format: 'percent', higherIsBetter: true },
  meetingsBooked: { label: 'Meetings booked', format: 'count', higherIsBetter: true },
  hardBounceRate: { label: 'Bounce rate (hard)', format: 'percent', higherIsBetter: false },
  unsubscribeRate: { label: 'Unsubscribe rate', format: 'percent', higherIsBetter: false },
  newLeads: { label: 'New leads', format: 'count', higherIsBetter: true },
};

/** Raw counts for one range, from `message_events`. */
export interface EventCounts {
  sent: number;
  hardBounced: number;
  unsubscribed: number;
  meetingsBooked: number;
  /** Distinct enrollments with at least one SENT event. */
  enrollmentsSent: number;
  /** Distinct enrollments with a REPLIED event. */
  enrollmentsReplied: number;
  /** Distinct enrollments with a POSITIVE_REPLY event (INTERESTED or MEETING_REQUEST). */
  enrollmentsPositive: number;
}

/** `null` when the denominator is zero: "no data" is not "0 %". */
export function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function computeMetrics(c: EventCounts, newLeads: number): Record<MetricKey, number | null> {
  return {
    emailsSent: c.sent,
    replyRate: rate(c.enrollmentsReplied, c.enrollmentsSent),
    positiveReplyRate: rate(c.enrollmentsPositive, c.enrollmentsSent),
    meetingsBooked: c.meetingsBooked,
    hardBounceRate: rate(c.hardBounced, c.sent),
    unsubscribeRate: rate(c.unsubscribed, c.enrollmentsSent),
    newLeads,
  };
}

/** Relative change vs the previous period; `null` when there is nothing to compare with. */
export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}
