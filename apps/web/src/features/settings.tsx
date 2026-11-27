'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ASSIGNABLE_ROLE_VALUES,
  type AssignableRole,
  CreateInvitationRequestSchema,
  type InvitationSummary,
  InvitationSummarySchema,
  type MemberSummary,
  MemberSummarySchema,
  type SessionSummary,
  SessionSummarySchema,
  type WorkspaceSummary,
} from '@lga/contracts';
import { Button } from '@lga/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@lga/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lga/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lga/ui/components/dropdown-menu';
import { Input } from '@lga/ui/components/input';
import {
  Avatar,
  AvatarFallback,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@lga/ui/components/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lga/ui/components/select';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Crown,
  Laptop,
  Loader2,
  LogOut,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DetailList, PageHeader, StatusBadge } from '@/components/data';
import { applyApiError, Field, SubmitButton } from '@/components/forms';
import { ReauthDialog } from '@/components/reauth-dialog';
import { ProfileTab } from './profile';
import {
  ComingSoon,
  ConfirmDialog,
  ErrorPanel,
  LimitReachedPanel,
  PermissionPanel,
  TableSkeleton,
} from '@/components/states';
import { api, idempotencyKey } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { formatDate, formatRelative, humanize, initials } from '@/lib/format';
import { PHASE } from '@/lib/navigation';
import { useCan, useWorkspace } from '@/lib/workspace-context';
import { hardNavigate } from '@/lib/navigate';

const list = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item) });
const ROLE_HELP: Record<AssignableRole, string> = {
  ADMIN: 'Manages members, integrations, compliance and approvals',
  MEMBER: 'Builds and runs campaigns; launches may need approval',
  READ_ONLY: 'Views workspace data and analytics only',
};

// ------------------------------------------------------------------ team

