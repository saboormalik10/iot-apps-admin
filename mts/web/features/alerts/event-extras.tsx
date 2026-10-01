'use client';

import { CheckCircle2, MinusCircle, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Annotation, EventDelivery } from '@/lib/api/types';
import { addAnnotation, getDelivery, listAnnotations } from '@/lib/api/endpoints';
import { Button } from '@/components/ui/button';
import { useDataRevision } from '@/lib/use-data';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const CHANNEL: Record<string, string> = { screen: 'On screen', push: 'Web push', email: 'Email', sms: 'SMS' };

/**
 * How this alert reached people. §7.1 sets the time limit and §8.2 says
 * delivery is confirmed and retried on failure — both are only worth promising
 * if someone can check them afterwards, per channel, which is what this is.
 */
export function DeliveryRecord({ eventId }: { eventId: string }) {
  const [d, setD] = useState<EventDelivery | null>(null);
  useEffect(() => {
    getDelivery(eventId).then((x) => setD(x ?? null));
  }, [eventId]);
  if (!d) return <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />;
  const limit = d.slaMinutes * 60;

  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Delivery</h2>
        <p className="text-xs text-muted-foreground">
          Obligation: every recipient within {d.slaMinutes} minutes (§7.1). Delivery is confirmed per channel and retried on failure (§8.2).
        </p>
      </header>
      <div className="scroll-x-hint overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {['Channel', 'Recipients', 'Delivered', 'Took', 'Attempts', 'Result'].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.attempts.map((a) => {
              const secs = a.deliveredAt ? (a.deliveredAt - a.queuedAt) / 1000 : null;
              const Icon = a.state === 'not-in-scope' ? MinusCircle : a.state === 'retried' ? RotateCw : CheckCircle2;
              return (
                <tr key={a.channel} className="border-t align-top">
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{CHANNEL[a.channel]}</td>
                  <td className="tabular px-4 py-2">{a.state === 'not-in-scope' ? '–' : a.recipients}</td>
                  <td className="tabular whitespace-nowrap px-4 py-2 text-muted-foreground">{a.deliveredAt ? fmtTime(a.deliveredAt) : '–'}</td>
                  <td className="tabular whitespace-nowrap px-4 py-2">
                    {secs === null ? '–' : secs < 90 ? `${Math.round(secs)} s` : `${(secs / 60).toFixed(1)} min`}
                  </td>
                  <td className="tabular px-4 py-2">{a.attempts || '–'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium',
                        a.state === 'not-in-scope' ? 'text-muted-foreground' : secs !== null && secs <= limit ? 'text-sev-normal-strong' : 'text-sev-alert-strong',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {a.state === 'not-in-scope' ? 'Not a channel' : a.state === 'retried' ? 'Delivered on retry' : 'Delivered in time'}
                    </span>
                    {a.note ? <p className="mt-0.5 text-[11px] text-muted-foreground">{a.note}</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Notes on the event. §8.1 asks that users can "interrogate, annotate and
 * acknowledge" alerts; the note is what turns "acknowledged 14:25" into what
 * was actually done about it, for the post-incident review.
 */
export function Annotations({ eventId }: { eventId: string }) {
  const revision = useDataRevision();
  const [notes, setNotes] = useState<Annotation[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listAnnotations(eventId).then(setNotes);
  }, [eventId, revision]);

  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Notes</h2>
        <p className="text-xs text-muted-foreground">What was done, by whom. Kept with the event and in the audit trail.</p>
      </header>
      <ol className="divide-y">
        {notes === null ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">Loading…</li>
        ) : notes.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">No notes yet.</li>
        ) : (
          notes.map((n) => (
            <li key={n.id} className="px-4 py-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{n.by}</span> · <span className="tabular">{fmtDateTime(n.at)}</span>
              </p>
              <p className="mt-0.5 text-sm">{n.text}</p>
            </li>
          ))
        )}
      </ol>
      <form
        className="flex flex-col gap-2 border-t p-3 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setBusy(true);
          await addAnnotation(eventId, draft.trim());
          setDraft('');
          setBusy(false);
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Add a note</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="e.g. Patrol confirmed standing water at 10.4 km; line remains blocked."
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
        </label>
        <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
          {busy ? 'Saving…' : 'Add note'}
        </Button>
      </form>
    </section>
  );
}
