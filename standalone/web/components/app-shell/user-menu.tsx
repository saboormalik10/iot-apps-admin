'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authApi } from '@/features/auth/auth-client';
import type { SessionUser } from '@/lib/api/types';

export function UserMenu({ user }: { user: SessionUser }) {
  const t = useTranslations('shell');
  const ta = useTranslations('auth');
  const router = useRouter();

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || user.email[0]?.toUpperCase();

  async function onLogout() {
    try {
      await authApi.logout();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/**
         * The name LEADS with the initials (M24 W2). The avatar's initials are
         * visible text, and WCAG 2.5.3 requires the accessible name to contain
         * what is visibly shown — `aria-hidden` does not help, because the rule
         * exists for speech-input users, who say what they see. "User menu" alone
         * failed on every route, since this button lives in the shell.
         */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${initials} — ${t('userMenu')}`}
          className="rounded-full"
        >
          <Avatar aria-hidden>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {user.firstName} {user.lastName}
            </span>
            <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <UserIcon className="h-4 w-4" /> {t('profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="h-4 w-4" /> {ta('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
