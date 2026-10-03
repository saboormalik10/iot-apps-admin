'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { BUCKET_SIZES, type BucketMm, type Instrument, type InstrumentKind, type LocationId } from '@/lib/api/types';
import { INSTRUMENT_CATALOG, addInstrument, listInstruments, updateInstrument } from '@/lib/api/endpoints';
import { LoadingState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDemoClock } from '@/lib/demo-clock';
import { useActing, useDataRevision } from '@/lib/use-data';
import { RightNotice } from '@/components/admin/right-notice';
import { fmtDate } from '@/lib/format';
import { toast } from '@/lib/hooks/use-toast';
import { STATIONS, STATIONS_BY_ID } from '@/lib/mock/seed/stations';
import { cn } from '@/lib/utils';

/**
 * The sensor register — every instrument on the line, managed here.
 *
 * The station pages show what is fitted; this is where that list is kept. MTS can
 * add a sensor (it starts in Commissioning, so no reading from it can raise an
 * alert until someone puts it in service), record a like-for-like replacement
 * with its new serial and certificate, correct details, and decommission a
 * device — kept in the list for its history, never deleted.
 */

const KINDS = Object.keys(INSTRUMENT_CATALOG) as InstrumentKind[];
type Dlg = { mode: 'add' } | { mode: 'edit' | 'replace' | 'decommission'; item: Instrument } | null;

