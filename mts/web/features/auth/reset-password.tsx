'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Check, CheckCircle2, Clock, Eye, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * The page the reset link opens: choose a new password against the policy
 * (§8.4 "enforced password policy"), shown as the person types rather than as a
 * rejection after they submit. Every other session is signed out on success.
 */
export function ResetPassword() {
  const token = useSearchParams().get('token');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);

  if (token === 'expired' || !token) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-3 rounded-md border border-sev-warning/40 bg-sev-warning-tint p-3 text-sev-warning-strong">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>This reset link has expired or has already been used. Links work once, for 30 minutes.</p>
        </div>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-3 rounded-md border border-sev-normal/40 bg-sev-normal-tint p-3 text-sev-normal-strong">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Password changed. Every other session has been signed out and a confirmation sent to your email. If this was not
            you, tell the OCC straight away.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  const rules = [
    { ok: pw.length >= 12, label: 'At least 12 characters' },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), label: 'Upper and lower case' },
    { ok: /\d/.test(pw), label: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(pw), label: 'A symbol' },
    { ok: pw.length > 0 && !/metro|sydney|password/i.test(pw), label: 'Not a common word (password, metro, sydney)' },
  ];
  const score = rules.filter((r) => r.ok).length;
  const matches = pw.length > 0 && pw === again;
  const valid = score === rules.length && matches;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) setDone(true);
      }}
    >
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="pw">New password</Label>
          <button type="button" onClick={() => setShow(!show)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <Input id="pw" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <div className="grid grid-cols-5 gap-1" aria-hidden>
          {rules.map((_, i) => (
            <span
              key={i}
              className={cn('h-1.5 rounded-full', i < score ? (score === rules.length ? 'bg-sev-normal' : score >= 3 ? 'bg-sev-warning' : 'bg-sev-alert') : 'bg-muted')}
            />
          ))}
        </div>
        <ul className="space-y-0.5 text-xs" aria-label="Password rules">
          {rules.map((r) => (
            <li key={r.label} className={cn('flex items-center gap-1.5', r.ok ? 'text-sev-normal-strong' : 'text-muted-foreground')}>
              {r.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
              {r.label}
            </li>
          ))}
          <li className="pl-5 text-muted-foreground">Also checked on save: not one of your last five passwords.</li>
        </ul>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="again">Type it again</Label>
        <Input id="again" type={show ? 'text' : 'password'} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        {again && !matches ? <p className="text-xs text-sev-alert-strong">The two passwords do not match.</p> : null}
      </div>
      <Button type="submit" className="w-full" disabled={!valid}>
        Set new password
      </Button>
      <p className="text-center text-xs">
        <Link href="/reset-password?token=expired" className="text-muted-foreground hover:underline">
          See the expired-link screen
        </Link>
      </p>
    </form>
  );
}
