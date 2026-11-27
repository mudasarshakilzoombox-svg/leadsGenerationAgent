// @vitest-environment jsdom
import { TooltipProvider } from '@lga/ui/components/misc';
import type { MembershipSummary, UserSummary } from '@lga/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UseFormSetError } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { Can, WorkspaceProvider } from '@/lib/workspace-context';
import { type Column, DataTable, StatusBadge } from './data';
import { applyApiError } from './forms';
import { ComingSoon, EmptyState, ErrorPanel } from './states';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

afterEach(cleanup);

const wrap = (ui: ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe('state components', () => {
  it('EmptyState explains the value and offers one action', () => {
    wrap(
      <EmptyState
        icon={Inbox}
        title="No replies yet"
        description="Replies appear here within 5 minutes."
        action={<button type="button">Connect</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No replies yet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
  });

  it('ComingSoon is visibly disabled, focusable, inert, and says when it arrives', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    wrap(
      <form onSubmit={onSubmit as never}>
        <ComingSoon phase={3} label="Launch" />
      </form>,
    );
    const button = screen.getByRole('button', { name: /Launch/ });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.textContent).toContain('(Coming in Phase 3)');
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ErrorPanel shows a reference and retries', () => {
    const retry = vi.fn();
    wrap(<ErrorPanel requestId="req-42" onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain('Reference: req-42');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('DataTable', () => {
  type Row = { id: string; name: string; status: string };
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', mobile: 'title', cell: (r) => r.name },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      cell: (r) => <StatusBadge status={r.status} />,
    },
    { key: 'hidden', header: 'Detail', priority: 3, cell: () => 'detail' },
  ];
  const rows = [
    { id: '1', name: 'Ada', status: 'ACTIVE' },
    { id: '2', name: 'Alan', status: 'PAUSED' },
  ];

  it('renders a desktop table and mobile cards from the same columns', () => {
    wrap(
      <DataTable columns={columns} rows={rows} caption="People" href={(r) => `/people/${r.id}`} />,
    );
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(table.querySelector('th:nth-child(3)')!.className).toContain('lg:table-cell');
    const cards = screen.getByRole('list', { name: 'People' });
    expect(cards.querySelectorAll('a[href="/people/2"]')).toHaveLength(1);
    expect(screen.getAllByText('Paused')).toHaveLength(2);
  });
});

describe('permissions', () => {
  const user: UserSummary = {
    id: 'u',
    email: 'a@b.test',
    name: 'A',
    emailVerified: true,
    isPlatformAdmin: false,
    locale: null,
    timezone: null,
  };
  const membership = (permissions: string[]): MembershipSummary => ({
    membershipId: 'm',
    roleKey: 'READ_ONLY',
    permissions,
    workspace: { id: 'w', name: 'W', slug: 'w', status: 'ACTIVE', planKey: 'trial' },
  });

  it('<Can> renders only with the permission, otherwise the fallback', () => {
    render(
      <WorkspaceProvider user={user} membership={membership(['analytics.view'])} memberships={[]}>
        <Can permission="members.manage" fallback={<span>no access</span>}>
          <button type="button">Invite</button>
        </Can>
        <Can permission="analytics.view">
          <span>charts</span>
        </Can>
      </WorkspaceProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
    expect(screen.getByText('no access')).toBeTruthy();
    expect(screen.getByText('charts')).toBeTruthy();
  });
});

describe('applyApiError', () => {
  it('maps field pointers onto the form and toasts the rest', () => {
    const setError = vi.fn() as unknown as UseFormSetError<{ email: string }>;
    const fieldError = new ApiError(400, 'VALIDATION_FAILED', 'Invalid', [
      { pointer: '/email', code: 'invalid', message: 'Enter a valid email address.' },
    ]);
    expect(applyApiError(fieldError, setError, ['email'])).toBe(true);
    expect(setError).toHaveBeenCalledWith('email', {
      type: 'server',
      message: 'Enter a valid email address.',
    });

    toastError.mockClear();
    expect(
      applyApiError(
        new ApiError(403, 'PERMISSION_DENIED', 'Your role does not allow this action.'),
        setError,
        ['email'],
      ),
    ).toBe(false);
    expect(toastError).toHaveBeenCalledWith('Your role does not allow this action.');
  });
});
