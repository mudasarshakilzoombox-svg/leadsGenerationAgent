import { Monitor, Shield } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/shell/admin-nav';
import { LogoMark } from '@/components/shell/app-shell';
import { homePath, requireSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: { default: 'Platform admin', template: '%s · Platform admin' },
};

/**
 * Separate platform admin interface. Visible only to Super Admins (others get 404).
 * This is presentation only: the admin API enforces MFA and the IP allowlist (SECURITY §3.4).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  if (!session.user.isPlatformAdmin) notFound();
  return (
    <>
      {/* Desktop only (PRD §10.2). */}
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center lg:hidden">
        <Monitor className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold">Use a desktop</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Platform administration needs a screen at least 1024 px wide.
        </p>
        <Link href={homePath(session)} className="text-sm font-medium underline">
          Back to the app
        </Link>
      </div>
      <div className="hidden min-h-dvh lg:flex">
        <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
            <LogoMark />
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Shield className="size-4 text-warning" aria-hidden /> Platform admin
            </span>
          </div>
          <AdminNav />
          <div className="border-t border-sidebar-border p-3 text-xs text-muted-foreground">
            Signed in as <span className="break-all text-foreground">{session.user.email}</span>
            <Link
              href={homePath(session)}
              className="mt-2 block font-medium text-foreground hover:underline"
            >
              Back to the app
            </Link>
          </div>
        </aside>
        <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-8 py-8">
          {children}
        </main>
      </div>
    </>
  );
}
