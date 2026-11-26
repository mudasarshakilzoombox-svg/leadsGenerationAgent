import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes, resolving conflicts (`cn('px-2', cond && 'px-4')`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
