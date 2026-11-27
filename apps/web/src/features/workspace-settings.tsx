'use client';

// Settings → Workspace (PRD WS-06, WS-07). Each card saves only its own fields with the row
// version it was loaded with (If-Match, 03-api §7); a concurrent edit shows a reload prompt
// instead of silently overwriting someone else's change.
import { zodResolver } from '@hookform/resolvers/zod';
import {
  PrivacyNoticeUrlSchema,
  SendWindowSchema,
  TimezoneSchema,
  type UpdateWorkspaceRequest,
  type WorkspaceDetail,
  WorkspaceDetailSchema,
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
import { cn } from '@lga/ui/lib/utils';
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { Controller, type FieldValues, type UseFormReturn, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DetailList, StatusBadge } from '@/components/data';
import { applyApiError, Field, FormMessage, SubmitButton } from '@/components/forms';
import { ReauthDialog } from '@/components/reauth-dialog';
import { TypedConfirmDialog } from '@/components/states';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { formatDate, humanize } from '@/lib/format';
import { timeZones } from '@/lib/timezones';
import { useWorkspace } from '@/lib/workspace-context';

// ------------------------------------------------------------------ shared save

interface SettingsState {
  detail: WorkspaceDetail;
  editable: boolean;
  /** PATCH with the current row version; updates the shared detail or flags a conflict. */
  save: (patch: UpdateWorkspaceRequest) => Promise<WorkspaceDetail>;
}

const SettingsContext = createContext<SettingsState | null>(null);

function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside WorkspaceSettings');
  return ctx;
}

/** The precondition error the API returns when someone saved in between (03-api §7). */
function isStale(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'PRECONDITION_FAILED';
}

async function submitPatch<T extends FieldValues>(
  form: UseFormReturn<T>,
  save: SettingsState['save'],
  patch: UpdateWorkspaceRequest,
  fields: string[],
  onStale: () => void,
): Promise<void> {
  try {
    await save(patch);
    form.reset(form.getValues());
    toast.success('Settings saved.');
  } catch (error) {
    if (isStale(error)) return onStale();
    applyApiError(error, form.setError, fields);
  }
}

export function WorkspaceSettings({ initial }: { initial: WorkspaceDetail }) {
  const [detail, setDetail] = useState(initial);
  const [stale, setStale] = useState(false);
  const canEdit = detail.permissions.includes('workspace.settings');
  const restricted = detail.status === 'PENDING_DELETION' || detail.status === 'READ_ONLY';
  const editable = canEdit && !restricted && !stale;

  const state = useMemo<SettingsState>(
    () => ({
      detail,
      editable,
      save: async (patch) => {
        try {
          const next = await api(`/workspaces/${detail.id}`, WorkspaceDetailSchema, {
            method: 'PATCH',
            body: patch,
            headers: { 'if-match': `W/"${detail.rowVersion}"` },
          });
          setDetail(next);
          return next;
        } catch (error) {
          if (isStale(error)) setStale(true);
          throw error;
        }
      },
    }),
    [detail, editable],
  );

  return (
    <SettingsContext.Provider value={state}>
      <div className="space-y-6">
        {stale && (
          <FormMessage tone="error">
            <span className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Someone else changed these settings. Reload to see the latest version.</span>
              <Button
                variant="outline"
                className="h-11 shrink-0 sm:h-9"
                onClick={() => window.location.reload()}
              >
                <RefreshCw aria-hidden /> Reload
              </Button>
            </span>
          </FormMessage>
        )}
        {!canEdit && (
          <FormMessage>
            Only Owners and Admins can change workspace settings. Ask one of them if something here
            needs updating.
          </FormMessage>
        )}
        <OverviewCard />
        <div className="grid gap-6 lg:grid-cols-2">
          <CompanyCard onStale={() => setStale(true)} />
          <AddressCard onStale={() => setStale(true)} />
          <DefaultsCard onStale={() => setStale(true)} />
          <ApprovalCard onStale={() => setStale(true)} />
        </div>
        {detail.permissions.includes('workspace.delete') && (
          <DangerZone onChanged={(next) => setDetail(next)} />
        )}
      </div>
    </SettingsContext.Provider>
  );
}

// ------------------------------------------------------------------ overview

const REQUIREMENT_LABEL: Record<WorkspaceDetail['launchReadiness']['missing'][number], string> = {
  physicalAddress: 'Postal address',
  privacyNoticeUrl: 'Privacy-notice link',
};

