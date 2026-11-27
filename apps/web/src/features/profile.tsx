'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AcceptedResponseSchema,
  AuthIdentitiesResponseSchema,
  ChangeEmailRequestSchema,
  ChangePasswordRequestSchema,
  DisplayNameSchema,
  OAUTH_PROVIDERS,
  type OAuthProvider,
  OAuthProvidersResponseSchema,
  TimezoneSchema,
} from '@lga/contracts';
import { Button } from '@lga/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@lga/ui/components/card';
import { Input } from '@lga/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lga/ui/components/select';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ProviderLogo } from '@/components/auth/oauth';
import { PROVIDER_LABEL } from '@/lib/auth/oauth-labels';
import { applyApiError, Field, FormMessage, SubmitButton } from '@/components/forms';
import { ReauthDialog } from '@/components/reauth-dialog';
import { ConfirmDialog, ErrorPanel } from '@/components/states';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';
import { timeZones } from '@/lib/timezones';
import { useWorkspace } from '@/lib/workspace-context';

// ------------------------------------------------------------------ name + time zone

const DetailsSchema = z.object({
  name: DisplayNameSchema,
  timezone: TimezoneSchema.or(z.literal('')),
});
type Details = z.infer<typeof DetailsSchema>;

function DetailsCard() {
  const { user } = useWorkspace();
  const router = useRouter();
  const zones = useMemo(() => timeZones(), []);
  const form = useForm<Details>({
    resolver: zodResolver(DetailsSchema),
    defaultValues: { name: user.name ?? '', timezone: user.timezone ?? '' },
  });
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Your details</CardTitle>
        <CardDescription>
          Your name appears to your team. Times show in your time zone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          noValidate
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await api('/auth/me', null, {
                method: 'PATCH',
                body: { name: values.name, timezone: values.timezone || null },
              });
              toast.success('Profile saved.');
              form.reset(values);
              router.refresh();
            } catch (error) {
              applyApiError(error, form.setError, ['name', 'timezone']);
            }
          })}
        >
          <Field label="Name" error={form.formState.errors.name?.message}>
            {(p) => <Input {...p} autoComplete="name" {...form.register('name')} />}
          </Field>
          <Field label="Time zone" error={form.formState.errors.timezone?.message}>
            {(p) => (
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      id={p.id}
                      aria-invalid={p['aria-invalid']}
                      aria-describedby={p['aria-describedby']}
                    >
                      <SelectValue placeholder="Use the workspace time zone" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {zones.map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {zone.replaceAll('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton
              pending={form.formState.isSubmitting}
              pendingLabel="Saving…"
              disabled={!form.formState.isDirty}
            >
              Save details
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ password

type PasswordValues = z.infer<typeof ChangePasswordRequestSchema>;

function PasswordCard() {
  const { user } = useWorkspace();
  const form = useForm<PasswordValues>({
    resolver: zodResolver(ChangePasswordRequestSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden /> Password
        </CardTitle>
        <CardDescription>
          {user.hasPassword
            ? 'Changing it signs out every other device.'
            : 'You sign in with Google or Microsoft. Set a password to also sign in with your email.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user.hasPassword ? (
          <form
            method="post"
            noValidate
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await api('/auth/password/change', null, { method: 'POST', body: values });
                toast.success('Password changed. Other devices were signed out.');
                form.reset();
              } catch (error) {
                applyApiError(error, form.setError, ['currentPassword', 'newPassword']);
              }
            })}
          >
            <Field label="Current password" error={form.formState.errors.currentPassword?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  {...form.register('currentPassword')}
                />
              )}
            </Field>
            <Field
              label="New password"
              hint="At least 12 characters. A short sentence works well."
              error={form.formState.errors.newPassword?.message}
            >
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="new-password"
                  {...form.register('newPassword')}
                />
              )}
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Changing…">
                Change password
              </SubmitButton>
            </div>
          </form>
        ) : (
          <Button asChild variant="outline">
            <Link href="/forgot-password">Set a password by email</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ email

type EmailValues = z.infer<typeof ChangeEmailRequestSchema>;

function EmailCard() {
  const { user } = useWorkspace();
  const [reauthOpen, setReauthOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const form = useForm<EmailValues>({
    resolver: zodResolver(ChangeEmailRequestSchema),
    defaultValues: { newEmail: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await api('/auth/email/change', AcceptedResponseSchema, {
        method: 'POST',
        body: values,
      });
      setSent(result.message);
      form.reset();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'REAUTH_REQUIRED') {
        setReauthOpen(true);
        return;
      }
      applyApiError(error, form.setError, ['newEmail']);
    }
  });

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4 text-muted-foreground" aria-hidden /> Email address
        </CardTitle>
        <CardDescription>
          <span className="break-all">{user.email}</span>
          {user.emailVerified ? ' · verified' : ' · not verified yet'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sent && <FormMessage tone="success">{sent}</FormMessage>}
        <form
          method="post"
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={submit}
        >
          <div className="flex-1">
            <Field label="New email address" error={form.formState.errors.newEmail?.message}>
              {(p) => (
                <Input {...p} type="email" autoComplete="email" {...form.register('newEmail')} />
              )}
            </Field>
          </div>
          <SubmitButton
            pending={form.formState.isSubmitting}
            pendingLabel="Sending…"
            className="sm:mt-6"
          >
            Send confirmation
          </SubmitButton>
        </form>
        <p className="text-xs text-muted-foreground">
          We send a link to the new address. Your current address gets a notice with a way to undo
          the change.
        </p>
      </CardContent>
      <ReauthDialog open={reauthOpen} onOpenChange={setReauthOpen} onDone={() => void submit()} />
    </Card>
  );
}

// ------------------------------------------------------------------ connected sign-in methods

function MethodsCard() {
  const { user } = useWorkspace();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [reauthOpen, setReauthOpen] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; provider: OAuthProvider } | null>(null);
  const providers = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => api('/auth/providers', OAuthProvidersResponseSchema),
  });
  const identities = useQuery({
    queryKey: ['auth', 'identities'],
    queryFn: () => api('/auth/identities', AuthIdentitiesResponseSchema),
  });
  const unlink = useMutation({
    mutationFn: (id: string) => api(`/auth/identities/${id}`, null, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Sign-in method removed.');
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'identities'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'REAUTH_REQUIRED') {
        setReauthOpen(true);
        return;
      }
      setRemoving(null);
      applyApiError(error);
    },
  });

  const enabled = providers.data?.providers ?? [];
  const linked = identities.data?.data ?? [];
  const shown = OAUTH_PROVIDERS.filter(
    (p) => enabled.includes(p) || linked.some((l) => l.provider === p),
  );
  const next = `${pathname}?tab=profile`;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden /> Sign-in methods
        </CardTitle>
        <CardDescription>
          Sign in with Google or Microsoft. This never gives us access to your mailbox: mailboxes
          are connected separately in Channels.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {identities.isError || providers.isError ? (
          <ErrorPanel
            onRetry={() => void Promise.all([identities.refetch(), providers.refetch()])}
          />
        ) : identities.isPending || providers.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Google and Microsoft sign-in are not set up on this server yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {shown.map((provider) => {
              const identity = linked.find((l) => l.provider === provider);
              return (
                <li key={provider} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <ProviderLogo provider={provider} className="size-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{PROVIDER_LABEL[provider]}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {identity
                          ? `Connected ${formatDate(identity.createdAt)}${identity.email ? ` · ${identity.email}` : ''}`
                          : 'Not connected'}
                      </span>
                    </span>
                  </span>
                  {identity ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-9"
                      onClick={() => setRemoving({ id: identity.id, provider })}
                    >
                      Disconnect
                    </Button>
                  ) : enabled.includes(provider) ? (
                    <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                      <a
                        href={`/api/v1/auth/oauth/${provider}/start?${new URLSearchParams({ intent: 'link', next }).toString()}`}
                      >
                        Connect
                      </a>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {!user.hasPassword && linked.length === 1 && (
          <p className="mt-3 text-xs text-muted-foreground">
            This is your only way to sign in, so it can&apos;t be disconnected until you set a
            password or connect another method.
          </p>
        )}
      </CardContent>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Disconnect ${removing ? PROVIDER_LABEL[removing.provider] : ''}?`}
        consequence="You won't be able to sign in with it until you connect it again."
        confirmLabel="Disconnect"
        destructive
        pending={unlink.isPending}
        onConfirm={() => removing && unlink.mutate(removing.id)}
      />
      <ReauthDialog
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        onDone={() => removing && unlink.mutate(removing.id)}
      />
    </Card>
  );
}

export function ProfileTab() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <DetailsCard />
      <EmailCard />
      <PasswordCard />
      <MethodsCard />
    </div>
  );
}
