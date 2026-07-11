'use client';

import { useMemo } from 'react';
import { Cpu, Waves } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState, EmptyState, TableSkeleton } from '@/components/screen-states';
import { UserStatusBadge } from '@/features/org/role-badge';
import { formatRelative } from '@/lib/time';
import type { DeviceType, MobileUser } from '@/lib/api/types';
import { useMobileUsers } from './use-mobile-users';

/**
 * Mobile users of ONE app family (MET-LINK or NEP-LINK) with their upload
 * activity and the devices they touched. A user belongs to a tab if they signed
 * up from that app (mobileAppType) or have uploaded that family's data — someone
 * who uses both apps appears in both tabs. Admins are excluded (they live in the
 * Admins tab, even if they've synced test data).
 */
export function MobileUsersTable({ type }: { type: DeviceType }) {
  const t = useTranslations('mobileUsers');
  const { data = [], isLoading, isError, refetch } = useMobileUsers();

  const rows = useMemo(
    () =>
      data
        .filter((u) => u.role !== 'admin')
        .filter((u) =>
          type === 'MET-LINK'
            ? u.mobileAppType === 'MET-LINK' || u.metRecordCount > 0
            : u.mobileAppType === 'NEP-LINK' || u.nepSessionCount > 0,
        ),
    [data, type],
  );

  if (isLoading) return <TableSkeleton rows={5} cols={8} />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (rows.length === 0) return <EmptyState title={t('empty')} body={t('emptyBody')} />;

  const uploads = (u: MobileUser) =>
    type === 'MET-LINK'
      ? `${u.metRecordCount} ${t('records')}`
      : `${u.nepSessionCount} ${t('sessions')}`;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {type === 'MET-LINK' ? t('metSubtitle') : t('nepSubtitle')}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colName')}</TableHead>
            <TableHead>{t('colEmail')}</TableHead>
            <TableHead>{t('colStatus')}</TableHead>
            <TableHead>{t('colSignedUp')}</TableHead>
            <TableHead>{t('colLastLogin')}</TableHead>
            <TableHead>{t('colUploads')}</TableHead>
            <TableHead>{t('colLastUpload')}</TableHead>
            <TableHead>{t('colDevices')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{`${u.firstName} ${u.lastName}`.trim() || t('none')}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <UserStatusBadge user={{ isActive: u.isActive, invitedAt: null, lastLoginAt: u.lastLoginAt }} />
              </TableCell>
              <TableCell>{formatRelative(u.createdAt)}</TableCell>
              <TableCell>{u.lastLoginAt ? formatRelative(u.lastLoginAt) : t('never')}</TableCell>
              <TableCell>{uploads(u)}</TableCell>
              <TableCell>{u.lastUploadAt ? formatRelative(u.lastUploadAt) : t('never')}</TableCell>
              <TableCell>
                {u.devices.length === 0 ? (
                  t('none')
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {u.devices.map((d) => (
                      <Badge key={d.id} variant="outline" className="gap-1 font-normal">
                        {d.type === 'MET-LINK' ? <Cpu className="h-3 w-3" /> : <Waves className="h-3 w-3" />}
                        {d.name}
                      </Badge>
                    ))}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
