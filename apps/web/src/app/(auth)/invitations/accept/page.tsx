import { InvitationLookupSchema } from '@lga/contracts';
import { Button } from '@lga/ui/components/button';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AcceptInvitation, AuthCard } from '@/components/auth/auth-forms';
import { FormMessage } from '@/components/forms';
import { ApiError, serverApi } from '@/lib/api/server';
import { getSession } from '@/lib/auth/session';
import { humanize } from '@/lib/format';

export const metadata: Metadata = { title: 'Accept invitation' };

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invitation = token
    ? await serverApi(
        `/api/v1/invitations/lookup?token=${encodeURIComponent(token)}`,
        InvitationLookupSchema,
      ).catch((e: unknown) => {
        if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
        throw e;
      })
    : null;

  if (!token || !invitation) {
    return (
      <AuthCard title="Invitation not available">
        <FormMessage tone="error">
          This invitation is invalid or has expired. Ask the person who invited you to send a new
          one.
        </FormMessage>
      </AuthCard>
    );
  }

  const session = await getSession();
  const here = `/invitations/accept?token=${encodeURIComponent(token)}`;
  return (
    <AuthCard
      title={`Join ${invitation.workspaceName}`}
      description={
        <>
          You were invited as{' '}
          <span className="font-medium text-foreground">{humanize(invitation.roleKey)}</span> using{' '}
          <span className="font-medium text-foreground">{invitation.emailHint}</span>.
        </>
      }
    >
      {session ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Signed in as{' '}
            <span className="font-medium break-all text-foreground">{session.user.email}</span>. You
            must be signed in with the invited address.
          </p>
          <AcceptInvitation token={token} />
        </div>
      ) : (
        <div className="space-y-2">
          <Button asChild className="w-full">
            <Link href={`/login?next=${encodeURIComponent(here)}`}>Sign in to accept</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/signup?next=${encodeURIComponent(here)}`}>Create an account</Link>
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
