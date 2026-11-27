'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type OAuthPendingLink, OAuthPendingLinkSchema, type OAuthProvider } from '@lga/contracts';
import { Input } from '@lga/ui/components/input';
import { CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, Field, FormMessage, SubmitButton } from '@/components/forms';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { PROVIDER_LABEL } from '@/lib/auth/oauth-labels';
import { hardNavigate } from '@/lib/navigate';

/** Official brand marks (Google "G", Microsoft four squares), as the brand guidelines show them. */
export function ProviderLogo({
  provider,
  className = 'size-[18px]',
}: {
  provider: OAuthProvider;
  className?: string;
}) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden>
        <path
          fill="#FFC107"
          d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
        />
        <path
          fill="#FF3D00"
          d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 23 23" className={className} aria-hidden>
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}

/** Full-page links: the provider flow starts on the API and returns through its callback. */
export function OAuthButtons({
  providers,
  next,
  mode,
}: {
  providers: OAuthProvider[];
  next?: string | undefined;
  mode: 'login' | 'signup';
}) {
  if (providers.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2">
        {providers.map((provider) => {
          const qs = new URLSearchParams({ intent: 'login', ...(next ? { next } : {}) });
          return (
            <a
              key={provider}
              href={`/api/v1/auth/oauth/${provider}/start?${qs.toString()}`}
              className="flex h-11 items-center justify-center gap-2.5 rounded-md border bg-background px-4 text-sm font-medium shadow-xs transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <ProviderLogo provider={provider} />
              Continue with {PROVIDER_LABEL[provider]}
            </a>
          );
        })}
      </div>
      {mode === 'signup' && (
        <p className="text-center text-xs text-muted-foreground">
          By continuing with Google or Microsoft you agree to the Terms of Service and Privacy
          Policy.
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ /login/link

const PasswordOnly = z.object({ password: z.string().min(1, 'Enter your password.') });

export function LinkAccount({ provider, sent }: { provider: OAuthProvider; sent: boolean }) {
  const label = PROVIDER_LABEL[provider];
  const [pending, setPending] = useState<OAuthPendingLink | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const loaded = useRef(false);
  const form = useForm<{ password: string }>({
    resolver: zodResolver(PasswordOnly),
    defaultValues: { password: '' },
  });

  useEffect(() => {
    if (sent || loaded.current) return;
    loaded.current = true;
    api('/auth/oauth/link', OAuthPendingLinkSchema)
      .then(setPending)
      .catch((error: unknown) => setFailed(errorMessage(error)));
  }, [sent]);

  if (sent) {
    return (
      <FormMessage tone="success">
        <span className="flex items-start gap-2">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            An account with this email already exists. We sent it a link: open it to connect {label}{' '}
            and sign in.
          </span>
        </span>
      </FormMessage>
    );
  }
  if (failed) {
    return (
      <div className="space-y-4">
        <FormMessage tone="error">{failed}</FormMessage>
        <Link href="/login" className="text-sm font-medium hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }
  if (!pending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }
  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ password }) => {
        try {
          const result = await api(
            '/auth/oauth/link',
            z.object({ next: z.string().nullable() }).loose(),
            {
              method: 'POST',
              body: { password },
            },
          );
          hardNavigate(result.next ?? '/');
        } catch (error) {
          applyApiError(error, form.setError, ['password']);
        }
      })}
    >
      <p className="text-sm text-muted-foreground">
        You already have an account as{' '}
        <span className="font-medium text-foreground">{pending.maskedEmail}</span>. Enter its
        password once to connect {label}. After that, {label} signs you in directly.
      </p>
      <Field label="Password" error={form.formState.errors.password?.message}>
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
        )}
      </Field>
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Connecting…"
        className="w-full"
      >
        Connect {label} and sign in
      </SubmitButton>
      <p className="text-center text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

// ------------------------------------------------------------------ token pages

/** A POST made by the page (links never change state on GET), then a success or error state. */
function useTokenAction(token: string | undefined, path: string) {
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed');
  const [message, setMessage] = useState('This link is invalid or has expired.');
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api(path, null, { method: 'POST', body: { token } })
      .then(() => setState('done'))
      .catch((error: unknown) => {
        setMessage(errorMessage(error));
        setState('failed');
      });
  }, [token, path]);
  return { state, message };
}

function Working({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
    </p>
  );
}

function Done({ children }: { children: ReactNode }) {
  return (
    <FormMessage tone="success">
      <span className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>{children}</span>
      </span>
    </FormMessage>
  );
}

export function ConfirmIdentityLink({ token }: { token: string | undefined }) {
  const { state, message } = useTokenAction(token, '/auth/oauth/link/confirm');
  useEffect(() => {
    if (state === 'done') setTimeout(() => hardNavigate('/'), 1200);
  }, [state]);
  if (state === 'working') return <Working label="Connecting your account…" />;
  if (state === 'done') return <Done>Connected. Signing you in…</Done>;
  return <FailedWithLink message={message} />;
}

export function EmailChangeResult({
  token,
  kind,
}: {
  token: string | undefined;
  kind: 'confirm' | 'revert';
}) {
  const { state, message } = useTokenAction(
    token,
    kind === 'confirm' ? '/auth/email/confirm' : '/auth/email/revert',
  );
  if (state === 'working')
    return (
      <Working label={kind === 'confirm' ? 'Confirming your new email…' : 'Undoing the change…'} />
    );
  if (state === 'failed') return <FailedWithLink message={message} />;
  return kind === 'confirm' ? (
    <div className="space-y-4">
      <Done>Your email address is updated. Use it the next time you sign in.</Done>
      <Link href="/" className="text-sm font-medium hover:underline">
        Continue
      </Link>
    </div>
  ) : (
    <div className="space-y-4">
      <Done>
        The change is undone and every device was signed out. Sign in again, and reset your password
        if you think someone else knows it.
      </Done>
      <div className="flex gap-4 text-sm font-medium">
        <Link href="/login" className="hover:underline">
          Sign in
        </Link>
        <Link href="/forgot-password" className="hover:underline">
          Reset password
        </Link>
      </div>
    </div>
  );
}

function FailedWithLink({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <FormMessage tone="error">{message}</FormMessage>
      <Link href="/login" className="text-sm font-medium hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
