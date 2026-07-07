'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { LoadingState, ErrorState } from '@/components/screen-states';
import { useOrg, useUpdateOrg } from './use-org';
import { updateOrgSchema } from '@/lib/api/schemas';
import { useApiToast } from '@/lib/hooks/use-api-toast';

export function OrgSettingsForm() {
  const t = useTranslations('org');
  const tc = useTranslations('common');
  const { data: org, isLoading, isError, refetch } = useOrg();
  const update = useUpdateOrg();
  const apiToast = useApiToast();

  const [form, setForm] = useState({ name: '', contactEmail: '', country: '', timezone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name ?? '',
        contactEmail: org.contactEmail ?? '',
        country: org.country ?? '',
        timezone: org.timezone ?? '',
      });
    }
  }, [org]);

  if (isLoading) return <LoadingState />;
  if (isError || !org) return <ErrorState onRetry={() => refetch()} />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = updateOrgSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) fe[String(issue.path[0])] = issue.message;
      setErrors(fe);
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync(parsed.data);
      apiToast.success(t('settingsSaved'));
    } catch (err) {
      apiToast.error(err);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <FormField id="name" label={t('name')} errorKey={errors.name}>
        <Input id="name" value={form.name} onChange={set('name')} />
      </FormField>
      <FormField id="contactEmail" label={t('contactEmail')} errorKey={errors.contactEmail}>
        <Input id="contactEmail" type="email" value={form.contactEmail} onChange={set('contactEmail')} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="country" label={t('country')} errorKey={errors.country}>
          <Input id="country" value={form.country} onChange={set('country')} />
        </FormField>
        <FormField id="timezone" label={t('timezone')} errorKey={errors.timezone}>
          <Input id="timezone" value={form.timezone} onChange={set('timezone')} />
        </FormField>
      </div>
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? tc('saving') : tc('save')}
      </Button>
    </form>
  );
}
