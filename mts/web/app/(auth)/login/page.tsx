import { Suspense } from 'react';
import { AuthShell } from '@/features/auth/auth-shell';
import { LoginForm } from '@/features/auth/login-form';

export default function Page() {
  return (
    <AuthShell title="Sign in" subtitle="Every account is named. There are no shared logins.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
