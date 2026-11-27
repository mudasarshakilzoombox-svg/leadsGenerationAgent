'use client';

// Form building blocks (01-frontend §7): React Hook Form + the shared contract Zod schemas,
// validation on blur and submit, API field errors mapped back onto inputs.
import { Button } from '@lga/ui/components/button';
import { Label } from '@lga/ui/components/label';
import { cn } from '@lga/ui/lib/utils';
import { Loader2 } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId, useSyncExternalStore } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/lib/api/errors';

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const noopSubscribe = () => () => {};

/** False during server render and before hydration, true once React owns the page. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Disabled until hydrated: a click before hydration would otherwise submit the form natively.
 * Forms also use method="post", so credentials can never end up in a URL.
 */
export function SubmitButton({
  pending,
  children,
  pendingLabel = 'Saving…',
  ...props
}: ComponentProps<typeof Button> & { pending: boolean; pendingLabel?: string }) {
  const hydrated = useHydrated();
  return (
    <Button type="submit" {...props} disabled={!hydrated || pending || props.disabled}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? pendingLabel : children}
    </Button>
  );
}

/**
 * Show an API failure: field errors go onto their inputs (`/email` -> `email`), everything else
 * becomes a toast. Returns true when at least one field error was applied.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError?: UseFormSetError<T>,
  fields: string[] = [],
): boolean {
  let applied = false;
  if (error instanceof ApiError && setError) {
    for (const fe of error.fieldErrors) {
      const name = fe.pointer.replace(/^\//, '').split('/')[0] ?? '';
      if (fields.includes(name)) {
        setError(name as Path<T>, { type: 'server', message: fe.message });
        applied = true;
      }
    }
  }
  if (!applied) toast.error(errorMessage(error));
  return applied;
}

export function FormMessage({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'error';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        tone === 'success' && 'border-success/30 bg-success/10 text-foreground',
        tone === 'error' && 'border-destructive/30 bg-destructive/5 text-destructive',
        tone === 'info' && 'bg-muted/50 text-muted-foreground',
      )}
    >
      {children}
    </div>
  );
}
