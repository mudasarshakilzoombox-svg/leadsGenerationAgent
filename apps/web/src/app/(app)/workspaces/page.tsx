import { APP_NAME } from '@lga/shared';
import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoMark } from '@/components/shell/app-shell';
import { CreateWorkspaceForm } from '@/features/create-workspace';
import { requireSession } from '@/lib/auth/session';
import { humanize, initials } from '@/lib/format';

export const metadata: Metadata = { title: 'Workspaces' };

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const session = await requireSession();
  const creating = (await searchParams).create === '1';
  if (session.memberships.length === 1 && !creating)
    redirect(`/${session.memberships[0]!.workspace.slug}`);

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="flex h-16 items-center gap-2 px-4 font-semibold sm:px-8">
        <LogoMark />
        {APP_NAME}
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-16">
        {session.memberships.length > 0 && (
          <section aria-labelledby="ws-heading" className="space-y-3">
            <h1 id="ws-heading" className="text-2xl font-semibold tracking-tight">
              Your workspaces
            </h1>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {session.memberships.map((m) => (
                <li key={m.workspace.id}>
                  <Link
                    href={`/${m.workspace.slug}`}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50"
                  >
                    <span className="flex size-9 items-center justify-center rounded-md bg-brand-soft text-sm font-semibold text-brand">
                      {initials(m.workspace.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.workspace.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {humanize(m.roleKey)} · {humanize(m.workspace.planKey)} plan
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section
          aria-labelledby="create-heading"
          className="space-y-4 rounded-xl border bg-card p-6"
        >
          <div className="space-y-1">
            <h2
              id="create-heading"
              className={
                session.memberships.length
                  ? 'text-lg font-semibold'
                  : 'text-2xl font-semibold tracking-tight'
              }
            >
              {session.memberships.length ? 'Create another workspace' : 'Create your workspace'}
            </h2>
            <p className="text-sm text-muted-foreground">
              A workspace holds your business profiles, leads, campaigns and team. You start on a
              14-day trial.
            </p>
          </div>
          <CreateWorkspaceForm autoFocus={creating || session.memberships.length === 0} />
        </section>
      </main>
    </div>
  );
}
