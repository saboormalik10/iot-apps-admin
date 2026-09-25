'use client';

import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useResetUserPassword } from './use-users';
import { generatePassword } from './generate-password';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import type { OrgUser } from '@/lib/api/types';

/**
 * An administrator sets someone's password.
 *
 * A site PC has no email, so this is what "forgot my password" comes down to. The
 * admin then knows the password, so the user is asked for their own the next time
 * they sign in, and is signed out everywhere now. The password is shown here once
 * — suggested, editable, copyable — and never again.
 */
export function ResetPasswordDialog({ user, onClose }: { user: OrgUser | null; onClose: () => void }) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const reset = useResetUserPassword();
  const apiToast = useApiToast();
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [forUser, setForUser] = useState<string | null>(null);

  // A fresh suggestion each time the dialog opens for someone.
  if (user && forUser !== user.id) {
    setForUser(user.id);
    setPassword(generatePassword());
    setReveal(true);
    setError(undefined);
    setDone(false);
    setCopied(false);
  }

  const name = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '';
  const close = () => {
    setForUser(null);
    onClose();
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (password.length < 8) {
      setError('auth.errors.passwordMin');
      return;
    }
    setError(undefined);
    try {
      await reset.mutateAsync({ id: user.id, password });
      setDone(true);
    } catch (err) {
      apiToast.error(err);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard needs a secure context; on plain-HTTP LAN the field is still selectable.
      setReveal(true);
    }
  }

  return (
    <Dialog
      open={Boolean(user)}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('resetPasswordTitle', { name })}</DialogTitle>
          <DialogDescription>{t('resetPasswordSubtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField id="reset-password" label={t('colPassword')} errorKey={error}>
            <div className="flex gap-2">
              <Input
                id="reset-password"
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error)}
                autoComplete="new-password"
                readOnly={done}
                className="font-mono"
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
              {done ? (
                <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={t('copyPassword')}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setPassword(generatePassword())}
                  aria-label={t('generatePassword')}
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </FormField>

          {done ? (
            <p className="text-sm" role="status">
              {t('resetPasswordDone', { name })}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            {done ? (
              <Button type="button" onClick={close}>
                {tc('close')}
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={close}>
                  {tc('cancel')}
                </Button>
                <Button type="submit" disabled={reset.isPending}>
                  {t('resetPasswordSubmit')}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
