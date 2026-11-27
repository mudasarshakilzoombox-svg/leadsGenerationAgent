'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CURRENT_TERMS_VERSION,
  EmailOnlyRequestSchema,
  LoginRequestSchema,
  PasswordResetRequestSchema,
  SignupRequestSchema,
} from '@lga/contracts';
import { Button } from '@lga/ui/components/button';
import { Input } from '@lga/ui/components/input';
import { cn } from '@lga/ui/lib/utils';
import { CheckCircle2, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyApiError, Field, FormMessage, SubmitButton } from '@/components/forms';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Turnstile } from './turnstile';
import { hardNavigate } from '@/lib/navigate';

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
      {footer && <p className="text-center text-sm text-muted-foreground">{footer}</p>}
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ login

const LoginForm = LoginRequestSchema.extend({
  password: z.string().min(1, 'Enter your password.').max(1024),
});

export function LoginForm_({
  next,
  siteKey,
  nonce,
}: {
  next?: string | undefined;
  siteKey?: string | undefined;
  nonce?: string | undefined;
}) {
  const [needsCaptcha, setNeedsCaptcha] = useState(false);
  const form = useForm<z.infer<typeof LoginForm>>({
    resolver: zodResolver(LoginForm),
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  });
  const onToken = useCallback(
    (t: string) => form.setValue('turnstileToken', t || undefined),
    [form],
  );
  const pending = form.formState.isSubmitting;

  const submit = form.handleSubmit(async (values) => {
    try {
      await api('/auth/login', null, { method: 'POST', body: values });
      hardNavigate(next ?? '/');
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.fieldErrors.some((f) => f.pointer === '/turnstileToken')
      ) {
        setNeedsCaptcha(true);
        // Without a site key the dev token is applied automatically; retry once.
        if (!siteKey && !values.turnstileToken) {
          form.setValue('turnstileToken', 'dev-turnstile-token');
          await submit();
          return;
        }
      }
      if (error instanceof ApiError && error.status === 401) {
        form.setError('password', { type: 'server', message: error.message });
        return;
      }
      applyApiError(error, form.setError, ['email', 'password']);
    }
  });

  return (
    <form method="post" onSubmit={submit} noValidate className="space-y-4">
      <Field label="Work email" error={form.formState.errors.email?.message}>
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="email"
            inputMode="email"
            {...form.register('email')}
          />
        )}
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message}>
        {(p) => (
          <PasswordInput {...p} autoComplete="current-password" {...form.register('password')} />
        )}
      </Field>
      <div className="-mt-1 flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      {needsCaptcha && <Turnstile siteKey={siteKey} nonce={nonce} onToken={onToken} />}
      <SubmitButton pending={pending} pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}

// ------------------------------------------------------------------ signup

const SignupForm = SignupRequestSchema.omit({
  acceptTerms: true,
  termsVersion: true,
  turnstileToken: true,
}).extend({
  acceptTerms: z.boolean().refine((v) => v, 'Accept the terms to continue.'),
});

