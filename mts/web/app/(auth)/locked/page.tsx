import Link from 'next/link';
import { Lock } from 'lucide-react';
import { AuthShell } from '@/features/auth/auth-shell';
import { Button } from '@/components/ui/button';

/**
 * §8.4: "enforced password policy and account lockout". What a person sees after
 * too many failed attempts — when they can try again, and who can unlock them
 * sooner — rather than a bare "access denied".
 */
export default function Page() {
  return (
    <AuthShell title="Account temporarily locked" subtitle="Too many unsuccessful sign-in attempts.">
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3 rounded-md border border-sev-warning/40 bg-sev-warning-tint p-3 text-sev-warning-strong">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            After three failed attempts the account is locked for <strong>15 minutes</strong>. You can try again after
            that, or ask an administrator to unlock it now.
          </p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>The lockout and every failed attempt are recorded in the audit trail.</li>
          <li>If it was not you, tell an administrator — they can reset your password and review the attempts.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="flex-1">
            <Link href="/forgot-password">Reset my password</Link>
          </Button>
          <Button asChild className="flex-1">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
