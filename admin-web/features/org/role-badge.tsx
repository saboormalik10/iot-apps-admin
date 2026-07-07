'use client';

import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { OrgUser, Role } from '@/lib/api/types';

export function RoleLabel({ role }: { role: Role }) {
  const t = useTranslations('users');
  const map: Record<Role, string> = {
    admin: t('roleAdmin'),
    operator: t('roleOperator'),
    viewer: t('roleViewer'),
  };
  return <span>{map[role]}</span>;
}

/** Status badge with icon + label (never colour alone — the a11y rule). */
export function UserStatusBadge({ user }: { user: OrgUser }) {
  const t = useTranslations('users');
  if (user.isActive) {
    return (
      <Badge variant="ok">
        <CheckCircle2 className="h-3 w-3" /> {t('active')}
      </Badge>
    );
  }
  if (user.invitedAt && !user.lastLoginAt) {
    return (
      <Badge variant="warn">
        <Clock className="h-3 w-3" /> {t('pending')}
      </Badge>
    );
  }
  return (
    <Badge variant="offline">
      <XCircle className="h-3 w-3" /> {t('inactive')}
    </Badge>
  );
}
