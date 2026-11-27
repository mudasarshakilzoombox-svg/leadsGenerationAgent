'use client';

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
  ChevronsUpDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Settings,
  Shield,
  Sun,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { OfflineBanner } from '@/components/states';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { humanize, initials } from '@/lib/format';
import { BOTTOM_NAV_PATHS, NAV_GROUPS, NAV_ITEMS, type NavItem } from '@/lib/navigation';
import { useWorkspace } from '@/lib/workspace-context';
import { hardNavigate } from '@/lib/navigate';

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
  return (item: NavItem) => {
    const target = href(item.path);
    return item.path === ''
      ? pathname === target
      : pathname === target || pathname.startsWith(`${target}/`);
  };
}

// ------------------------------------------------------------------ sidebar (sm+)

function Sidebar() {
  const { href } = useWorkspace();
  const isActive = useActive();
  return (
    <aside className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground sm:flex lg:w-60">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <Link
          href={href()}
          className="flex items-center gap-2 font-semibold text-foreground"
          aria-label={`${APP_NAME} home`}
        >
          <LogoMark />
          <span className="hidden truncate text-sm lg:inline">{APP_NAME}</span>
        </Link>
      </div>
      <div className="hidden px-3 pt-3 lg:block">
        <WorkspaceSwitcher />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3 lg:px-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            <p className="mb-1 hidden px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase lg:block">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.label}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={href(item.path)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex h-10 items-center justify-center gap-3 rounded-md px-2 text-sm transition-colors lg:h-9 lg:justify-start',
                            active
                              ? 'bg-sidebar-accent font-medium text-foreground'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground',
                          )}
                        >
                          <item.icon
                            className={cn('size-[18px] shrink-0', active && 'text-brand')}
                            aria-hidden
                          />
                          <span className="sr-only lg:not-sr-only">{item.label}</span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="lg:hidden">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-2 lg:p-3">
        <UserMenu compact />
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ workspace switcher

export function WorkspaceSwitcher() {
  const { membership, memberships } = useWorkspace();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-sm shadow-xs hover:bg-accent sm:min-h-10"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-brand-soft text-[11px] font-semibold text-brand">
            {initials(membership.workspace.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{membership.workspace.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {humanize(membership.roleKey)}
            </span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">Switch workspace</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.workspace.id} asChild>
            <Link href={`/${m.workspace.slug}`}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold">
                {initials(m.workspace.name)}
              </span>
              <span className="flex-1 truncate">{m.workspace.name}</span>
              {m.workspace.id === membership.workspace.id && (
                <Check className="size-4" aria-label="Current" />
              )}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/workspaces?create=1">
            <Plus aria-hidden /> Create workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------------ user menu

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

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, href } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-md p-1.5 text-left text-sm hover:bg-sidebar-accent',
            compact && 'justify-center lg:justify-start',
          )}
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            <AvatarFallback>{initials(user.name, user.email[0]?.toUpperCase())}</AvatarFallback>
          </Avatar>
          <span className={cn('min-w-0 flex-1', compact && 'hidden lg:block')}>
            <span className="block truncate font-medium">{user.name ?? user.email}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={compact ? 'right' : 'bottom'} className="w-60">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
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
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
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

function TrialBadge() {
  const { membership } = useWorkspace();
  if (membership.workspace.status !== 'TRIALING') return null;
  return (
    <Link
      href={`/${membership.workspace.slug}/billing`}
      className="hidden items-center rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand hover:opacity-90 md:inline-flex"
    >
      Trial plan
    </Link>
  );
}

function TopBar() {
  const { membership } = useWorkspace();
  const pathname = usePathname();
  const current =
    [...NAV_ITEMS]
      .reverse()
      .find((i) => pathname.startsWith(`/${membership.workspace.slug}/${i.path}`) && i.path) ??
    NAV_ITEMS[0]!;
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:hidden">
        <LogoMark className="size-6" />
        <span className="truncate text-sm font-semibold">{current.label}</span>
      </div>
      <p className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
        <span className="font-medium text-foreground">{membership.workspace.name}</span>
        <span aria-hidden> / </span>
        {current.label}
      </p>
      <TrialBadge />
      <div className="sm:hidden">
        <MobileAccount />
      </div>
    </header>
  );
}

function MobileAccount() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Workspace and account">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Workspace</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <WorkspaceSwitcher />
          <UserMenu />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BottomNav() {
  const { href } = useWorkspace();
  const isActive = useActive();
  const [open, setOpen] = useState(false);
  const primary = BOTTOM_NAV_PATHS.map((p) => NAV_ITEMS.find((i) => i.path === p)!);
  const more = NAV_ITEMS.filter((i) => !BOTTOM_NAV_PATHS.includes(i.path));
  const moreActive = more.some(isActive);
  const cell = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]';
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="flex">
        {primary.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.label} className="flex flex-1">
              <Link
                href={href(item.path)}
                aria-current={active ? 'page' : undefined}
                className={cn(cell, active ? 'text-foreground' : 'text-muted-foreground')}
              >
                <item.icon className={cn('size-5', active && 'text-brand')} aria-hidden />
                {item.label}
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
                      aria-current={isActive(item) ? 'page' : undefined}
                      className={cn(
                        'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-center text-xs',
                        isActive(item) && 'border-brand bg-brand-soft',
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
        <TopBar />
        <main
          id="main"
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pb-10 lg:px-8"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
