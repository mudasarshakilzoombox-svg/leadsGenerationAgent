import '@lga/ui/globals.css';
import { APP_NAME } from '@lga/shared';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// Every page renders per request: the CSP nonce must be applied to Next's inline scripts,
// and tenant data must never be cached (01-frontend §4).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'AI lead generation and outreach.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
