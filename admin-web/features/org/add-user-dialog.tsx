'use client';

import { useState } from 'react';
import { Eye, EyeOff, UserPlus, Wand2 } from 'lucide-react';
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
import { createUserSchema } from '@/lib/api/schemas';
import { useCreateUser } from './use-users';
import { useAssignableRoles } from '@/features/roles/use-roles';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { ApiError } from '@/lib/api/errors';

/**
 * Add a person to this organisation.
 *
 * Replaces the invitation dialog rather than re-enabling it: there is no
 * invitation email in this deployment, so the operator sets the password and
 * passes it on — the same flow a platform admin uses for a new customer's first
 * admin.
 *
 * The role picker is driven by the ROLES LIST, not a hard-coded triple, so a
 * custom role can actually be assigned. That was the gap: roles could be created
 * and edited but never held by anyone, because every path derived the role from a
 * legacy key. Selecting by id also means the server decides which legacy key to
 * mirror, from the role's own `baseRole`.
 */
export function AddUserDialog() {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateUser();
  const apiToast = useApiToast();
  const { data: roles } = useAssignableRoles();

  // Already least-privilege-first from the hook, which also drops anything this
  // user could not grant.
  const options = roles;
  const selected = roleId || options[0]?._id || '';

  function reset() {
    setEmail('');
    setPassword('');
    setReveal(false);
    setFirstName('');
    setLastName('');
    setRoleId('');
    setErrors({});
  }

  function generate() {
    // Shown to the operator to pass on; never round-tripped to the server as a
    // "suggestion", so nothing to leak if the dialog is abandoned.
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    setPassword(Array.from(bytes, (b) => alphabet[b % alphabet.length]).join(''));
    setReveal(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createUserSchema.safeParse({
      email,
      password,
      firstName,
      lastName,
      ...(selected ? { roleId: selected } : {}),
    });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) fe[String(issue.path[0])] = issue.message;
      setErrors(fe);
      return;
    }
    setErrors({});
    try {
      await create.mutateAsync(parsed.data);
      apiToast.success(t('userAdded', { email }));
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
          <UserPlus className="h-4 w-4" /> {t('addUser')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addUserTitle')}</DialogTitle>
          <DialogDescription>{t('addUserSubtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField id="add-email" label={t('colEmail')} errorKey={errors.email}>
            <Input
              id="add-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)}
            />
          </FormField>

          <FormField id="add-password" label={t('colPassword')} errorKey={errors.password}>
            <div className="flex gap-2">
              <Input
                id="add-password"
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(errors.password)}
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? t('hidePassword') : t('showPassword')}
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={generate} aria-label={t('generatePassword')}>
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="add-first" label={t('colFirstName')} errorKey={errors.firstName}>
              <Input id="add-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </FormField>
            <FormField id="add-last" label={t('colLastName')} errorKey={errors.lastName}>
              <Input id="add-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </FormField>
          </div>

          <FormField id="add-role" label={t('colRole')} errorKey={errors.roleId}>
            <Select value={selected} onValueChange={setRoleId}>
              <SelectTrigger id="add-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((r) => (
                  <SelectItem key={r._id} value={r._id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <p className="text-xs text-muted-foreground">{t('addUserPasswordNote')}</p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t('addUserSubmit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
