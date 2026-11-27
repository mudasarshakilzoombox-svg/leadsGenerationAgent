import {
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  Inbox,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Plug,
  Search,
  Send,
  Settings,
  Target,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  /** Path below `/<workspaceSlug>`; empty for Overview. */
  path: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Workspace', items: [{ label: 'Overview', path: '', icon: LayoutDashboard }] },
  {
    label: 'Prospecting',
    items: [
      { label: 'Find Leads', path: 'find-leads', icon: Search },
      { label: 'Companies', path: 'companies', icon: Building2 },
      { label: 'Contacts', path: 'contacts', icon: Users },
      { label: 'Lead Lists', path: 'lead-lists', icon: ListChecks },
      { label: 'ICP Builder', path: 'icp', icon: Target },
    ],
  },
  {
    label: 'Engage',
    items: [
      { label: 'Campaigns', path: 'campaigns', icon: Send },
      { label: 'Inbox', path: 'inbox', icon: Inbox },
      { label: 'Meetings', path: 'meetings', icon: CalendarDays },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Integrations', path: 'integrations', icon: Plug },
      { label: 'Analytics', path: 'analytics', icon: BarChart3 },
      { label: 'Billing', path: 'billing', icon: CreditCard },
      { label: 'Settings', path: 'settings', icon: Settings },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Mobile bottom navigation (PRD §10.1): four destinations plus "More". */
export const BOTTOM_NAV_PATHS = ['', 'inbox', 'find-leads', 'campaigns'];

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
} as const;