export function SignupForm_({
  siteKey,
  nonce,
}: {
  siteKey?: string | undefined;
  nonce?: string | undefined;
}) {
  const [token, setToken] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<z.infer<typeof SignupForm>>({
    resolver: zodResolver(SignupForm),
    mode: 'onBlur',
    defaultValues: { name: '', email: '', password: '', acceptTerms: false },
  });

  const submit = form.handleSubmit(async ({ name, email, password }) => {
    const values = { name, email, password };
    if (!token) {
      form.setError('root', { message: 'Complete the security check to continue.' });
      return;
    }
    try {
      await api('/auth/signup', null, {
        method: 'POST',
        body: {
          ...values,
          acceptTerms: true,
          termsVersion: CURRENT_TERMS_VERSION,
          turnstileToken: token,
        },
      });
      setSentTo(values.email);
    } catch (error) {
      applyApiError(error, form.setError, ['name', 'email', 'password']);
    }
  });

  if (sentTo) return <CheckEmail email={sentTo} kind="verify" />;
  const errors = form.formState.errors;
  return (
    <form method="post" onSubmit={submit} noValidate className="space-y-4">
      <Field label="Full name" error={errors.name?.message}>
        {(p) => <Input {...p} autoComplete="name" {...form.register('name')} />}
      </Field>
      <Field label="Work email" error={errors.email?.message}>
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="email"
            inputMode="email"
            {...form.register('email')}
          />
        )}
      </Field>
      <Field
        label="Password"
        error={errors.password?.message}
        hint="At least 12 characters. A short phrase works well."
      >
        {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register('password')} />}
      </Field>
      <div className="space-y-1">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-[var(--brand)] sm:size-4"
            {...form.register('acceptTerms')}
          />
          <span className="text-muted-foreground">
            I agree to the Terms of Service, Privacy Policy and Acceptable Use Policy (version{' '}
            {CURRENT_TERMS_VERSION}).
          </span>
        </label>
        {errors.acceptTerms && (
          <p className="text-sm text-destructive">{errors.acceptTerms.message}</p>
        )}
      </div>
      <Turnstile siteKey={siteKey} nonce={nonce} onToken={setToken} />
      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Creating account…"
        className="w-full"
      >
        Create account
      </SubmitButton>
    </form>
  );
}

// ------------------------------------------------------------------ check email + resend

function CheckEmail({ email, kind }: { email: string; kind: 'verify' | 'reset' }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const resend = async () => {
    setState('sending');
    try {
      await api(kind === 'verify' ? '/auth/verify-email/resend' : '/auth/password/forgot', null, {
        method: 'POST',
        body: { email },
      });
      setState('sent');
    } catch (error) {
      setState('idle');
      applyApiError(error);
    }
  };
  return (
    <div className="space-y-4 text-center" role="status">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <MailCheck className="size-6" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-medium">Check your email</p>
        <p className="text-sm break-words text-muted-foreground">
          If <span className="font-medium text-foreground">{email}</span> can be used, a link is on
          its way.
          {kind === 'verify' ? ' It expires in 24 hours.' : ' It expires in 30 minutes.'}
        </p>
      </div>
      <Button variant="outline" className="w-full" onClick={resend} disabled={state !== 'idle'}>
        {state === 'sending' && <Loader2 className="animate-spin" aria-hidden />}
        {state === 'sent' ? 'Sent again' : state === 'sending' ? 'Sending…' : 'Send the link again'}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ verify email

export function VerifyEmail({ token }: { token: string | undefined }) {
  const [state, setState] = useState<'verifying' | 'done' | 'failed'>(
    token ? 'verifying' : 'failed',
  );
  const [message, setMessage] = useState('This link is invalid or has expired.');
  const started = useRef(false);

  useEffect(() => {
    // Verification is a POST made by the page (links never change state on GET).
    if (!token || started.current) return;
    started.current = true;
    api('/auth/verify-email', null, { method: 'POST', body: { token } })
      .then(() => {
        setState('done');
        setTimeout(() => hardNavigate('/workspaces'), 1200);
      })
      .catch((error: unknown) => {
        setMessage(errorMessage(error));
        setState('failed');
      });
  }, [token]);

  if (state === 'verifying') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Confirming your email…
      </p>
    );
  }
  if (state === 'done') {
    return (
      <FormMessage tone="success">
        <span className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success" aria-hidden /> Email confirmed. Taking you
          to your workspace…
        </span>
      </FormMessage>
    );
  }
  return (
    <div className="space-y-4">
      <FormMessage tone="error">{message}</FormMessage>
      <ResendVerification />
    </div>
  );
}

