'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createCustomer } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import type { CreatedCustomer } from '@/lib/api/types';

/**
 * Create a customer and its first administrator.
 *
 * No email invitation — the platform administrator sets the password and hands
 * it over, which is what the client asked for. The account is usable
 * immediately, so there is no pending-invite state to get stuck in.
 */
export function CreateCustomerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useApiToast();

  const [name, setName] = useState('');
  const [uploadFolder, setUploadFolder] = useState('');
  const [timezone, setTimezone] = useState('Australia/Sydney');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CreatedCustomer | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setUploadFolder('');
    setTimezone('Australia/Sydney');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setError(null);
    setDone(null);
    setCopied(false);
  }, [open]);

  const create = useMutation({
    mutationFn: createCustomer,
    onSuccess: (customer) => {
      qc.invalidateQueries({ queryKey: queryKeys.platformOverview });
      qc.invalidateQueries({ queryKey: queryKeys.organizations });
      setDone(customer);
      toast.success(`${customer.name} created`);
    },
  });

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Give the customer a name.');
    if (!firstName.trim() || !lastName.trim()) return setError("Enter the administrator's first and last name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid administrator email.');
    if (password.length < 8) return setError('The password must be at least 8 characters.');

    try {
      await create.mutateAsync({
        name: name.trim(),
        timezone,
        uploadFolder: uploadFolder.trim() || undefined,
        admin: { email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the customer.');
    }
  }

  const copyCredentials = async () => {
    if (!done) return;
    await navigator.clipboard
      .writeText(`${done.name}\nSign in: ${done.admin.email}\nPassword: ${password}\nUpload folder: ${done.uploadFolder}`)
      .then(() => setCopied(true))
      .catch(() => setError('Could not copy — select the details manually.'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{done ? `${done.name} created` : 'New customer'}</DialogTitle>
          <DialogDescription>
            {done
              ? 'Hand these details over now — the password is not stored anywhere and cannot be shown again.'
              : 'Creates the organisation, its upload folder, and an administrator who can sign in straight away.'}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <dl className="grid gap-2 rounded-md border p-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Sign in</dt>
                <dd className="truncate font-mono text-xs">{done.admin.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Password</dt>
                <dd className="truncate font-mono text-xs">{password}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Upload folder</dt>
                <dd className="truncate font-mono text-xs">{done.uploadFolder}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Station files go in <span className="font-mono">{done.uploadFolder}/&lt;Tower&gt;/</span> on the SFTP
              server.
            </p>
            <Button variant="outline" size="sm" className="gap-1" onClick={copyCredentials}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy details'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="c-name">Customer name</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Marine Services" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="c-folder">Upload folder</Label>
                <Input
                  id="c-folder"
                  value={uploadFolder}
                  onChange={(e) => setUploadFolder(e.target.value)}
                  placeholder={name.trim() || 'Acme Marine'}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-tz">Time zone</Label>
                <Input id="c-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="mb-3 text-sm font-medium">First administrator</p>
              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="c-first">First name</Label>
                    <Input id="c-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="c-last">Last name</Label>
                    <Input id="c-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="c-email">Email</Label>
                  <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="c-pw">Password</Label>
                  <Input
                    id="c-pw"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                  {/* Shown in plain text deliberately: whoever types it has to
                      read it back to the customer, and masking it here only
                      invites a typo nobody can see. */}
                  <p className="text-xs text-muted-foreground">Shown so you can pass it on. It is not stored.</p>
                </div>
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-status-error">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create customer'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
