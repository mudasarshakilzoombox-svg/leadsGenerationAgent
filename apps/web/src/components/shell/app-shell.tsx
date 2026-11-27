'use client';

import type { Project } from '@lga/contracts';
import {
  Avatar,
  AvatarFallback,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@lga/ui/components/misc';
import { Button } from '@lga/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@lga/ui/components/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@lga/ui/components/sheet';
import { cn } from '@lga/ui/lib/utils';
import { APP_NAME } from '@lga/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  Globe,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Shield,
  Sun,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { OfflineBanner } from '@/components/states';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { humanize, initials } from '@/lib/format';
import {
  BOTTOM_NAV_PATHS,
  CAMPAIGNS,
  DASHBOARD,
  NAV_GROUPS,
  NAV_ITEMS,
  type NavItem,
  PHASE,
  SIDEBAR_CAMPAIGNS,
} from '@/lib/navigation';
import { hardNavigate } from '@/lib/navigate';
import { rememberProject } from '@/lib/project-cookie';
import { useWorkspace } from '@/lib/workspace-context';
import { PendingDeletionBanner } from './pending-deletion-banner';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-foreground" />
      <path d="M9 22V10h3v9.5h6V22z" className="fill-background" />
      <circle cx="22.5" cy="11.5" r="2.5" fill="#34d399" />
    </svg>
  );
}

function useActive() {
  const pathname = usePathname();
  const { href } = useWorkspace();
  return (path: string) => {
    const target = href(path);
    return path === ''
      ? pathname === target
      : pathname === target || pathname.startsWith(`${target}/`);
  };
}

/** Persisted sidebar collapse (a per-viewer convenience; storage may be unavailable). */
function useCollapsed(): [boolean, (value: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // Reading storage is a side effect of mounting, not render-time state derivation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(window.localStorage.getItem('lga.sidebar.collapsed') === '1');
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const update = (value: boolean) => {
    setCollapsed(value);
    try {
      window.localStorage.setItem('lga.sidebar.collapsed', value ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return [collapsed, update];
}

// Campaign status -> the coloured bar in the sidebar (Explee-style "running / paused").
const STATUS_BAR: Record<string, string> = {
  ACTIVE: 'bg-success',
  SCHEDULED: 'bg-chart-2',
  PAUSED: 'bg-warning',
  PENDING_APPROVAL: 'bg-warning/60',
  DRAFT: 'bg-muted-foreground/40',
  COMPLETED: 'bg-muted-foreground/25',
  ARCHIVED: 'bg-muted-foreground/25',
};

function ProjectMark({ project, className }: { project: Project; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-[11px] font-semibold text-brand uppercase',
        className,
      )}
      aria-hidden
    >
      {initials(project.domain.replace(/^www\./, '').replace(/\..*$/, ''))}
    </span>
  );
}

// ------------------------------------------------------------------ project switcher

export function ProjectSwitcher({ compact = false }: { compact?: boolean }) {
  const { projects, project, membership, href } = useWorkspace();
  const router = useRouter();
  if (!project) {
    return (
      <Link
        href={href('icp')}
        className={cn(
          'flex min-h-11 items-center gap-2 rounded-md border border-dashed px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:min-h-10',
          compact && 'justify-center px-0',
        )}
      >
        <Globe className="size-4" aria-hidden />
        <span className={cn(compact && 'sr-only')}>Add your website</span>
      </Link>
    );
  }
  const choose = (id: string) => {
    if (id === project.id) return;
    rememberProject(membership.workspace.id, id);
    router.refresh();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-sidebar-accent sm:min-h-10',
            compact && 'justify-center',
          )}
          aria-label={`Project: ${project.domain}. Switch project`}
        >
          <ProjectMark project={project} />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[15px] font-semibold',
              compact && 'sr-only',
            )}
          >
            {project.domain}
          </span>
          <ChevronsUpDown
            className={cn('size-4 text-muted-foreground', compact && 'hidden')}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => choose(p.id)}>
            <ProjectMark project={p} className="size-6" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.domain}</span>
              <span className="block truncate text-xs text-muted-foreground">{p.name}</span>
            </span>
            {p.id === project.id && <Check className="size-4" aria-label="Current project" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="justify-between">
          <span className="inline-flex items-center gap-2">
            <Plus aria-hidden /> New project
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden /> Phase {PHASE.projects}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------------ sidebar (sm+)

function NavLink({ item, rail, badge }: { item: NavItem; rail: boolean; badge?: number }) {
  const { href } = useWorkspace();
  const active = useActive()(item.path);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href(item.path)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'relative flex h-10 items-center gap-3 rounded-md px-2.5 text-sm transition-colors lg:h-9',
            rail ? 'justify-center' : 'justify-center lg:justify-start',
            active
              ? 'bg-sidebar-accent font-medium text-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground',
          )}
        >
          <item.icon className={cn('size-[18px] shrink-0', active && 'text-brand')} aria-hidden />
          <span className={cn('flex-1 truncate', rail ? 'sr-only' : 'sr-only lg:not-sr-only')}>
            {item.label}
          </span>
          {badge ? (
            <span
              className={cn(
                'tabular rounded-full bg-destructive px-1.5 text-[11px] leading-5 font-semibold text-white',
                rail
                  ? 'absolute top-0.5 right-0.5 min-w-4 text-center'
                  : 'max-lg:absolute max-lg:top-0.5 max-lg:right-0.5',
              )}
            >
              {badge > 99 ? '99+' : badge}
              <span className="sr-only"> unread</span>
            </span>
          ) : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className={rail ? '' : 'lg:hidden'}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarCampaigns() {
  const { project, href } = useWorkspace();
  const isActive = useActive();
  const [expanded, setExpanded] = useState(false);
  const campaigns = project?.campaigns ?? [];
  const shown = expanded ? campaigns : campaigns.slice(0, SIDEBAR_CAMPAIGNS);
  const hidden = campaigns.length - shown.length;
  return (
    <ul aria-label="Campaigns in this project" className="space-y-0.5">
      {shown.map((c) => {
        const active = isActive(`campaigns/${c.id}`);
        return (
          <li key={c.id}>
            <Link
              href={href(`campaigns/${c.id}`)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm',
                active
                  ? 'bg-sidebar-accent font-medium text-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground',
              )}
            >
              <span
                className={cn('h-4 w-1 shrink-0 rounded-full', STATUS_BAR[c.status] ?? 'bg-muted')}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>{' '}
              <span className="sr-only">({humanize(c.status)})</span>
            </Link>
          </li>
        );
      })}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
          >
            <ChevronDown className="size-4" aria-hidden />
            Show {hidden} more
          </button>
        </li>
      )}
      <li>
        <Link
          href={href('campaigns')}
          aria-current={
            isActive('campaigns') && !campaigns.some((c) => isActive(`campaigns/${c.id}`))
              ? 'page'
              : undefined
          }
          className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground"
        >
          <CAMPAIGNS.icon className="size-4" aria-hidden />
          {campaigns.length === 0 ? 'Campaigns' : 'All campaigns'}
        </Link>
      </li>
      <li>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-disabled="true"
              className="flex h-9 w-full cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground opacity-70"
            >
              <Plus className="size-4" aria-hidden />
              New campaign <span className="sr-only">(Coming in Phase {PHASE.campaigns})</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Coming in Phase {PHASE.campaigns}</TooltipContent>
        </Tooltip>
      </li>
    </ul>
  );
}

