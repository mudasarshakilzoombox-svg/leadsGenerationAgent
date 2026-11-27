// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuthButtons, oauthErrorMessage } from './oauth';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);

describe('OAuthButtons (AUTH-03)', () => {
  it('renders nothing when no provider is enabled', () => {
    const { container } = render(<OAuthButtons providers={[]} mode="login" />);
    expect(container.textContent).toBe('');
  });

  it('links each enabled provider to the API start route, keeping a safe next', () => {
    render(<OAuthButtons providers={['google', 'microsoft']} next="/acme/inbox" mode="login" />);
    const google = screen.getByRole('link', { name: 'Continue with Google' });
    const microsoft = screen.getByRole('link', { name: 'Continue with Microsoft' });
    expect(google.getAttribute('href')).toBe(
      '/api/v1/auth/oauth/google/start?intent=login&next=%2Facme%2Finbox',
    );
    expect(microsoft.getAttribute('href')).toContain('/api/v1/auth/oauth/microsoft/start');
    expect(screen.queryByText(/Terms of Service/)).toBeNull();
  });

  it('shows the terms notice on signup', () => {
    render(<OAuthButtons providers={['google']} mode="signup" />);
    expect(screen.getByText(/Terms of Service/)).toBeTruthy();
  });
});

describe('oauthErrorMessage', () => {
  it('maps known codes and falls back for unknown ones', () => {
    expect(oauthErrorMessage(undefined)).toBeNull();
    expect(oauthErrorMessage('oauth_cancelled')).toBe('Sign-in was cancelled.');
    expect(oauthErrorMessage('<script>')).toBe(oauthErrorMessage('oauth_failed'));
  });
});
