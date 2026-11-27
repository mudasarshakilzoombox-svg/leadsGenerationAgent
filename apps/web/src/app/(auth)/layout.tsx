import { APP_NAME } from '@lga/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/shell/app-shell';

/** Public auth pages: one focused card, product name, legal links. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <LogoMark />
          {APP_NAME}
        </Link>
      </header>
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">
        B2B prospecting and outreach from your own mailboxes.
      </footer>
    </div>
  );
}
