'use client';

// Data display building blocks (01-frontend §9, PRD §10.3): one column definition drives the
// desktop table (priority columns per breakpoint) and the mobile card list.
import { Badge } from '@lga/ui/components/badge';
import { Button } from '@lga/ui/components/button';
import { Input } from '@lga/ui/components/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@lga/ui/components/misc';
import { cn } from '@lga/ui/lib/utils';
import { ChevronRight, Loader2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { humanize } from '@/lib/format';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** 1: always (and on cards), 2: from `md`, 3: from `lg`. */
  priority?: 1 | 2 | 3;
  align?: 'left' | 'right';
  /** Role of the field on the mobile card. */
  mobile?: 'title' | 'subtitle' | 'meta' | 'hidden';
}

const priorityClass = { 1: '', 2: 'hidden md:table-cell', 3: 'hidden lg:table-cell' } as const;

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  href,
  caption,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  href?: (row: T) => string;
  caption: string;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const title = columns.find((c) => c.mobile === 'title') ?? columns[0]!;
  const subtitle = columns.find((c) => c.mobile === 'subtitle');
  const meta = columns.filter((c) => c.mobile === 'meta');

  return (
    <div className="space-y-3">
      {/* Desktop and tablet: table, scrolls inside its own container only. */}
      <div className="hidden overflow-hidden rounded-lg border bg-card sm:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="sticky top-0 z-10 bg-muted/50">
            <TableRow className="hover:bg-transparent">
              {columns.map((c, i) => (
                <TableHead
                  key={c.key}
                  scope="col"
                  className={cn(
                    priorityClass[c.priority ?? 1],
                    c.align === 'right' && 'text-right',
                    i === 0 && 'lg:sticky lg:left-0 lg:bg-muted/50',
                  )}
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(href && 'cursor-pointer')}
                onClick={href ? () => router.push(href(row)) : undefined}
              >
                {columns.map((c, i) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      priorityClass[c.priority ?? 1],
                      c.align === 'right' && 'text-right tabular',
                      i === 0 && 'max-w-64 truncate font-medium lg:sticky lg:left-0 lg:bg-card',
                    )}
                  >
                    {i === 0 && href ? (
                      <Link
                        href={href(row)}
                        className="hover:underline focus-visible:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: cards with the 3-4 most important fields. */}
      <ul className="space-y-2 sm:hidden" aria-label={caption}>
        {rows.map((row) => {
          const body = (
            <>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate font-medium">{title.cell(row)}</div>
                {subtitle && (
                  <div className="truncate text-sm text-muted-foreground">{subtitle.cell(row)}</div>
                )}
                {meta.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {meta.map((m) => (
                      <span key={m.key} className="inline-flex items-center gap-1">
                        <span className="sr-only">{m.header}:</span>
                        {m.cell(row)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {href && (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </>
          );
          return (
            <li key={row.id}>
              {href ? (
                <Link
                  href={href(row)}
                  className="flex min-h-11 items-center gap-3 rounded-lg border bg-card p-3 active:bg-muted"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border bg-card p-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {footer}
    </div>
  );
}

export function LoadMore({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center">
      <Button variant="outline" onClick={onClick} disabled={loading}>
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {loading ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ page header, filters

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {back && (
          <Link
            href={back.href}
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground sm:min-h-0"
          >
            ← {back.label}
          </Link>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Debounced search box (300 ms). */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);
  // Follow external resets (e.g. "Clear filters") without an effect.
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return (
    <div className="relative w-full sm:max-w-72">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="pr-9 pl-9"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Pill filter group: wraps on small screens, keeps filters visible (PRD §9.1). */
export function FilterPills<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: V | ''; label: string }[];
  value: V | '';
  onChange: (value: V | '') => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors',
            value === o.value
              ? 'border-foreground bg-foreground text-background'
              : 'bg-background text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ badges

const STATUS_TONE: Record<string, 'success' | 'warning' | 'muted' | 'danger' | 'brand'> = {
  ACTIVE: 'success',
  CONNECTED: 'success',
  READY: 'success',
  VALID: 'success',
  PASS: 'success',
  BOOKED: 'success',
  APPROVED: 'success',
  COMPLETED: 'muted',
  SCHEDULED: 'brand',
  PENDING_APPROVAL: 'warning',
  PENDING: 'warning',
  PAUSED: 'warning',
  CATCH_ALL: 'warning',
  UNKNOWN: 'muted',
  UNVERIFIED: 'muted',
  DRAFT: 'muted',
  ARCHIVED: 'muted',
  TRIALING: 'brand',
  ERROR: 'danger',
  FAIL: 'danger',
  MISSING: 'danger',
  INVALID: 'danger',
  DISCONNECTED: 'danger',
  CANCELED: 'danger',
  REJECTED: 'danger',
};

const TONE_CLASS = {
  success: 'border-transparent bg-success/12 text-success',
  warning: 'border-transparent bg-warning/15 text-warning',
  danger: 'border-transparent bg-destructive/10 text-destructive',
  brand: 'border-transparent bg-brand-soft text-brand',
  muted: 'border-transparent bg-muted text-muted-foreground',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? 'muted';
  return (
    <Badge variant="outline" className={cn('font-medium', TONE_CLASS[tone])}>
      {label ?? humanize(status)}
    </Badge>
  );
}

const TIER_CLASS: Record<string, string> = {
  A: 'bg-success/12 text-success',
  B: 'bg-brand-soft text-brand',
  C: 'bg-warning/15 text-warning',
  D: 'bg-muted text-muted-foreground',
};

export function ScoreBadge({ tier, score }: { tier: string | null; score: number | null }) {
  if (!tier) return <span className="text-muted-foreground">Not scored</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-md text-xs font-semibold',
          TIER_CLASS[tier],
        )}
        aria-label={`Tier ${tier}`}
      >
        {tier}
      </span>
      <span className="tabular text-sm">{score ?? '—'}</span>
    </span>
  );
}

export function Meter({
  label,
  used,
  limit,
  format = (n) => n.toLocaleString('en-US'),
}: {
  label: string;
  used: number;
  limit: number | null;
  format?: (n: number) => string;
}) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-medium">
          {format(used)}
          <span className="text-muted-foreground">
            {' '}
            / {limit === null ? 'Unlimited' : format(limit)}
          </span>
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
      >
        <div
          className={cn(
            'h-full rounded-full',
            pct >= 90 ? 'bg-destructive' : pct >= 80 ? 'bg-warning' : 'bg-brand',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Label/value list for detail pages. */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="mt-0.5 text-sm break-words">{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
