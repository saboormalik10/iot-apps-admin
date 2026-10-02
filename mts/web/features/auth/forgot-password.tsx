'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Turnstile } from '@/components/auth/turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Self-service password reset. Nobody at MTS manages forgotten passwords: the
 * person asks for a link, the link comes to the address on their account, and
 * they choose a new password. Administrators never see or set one.
 *
 * The response is the same whether or not the address has an account, so the
 * form cannot be used to find out who works there; the Cloudflare check stops it
 * being used to flood inboxes.
 */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [human, setHuman] = useState(false);
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!wait) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  const masked = email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}${'•'.repeat(Math.min(6, b.length))}${c}`) || 'your address';

  if (sent) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-3 rounded-md border border-sev-normal/40 bg-sev-normal-tint p-3 text-sev-normal-strong">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            If an account exists for <strong>{masked}</strong>, a reset link is on its way. It works once and expires in
            30 minutes.
          </p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Check spam if it has not arrived in a few minutes.</li>
          <li>Your current password keeps working until you choose a new one.</li>
          <li>The request is recorded in the audit trail.</li>
        </ul>
        <Button variant="outline" className="w-full" disabled={wait > 0} onClick={() => setWait(60)}>
          {wait > 0 ? `Send again in ${wait} s` : 'Send the link again'}
        </Button>

        {/* The prototype sends nothing — this shows what would arrive. */}
        <button type="button" onClick={() => setPreview(!preview)} aria-expanded={preview} className="w-full text-center text-xs text-primary hover:underline">
          {preview ? 'Hide' : 'Show'} the email (demo)
        </button>
        {preview ? (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <p className="text-muted-foreground">From: Weather Monitoring Portal &lt;no-reply@portal&gt;</p>
            <p className="mb-2 text-muted-foreground">Subject: Reset your password</p>
            <p>Someone asked to reset the password for your Sydney Metro M1 weather portal account.</p>
            <Button asChild size="sm" className="my-2">
              <Link href="/reset-password?token=demo">Choose a new password</Link>
            </Button>
            <p className="text-muted-foreground">
              The link works once and expires in 30 minutes. If you did not ask for this, ignore this email — your password
              has not changed.
            </p>
          </div>
        ) : null}
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!human || !email.includes('@')) return;
        setSent(true);
        setWait(60);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@metrotrains.com.au" />
      </div>
      <Turnstile action="password_reset" onVerify={(t) => setHuman(Boolean(t))} />
      <Button type="submit" className="w-full" disabled={!human}>
        Send the reset link
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        No administrator is involved — the link goes to the email address on your account.
      </p>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
