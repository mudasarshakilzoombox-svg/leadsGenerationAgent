'use client';

import type { Overview } from '@lga/contracts';
import { cn } from '@lga/ui/lib/utils';
import { CheckCircle2, ChevronDown, ChevronUp, Circle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { useWorkspace } from '@/lib/workspace-context';

type Checklist = Overview['checklist'];

const STORAGE_KEY = 'lga.getStarted.open';

/** Progress through the onboarding checklist (WS-08), e.g. `{ done: 2, total: 7 }`. */
export function checklistProgress(items: Checklist): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/**
 * Floating "Get started" pill (ADR-0036): onboarding progress that stays out of the way and
 * expands into the step list. Hidden once every step is done.
 */
export function GetStarted({ items }: { items: Checklist }) {
  const { href } = useWorkspace();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      // Restoring a per-viewer preference after mount (storage is not available during SSR).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* storage blocked */
    }
  }, []);
  const toggle = () => {
    setOpen((value) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !value;
    });
  };

  const { done, total } = checklistProgress(items);
  if (total === 0 || done === total) return null;
  const next = items.find((i) => !i.done);

  return (
    <div className="fixed right-4 bottom-20 z-40 flex flex-col items-end gap-2 sm:right-6 sm:bottom-6">
      {open && (
        <div
          id={panelId}
          className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl"
        >
          <p className="px-2 pt-1.5 pb-2 text-sm font-semibold">Set up your agent</p>
          <ol className="space-y-0.5">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={href(item.href)}
                  className={cn(
                    'flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted',
                    item.key === next?.key && 'bg-brand-soft/60 font-medium',
                  )}
                >
                  {item.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Done" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="To do" />
                  )}
                  <span className={cn('flex-1', item.done && 'text-muted-foreground line-through')}>
                    {item.label}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="flex h-12 items-center gap-3 rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0 dark:bg-brand dark:text-brand-foreground"
      >
        Get started
        <span
          className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/30 sm:block"
          aria-hidden
        >
          <span
            className="block h-full rounded-full bg-white dark:bg-brand-foreground"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </span>
        <span className="tabular font-medium opacity-90">
          {done} of {total}
        </span>
        {open ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronUp className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
