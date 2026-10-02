'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { ShieldCheck } from 'lucide-react';

/**
 * Cloudflare Turnstile — the "are you human" check before sign-in and before a
 * password-reset email is sent.
 *
 * It stops scripted password guessing and stops anyone using the reset form to
 * flood staff inboxes, without a puzzle for a person: most visitors pass on a
 * tick. In the real build the token it returns is verified on the server
 * (siteverify) before the password is even looked at.
 *
 * The prototype loads the real widget. Without NEXT_PUBLIC_TURNSTILE_SITE_KEY it
 * uses Cloudflare's published always-pass test key, so it works on any domain;
 * if Cloudflare cannot be reached (offline review) it falls back to a labelled
 * stand-in rather than blocking the demo.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TEST_SITE_KEY = '1x00000000000000000000AA';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let tag = document.getElementById('cf-turnstile') as HTMLScriptElement | null;
    if (!tag) {
      tag = document.createElement('script');
      tag.id = 'cf-turnstile';
      tag.src = SCRIPT;
      tag.async = true;
      tag.defer = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener('load', () => resolve());
    tag.addEventListener('error', () => reject(new Error('turnstile unavailable')));
  });
}

export function Turnstile({ action, onVerify }: { action: string; onVerify: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const { resolvedTheme } = useTheme();
  const [offline, setOffline] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => !cancelled && !window.turnstile && setOffline(true), 8000);
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TEST_SITE_KEY,
          action,
          theme: resolvedTheme === 'dark' ? 'dark' : 'light',
          size: 'flexible',
          callback: (token: string) => {
            setVerified(true);
            onVerify(token);
          },
          'expired-callback': () => {
            setVerified(false);
            onVerify(null);
          },
          'error-callback': () => setOffline(true),
        });
      })
      .catch(() => !cancelled && setOffline(true));
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
    // Re-render only when the theme flips; the callbacks are stable enough for a form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, resolvedTheme]);

  return (
    <div className="space-y-1">
      {offline ? (
        <button
          type="button"
          onClick={() => {
            setVerified(true);
            onVerify('offline-demo-token');
          }}
          className="flex h-[65px] w-full items-center gap-3 rounded-md border bg-muted/40 px-3 text-left text-sm"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded border bg-background" aria-hidden>
            {verified ? '✓' : ''}
          </span>
          <span>
            Verify you are human
            <span className="block text-[11px] text-muted-foreground">Cloudflare unreachable — offline stand-in for the review</span>
          </span>
        </button>
      ) : (
        <div ref={box} className="min-h-[65px]" />
      )}
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Protected by Cloudflare Turnstile.{' '}
          {verified ? 'Verified.' : 'The check runs before your password is checked.'}
          {!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? ' (Prototype: Cloudflare’s test key.)' : ''}
        </span>
      </p>
    </div>
  );
}
