import { Suspense } from 'react';
import { AuthShell } from '@/features/auth/auth-shell';
import { ResetPassword } from '@/features/auth/reset-password';

export default function Page() {
  return (
    <AuthShell title="Choose a new password" subtitle="This link works once and expires 30 minutes after it was sent.">
      <Suspense>
        <ResetPassword />
      </Suspense>
    </AuthShell>
  );
}
