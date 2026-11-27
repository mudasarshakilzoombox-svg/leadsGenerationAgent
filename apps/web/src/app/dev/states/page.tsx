import { Inbox } from 'lucide-react';
import { notFound } from 'next/navigation';
import { StatusBadge, ScoreBadge, Meter } from '@/components/data';
import { FormMessage } from '@/components/forms';
import {
  CardSkeleton,
  ComingSoon,
  EmptyState,
  ErrorPanel,
  KpiSkeleton,
  LimitReachedPanel,
  LockedBanner,
  PermissionPanel,
  PhaseNote,
  TableSkeleton,
} from '@/components/states';
import { serverEnv } from '@/env';

/** Development-only gallery of every shared state component (01-frontend §8). */
export default function StatesPage() {
  if (serverEnv.APP_ENV === 'production' || serverEnv.APP_ENV === 'staging') notFound();
  return (
    <main id="main" className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      <h1 className="text-2xl font-semibold">UI states</h1>
      <section className="space-y-3">
        <h2 className="font-medium">Empty</h2>
        <EmptyState
          icon={Inbox}
          title="No replies yet"
          description="Replies appear here within 5 minutes."
          action={<ComingSoon phase={3} label="Connect mailbox" variant="default" />}
        />
      </section>
      <section className="space-y-3">
        <h2 className="font-medium">Loading</h2>
        <KpiSkeleton />
        <TableSkeleton rows={3} />
        <CardSkeleton />
      </section>
      <section className="space-y-3">
        <h2 className="font-medium">Errors</h2>
        <ErrorPanel requestId="0195f000-demo" />
        <PermissionPanel what="billing" />
        <LimitReachedPanel label="Seat" used={2} limit={2} isOwner />
        <FormMessage tone="error">This link is invalid or has expired.</FormMessage>
      </section>
      <section className="space-y-3">
        <h2 className="font-medium">Notices and badges</h2>
        <FormMessage tone="success">Invitation sent.</FormMessage>
        <LockedBanner title="Requires Super Admin MFA">Unlocks with the admin API.</LockedBanner>
        <PhaseNote phase={2}>Discovery arrives with the prospecting module.</PhaseNote>
        <div className="flex flex-wrap gap-2">
          {['ACTIVE', 'PAUSED', 'DRAFT', 'PENDING_APPROVAL', 'ERROR', 'VALID', 'CATCH_ALL'].map(
            (s) => (
              <StatusBadge key={s} status={s} />
            ),
          )}
          <ScoreBadge tier="A" score={86} />
          <ScoreBadge tier="C" score={41} />
        </div>
        <div className="max-w-sm">
          <Meter label="Seats" used={4} limit={5} />
        </div>
      </section>
    </main>
  );
}
