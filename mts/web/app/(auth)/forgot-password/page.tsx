import { AuthShell } from '@/features/auth/auth-shell';
import { ForgotPassword } from '@/features/auth/forgot-password';

export default function Page() {
  return (
    <AuthShell title="Reset your password" subtitle="We will email you a link to choose a new one.">
      <ForgotPassword />
    </AuthShell>
  );
}
