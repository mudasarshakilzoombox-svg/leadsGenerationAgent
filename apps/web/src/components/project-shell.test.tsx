// @vitest-environment jsdom
// Explee-style project shell (ADR-0036): project switcher, sidebar campaigns, performance cards
// and the floating "Get started" checklist.
import type { MembershipSummary, Overview, PerformanceMetric, Project } from '@lga/contracts';
import { TooltipProvider } from '@lga/ui/components/misc';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceCard } from '@/features/overview';
import { rememberProject } from '@/lib/project-cookie';
import { WorkspaceProvider } from '@/lib/workspace-context';
import { checklistProgress, GetStarted } from './get-started';
import { ProjectSwitcher, SidebarCampaigns } from './shell/app-shell';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => '/acme',
}));

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
});

const membership: MembershipSummary = {
  membershipId: 'm',
  roleKey: 'OWNER',
  permissions: [],
  workspace: { id: 'w1', name: 'Acme', slug: 'acme', status: 'TRIALING', planKey: 'trial' },
};

const campaigns = (n: number): Project['campaigns'] =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-7000-8000-00000000000${i}`,
    name: `Campaign ${i + 1}`,
    status: i === 0 ? 'ACTIVE' : 'PAUSED',
  }));

const project = (n = 0): Project => ({
  id: '00000000-0000-7000-8000-0000000000aa',
  name: 'Kaizen Torch',
  domain: 'kaizentorch.com',
  status: 'READY',
  campaigns: campaigns(n),
});

function withWorkspace(
  ui: ReactNode,
  current: Project | null,
  all: Project[] = current ? [current] : [],
) {
  return render(
    <TooltipProvider>
      <WorkspaceProvider
        user={{
          id: 'u',
          email: 'owner@acme.test',
          name: 'Olivia',
          emailVerified: true,
          isPlatformAdmin: false,
          locale: null,
          timezone: null,
        }}
        membership={membership}
        memberships={[membership]}
        projects={all}
        project={current}
        unreadReplies={3}
      >
        {ui}
      </WorkspaceProvider>
    </TooltipProvider>,
  );
}

describe('project selection', () => {
  it('remembers the project in a per-workspace, site-wide cookie', () => {
    rememberProject('w1', 'p-123');
    expect(document.cookie).toContain('lga_project_w1=p-123');
  });

  it('shows the current project domain, or a call to add a website', () => {
    withWorkspace(<ProjectSwitcher />, project());
    expect(screen.getByRole('button', { name: /kaizentorch\.com/ })).toBeTruthy();
    cleanup();
    withWorkspace(<ProjectSwitcher />, null);
    expect(screen.getByRole('link', { name: 'Add your website' }).getAttribute('href')).toBe(
      '/acme/icp',
    );
  });
});

describe('sidebar campaigns', () => {
  it('lists the first four campaigns and reveals the rest on demand', () => {
    withWorkspace(<SidebarCampaigns />, project(6));
    expect(screen.getAllByRole('link', { name: /^Campaign \d/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getAllByRole('link', { name: /^Campaign \d/ })).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Show \d more/ })).toBeNull();
    // Status is announced for screen readers.
    expect(screen.getByRole('link', { name: 'Campaign 1 (Active)' })).toBeTruthy();
    // Creating campaigns arrives later: inert, not a dead button.
    expect(screen.getByRole('button', { name: /New campaign/ }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });
});

const metric = (over: Partial<PerformanceMetric>): PerformanceMetric => ({
  key: 'sent',
  label: 'Sent',
  format: 'count',
  higherIsBetter: true,
  scope: 'filtered',
  value: 12,
  previous: 6,
  change: 1,
  series: [{ date: '2026-11-27', value: 12 }],
  ...over,
});

describe('PerformanceCard', () => {
  it('shows the value and an upward change against the previous period', () => {
    withWorkspace(<PerformanceCard metric={metric({})} range="7d" />, null);
    const card = screen.getByRole('article', { name: 'Sent' });
    expect(card.textContent).toContain('12');
    expect(card.textContent).toContain('Up');
    expect(card.textContent).toContain('100%');
    expect(card.textContent).toContain('vs prev 7d');
  });

  it('shows a dash for no data and hides the change', () => {
    withWorkspace(
      <PerformanceCard
        metric={metric({
          key: 'delivered',
          label: 'Delivered',
          value: null,
          previous: null,
          change: null,
        })}
        range="7d"
      />,
      null,
    );
    const card = screen.getByRole('article', { name: 'Delivered' });
    expect(card.textContent).toContain('—');
    expect(card.textContent).not.toContain('vs prev');
  });

  it('marks workspace-wide credits and keeps their change neutral', () => {
    withWorkspace(
      <PerformanceCard
        metric={metric({
          key: 'creditsUsed',
          label: 'Credits used',
          format: 'credits',
          higherIsBetter: false,
          scope: 'workspace',
          value: 2.5,
          change: -1,
        })}
        range="30d"
      />,
      null,
    );
    const card = screen.getByRole('article', { name: 'Credits used' });
    expect(card.textContent).toContain('2.5');
    expect(card.textContent).toContain('credits');
    expect(card.textContent).toContain('Workspace');
    expect(card.querySelector('.text-destructive, .text-success')).toBeNull();
  });
});

describe('GetStarted', () => {
  const items: Overview['checklist'] = [
    { key: 'verify_email', label: 'Verify your email', done: true, href: 'settings' },
    { key: 'analyze_website', label: 'Analyze your website', done: true, href: 'icp' },
    { key: 'connect_mailbox', label: 'Connect a mailbox', done: false, href: 'integrations' },
  ];

  it('counts progress', () => {
    expect(checklistProgress(items)).toEqual({ done: 2, total: 3 });
  });

  it('shows "N of M" and expands into the step list', () => {
    withWorkspace(<GetStarted items={items} />, null);
    const pill = screen.getByRole('button', { name: /Get started/ });
    expect(pill.textContent).toContain('2 of 3');
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(pill);
    expect(pill.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: /Connect a mailbox/ }).getAttribute('href')).toBe(
      '/acme/integrations',
    );
  });

  it('disappears once every step is done', () => {
    const { container } = withWorkspace(
      <GetStarted items={items.map((i) => ({ ...i, done: true }))} />,
      null,
    );
    expect(container.textContent).toBe('');
  });
});
