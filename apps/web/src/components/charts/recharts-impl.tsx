'use client';

// Recharts implementations. Imported only through `next/dynamic` (charts.tsx) to keep the
// initial bundle small (01-frontend §12).
import type { SeriesPoint } from '@lga/contracts';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const tick = { fill: 'var(--muted-foreground)', fontSize: 12 };

function shortDate(d: string): string {
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}`;
}

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="tabular font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function TrendChartImpl({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="fill-sent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fill-replies" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={tick}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: 'var(--border)' }} />
        <Area
          animationDuration={500}
          type="monotone"
          name="Sent"
          dataKey="sent"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#fill-sent)"
        />
        <Area
          animationDuration={500}
          type="monotone"
          name="Replies"
          dataKey="replies"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#fill-replies)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarChartImpl({
  data,
  color = 'var(--chart-1)',
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'var(--muted)' }} />
        <Bar
          animationDuration={500}
          dataKey="value"
          name="Count"
          fill={color}
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

/** Weekday names for a week of points, otherwise month/day. */
function dayTick(points: number) {
  return (d: string) => (points <= 8 ? WEEKDAY.format(new Date(`${d}T00:00:00Z`)) : shortDate(d));
}

/** Small single-series line chart for dashboard performance cards (ADR-0036). */
export function MiniLineChartImpl({
  data,
  name,
  color = 'var(--chart-1)',
}: {
  data: { date: string; value: number }[];
  name: string;
  color?: string;
}) {
  const dots = data.length <= 14;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis
          dataKey="date"
          tickFormatter={dayTick(data.length)}
          tick={tick}
          tickLine={false}
          axisLine={false}
          minTickGap={12}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={tick}
          tickLine={false}
          axisLine={false}
          width={36}
          tickCount={3}
          domain={[0, (max: number) => Math.max(1, max)]}
        />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: 'var(--border)' }} />
        <Line
          animationDuration={400}
          type="monotone"
          dataKey="value"
          name={name}
          stroke={color}
          strokeWidth={2}
          dot={dots ? { r: 2.5, fill: color, strokeWidth: 0 } : false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
