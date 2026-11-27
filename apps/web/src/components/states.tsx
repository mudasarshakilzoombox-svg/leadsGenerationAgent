'use client';

// Shared UI states (PRD §9.1, 01-frontend §8). Every screen uses these; none invent their own.
import { Button } from '@lga/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lga/ui/components/dialog';
import { Skeleton, Tooltip, TooltipContent, TooltipTrigger } from '@lga/ui/components/misc';
import { cn } from '@lga/ui/lib/utils';
import {
  AlertTriangle,
  Clock,
  Gauge,
  Loader2,
  Lock,
  type LucideIcon,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { type ComponentProps, type ReactNode, useState, useSyncExternalStore } from 'react';

// ------------------------------------------------------------------ empty

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondary,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1">
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {(action || secondary) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ errors

export function ErrorPanel({
  title = 'This section could not be loaded',
  message = 'Check your connection and try again. If it keeps happening, contact support.',
  requestId,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  requestId?: string | undefined;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5',
        className,
      )}
    >
      <div className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="size-4" aria-hidden />
        {title}
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {requestId && (
        <p className="font-mono text-xs text-muted-foreground">Reference: {requestId}</p>
      )}
      <div className="flex gap-2">
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <a href="mailto:support@lga.example">Contact support</a>
        </Button>
      </div>
    </div>
  );
}

export function PermissionPanel({ what = 'this' }: { what?: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border bg-muted/40 p-5">
      <div className="flex items-center gap-2 font-medium">
        <ShieldAlert className="size-4 text-warning" aria-hidden />
        You don&apos;t have access to {what}
      </div>
      <p className="text-sm text-muted-foreground">
        Ask an Owner or Admin of this workspace to change your role.
      </p>
    </div>
  );
}

export function LimitReachedPanel({
  label,
  used,
  limit,
  isOwner,
}: {
  label: string;
  used: number;
  limit: number;
  isOwner: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/5 p-5">
      <div className="flex items-center gap-2 font-medium">
        <Gauge className="size-4 text-warning" aria-hidden />
        {label} limit reached ({used} of {limit})
      </div>
      <p className="text-sm text-muted-foreground">
        {isOwner
          ? 'Upgrade your plan or free up space to continue.'
          : 'Ask your workspace Owner to upgrade the plan.'}
      </p>
      {isOwner && <ComingSoon phase={5} label="Upgrade plan" />}
    </div>
  );
}

// ------------------------------------------------------------------ disabled-with-reason

/**
 * An action whose backend ships later: visibly disabled, still focusable, with the reason in a
 * tooltip ("Every button must have a real action or a clearly disabled state").
 */
export function ComingSoon({
  phase,
  label,
  icon: Icon,
  reason,
  variant = 'outline',
  size = 'default',
  className,
}: {
  phase: number;
  label: string;
  icon?: LucideIcon;
  reason?: string;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
  className?: string;
}) {
  const when = phase > 0 ? `Coming in Phase ${phase}` : 'Coming soon';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          aria-disabled="true"
          onClick={(e) => e.preventDefault()}
          className={cn(
            'cursor-not-allowed opacity-60 hover:bg-transparent',
            variant === 'default' && 'hover:bg-primary',
            className,
          )}
        >
          {Icon && <Icon aria-hidden />}
          {label}
          <Clock className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="sr-only">({when})</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {when}
        {reason ? `: ${reason}` : ''}
      </TooltipContent>
    </Tooltip>
  );
}

/** Inline note for a whole section whose workflow arrives later. */
export function PhaseNote({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-medium text-foreground">
          {phase > 0 ? `Phase ${phase}` : 'Coming soon'}:
        </span>{' '}
        {children}
      </span>
    </p>
  );
}

export function LockedBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ loading

export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border" aria-busy="true" aria-label="Loading">
      <div className="flex gap-4 border-b bg-muted/40 px-3 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b px-3 py-3.5 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'flex-[2]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('space-y-3 rounded-lg border p-5', className)}
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton className={cn('h-64 w-full rounded-lg', className)} aria-label="Loading chart" />
  );
}

export function PageSkeleton({ kpis = false }: { kpis?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {kpis && <KpiSkeleton />}
      <TableSkeleton />
    </div>
  );
}

// ------------------------------------------------------------------ offline

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-sm"
    >
      <WifiOff className="size-4" aria-hidden />
      You&apos;re offline. Changes will be retried when you reconnect.
    </div>
  );
}

// ------------------------------------------------------------------ confirm

/** Destructive confirmation (PRD §9.1): names the consequence, default focus on Cancel. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel,
  onConfirm,
  pending,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  consequence: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  destructive?: boolean;
}) {
  const [cancelRef, setCancelRef] = useState<HTMLButtonElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          cancelRef?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{consequence}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={setCancelRef} variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
