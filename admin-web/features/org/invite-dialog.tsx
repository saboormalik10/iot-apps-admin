'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { inviteUserSchema } from '@/lib/api/schemas';
import { useInviteUser } from './use-users';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { ApiError } from '@/lib/api/errors';
import type { Role } from '@/lib/api/types';

export function InviteDialog() {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invite = useInviteUser();
  const apiToast = useApiToast();

  function reset() {
    setEmail('');
    setRole('viewer');
    setFirstName('');
    setLastName('');
    setErrors({});
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = inviteUserSchema.safeParse({ email, role, firstName, lastName });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) fe[String(issue.path[0])] = issue.message;
      setErrors(fe);
      return;
    }
    setErrors({});
    try {
      await invite.mutateAsync(parsed.data);
      apiToast.success(t('inviteSent', { email }));
      reset();
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ email: 'users.alreadyExists' });
      } else {
        apiToast.error(err);
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4" /> {t('invite')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('inviteTitle')}</DialogTitle>
          <DialogDescription>{t('inviteSubtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField id="invite-email" label={t('colEmail')} errorKey={errors.email}>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="invite-first" label={t('colName')} errorKey={errors.firstName}>
              <Input id="invite-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </FormField>
            <FormField id="invite-last" label={t('colName')} errorKey={errors.lastName}>
              <Input id="invite-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </FormField>
          </div>
          <FormField id="invite-role" label={t('colRole')} errorKey={errors.role}>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">{t('roleViewer')}</SelectItem>
                <SelectItem value="operator">{t('roleOperator')}</SelectItem>
                <SelectItem value="admin">{t('roleAdmin')}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {t('inviteSubmit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