export function SensorsPage() {
  const now = useDemoClock();
  const revision = useDataRevision();
  const { can } = useActing();
  const [items, setItems] = useState<Instrument[] | null>(null);
  const [loc, setLoc] = useState<LocationId | 'all'>('all');
  const [kind, setKind] = useState<InstrumentKind | 'all'>('all');
  const [status, setStatus] = useState<Instrument['status'] | 'all'>('all');
  const [q, setQ] = useState('');
  const [dlg, setDlg] = useState<Dlg>(null);

  const load = useCallback(() => {
    listInstruments().then(setItems);
  }, []);
  useEffect(load, [load, revision]);

  const shown = useMemo(
    () =>
      (items ?? []).filter(
        (i) =>
          (loc === 'all' || i.locationId === loc) &&
          (kind === 'all' || i.kind === kind) &&
          (status === 'all' || i.status === status) &&
          (!q || `${i.sensorId} ${i.serial} ${i.model}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [items, loc, kind, status, q],
  );

  if (!items || !now) return <LoadingState label="Loading the sensor register…" />;

  const count = (s: Instrument['status']) => items.filter((i) => i.status === s).length;
  const dueSoon = items.filter((i) => i.status !== 'decommissioned' && i.calibrationDueAt !== undefined && i.calibrationDueAt - now < 45 * 86_400_000).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every instrument on the line, one row per device. Add a sensor, record a like-for-like replacement, or decommission
        one — each change is recorded in the audit trail, and the station pages read from this list.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="In service" value={count('in-service')} />
        <Tile label="Commissioning" value={count('commissioning')} tone={count('commissioning') ? 'info' : undefined} />
        <Tile label="Calibration due ≤ 45 days" value={dueSoon} tone={dueSoon ? 'warning' : undefined} />
        <Tile label="Decommissioned (kept)" value={count('decommissioned')} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {can('addSensors') ? (
          <Button size="sm" onClick={() => setDlg({ mode: 'add' })}>
            <Plus className="h-4 w-4" /> Add sensor
          </Button>
        ) : null}
        <select value={loc} onChange={(e) => setLoc(e.target.value as LocationId | 'all')} aria-label="Location" className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="all">All locations</option>
          {STATIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.ordinal}. {s.name}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as InstrumentKind | 'all')} aria-label="Instrument" className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="all">All instruments</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {INSTRUMENT_CATALOG[k].label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {(['all', 'in-service', 'commissioning', 'decommissioned'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={cn('rounded-full px-3 py-1 text-xs font-medium capitalize', status === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}
            >
              {s.replace('-', ' ')}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:ml-auto sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sensor ID or serial…" aria-label="Search sensors" className="h-9 w-full pl-8 sm:w-56" />
        </div>
      </div>

      {!can('addSensors') ? <RightNotice right="addSensors" /> : null}

      <section className="min-w-0 rounded-lg border bg-card">
        {/* phone: one card per instrument */}
        <ul className="divide-y md:hidden">
          {shown.map((i) => (
            <li key={i.sensorId} className={cn('space-y-1.5 px-4 py-3', i.status === 'decommissioned' && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="tabular font-medium">{i.sensorId}</p>
                  <p className="text-xs text-muted-foreground">
                    {INSTRUMENT_CATALOG[i.kind].label}
                    {i.bucketMm ? ` (${i.bucketMm} mm bucket)` : ''} · {i.locationName} · {i.loggerId} {i.terminal}
                  </p>
                </div>
                <StatusChip status={i.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                Serial {i.serial} · calibration due {i.calibrationDueAt ? fmtDate(i.calibrationDueAt) : '—'}
              </p>
              <Actions item={i} onPick={setDlg} />
            </li>
          ))}
        </ul>
        <div className="scroll-x-hint hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-header text-header-foreground">
              <tr>
                {['Sensor', 'Instrument', 'Location · logger', 'Terminal', 'Serial', 'Installed', 'Calibration due', 'Status', ''].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const due = i.calibrationDueAt;
                const late = due !== undefined && due < now;
                const soon = due !== undefined && !late && due - now < 45 * 86_400_000;
                return (
                  <tr key={i.sensorId} className={cn('border-b last:border-0 hover:bg-muted/40', i.status === 'decommissioned' && 'text-muted-foreground')}>
                    <td className="tabular whitespace-nowrap px-3 py-2 font-medium">{i.sensorId}</td>
                    <td className="px-3 py-2">
                      <p>{INSTRUMENT_CATALOG[i.kind].label}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.model}
                        {i.bucketMm ? ` · ${i.bucketMm} mm bucket` : ''}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`/stations/${i.locationId}/installation`} className="hover:text-primary hover:underline">
                        {i.locationName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{i.loggerId}</span>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2 text-xs">{i.terminal}</td>
                    <td className="tabular whitespace-nowrap px-3 py-2 text-xs">{i.serial}</td>
                    <td className="tabular whitespace-nowrap px-3 py-2 text-xs">{fmtDate(i.installedAt)}</td>
                    <td className={cn('tabular whitespace-nowrap px-3 py-2 text-xs', late && 'font-semibold text-sev-alert-strong', soon && 'font-semibold text-sev-warning-strong')}>
                      {due ? fmtDate(due) : '—'}
                      {late ? ' · overdue' : soon ? ' · due soon' : ''}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={i.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Actions item={i} onPick={setDlg} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>
            Like-for-like replacement is maintenance; a new kind of instrument at a location is a non-like-for-like change for
            the CCB (§13).
          </span>
          <span>
            {shown.length} of {items.length} instruments
          </span>
        </footer>
      </section>

      {dlg?.mode === 'add' ? <AddDialog items={items} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg.mode !== 'add' ? <ChangeDialog mode={dlg.mode} item={dlg.item} onClose={() => setDlg(null)} /> : null}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'info' | 'warning' }) {
  return (
    <div className={cn('rounded-lg border-l-4 bg-card p-3 ring-1 ring-border', tone === 'warning' ? 'border-l-sev-warning' : tone === 'info' ? 'border-l-sev-info' : 'border-l-sev-normal')}>
      <p className="tabular text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusChip({ status }: { status: Instrument['status'] }) {
  const s = {
    'in-service': ['In service', 'bg-sev-normal-tint text-sev-normal-strong', 'bg-sev-normal'],
    commissioning: ['Commissioning', 'bg-sev-info-tint text-sev-info-strong', 'bg-sev-info'],
    decommissioned: ['Decommissioned', 'bg-muted text-muted-foreground', 'bg-sev-offline'],
  }[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', s[1])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s[2])} aria-hidden />
      {s[0]}
    </span>
  );
}

function Actions({ item, onPick }: { item: Instrument; onPick: (d: Dlg) => void }) {
  const { can } = useActing();
  if (item.status === 'decommissioned') return <span className="text-xs text-muted-foreground">Kept for history</span>;
  // The sensors right covers changing them too, not only adding (Super User grants it).
  if (!can('addSensors')) return <span className="text-xs text-muted-foreground">View only</span>;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {item.status === 'commissioning' ? (
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            updateInstrument(item.sensorId, { status: 'in-service' }, 'Sensor put in service', 'commissioning checks complete; readings now feed the alert engine').then(() =>
              toast({ variant: 'success', title: `${item.sensorId} in service (simulated)` }),
            )
          }
        >
          Put in service
        </Button>
      ) : null}
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPick({ mode: 'edit', item })}>
        Edit
      </Button>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPick({ mode: 'replace', item })}>
        Replace
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs text-sev-alert-strong" onClick={() => onPick({ mode: 'decommission', item })}>
        Decommission
      </Button>
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-sev-alert-strong">{error}</span> : null}
    </label>
  );
}

const sel = 'h-9 w-full rounded-md border bg-background px-2 text-sm';

/**
 * A rain gauge's bucket size: the rain per tip. The logger counts tips; the
 * rainfall is tips × this, so it must match the gauge as fitted.
 */
function BucketField({ value, onChange }: { value: BucketMm; onChange: (v: BucketMm) => void }) {
  return (
    <Field label="Bucket size (rain per tip)" hint="Must match the gauge as fitted — every tip is counted as this much rain.">
      <select className={sel} value={value} onChange={(e) => onChange(Number(e.target.value) as BucketMm)}>
        {BUCKET_SIZES.map((b) => (
          <option key={b} value={b}>
            {b.toFixed(1)} mm{b === 0.2 ? ' (RIMCO 7499 standard)' : ''}
          </option>
        ))}
      </select>
    </Field>
  );
}

function AddDialog({ items, onClose }: { items: Instrument[]; onClose: () => void }) {
  const [locationId, setLocationId] = useState<LocationId>('canterbury');
  const station = STATIONS_BY_ID[locationId];
  const [loggerId, setLoggerId] = useState(station.loggers[0].id);
  const [kind, setKind] = useState<InstrumentKind>('rain');
  const prefix = loggerId.replace(/-\d+$/, '-');
  const suggested = useMemo(() => {
    const code = INSTRUMENT_CATALOG[kind].code;
    for (let n = 1; n < 20; n++) {
      const id = `${prefix}${code}-${String(n).padStart(2, '0')}`;
      if (!items.some((i) => i.sensorId === id)) return id;
    }
    return `${prefix}${code}-XX`;
  }, [items, prefix, kind]);
  const [sensorId, setSensorId] = useState('');
  const [serial, setSerial] = useState('');
  const [bucket, setBucket] = useState<BucketMm>(0.2);
  const [mounting, setMounting] = useState('');
  const [certificate, setCertificate] = useState('');
  const [calDue, setCalDue] = useState('');
  const [touched, setTouched] = useState(false);

  const id = sensorId.trim() || suggested;
  const live = items.filter((i) => i.status !== 'decommissioned');
  const terminalTaken = live.find((i) => i.loggerId === loggerId && i.kind === kind);
  const newKindHere = !live.some((i) => i.locationId === locationId && i.kind === kind);
  const errors = {
    sensorId: items.some((i) => i.sensorId === id) ? 'That sensor ID is already in the register.' : undefined,
    serial: serial.trim() ? undefined : 'Enter the serial number from the instrument.',
    terminal: terminalTaken
      ? `${loggerId} already has ${terminalTaken.sensorId} on ${terminalTaken.terminal}. Replace it, or decommission it first.`
      : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a sensor</DialogTitle>
          <DialogDescription>It starts in Commissioning — its readings feed no alerts until it is put in service.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Location">
            <select
              className={sel}
              value={locationId}
              onChange={(e) => {
                const l = e.target.value as LocationId;
                setLocationId(l);
                setLoggerId(STATIONS_BY_ID[l].loggers[0].id);
              }}
            >
              {STATIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ordinal}. {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Logger">
            <select className={sel} value={loggerId} onChange={(e) => setLoggerId(e.target.value)}>
              {station.loggers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id} — {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Instrument" error={touched ? errors.terminal : undefined} hint={`${INSTRUMENT_CATALOG[kind].model}`}>
            <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as InstrumentKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {INSTRUMENT_CATALOG[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sensor ID" error={touched ? errors.sensorId : undefined} hint="Suggested from the logger and instrument — edit if your naming differs.">
            <Input value={sensorId} placeholder={suggested} onChange={(e) => setSensorId(e.target.value.toUpperCase())} className="tabular h-9" />
          </Field>
          <Field label="Serial number" error={touched ? errors.serial : undefined}>
            <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="tabular h-9" />
          </Field>
          {kind === 'rain' ? <BucketField value={bucket} onChange={setBucket} /> : null}
          <Field label="Mounting">
            <Input value={mounting} placeholder={INSTRUMENT_CATALOG[kind].mounting} onChange={(e) => setMounting(e.target.value)} className="h-9" />
          </Field>
          <Field label="Calibration certificate">
            <Input value={certificate} placeholder="CAL-2026-…" onChange={(e) => setCertificate(e.target.value)} className="tabular h-9" />
          </Field>
          <Field label="Calibration due">
            <Input type="date" value={calDue} onChange={(e) => setCalDue(e.target.value)} className="h-9" />
          </Field>
        </div>
        <p
          className={cn(
            'rounded-md border p-2 text-xs',
            newKindHere ? 'border-sev-warning/50 bg-sev-warning-tint text-sev-warning-strong' : 'bg-muted/40 text-muted-foreground',
          )}
        >
          {newKindHere
            ? `A ${INSTRUMENT_CATALOG[kind].label.toLowerCase()} is new at ${station.name}: a non-like-for-like change, submitted to the CCB before installation (§13).`
            : `Another ${INSTRUMENT_CATALOG[kind].label.toLowerCase()} of a kind already at ${station.name}.`}{' '}
          Wired to {loggerId} on the terminal the §4.3 schedule assigns.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setTouched(true);
              if (invalid) return;
              await addInstrument({
                sensorId: id,
                locationId,
                loggerId,
                kind,
                serial: serial.trim(),
                bucketMm: kind === 'rain' ? bucket : undefined,
                mounting: mounting.trim() || INSTRUMENT_CATALOG[kind].mounting,
                certificate: certificate.trim() || undefined,
                calibrationDueAt: calDue ? new Date(`${calDue}T00:00:00`).getTime() : undefined,
              });
              toast({ variant: 'success', title: `${id} added (simulated)`, description: `${station.name} · Commissioning · recorded in the audit trail` });
              onClose();
            }}
          >
            Add sensor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeDialog({ mode, item, onClose }: { mode: 'edit' | 'replace' | 'decommission'; item: Instrument; onClose: () => void }) {
  const now = useDemoClock();
  const [serial, setSerial] = useState(mode === 'edit' ? item.serial : '');
  const [bucket, setBucket] = useState<BucketMm>(item.bucketMm ?? 0.2);
  const [mounting, setMounting] = useState(item.mounting);
  const [certificate, setCertificate] = useState(mode === 'edit' ? item.certificate ?? '' : '');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const title = { edit: `Edit ${item.sensorId}`, replace: `Replace ${item.sensorId} (like-for-like)`, decommission: `Decommission ${item.sensorId}` }[mode];
  const error =
    mode === 'decommission'
      ? reason.trim()
        ? undefined
        : 'Say why — it is kept with the record.'
      : serial.trim()
        ? mode === 'replace' && serial.trim() === item.serial
          ? 'A replacement has a new serial number.'
          : undefined
        : 'Enter the serial number.';

  const save = async () => {
    setTouched(true);
    if (error) return;
    if (mode === 'edit') {
      const bucketNote = item.kind === 'rain' && bucket !== item.bucketMm ? `; bucket ${item.bucketMm} → ${bucket} mm` : '';
      await updateInstrument(
        item.sensorId,
        { serial: serial.trim(), mounting, certificate: certificate || undefined, ...(item.kind === 'rain' ? { bucketMm: bucket } : {}) },
        'Sensor details edited',
        `serial, mounting or certificate corrected${bucketNote}`,
      );
    } else if (mode === 'replace') {
      await updateInstrument(
        item.sensorId,
        { serial: serial.trim(), certificate: certificate || undefined, status: 'commissioning', installedAt: now, ...(item.kind === 'rain' ? { bucketMm: bucket } : {}) },
        'Sensor replaced (like-for-like)',
        `${item.serial} → ${serial.trim()}; same sensor ID and terminal, maintenance not CCB. Commissioning.`,
      );
    } else {
      await updateInstrument(item.sensorId, { status: 'decommissioned', note: reason.trim() }, 'Sensor decommissioned', reason.trim());
    }
    toast({ variant: 'success', title: `${title} — done (simulated)`, description: 'Recorded in the audit trail.' });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {INSTRUMENT_CATALOG[item.kind].label} at {item.locationName} · {item.loggerId} {item.terminal}
          </DialogDescription>
        </DialogHeader>
        {mode === 'decommission' ? (
          <Field label="Reason" error={touched ? error : undefined} hint="The device stays in the register as decommissioned; its history and readings are kept.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Removed — location no longer monitored for rain" className="h-9" />
          </Field>
        ) : (
          <div className="space-y-3">
            <Field label={mode === 'replace' ? 'New serial number' : 'Serial number'} error={touched ? error : undefined}>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="tabular h-9" />
            </Field>
            {item.kind === 'rain' ? <BucketField value={bucket} onChange={setBucket} /> : null}
            {mode === 'edit' ? (
              <Field label="Mounting">
                <Input value={mounting} onChange={(e) => setMounting(e.target.value)} className="h-9" />
              </Field>
            ) : null}
            <Field label={mode === 'replace' ? 'Certificate for the new unit' : 'Calibration certificate'}>
              <Input value={certificate} onChange={(e) => setCertificate(e.target.value)} className="tabular h-9" />
            </Field>
            {mode === 'replace' ? (
              <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                Same sensor ID and terminal, so its history continues unbroken. It goes back to Commissioning until checked.
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={mode === 'decommission' ? 'destructive' : 'default'} onClick={save}>
            {mode === 'decommission' ? 'Decommission' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
