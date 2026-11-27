'use client';

import Script from 'next/script';
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

/** Token sent when no site key is configured. The API's fake verifier accepts it (fake mode only). */
export const DEV_TURNSTILE_TOKEN = 'dev-turnstile-token';

/**
 * Cloudflare Turnstile (bot check on signup and after failed logins, 08-authentication §4.1).
 * Without a site key (local development) it renders nothing and reports the dev token.
 */
export function Turnstile({
  siteKey,
  nonce,
  onToken,
}: {
  siteKey: string | undefined;
  nonce: string | undefined;
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) onToken(DEV_TURNSTILE_TOKEN);
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        nonce={nonce}
        onReady={() => {
          if (ref.current && window.turnstile && !widget.current) {
            widget.current = window.turnstile.render(ref.current, {
              sitekey: siteKey,
              callback: onToken,
              'expired-callback': () => onToken(''),
            });
          }
        }}
      />
      <div ref={ref} className="min-h-[65px]" />
    </>
  );
}