function OverviewCard() {
  const { detail } = useSettings();
  return (
    <Card className="gap-4">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{detail.name}</CardTitle>
        <CardDescription>Your role: {humanize(detail.roleKey)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DetailList
          items={[
            { label: 'URL', value: `/${detail.slug}` },
            { label: 'Plan', value: humanize(detail.planKey) },
            { label: 'Status', value: <StatusBadge status={detail.status} /> },
            { label: 'Trial ends', value: formatDate(detail.trialEndsAt) },
            { label: 'Created', value: formatDate(detail.createdAt) },
          ]}
        />
        <div
          className={cn(
            'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
            detail.launchReadiness.ready
              ? 'border-success/30 bg-success/5'
              : 'border-warning/40 bg-warning/5',
          )}
          role="status"
        >
          {detail.launchReadiness.ready ? (
            <>
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <span>
                Ready for campaigns: every email footer has your address and privacy link.
              </span>
            </>
          ) : (
            <>
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                Before any campaign can launch, add:{' '}
                <span className="font-medium">
                  {detail.launchReadiness.missing.map((m) => REQUIREMENT_LABEL[m]).join(' and ')}
                </span>
                .
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ company

const CompanySchema = z.object({
  legalName: z.string().trim().max(200),
  privacyNoticeUrl: z.union([z.literal(''), PrivacyNoticeUrlSchema]),
});
type Company = z.infer<typeof CompanySchema>;

function CompanyCard({ onStale }: { onStale: () => void }) {
  const { detail, editable, save } = useSettings();
  const form = useForm<Company>({
    resolver: zodResolver(CompanySchema),
    defaultValues: {
      legalName: detail.legalName ?? '',
      privacyNoticeUrl: detail.privacyNoticeUrl ?? '',
    },
  });
  const { errors } = form.formState;
  return (
    <SettingsCard
      title="Company"
      description="Shown in every outreach footer: who is sending and where recipients can read how their data is used."
    >
      <form
        method="post"
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((v) =>
          submitPatch(
            form,
            save,
            { legalName: v.legalName || null, privacyNoticeUrl: v.privacyNoticeUrl || null },
            ['legalName', 'privacyNoticeUrl'],
            onStale,
          ),
        )}
      >
        <fieldset disabled={!editable} className="space-y-4">
          <Field label="Legal company name" error={errors.legalName?.message}>
            {(p) => <Input {...p} autoComplete="organization" {...form.register('legalName')} />}
          </Field>
          <Field
            label="Privacy-notice link"
            error={errors.privacyNoticeUrl?.message}
            hint="Required before launch. Explains where contact data comes from."
          >
            {(p) => (
              <Input
                {...p}
                type="url"
                inputMode="url"
                placeholder="https://example.com/privacy"
                {...form.register('privacyNoticeUrl')}
              />
            )}
          </Field>
        </fieldset>
        {editable && (
          <SubmitButton pending={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            Save company
          </SubmitButton>
        )}
      </form>
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ address

const opt = (max: number) => z.string().trim().max(max);
const AddressFormSchema = z
  .object({
    line1: opt(200),
    line2: opt(200),
    city: opt(100),
    region: opt(100),
    postalCode: opt(20),
    country: opt(2),
  })
  .superRefine((v, ctx) => {
    if (Object.values(v).every((x) => x === '')) return; // clearing the address
    if (!v.line1) ctx.addIssue({ code: 'custom', path: ['line1'], message: 'Enter the street.' });
    if (!v.city) ctx.addIssue({ code: 'custom', path: ['city'], message: 'Enter the city.' });
    if (!/^[A-Za-z]{2}$/.test(v.country)) {
      ctx.addIssue({
        code: 'custom',
        path: ['country'],
        message: 'Use the two-letter code, for example GB or US.',
      });
    }
  });
type AddressForm = z.infer<typeof AddressFormSchema>;
const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'region', 'postalCode', 'country'];

function AddressCard({ onStale }: { onStale: () => void }) {
  const { detail, editable, save } = useSettings();
  const a = detail.physicalAddress;
  const form = useForm<AddressForm>({
    resolver: zodResolver(AddressFormSchema),
    defaultValues: {
      line1: a?.line1 ?? '',
      line2: a?.line2 ?? '',
      city: a?.city ?? '',
      region: a?.region ?? '',
      postalCode: a?.postalCode ?? '',
      country: a?.country ?? '',
    },
  });
  const { errors } = form.formState;
  const text = (
    name: keyof AddressForm,
    label: string,
    autoComplete: string,
    className?: string,
  ) => (
    <Field label={label} error={errors[name]?.message} className={className}>
      {(p) => <Input {...p} autoComplete={autoComplete} {...form.register(name)} />}
    </Field>
  );
  return (
    <SettingsCard
      title="Postal address"
      description="Required before any campaign launches. Anti-spam laws need a physical address in every email footer."
    >
      <form
        method="post"
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((v) => {
          const empty = Object.values(v).every((x) => x === '');
          const physicalAddress = empty
            ? null
            : {
                line1: v.line1,
                ...(v.line2 ? { line2: v.line2 } : {}),
                city: v.city,
                ...(v.region ? { region: v.region } : {}),
                ...(v.postalCode ? { postalCode: v.postalCode } : {}),
                country: v.country.toUpperCase(),
              };
          // Show the stored form (upper-case country) once saved.
          if (v.country) form.setValue('country', v.country.toUpperCase());
          return submitPatch(form, save, { physicalAddress }, ADDRESS_FIELDS, onStale);
        })}
      >
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
          {text('line1', 'Street address', 'address-line1', 'sm:col-span-2')}
          {text('line2', 'Address line 2 (optional)', 'address-line2', 'sm:col-span-2')}
          {text('city', 'City', 'address-level2')}
          {text('region', 'State or region (optional)', 'address-level1')}
          {text('postalCode', 'Postal code (optional)', 'postal-code')}
          {text('country', 'Country code', 'country')}
        </fieldset>
        {editable && (
          <SubmitButton pending={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            Save address
          </SubmitButton>
        )}
      </form>
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ defaults

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const DefaultsSchema = z
  .object({
    defaultTimezone: TimezoneSchema,
    days: z.array(z.number().int().min(1).max(7)).min(1, 'Pick at least one day.'),
    start: z.string(),
    end: z.string(),
  })
  .superRefine((v, ctx) => {
    const parsed = SendWindowSchema.safeParse({ days: v.days, start: v.start, end: v.end });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field =
          issue.path[0] === 'days' ? 'days' : issue.path[0] === 'start' ? 'start' : 'end';
        ctx.addIssue({ code: 'custom', path: [field], message: issue.message });
      }
    }
  });
type Defaults = z.infer<typeof DefaultsSchema>;

function DefaultsCard({ onStale }: { onStale: () => void }) {
  const { detail, editable, save } = useSettings();
  const zones = useMemo(() => timeZones(), []);
  const form = useForm<Defaults>({
    resolver: zodResolver(DefaultsSchema),
    defaultValues: {
      defaultTimezone: detail.defaultTimezone,
      days: detail.defaultSendWindow.days,
      start: detail.defaultSendWindow.start,
      end: detail.defaultSendWindow.end,
    },
  });
  const { errors } = form.formState;
  return (
    <SettingsCard
      title="Sending defaults"
      description="New campaigns start with these. Each campaign can still use the recipient's own time zone."
    >
      <form
        method="post"
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((v) =>
          submitPatch(
            form,
            save,
            {
              defaultTimezone: v.defaultTimezone,
              defaultSendWindow: { days: v.days, start: v.start, end: v.end },
            },
            ['defaultTimezone'],
            onStale,
          ),
        )}
      >
        <fieldset disabled={!editable} className="space-y-4">
          <Field label="Default time zone" error={errors.defaultTimezone?.message}>
            {(p) => (
              <Controller
                control={form.control}
                name="defaultTimezone"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!editable}>
                    <SelectTrigger
                      id={p.id}
                      aria-invalid={p['aria-invalid']}
                      aria-describedby={p['aria-describedby']}
                      className="h-11 w-full sm:h-9"
                    >
                      <SelectValue />
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
          <div className="space-y-2">
            <p className="text-sm font-medium" id="send-days-label">
              Sending days
            </p>
            <Controller
              control={form.control}
              name="days"
              render={({ field }) => (
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-labelledby="send-days-label"
                >
                  {DAYS.map((day) => {
                    const on = field.value.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        aria-pressed={on}
                        disabled={!editable}
                        onClick={() =>
                          field.onChange(
                            on
                              ? field.value.filter((d) => d !== day.value)
                              : [...field.value, day.value].sort((a, b) => a - b),
                          )
                        }
                        className={cn(
                          'h-11 min-w-12 rounded-md border px-3 text-sm font-medium transition-colors sm:h-9',
                          'focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                          'disabled:cursor-not-allowed disabled:opacity-60',
                          on
                            ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-foreground'
                            : 'bg-background text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.days && <p className="text-sm text-destructive">{errors.days.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From" error={errors.start?.message}>
              {(p) => <Input {...p} type="time" step={900} {...form.register('start')} />}
            </Field>
            <Field label="Until" error={errors.end?.message}>
              {(p) => <Input {...p} type="time" step={900} {...form.register('end')} />}
            </Field>
          </div>
        </fieldset>
        {editable && (
          <SubmitButton pending={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            Save defaults
          </SubmitButton>
        )}
      </form>
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ launch approval

const ApprovalSchema = z.object({ launchRequiresApproval: z.boolean() });
type Approval = z.infer<typeof ApprovalSchema>;

function ApprovalCard({ onStale }: { onStale: () => void }) {
  const { detail, editable, save } = useSettings();
  const form = useForm<Approval>({
    resolver: zodResolver(ApprovalSchema),
    defaultValues: { launchRequiresApproval: detail.launchRequiresApproval },
  });
  return (
    <SettingsCard
      title="Launch approval"
      description="Recommended. An Owner or Admin reviews a Member's campaign before it sends."
      icon={<ShieldCheck className="size-4 text-muted-foreground" aria-hidden />}
    >
      <form
        method="post"
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((v) =>
          submitPatch(
            form,
            save,
            { launchRequiresApproval: v.launchRequiresApproval },
            ['launchRequiresApproval'],
            onStale,
          ),
        )}
      >
        <fieldset disabled={!editable}>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-[var(--brand)] sm:size-4"
              {...form.register('launchRequiresApproval')}
            />
            <span>
              <span className="font-medium">Campaign launch requires Admin approval</span>
              <span className="block text-muted-foreground">
                When off, Members can launch their own campaigns.
              </span>
            </span>
          </label>
        </fieldset>
        {editable && (
          <SubmitButton pending={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            Save approval setting
          </SubmitButton>
        )}
      </form>
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ danger zone

function DangerZone({ onChanged }: { onChanged: (detail: WorkspaceDetail) => void }) {
  const { detail } = useSettings();
  const { user } = useWorkspace();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState('');
  /** When the data would go, fixed when the dialog opens (render must stay pure). */
  const [purgeOn, setPurgeOn] = useState<string | null>(null);

  const pendingDeletion = detail.status === 'PENDING_DELETION';

  async function remove(confirmName: string) {
    setPending(true);
    try {
      const next = await api(`/workspaces/${detail.id}`, WorkspaceDetailSchema, {
        method: 'DELETE',
        body: { confirmName },
      });
      setConfirmOpen(false);
      onChanged(next);
      toast.success('Workspace scheduled for deletion.');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'REAUTH_REQUIRED') {
        setTyped(confirmName);
        setReauthOpen(true);
        return;
      }
      applyApiError(error);
    } finally {
      setPending(false);
    }
  }

  async function restore() {
    setPending(true);
    try {
      const next = await api(`/workspaces/${detail.id}/restore`, WorkspaceDetailSchema, {
        method: 'POST',
      });
      onChanged(next);
      toast.success('Workspace restored.');
      router.refresh();
    } catch (error) {
      applyApiError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="gap-4 border-destructive/40">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <Trash2 className="size-4" aria-hidden /> Danger zone
        </CardTitle>
        <CardDescription>Only the Owner can do this.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {pendingDeletion ? (
          <>
            <p className="text-sm">
              <span className="font-medium">
                Scheduled for permanent deletion on {formatDate(detail.purgeAfter)}.
              </span>{' '}
              <span className="text-muted-foreground">
                Restore it to start sending and editing again.
              </span>
            </p>
            <Button
              variant="outline"
              className="h-11 shrink-0 sm:h-9"
              onClick={() => void restore()}
              disabled={pending}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Restore workspace
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1 text-sm">
              <p className="font-medium">Delete this workspace</p>
              <p className="text-muted-foreground">
                Sending stops at once. Everything is permanently deleted after 30 days; until then
                you can restore it.
              </p>
              {!user.hasPassword && (
                <p className="text-muted-foreground">
                  You sign in with Google or Microsoft. To confirm a deletion,{' '}
                  <Link href="/forgot-password" className="font-medium text-foreground underline">
                    set a password
                  </Link>{' '}
                  first.
                </p>
              )}
            </div>
            <Button
              variant="destructive"
              className="h-11 shrink-0 sm:h-9"
              onClick={() => {
                setPurgeOn(new Date(Date.now() + 30 * 86_400_000).toISOString());
                setConfirmOpen(true);
              }}
              disabled={!user.hasPassword}
            >
              Delete workspace
            </Button>
          </>
        )}
      </CardContent>
      <TypedConfirmDialog
        open={confirmOpen && !reauthOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${detail.name}?`}
        consequence={
          <>
            <span className="block">
              Sending stops now and the workspace becomes read-only for everyone.
            </span>
            <span className="block">
              On {formatDate(purgeOn)} all its contacts, campaigns, messages and history are
              permanently deleted. You can restore it until then.
            </span>
          </>
        }
        confirmText={detail.name}
        confirmLabel="Delete workspace"
        onConfirm={(name) => void remove(name)}
        pending={pending}
      />
      <ReauthDialog
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        onDone={() => void remove(typed)}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ layout

function SettingsCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-4">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
