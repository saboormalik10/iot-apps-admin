import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession, isSessionLive } from '@/lib/session';
import { RbacProvider } from '@/lib/rbac/context';
import { SocketProvider } from '@/lib/realtime/provider';
import { AppShell } from '@/components/app-shell/app-shell';
import { RealtimeCatchup } from '@/components/app-shell/realtime-catchup';

/**
 * Authoritative auth gate (the middleware only did a fast cookie-presence check).
 * Seeds the RBAC context from the session user and mounts the shared socket only
 * inside the authenticated shell.
 */
export default async function DashLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!isSessionLive(session) || !session.user) {
    redirect('/login');
  }
  // An administrator set this password, so they know it: the user chooses their
  // own before anything else.
  if (session.user.mustChangePassword) {
    redirect('/change-password');
  }

  return (
    <RbacProvider user={session.user}>
      <SocketProvider>
        <RealtimeCatchup />
        <AppShell user={session.user}>{children}</AppShell>
      </SocketProvider>
    </RbacProvider>
  );
}
