'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { AlertRule, RecipientGroup, User } from '@/lib/api/types';
import {
  listRecipientGroups,
  listRules,
  listUsers,
  removeRecipientGroup,
  saveRecipientGroup,
} from '@/lib/api/endpoints';
import { CHANNELS } from '@/lib/mock/seed/rules';
import { ROLES_BY_ID } from '@/lib/mock/seed/people';
import { LoadingState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/lib/hooks/use-toast';
import { useDataRevision } from '@/lib/use-data';
import { cn } from '@/lib/utils';

/**
 * Who hears about what, and how (client, 9 Nov 2026: "Where do I define these
 * recipients?"). A group is a name, the people in it, and the channels they are
 * told by; alert rules then send to groups. Every change is in the audit trail.
 *
 * SMS stays listed but out of scope — replaced by web push (Rev B §10).
 */

const AVAILABLE = CHANNELS.filter((c) => c.available);
const CHANNEL_LABEL = Object.fromEntries(CHANNELS.map((c) => [c.id, c.label])) as Record<string, string>;

type Editing = { mode: 'add' } | { mode: 'edit'; group: RecipientGroup } | null;

export function RecipientsPage() {
  const revision = useDataRevision();
  const [groups, setGroups] = useState<RecipientGroup[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<RecipientGroup | null>(null);

  useEffect(() => {
    listRecipientGroups().then(setGroups);
    listUsers('mts').then(setUsers);
    listRules().then(setRules);
  }, [revision]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  if (!groups) return <LoadingState label="Loading recipients…" />;

  const usedBy = (g: RecipientGroup) => rules.filter((r) => r.recipients.includes(g.id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A recipient group is a set of people and the channels they are alerted by. Alert rules send to groups — choose them
        under Alert rules → Recipients &amp; channels.
      </p>

      <section className="rounded-lg border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Recipient groups</h2>
          <Button size="sm" onClick={() => setEditing({ mode: 'add' })}>
            <Plus className="h-4 w-4" /> Add group
          </Button>
        </header>
        <div className="scroll-x-hint overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted">
              <tr>
                {['Group', 'Members', 'Purpose', 'Channels', 'Used by', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const names = g.memberIds.map((id) => userById.get(id)?.name).filter(Boolean) as string[];
                const rulesUsing = usedBy(g).length;
                return (
                  <tr key={g.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2 font-medium">{g.label}</td>
                    <td className="px-3 py-2">
                      <span className="tabular font-medium">{g.memberIds.length}</span>
                      <span className="block text-xs text-muted-foreground">
                        {names.slice(0, 3).join(', ')}
                        {names.length > 3 ? ` +${names.length - 3} more` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{g.description || '–'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {g.channels.map((c) => (
                          <span key={c} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary-strong">
                            {CHANNEL_LABEL[c]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {rulesUsing ? `${rulesUsing} rule${rulesUsing === 1 ? '' : 's'}` : 'No rules'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ mode: 'edit', group: g })} aria-label={`Edit ${g.label}`}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-sev-alert-strong hover:text-sev-alert-strong"
                        onClick={() => setRemoving(g)}
                        aria-label={`Remove ${g.label}`}
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!groups.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No recipient groups. Add one so alert rules have someone to send to.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Delivery channels</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <li key={c.id} className={cn('rounded-md border p-3', !c.available && 'border-dashed bg-muted/40 text-muted-foreground')}>
              <p className="text-sm font-medium">
                {c.label}
                {!c.available ? <span className="ml-2 text-xs font-normal">not in scope</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.reason ??
                  (c.id === 'push'
                    ? 'Delivered whether or not the portal is open. On iPhone and iPad the portal must be added to the Home Screen once.'
                    : c.id === 'screen'
                      ? 'Pop-up and unacknowledged badge, with an audible option for control-room use.'
                      : 'Carries the same event link as the on-screen alert.')}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {editing ? (
        <GroupDialog
          group={editing.mode === 'edit' ? editing.group : undefined}
          groups={groups}
          users={users}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.label}?</DialogTitle>
            <DialogDescription>
              {removing && usedBy(removing).length
                ? `${usedBy(removing).length} alert rule${usedBy(removing).length === 1 ? '' : 's'} send${usedBy(removing).length === 1 ? 's' : ''} to this group (${usedBy(removing)
                    .map((r) => r.name)
                    .join(', ')}). They will stop sending to it. Check those rules still reach someone.`
                : 'No alert rule sends to this group.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              className="bg-sev-alert text-white hover:bg-sev-alert/90"
              onClick={async () => {
                const g = removing!;
                await removeRecipientGroup(g.id);
                toast({ variant: 'success', title: `${g.label} removed (simulated)`, description: 'Recorded in the audit trail.' });
                setRemoving(null);
              }}
            >
              Remove group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupDialog({
  group,
  groups,
  users,
  onClose,
}: {
  group?: RecipientGroup;
  groups: RecipientGroup[];
  users: User[];
  onClose: () => void;
}) {
  const [label, setLabel] = useState(group?.label ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [members, setMembers] = useState<string[]>(group?.memberIds ?? []);
  const [channels, setChannels] = useState<RecipientGroup['channels']>(group?.channels ?? ['screen', 'push', 'email']);
  const [q, setQ] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const people = users.filter((u) => u.status !== 'suspended');
  const shown = people.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const clash = groups.some((g) => g.id !== group?.id && g.label.trim().toLowerCase() === label.trim().toLowerCase());
  const errors = {
    label: !label.trim() ? 'Name the group.' : clash ? 'Another group already has this name.' : undefined,
    members: members.length ? undefined : 'Choose at least one person.',
    channels: channels.length ? undefined : 'Choose at least one channel.',
  };
  const invalid = Object.values(errors).some(Boolean);
  const err = (e?: string) => (touched && e ? <span className="mt-1 block text-xs text-sev-alert-strong">{e}</span> : null);
  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? `Edit ${group.label}` : 'Add recipient group'}</DialogTitle>
          <DialogDescription>Who is in the group, and how they are alerted.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Group name</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Night shift controllers" className="h-9" />
            {err(errors.label)}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Purpose (optional)</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who they are and when they act" className="h-9" />
          </label>

          <fieldset>
            <legend className="mb-1 text-xs text-muted-foreground">Channels</legend>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE.map((c) => {
                const on = channels.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(channels, c.id, setChannels)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      on ? 'border-primary bg-primary/10 font-medium text-primary-strong' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            {err(errors.channels)}
          </fieldset>

          <fieldset>
            <legend className="mb-1 flex w-full items-center justify-between text-xs text-muted-foreground">
              <span>Members</span>
              <span className="tabular">{members.length} chosen</span>
            </legend>
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" className="h-8 pl-8 text-sm" aria-label="Find a person" />
            </div>
            <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
              {shown.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/50">
                    <input type="checkbox" className="h-4 w-4" checked={members.includes(u.id)} onChange={() => toggle(members, u.id, setMembers)} />
                    <span className="min-w-0 flex-1">
                      {u.name}
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {u.roles.map((r) => ROLES_BY_ID[r]?.name ?? r).join(', ')}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              {!shown.length ? <li className="px-3 py-3 text-center text-xs text-muted-foreground">No one matches.</li> : null}
            </ul>
            {err(errors.members)}
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setTouched(true);
              if (invalid) return;
              setSaving(true);
              await saveRecipientGroup({ id: group?.id, label: label.trim(), description: description.trim(), memberIds: members, channels });
              toast({
                variant: 'success',
                title: `${label.trim()} ${group ? 'saved' : 'added'} (simulated)`,
                description: `${members.length} member${members.length === 1 ? '' : 's'} · recorded in the audit trail`,
              });
              onClose();
            }}
          >
            {saving ? 'Saving…' : group ? 'Save changes' : 'Add group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