function ResendVerification() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<{ email: string }>({
    resolver: zodResolver(EmailOnlyRequestSchema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  });
  if (sentTo) return <CheckEmail email={sentTo} kind="verify" />;
  return (
    <form
      method="post"
      noValidate
      className="space-y-3"
      onSubmit={form.handleSubmit(async ({ email }) => {
        try {
          await api('/auth/verify-email/resend', null, { method: 'POST', body: { email } });
          setSentTo(email);
        } catch (error) {
          applyApiError(error, form.setError, ['email']);
        }
      })}
    >
      <Field label="Email" error={form.formState.errors.email?.message}>
        {(p) => <Input {...p} type="email" autoComplete="email" {...form.register('email')} />}
      </Field>
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Sending…"
        className="w-full"
      >
        Send a new link
      </SubmitButton>
    </form>
  );
}

// ------------------------------------------------------------------ forgot / reset

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<{ email: string }>({
    resolver: zodResolver(EmailOnlyRequestSchema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  });
  if (sentTo) return <CheckEmail email={sentTo} kind="reset" />;
  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ email }) => {
        try {
          await api('/auth/password/forgot', null, { method: 'POST', body: { email } });
          setSentTo(email);
        } catch (error) {
          applyApiError(error, form.setError, ['email']);
        }
      })}
    >
      <Field label="Work email" error={form.formState.errors.email?.message}>
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="email"
            inputMode="email"
            {...form.register('email')}
          />
        )}
      </Field>
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Sending…"
        className="w-full"
      >
        Send reset link
      </SubmitButton>
    </form>
  );
}

const ResetForm = PasswordResetRequestSchema.pick({ newPassword: true })
  .extend({ confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match.',
  });

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof ResetForm>>({
    resolver: zodResolver(ResetForm),
    mode: 'onBlur',
    defaultValues: { newPassword: '', confirm: '' },
  });
  if (!token)
    return (
      <FormMessage tone="error">This reset link is incomplete. Request a new one.</FormMessage>
    );
  if (done) {
    return (
      <div className="space-y-4">
        <FormMessage tone="success">
          Your password was changed and every device was signed out.
        </FormMessage>
        <Button asChild className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }
  const errors = form.formState.errors;
  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ newPassword }) => {
        try {
          await api('/auth/password/reset', null, { method: 'POST', body: { token, newPassword } });
          setDone(true);
        } catch (error) {
          const tokenProblem =
            error instanceof ApiError && error.fieldErrors.some((f) => f.pointer === '/token');
          if (tokenProblem) form.setError('root', { message: (error as ApiError).message });
          else applyApiError(error, form.setError, ['newPassword']);
        }
      })}
    >
      <Field
        label="New password"
        error={errors.newPassword?.message}
        hint="At least 12 characters."
      >
        {(p) => (
          <PasswordInput {...p} autoComplete="new-password" {...form.register('newPassword')} />
        )}
      </Field>
      <Field label="Confirm new password" error={errors.confirm?.message}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register('confirm')} />}
      </Field>
      {errors.root && (
        <FormMessage tone="error">
          {errors.root.message}{' '}
          <Link href="/forgot-password" className={cn('font-medium underline')}>
            Request a new link
          </Link>
        </FormMessage>
      )}
      <SubmitButton pending={form.formState.isSubmitting} className="w-full">
        Change password
      </SubmitButton>
    </form>
  );
}

// ------------------------------------------------------------------ accept invitation

export function AcceptInvitation({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const accept = async () => {
    setPending(true);
    try {
      const membership = await api(
        '/invitations/accept',
        z.object({ workspace: z.object({ slug: z.string() }) }),
        {
          method: 'POST',
          body: { token },
        },
      );
      hardNavigate(`/${membership.workspace.slug}`);
    } catch (error) {
      setPending(false);
      applyApiError(error);
    }
  };
  return (
    <Button className="w-full" onClick={accept} disabled={pending}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? 'Joining…' : 'Accept invitation'}
    </Button>
  );
}

export { LoginForm_ as LoginForm, SignupForm_ as SignupForm };
