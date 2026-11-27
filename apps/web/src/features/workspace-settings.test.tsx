// @vitest-environment jsdom
// Settings → Workspace (PRD WS-06, WS-07): editable cards with If-Match, conflict prompt,
// permission-limited view, typed delete confirmation and the pending-deletion banner.
import type { MembershipSummary, WorkspaceDetail } from '@lga/contracts';
import { TooltipProvider } from '@lga/ui/components/misc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Full settings forms render slowly under jsdom.
vi.setConfig({ testTimeout: 30_000 });
import { PendingDeletionBanner } from '@/components/shell/pending-deletion-banner';
import { TypedConfirmDialog } from '@/components/states';
import { WorkspaceProvider } from '@/lib/workspace-context';
import { WorkspaceSettings } from './workspace-settings';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => '/acme/settings',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OWNER_PERMS = ['workspace.delete', 'workspace.settings', 'analytics.view'];

const detail = (over: Partial<WorkspaceDetail> = {}): WorkspaceDetail => ({
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Acme',
  slug: 'acme',
  status: 'TRIALING',
  planKey: 'trial',
  trialEndsAt: null,
  defaultTimezone: 'UTC',
  createdAt: '2026-11-01T00:00:00.000Z',
  legalName: null,
  physicalAddress: null,
  privacyNoticeUrl: null,
  defaultSendWindow: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  launchRequiresApproval: true,
  launchReadiness: { ready: false, missing: ['physicalAddress', 'privacyNoticeUrl'] },
  rowVersion: 4,
  deletionRequestedAt: null,
  purgeAfter: null,
  roleKey: 'OWNER',
  permissions: OWNER_PERMS,
  ...over,
});

function withWorkspace(ui: ReactNode, membership: Partial<MembershipSummary> = {}) {
  const m: MembershipSummary = {
    membershipId: 'm',
    roleKey: 'OWNER',
    permissions: OWNER_PERMS,
    workspace: { id: 'w1', name: 'Acme', slug: 'acme', status: 'TRIALING', planKey: 'trial' },
    ...membership,
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
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
            hasPassword: true,
          }}
          membership={m}
          memberships={[m]}
          projects={[]}
          project={null}
          unreadReplies={0}
        >
          {ui}
        </WorkspaceProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
    },
  });

describe('WorkspaceSettings (WS-06)', () => {
  it('shows what is missing before launch and saves a card with If-Match', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        200,
        detail({ legalName: 'Acme Ltd', privacyNoticeUrl: 'https://acme.test/p', rowVersion: 5 }),
      ),
    );
    withWorkspace(<WorkspaceSettings initial={detail()} />);
    expect(screen.getByText(/Postal address and Privacy-notice link/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Legal company name'), {
      target: { value: 'Acme Ltd' },
    });
    fireEvent.change(screen.getByLabelText('Privacy-notice link'), {
      target: { value: 'https://acme.test/p' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save company' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/workspaces/00000000-0000-7000-8000-000000000001');
    expect(init?.method).toBe('PATCH');
    expect((init?.headers as Record<string, string>)['if-match']).toBe('W/"4"');
    expect(JSON.parse(init?.body as string)).toEqual({
      legalName: 'Acme Ltd',
      privacyNoticeUrl: 'https://acme.test/p',
    });
  });

  it('validates the address and the sending window before calling the API', async () => {
    withWorkspace(<WorkspaceSettings initial={detail()} />);
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '1 Road' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }));
    expect(await screen.findByText('Enter the city.')).toBeTruthy();
    expect(screen.getByText(/two-letter code/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save defaults' }));
    expect(await screen.findByText('End after start.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a reload prompt when someone else saved first (412)', async () => {
    fetchMock.mockResolvedValueOnce(
      json(412, {
        type: 'about:blank',
        title: 'Precondition failed',
        status: 412,
        code: 'PRECONDITION_FAILED',
        detail: 'Stale',
      }),
    );
    withWorkspace(<WorkspaceSettings initial={detail()} />);
    fireEvent.change(screen.getByLabelText('Legal company name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save company' }));
    expect(await screen.findByText(/Someone else changed these settings/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reload/ })).toBeTruthy();
    // Editing is paused until the page is reloaded.
    expect(screen.queryByRole('button', { name: 'Save company' })).toBeNull();
  });

  it('is read-only without workspace.settings and hides the danger zone from non-Owners', () => {
    withWorkspace(
      <WorkspaceSettings
        initial={detail({ roleKey: 'MEMBER', permissions: ['analytics.view'] })}
      />,
    );
    expect(screen.getByText(/Only Owners and Admins can change workspace settings/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
    expect(screen.queryByText('Danger zone')).toBeNull();
  });

  it('shows the saved values in read-only mode too', () => {
    withWorkspace(
      <WorkspaceSettings
        initial={detail({
          roleKey: 'MEMBER',
          permissions: ['analytics.view'],
          legalName: 'Acme Ltd',
          physicalAddress: { line1: '1 Road', city: 'Leeds', country: 'GB' },
        })}
      />,
    );
    expect((screen.getByLabelText('Legal company name') as HTMLInputElement).value).toBe(
      'Acme Ltd',
    );
    expect((screen.getByLabelText('City') as HTMLInputElement).value).toBe('Leeds');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('09:00');
  });
});

describe('TypedConfirmDialog (PRD §9.1)', () => {
  it('focuses Cancel and enables the action only for the exact name', () => {
    const onConfirm = vi.fn();
    render(
      <TypedConfirmDialog
        open
        onOpenChange={() => {}}
        title="Delete Acme?"
        consequence="Everything goes."
        confirmText="Acme"
        confirmLabel="Delete workspace"
        onConfirm={onConfirm}
      />,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    const action = screen.getByRole('button', { name: 'Delete workspace' });
    expect(action.hasAttribute('disabled')).toBe(true);
    const input = screen.getByLabelText(/to confirm/);
    fireEvent.change(input, { target: { value: 'acme' } });
    expect(action.hasAttribute('disabled')).toBe(true);
    fireEvent.change(input, { target: { value: 'Acme' } });
    expect(action.hasAttribute('disabled')).toBe(false);
    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledWith('Acme');
  });
});

describe('PendingDeletionBanner (WS-07)', () => {
  const pending = {
    workspace: {
      id: 'w1',
      name: 'Acme',
      slug: 'acme',
      status: 'PENDING_DELETION',
      planKey: 'trial',
      purgeAfter: '2026-12-27T10:00:00.000Z',
    },
  };

  it('renders nothing for a normal workspace', () => {
    const { container } = withWorkspace(<PendingDeletionBanner />);
    expect(container.textContent).toBe('');
  });

  it('offers the Owner a restore button', async () => {
    fetchMock.mockResolvedValueOnce(json(200, detail({ rowVersion: 6 })));
    withWorkspace(<PendingDeletionBanner />, pending);
    expect(screen.getByText(/permanently deleted on Dec 27, 2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore workspace' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/workspaces/w1/restore');
  });

  it('tells other members to ask the Owner', () => {
    withWorkspace(<PendingDeletionBanner />, { ...pending, roleKey: 'MEMBER', permissions: [] });
    expect(screen.getByText(/Ask the Owner to restore it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore workspace' })).toBeNull();
  });
});
