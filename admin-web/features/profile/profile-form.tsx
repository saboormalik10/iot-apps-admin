'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { FormField } from '@/components/form-field';
import { LoadingState, ErrorState } from '@/components/screen-states';
import { useProfile, useUpdateProfile } from './use-profile';
import { profileSchema } from '@/lib/api/schemas';
import { useApiToast } from '@/lib/hooks/use-api-toast';

export function ProfileForm() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const ta = useTranslations('auth');
  const { data: profile, isLoading, isError, refetch } = useProfile();
  const update = useUpdateProfile();
  const apiToast = useApiToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName ?? '');
      setLastName(profile.lastName ?? '');
    }
  }, [profile]);

  if (isLoading) return <LoadingState />;
  if (isError || !profile) return <ErrorState onRetry={() => refetch()} />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileSchema.safeParse({
      firstName,
      lastName,
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) fe[String(issue.path[0])] = issue.message;
      setErrors(fe);
      return;
    }
    setErrors({});
    const changingPassword = Boolean(newPassword);
    try {
      await update.mutateAsync({
        firstName,
        lastName,
        ...(changingPassword ? { currentPassword, newPassword } : {}),
      });
      apiToast.success(changingPassword ? t('passwordChanged') : t('profileSaved'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      apiToast.error(err);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="firstName" label={t('firstName')} errorKey={errors.firstName}>
          <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </FormField>
        <FormField id="lastName" label={t('lastName')} errorKey={errors.lastName}>
          <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </FormField>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">{t('passwordSection')}</h3>
          <p className="text-xs text-muted-foreground">{t('passwordHint')}</p>
        </div>
        <FormField id="currentPassword" label={ta('currentPassword')} errorKey={errors.currentPassword}>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="newPassword" label={ta('newPassword')} errorKey={errors.newPassword}>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </FormField>
          <FormField id="confirmPassword" label={ta('confirmPassword')} errorKey={errors.confirmPassword}>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </FormField>
        </div>
      </div>

      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? tc('saving') : tc('save')}
      </Button>
    </form>
  );
}
