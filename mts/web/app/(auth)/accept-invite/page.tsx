import Link from 'next/link';
import { AuthShell } from '@/features/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Page() {
  return (
    <AuthShell
      title="Choose your password"
      subtitle="You have been invited to the Sydney Metro M1 weather portal. Choose a password only you know."
    >
      <form className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw2">Confirm password</Label>
          <Input id="pw2" type="password" autoComplete="new-password" />
        </div>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>At least 12 characters</li>
          <li>Not a password you use elsewhere</li>
          <li>The account locks after repeated failed attempts</li>
        </ul>
        <Button className="w-full" asChild>
          <Link href="/">Set password and sign in</Link>
        </Button>
      </form>
    </AuthShell>
  );
}
