import {
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  Plug,
  Search,
  Send,
  SendHorizontal,
  Settings,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  /** Path below `/<workspaceSlug>`; empty for the Dashboard. */
  path: string;
  icon: LucideIcon;
  /** Where the data comes from (ADR-0036): the selected project or the whole workspace. */
  scope?: 'project' | 'workspace';
}

export interface NavGroup {
  /** Section label; null for the ungrouped top and bottom blocks. */
  label: string | null;
  items: NavItem[];
}

export const DASHBOARD: NavItem = {
  label: 'Dashboard',
  path: '',
  icon: LayoutDashboard,
  scope: 'project',
};
export const CAMPAIGNS: NavItem = {
  label: 'Campaigns',
  path: 'campaigns',
  icon: Send,
  scope: 'project',
};

/**
 * Sidebar sections below the Dashboard and the project's campaign list (ADR-0036, Explee-style
 * information architecture with our own names). Paths are the ADR-0035 routes.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Leads',
    items: [
      { label: 'Find leads', path: 'find-leads', icon: Search },
      { label: 'Companies', path: 'companies', icon: Building2 },
      { label: 'Contacts', path: 'contacts', icon: Users },
      { label: 'Lead lists', path: 'lead-lists', icon: ListChecks },
    ],
  },
  {
    label: 'Mailbox',
    items: [
      { label: 'Inbox', path: 'inbox', icon: Inbox },
      { label: 'Sent', path: 'sent', icon: SendHorizontal, scope: 'project' },
      { label: 'Meetings', path: 'meetings', icon: CalendarDays },
    ],
  },
  {
    label: 'Setup',
    items: [
      { label: 'Project docs', path: 'icp', icon: FileText, scope: 'project' },
      { label: 'Channels', path: 'integrations', icon: Plug },
      { label: 'Email sequences', path: 'sequences', icon: ListOrdered, scope: 'project' },
    ],
  },
  {
    label: null,
    items: [
      { label: 'Analytics', path: 'analytics', icon: BarChart3 },
      { label: 'Billing', path: 'billing', icon: CreditCard },
      { label: 'Settings', path: 'settings', icon: Settings },
    ],
  },
];

/** Every destination, for titles and the mobile "More" sheet. */
export const NAV_ITEMS: NavItem[] = [DASHBOARD, CAMPAIGNS, ...NAV_GROUPS.flatMap((g) => g.items)];

/** Mobile bottom navigation (PRD §10.1): four destinations plus "More". */
export const BOTTOM_NAV_PATHS = ['', 'inbox', 'campaigns', 'find-leads'];

/** How many of the project's campaigns the sidebar shows before "Show N more". */
export const SIDEBAR_CAMPAIGNS = 4;

/** Roadmap phase in which an action's backend arrives (docs/ROADMAP.md). */
export const PHASE = {
  discovery: 2,
  import: 2,
  icpEdit: 1,
  listEdit: 2,
  campaigns: 3,
  inboxReply: 4,
  meetings: 4,
  integrations: 2,
  mailboxes: 3,
  billing: 5,
  workspaceSettings: 0,
  profile: 0,
  admin: 6,
  export: 5,
  projects: 1,
} as const;
