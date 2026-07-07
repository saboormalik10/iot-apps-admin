import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession, isSessionLive } from '@/lib/session';
import { RbacProvider } from '@/lib/rbac/context';
import { SocketProvider } from '@/lib/realtime/provider';
import { AppShell } from '@/components/app-shell/app-shell';

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

  return (
    <RbacProvider user={session.user}>
      <SocketProvider>
        <AppShell user={session.user}>{children}</AppShell>
      </SocketProvider>
    </RbacProvider>
  );
}
