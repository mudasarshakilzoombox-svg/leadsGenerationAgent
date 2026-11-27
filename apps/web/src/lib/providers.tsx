'use client';

import { TooltipProvider } from '@lga/ui/components/misc';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from './api/errors';

/** Query defaults from 01-frontend §5: staleTime 30 s, GET retried twice but never on 4xx. */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
  });
}

export function Providers({
  children,
  nonce,
}: {
  children: ReactNode;
  nonce?: string | undefined;
}) {
  const [client] = useState(makeQueryClient);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <QueryClientProvider client={client}>
        <TooltipProvider>
          {children}
          {/* aria-live toasts, auto-dismiss 4 s (PRD §9.1). */}
          <Toaster position="top-right" duration={4000} richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
