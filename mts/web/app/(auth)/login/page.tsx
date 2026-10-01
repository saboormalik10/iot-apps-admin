import Link from 'next/link';
import { AuthShell } from '@/features/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Page() {
  return (
    <AuthShell title="Sign in" subtitle="Every account is named. There are no shared logins.">
      <form className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" defaultValue="s.chen@metrotrains.com.au" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" defaultValue="demo-password" />
        </div>
        <Button className="w-full" asChild>
          <Link href="/mfa">Sign in</Link>
        </Button>
        <p className="flex justify-center gap-4 text-center text-sm">
          <Link href="/forgot-password" className="text-primary hover:underline">
            Forgot your password?
          </Link>
          <Link href="/locked" className="text-muted-foreground hover:underline">
            See the lockout screen
          </Link>
        </p>
        <p className="rounded-md border border-sev-info/40 bg-sev-info-tint p-2 text-center text-xs text-sev-info-strong">
          Sign-in is not implemented in the prototype — continue to see the multi-factor step.
        </p>
      </form>
    </AuthShell>
  );
}