function useTeam() {
  const { base, membership } = useWorkspace();
  const canManage = useCan('members.manage');
  const ws = membership.workspace.id;
  const members = useQuery({
    queryKey: ['ws', ws, 'members'],
    queryFn: () => api(`${base}/members`, list(MemberSummarySchema)),
  });
  const invitations = useQuery({
    queryKey: ['ws', ws, 'invitations'],
    queryFn: () => api(`${base}/invitations`, list(InvitationSummarySchema)),
    enabled: canManage,
  });
  return { members, invitations, canManage, ws };
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { base, membership } = useWorkspace();
  const queryClient = useQueryClient();
  // One key per user intent (03-api §6): reused if the same submission is retried.
  const [intentKey, setIntentKey] = useState(idempotencyKey);
  const [limit, setLimit] = useState<{ used: number; limit: number } | null>(null);
  const form = useForm<{ email: string; roleKey: AssignableRole }>({
    resolver: zodResolver(CreateInvitationRequestSchema),
    mode: 'onBlur',
    defaultValues: { email: '', roleKey: 'MEMBER' },
  });
  const roleKey = useWatch({ control: form.control, name: 'roleKey' });
  const submit = form.handleSubmit(async (values) => {
    try {
      await api(`${base}/invitations`, InvitationSummarySchema, {
        method: 'POST',
        body: values,
        headers: { 'Idempotency-Key': intentKey },
      });
      toast.success(`Invitation sent to ${values.email}`);
      setIntentKey(idempotencyKey());
      form.reset();
      onOpenChange(false);
      await queryClient.invalidateQueries({
        queryKey: ['ws', membership.workspace.id, 'invitations'],
      });
    } catch (error) {
      setIntentKey(idempotencyKey());
      if (error instanceof ApiError && error.code === 'QUOTA_EXCEEDED') {
        const l = error.extensions.limit as { used: number; limit: number } | undefined;
        setLimit(l ?? { used: 0, limit: 0 });
        return;
      }
      applyApiError(error, form.setError, ['email', 'roleKey']);
    }
  });
  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), setLimit(null))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They get an email with a link that is valid for 7 days.
          </DialogDescription>
        </DialogHeader>
        {limit ? (
          <LimitReachedPanel
            label="Seat"
            used={limit.used}
            limit={limit.limit}
            isOwner={membership.roleKey === 'OWNER'}
          />
        ) : (
          <form method="post" onSubmit={submit} noValidate className="space-y-4">
            <Field label="Email" error={form.formState.errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="off" {...form.register('email')} />}
            </Field>
            <Field label="Role" hint={ROLE_HELP[roleKey]}>
              {(p) => (
                <Select
                  value={roleKey}
                  onValueChange={(v) => form.setValue('roleKey', v as AssignableRole)}
                >
                  <SelectTrigger id={p.id} aria-describedby={p['aria-describedby']}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLE_VALUES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {humanize(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Sending…">
                Send invitation
              </SubmitButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  m,
  canManage,
  isSelf,
  onRemove,
  onTransfer,
}: {
  m: MemberSummary;
  canManage: boolean;
  isSelf: boolean;
  onRemove: () => void;
  onTransfer: () => void;
}) {
  const { base, membership } = useWorkspace();
  const queryClient = useQueryClient();
  const isOwnerViewer = membership.roleKey === 'OWNER';
  const changeRole = useMutation({
    mutationFn: (roleKey: AssignableRole) =>
      api(`${base}/members/${m.id}`, MemberSummarySchema, { method: 'PATCH', body: { roleKey } }),
    onSuccess: async (updated) => {
      toast.success(`${updated.name ?? updated.email} is now ${humanize(updated.roleKey)}`);
      await queryClient.invalidateQueries({ queryKey: ['ws', membership.workspace.id, 'members'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar className="size-9">
        <AvatarFallback>{initials(m.name, m.email[0]?.toUpperCase())}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {m.name ?? m.email} {isSelf && <span className="text-muted-foreground">(you)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {m.email} · joined {formatDate(m.joinedAt)}
        </p>
      </div>
      {m.roleKey === 'OWNER' ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium">
          <Crown className="size-4 text-warning" aria-hidden /> Owner
        </span>
      ) : canManage && !isSelf ? (
        <Select
          value={m.roleKey}
          onValueChange={(v) => changeRole.mutate(v as AssignableRole)}
          disabled={changeRole.isPending}
        >
          <SelectTrigger className="w-36" aria-label={`Role for ${m.name ?? m.email}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNABLE_ROLE_VALUES.map((r) => (
              <SelectItem key={r} value={r}>
                {humanize(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <StatusBadge status={m.roleKey} label={humanize(m.roleKey)} />
      )}
      {m.roleKey !== 'OWNER' && (canManage || isSelf) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${m.name ?? m.email}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isOwnerViewer && m.roleKey === 'ADMIN' && (
              <DropdownMenuItem onSelect={onTransfer}>
                <Crown aria-hidden /> Make Owner
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              {isSelf ? <LogOut aria-hidden /> : <Trash2 aria-hidden />}{' '}
              {isSelf ? 'Leave workspace' : 'Remove from workspace'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function InvitationRow({ inv }: { inv: InvitationSummary }) {
  const { base, membership } = useWorkspace();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['ws', membership.workspace.id, 'invitations'] });
  const resend = useMutation({
    mutationFn: () =>
      api(`${base}/invitations/${inv.id}/resend`, InvitationSummarySchema, { method: 'POST' }),
    onSuccess: async () => (toast.success(`Invitation sent again to ${inv.email}`), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: () => api(`${base}/invitations/${inv.id}`, null, { method: 'DELETE' }),
    onSuccess: async () => (toast.success('Invitation revoked'), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex size-9 items-center justify-center rounded-full bg-muted">
        <Mail className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{inv.email}</p>
        <p className="text-xs text-muted-foreground">
          {humanize(inv.roleKey)} ·{' '}
          {inv.status === 'EXPIRED' ? 'expired' : `expires ${formatRelative(inv.expiresAt)}`}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => resend.mutate()}
        disabled={resend.isPending}
      >
        {resend.isPending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <RefreshCw aria-hidden />
        )}{' '}
        Resend
      </Button>
      <Button variant="ghost" size="sm" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
        Revoke
      </Button>
    </li>
  );
}

function TeamTab() {
  const { base, user, membership } = useWorkspace();
  const queryClient = useQueryClient();
  const { members, invitations, canManage, ws } = useTeam();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<MemberSummary | null>(null);
  const [transferTo, setTransferTo] = useState<MemberSummary | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);

  const remove = useMutation({
    mutationFn: (m: MemberSummary) => api(`${base}/members/${m.id}`, null, { method: 'DELETE' }),
    onSuccess: async (_v, m) => {
      setRemoving(null);
      if (m.userId === user.id) {
        toast.success(`You left ${membership.workspace.name}`);
        hardNavigate('/workspaces');
        return;
      }
      toast.success(
        `${m.name ?? m.email} was removed. Their mailboxes are paused and moved to the Owner.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['ws', ws, 'members'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const transfer = useMutation({
    mutationFn: (m: MemberSummary) =>
      api(`${base}/transfer-ownership`, null, { method: 'POST', body: { memberId: m.id } }),
    onSuccess: () => {
      toast.success('Ownership transferred. You are now an Admin.');
      window.location.reload();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'REAUTH_REQUIRED') {
        setReauthOpen(true);
        return;
      }
      setTransferTo(null);
      toast.error(errorMessage(e));
    },
  });

  return (
    <div className="space-y-6">
      <Card className="gap-2">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">Members</CardTitle>
            <CardDescription>Roles take effect on each person&apos;s next action.</CardDescription>
          </div>
          {canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden /> Invite
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {members.isPending ? (
            <TableSkeleton rows={3} columns={3} />
          ) : members.isError ? (
            <ErrorPanel onRetry={() => void members.refetch()} />
          ) : (
            <ul className="divide-y">
              {members.data.data.map((m) => (
                <MemberRow
                  key={m.id}
                  m={m}
                  canManage={canManage}
                  isSelf={m.userId === user.id}
                  onRemove={() => setRemoving(m)}
                  onTransfer={() => setTransferTo(m)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {canManage ? (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
            <CardDescription>Pending invitations count toward your seats.</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.isPending ? (
              <TableSkeleton rows={2} columns={3} />
            ) : invitations.isError ? (
              <ErrorPanel onRetry={() => void invitations.refetch()} />
            ) : invitations.data.data.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No pending invitations.</p>
            ) : (
              <ul className="divide-y">
                {invitations.data.data.map((inv) => (
                  <InvitationRow key={inv.id} inv={inv} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <PermissionPanel what="invitations" />
      )}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={
          removing?.userId === user.id
            ? `Leave ${membership.workspace.name}?`
            : `Remove ${removing?.name ?? removing?.email}?`
        }
        consequence={
          removing?.userId === user.id
            ? 'You will lose access to this workspace immediately. An Admin can invite you again.'
            : 'They lose access immediately. Their campaigns stay; their mailboxes are paused and reassigned to the Owner.'
        }
        confirmLabel={removing?.userId === user.id ? 'Leave workspace' : 'Remove member'}
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
      <ConfirmDialog
        open={transferTo !== null && !reauthOpen}
        onOpenChange={(o) => !o && setTransferTo(null)}
        title={`Make ${transferTo?.name ?? transferTo?.email} the Owner?`}
        consequence="They get full control including billing and deletion. You become an Admin. This can only be undone by the new Owner."
        confirmLabel="Transfer ownership"
        pending={transfer.isPending}
        onConfirm={() => transferTo && transfer.mutate(transferTo)}
      />
      <ReauthDialog
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        onDone={() => transferTo && transfer.mutate(transferTo)}
      />
    </div>
  );
}

// ------------------------------------------------------------------ sessions

function SessionsTab() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ['me', 'sessions'],
    queryFn: () => api('/auth/sessions', list(SessionSummarySchema)),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['me', 'sessions'] });
  const revoke = useMutation({
    mutationFn: (s: SessionSummary) => api(`/auth/sessions/${s.id}`, null, { method: 'DELETE' }),
    onSuccess: async (_v, s) => {
      if (s.current) return hardNavigate('/login');
      toast.success('Session signed out');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api('/auth/sessions/revoke-others', null, { method: 'POST' }),
    onSuccess: async () => (toast.success('Signed out of all other sessions'), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const others = sessions.data?.data.filter((s) => !s.current).length ?? 0;
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">Active sessions</CardTitle>
          <CardDescription>
            Devices signed in to your account. Sessions end after 7 idle days.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          onClick={() => revokeOthers.mutate()}
          disabled={others === 0 || revokeOthers.isPending}
        >
          {revokeOthers.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Sign out other sessions
        </Button>
      </CardHeader>
      <CardContent>
        {sessions.isPending ? (
          <TableSkeleton rows={2} columns={3} />
        ) : sessions.isError ? (
          <ErrorPanel onRetry={() => void sessions.refetch()} />
        ) : (
          <ul className="divide-y">
            {sessions.data.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <Laptop className="size-5 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {describeAgent(s.userAgent)}{' '}
                    {s.current && <span className="text-brand">· This device</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.ip ?? 'Unknown network'} · active {formatRelative(s.lastSeenAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke.mutate(s)}
                  disabled={revoke.isPending}
                >
                  {s.current ? 'Sign out' : 'Revoke'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function describeAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'device';
  return `${browser} on ${os}`;
}

// ------------------------------------------------------------------ page

const TABS = ['workspace', 'team', 'sessions', 'profile'] as const;
type Tab = (typeof TABS)[number];

export function SettingsView({
  workspace,
}: {
  workspace: WorkspaceSummary & { roleKey: string; permissions: string[] };
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = (TABS as readonly string[]).includes(search.get('tab') ?? '')
    ? (search.get('tab') as Tab)
    : 'workspace';
  const canEdit = workspace.permissions.includes('workspace.settings');
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Workspace details, your team and your account." />
      <Tabs
        value={tab}
        onValueChange={(v) => window.history.replaceState(null, '', `${pathname}?tab=${v}`)}
      >
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>
        <TabsContent value="workspace">
          <Card className="gap-4">
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="text-base">{workspace.name}</CardTitle>
                <CardDescription>Your role: {humanize(workspace.roleKey)}</CardDescription>
              </div>
              {canEdit && (
                <ComingSoon
                  phase={PHASE.workspaceSettings}
                  label="Edit settings"
                  reason="Address, privacy notice, defaults and launch approval."
                />
              )}
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: 'URL', value: `/${workspace.slug}` },
                  { label: 'Plan', value: humanize(workspace.planKey) },
                  { label: 'Status', value: <StatusBadge status={workspace.status} /> },
                  { label: 'Trial ends', value: formatDate(workspace.trialEndsAt) },
                  { label: 'Default time zone', value: workspace.defaultTimezone },
                  { label: 'Created', value: formatDate(workspace.createdAt) },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab />
        </TabsContent>
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
