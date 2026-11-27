'use client';

import type { Kpi, SeriesPoint } from '@lga/contracts';
import { cn } from '@lga/ui/lib/utils';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/states';
import { formatChange, formatCount, formatPercent } from '@/lib/format';

const TrendChartImpl = dynamic(() => import('./recharts-impl'), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-full" />,
});
const BarChartImpl = dynamic(() => import('./recharts-impl').then((m) => m.BarChartImpl), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-full" />,
});

export function KpiTile({ kpi }: { kpi: Kpi }) {
  const value = kpi.format === 'percent' ? formatPercent(kpi.value) : formatCount(kpi.value);
  const good =
    kpi.change === null || kpi.change === 0 ? null : kpi.change > 0 === kpi.higherIsBetter;
  const Icon =
    kpi.change === null || kpi.change === 0
      ? Minus
      : kpi.change > 0
        ? ArrowUpRight
        : ArrowDownRight;
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
      <p className="tabular text-2xl font-semibold tracking-tight">{value}</p>
      <p
        className={cn(
          'flex items-center gap-1 text-xs',
          good === null ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {formatChange(kpi.change)}
      </p>
    </div>
  );
}

/** Sent vs replies per day, with a screen-reader table alternative (PRD §10.3). */
export function TrendChart({ data, className }: { data: SeriesPoint[]; className?: string }) {
  return (
    <figure className={cn('space-y-3', className)}>
      <div className="h-64" aria-hidden>
        <TrendChartImpl data={data} />
      </div>
      <figcaption className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-2" /> Sent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-1" /> Replies
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Emails sent and replies per day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Sent</th>
            <th scope="col">Replies</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{p.sent}</td>
              <td>{p.replies}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function BarBreakdown({
  data,
  caption,
  className,
}: {
  data: { label: string; value: number }[];
  caption: string;
  className?: string;
}) {
  return (
    <figure className={cn('space-y-2', className)}>
      <div className="h-48" aria-hidden>
        <BarChartImpl data={data} />
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