function Sidebar() {
  const { membership, unreadReplies } = useWorkspace();
  const [collapsed, setCollapsed] = useCollapsed();
  const rail = collapsed;
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] sm:flex',
        !rail && 'lg:w-64',
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center gap-2 px-3',
          rail ? 'justify-center' : 'justify-center lg:justify-between',
        )}
      >
        <Link
          href="/workspaces"
          className="flex items-center gap-2"
          aria-label={`${APP_NAME}: all workspaces`}
        >
          <LogoMark />
          {membership.workspace.status === 'TRIALING' && (
            <span
              className={cn(
                'rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand',
                rail ? 'hidden' : 'hidden lg:inline',
              )}
            >
              Trial
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-8 text-muted-foreground', rail ? 'hidden' : 'hidden lg:inline-flex')}
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose aria-hidden />
        </Button>
      </div>
      <div className="px-2 pb-2 lg:px-3">
        <div className={cn(rail ? 'block' : 'lg:hidden')}>
          <ProjectSwitcher compact />
        </div>
        <div className={cn('hidden', !rail && 'lg:block')}>
          <ProjectSwitcher />
        </div>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-2 py-2 lg:px-3">
        <div className="space-y-0.5">
          <NavLink item={DASHBOARD} rail={rail} />
          <div className={cn('hidden', !rail && 'lg:block')}>
            <SidebarCampaigns />
          </div>
          <div className={cn(rail ? 'block' : 'lg:hidden')}>
            <NavLink item={CAMPAIGNS} rail />
          </div>
        </div>
        {NAV_GROUPS.map((group, i) => (
          <div
            key={group.label ?? `group-${i}`}
            className={cn(!group.label && 'border-t border-sidebar-border pt-3')}
          >
            {group.label && (
              <p
                className={cn(
                  'mb-1 px-2.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase',
                  rail ? 'sr-only' : 'sr-only lg:not-sr-only lg:block',
                )}
              >
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    item={item}
                    rail={rail}
                    badge={item.path === 'inbox' ? unreadReplies : undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t border-sidebar-border p-2 lg:p-3">
        {rail && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden w-full text-muted-foreground lg:inline-flex"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen aria-hidden />
          </Button>
        )}
        <AccountMenu compact={rail} />
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ account menu (+ workspaces)

async function signOut(clear: () => void) {
  try {
    await api('/auth/logout', null, { method: 'POST' });
  } catch (error) {
    toast.error(errorMessage(error));
    return;
  }
  clear();
  hardNavigate('/login');
}

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, href, membership, memberships } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-md p-1.5 text-left text-sm hover:bg-sidebar-accent',
            compact ? 'justify-center' : 'justify-center lg:justify-start',
          )}
          aria-label="Account and workspace menu"
        >
          <Avatar className="size-8">
            <AvatarFallback>{initials(user.name, user.email[0]?.toUpperCase())}</AvatarFallback>
          </Avatar>
          <span className={cn('min-w-0 flex-1', compact ? 'hidden' : 'hidden lg:block')}>
            <span className="block truncate font-medium">{membership.workspace.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
          <ChevronsUpDown
            className={cn('size-4 text-muted-foreground', compact ? 'hidden' : 'hidden lg:block')}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-64">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.workspace.id} asChild>
            <Link href={`/${m.workspace.slug}`}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold">
                {initials(m.workspace.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.workspace.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {humanize(m.roleKey)}
                </span>
              </span>
              {m.workspace.id === membership.workspace.id && (
                <Check className="size-4" aria-label="Current workspace" />
              )}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link href="/workspaces?create=1">
            <Plus aria-hidden /> Create workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={href('settings')}>
            <Settings aria-hidden /> Settings
          </Link>
        </DropdownMenuItem>
        {user.isPlatformAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield aria-hidden /> Platform admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        {(
          [
            ['light', 'Light', Sun],
            ['dark', 'Dark', Moon],
            ['system', 'System', Monitor],
          ] as const
        ).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon aria-hidden /> {label}
            {theme === value && <Check className="ml-auto size-4" aria-label="Selected" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut(() => queryClient.clear())}>
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------------ top bar, bottom nav

function useCurrentItem(): NavItem {
  const pathname = usePathname();
  const { href } = useWorkspace();
  const matches = NAV_ITEMS.filter((i) => i.path && pathname.startsWith(href(i.path)));
  return matches.sort((a, b) => b.path.length - a.path.length)[0] ?? DASHBOARD;
}

function TopBar() {
  const current = useCurrentItem();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:hidden">
      <div className="min-w-0 flex-1">
        <ProjectSwitcher />
      </div>
      <span className="sr-only">{current.label}</span>
      <MobileAccount />
    </header>
  );
}

function MobileAccount() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11" aria-label="Account and workspace">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Account</SheetTitle>
        </SheetHeader>
        <div className="px-4">
          <AccountMenu />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BottomNav() {
  const { href, unreadReplies } = useWorkspace();
  const isActive = useActive();
  const [open, setOpen] = useState(false);
  const primary = BOTTOM_NAV_PATHS.map((p) => NAV_ITEMS.find((i) => i.path === p)!);
  const more = NAV_ITEMS.filter((i) => !BOTTOM_NAV_PATHS.includes(i.path));
  const moreActive = more.some((i) => isActive(i.path));
  const cell =
    'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]';
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="flex">
        {primary.map((item) => {
          const active = isActive(item.path);
          return (
            <li key={item.label} className="flex flex-1">
              <Link
                href={href(item.path)}
                aria-current={active ? 'page' : undefined}
                className={cn(cell, active ? 'text-foreground' : 'text-muted-foreground')}
              >
                <item.icon className={cn('size-5', active && 'text-brand')} aria-hidden />
                {item.label}
                {item.path === 'inbox' && unreadReplies > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-1.5 size-2 rounded-full bg-destructive">
                    <span className="sr-only">{unreadReplies} unread</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(cell, moreActive ? 'text-foreground' : 'text-muted-foreground')}
              >
                <Menu className={cn('size-5', moreActive && 'text-brand')} aria-hidden />
                More
              </button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <ul className="grid grid-cols-3 gap-2 px-4 pb-4">
                {more.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={href(item.path)}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(item.path) ? 'page' : undefined}
                      className={cn(
                        'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-center text-xs',
                        isActive(item.path) && 'border-brand bg-brand-soft',
                      )}
                    >
                      <item.icon className="size-5" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <PendingDeletionBanner />
        <TopBar />
        <main
          id="main"
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-10 lg:px-10"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
