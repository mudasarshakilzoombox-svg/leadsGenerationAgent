// Platform administration shell (PRD SA-01..06). Data and actions stay locked until the
// MFA-protected, IP-allowlisted admin API ships (SECURITY.md §3.4, ADR-0035).
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@lga/ui/components/card';
import { Input } from '@lga/ui/components/input';
import { Label } from '@lga/ui/components/label';
import {
  Activity,
  Building2,
  Coins,
  Eye,
  Gauge,
  type LucideIcon,
  OctagonPause,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { ComingSoon, LockedBanner } from '@/components/states';
import { PHASE } from '@/lib/navigation';

export interface AdminSection {
  slug: string;
  label: string;
  feature: string;
  icon: LucideIcon;
  description: string;
  /** Columns the table will show, from the PRD acceptance criteria. */
  columns?: string[];
  /** Inputs of the action form. */
  fields?: { label: string; placeholder: string }[];
  action?: string;
  phase: number;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    slug: 'workspaces',
    label: 'Workspaces',
    feature: 'SA-01',
    icon: Building2,
    description:
      'Every workspace with plan, status, signup date, 7-day sends, bounce and unsubscribe rates and credit balance.',
    columns: [
      'Workspace',
      'Plan',
      'Status',
      'Signed up',
      'Sends (7 d)',
      'Bounce rate',
      'Unsubscribe rate',
      'Credits',
    ],
    phase: PHASE.admin,
  },
  {
    slug: 'standing',
    label: 'Standing',
    feature: 'SA-02',
    icon: ShieldCheck,
    description:
      'Set Good, Warning, Restricted or Suspended with a reason. Workspaces above 5% bounces or 1% unsubscribes in 7 days are flagged.',
    fields: [
      { label: 'Workspace', placeholder: 'Search by name or id' },
      { label: 'Reason', placeholder: 'Visible to the workspace Owner' },
    ],
    action: 'Update standing',
    phase: PHASE.admin,
  },
  {
    slug: 'kill-switches',
    label: 'Kill switches',
    feature: 'SA-03',
    icon: OctagonPause,
    description:
      'Pause all sending platform-wide, for one workspace or one mailbox; disable AI generation or a provider. Every use is audited.',
    fields: [
      { label: 'Scope', placeholder: 'Platform, workspace or mailbox' },
      { label: 'Reason', placeholder: 'Why this is being paused' },
    ],
    action: 'Pause sending',
    phase: PHASE.campaigns,
  },
  {
    slug: 'credits',
    label: 'Credits and limits',
    feature: 'SA-04',
    icon: Coins,
    description:
      'Grant or deduct credits and set custom limits with a reason. Adjustments appear in the workspace usage history.',
    fields: [
      { label: 'Workspace', placeholder: 'Search by name or id' },
      { label: 'Credits (+/-)', placeholder: 'e.g. 500' },
      { label: 'Reason', placeholder: 'Required and audited' },
    ],
    action: 'Apply adjustment',
    phase: PHASE.admin,
  },
  {
    slug: 'impersonation',
    label: 'Support access',
    feature: 'SA-05',
    icon: Eye,
    description:
      'Read-only, 30-minute support sessions that require a reason and appear in the workspace audit log.',
    fields: [
      { label: 'Workspace', placeholder: 'Search by name or id' },
      { label: 'Reason', placeholder: 'Ticket reference and purpose' },
    ],
    action: 'Start read-only session',
    phase: PHASE.admin,
  },
  {
    slug: 'health',
    label: 'System health',
    feature: 'SA-06',
    icon: Gauge,
    description: 'Queue backlogs, failed jobs, provider error rates and AI spend today.',
    columns: ['Queue', 'Waiting', 'Active', 'Failed (24 h)', 'Oldest job'],
    phase: PHASE.admin,
  },
  {
    slug: 'audit',
    label: 'Platform audit log',
    feature: 'SECURITY §12',
    icon: ScrollText,
    description:
      'Every admin action, impersonation and override, with actor, reason and request id.',
    columns: ['Time', 'Actor', 'Action', 'Target', 'Reason'],
    phase: PHASE.admin,
  },
];

export const ADMIN_OVERVIEW = { slug: '', label: 'Overview', icon: Activity };

export function AdminLock() {
  return (
    <LockedBanner title="Requires Super Admin MFA">
      Platform data and actions unlock when the admin API ships with TOTP MFA and the IP allowlist
      (Phase {PHASE.admin}). Nothing on these pages can read or change customer data yet.
    </LockedBanner>
  );
}

export function AdminSectionView({ section }: { section: AdminSection }) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{section.feature}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{section.label}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{section.description}</p>
      </div>
      <AdminLock />
      {section.columns && (
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-base">What this view shows</CardTitle>
            <CardDescription>Columns populated by the admin API.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {section.columns.map((c) => (
                <li key={c} className="rounded-md border bg-muted/40 px-2.5 py-1 text-sm">
                  {c}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {section.fields && (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">{section.action}</CardTitle>
            <CardDescription>
              Every action requires a reason and writes the platform audit log.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset disabled className="grid-cols-1 grid max-w-xl gap-4">
              {section.fields.map((f) => (
                <div key={f.label} className="space-y-2">
                  <Label htmlFor={`f-${section.slug}-${f.label}`}>{f.label}</Label>
                  <Input id={`f-${section.slug}-${f.label}`} placeholder={f.placeholder} />
                </div>
              ))}
            </fieldset>
            <ComingSoon
              phase={section.phase}
              label={section.action ?? 'Apply'}
              variant="default"
              reason="Requires the MFA-protected admin API."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
