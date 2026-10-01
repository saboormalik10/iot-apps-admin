import Link from 'next/link';
import { AuthShell } from '@/features/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Page() {
  return (
    <AuthShell title="Two-factor authentication" subtitle="Enter the six-digit code from your authenticator app.">
      <form className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="code">Authentication code</Label>
          <Input id="code" inputMode="numeric" maxLength={6} placeholder="000000" className="tabular text-center text-lg tracking-[0.4em]" />
        </div>
        <Button className="w-full" asChild>
          <Link href="/">Verify and continue</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          MFA is optional and enabled per site by an administrator.
        </p>
      </form>
    </AuthShell>
  );
}
