'use client';

import { useEffect, useState } from 'react';
import { FileText, Folder, FolderCheck } from 'lucide-react';
import type { Telemetry } from '@/lib/api/types';
import { telemetryFor } from '@/lib/api/endpoints';
import { STATIONS } from '@/lib/mock/seed/stations';

/**
 * Where the stations' data files land on the server, as the client laid it out
 * (3 Oct 2026):
 *
 *   SERVER:/MTS/Sydney/Site-1/            ← new files, not yet read
 *   SERVER:/MTS/Sydney/Site-1/Processed/  ← files already read
 *
 * Moving a file into Processed/ once it has been read keeps the site folder to
 * the files still waiting, so listing it stays fast. Files are moved, never
 * deleted: the original record is always kept. "Site-N" becomes the station's
 * name once MTS confirms it.
 */
export function IngestFolders({ minuteKey }: { minuteKey: number }) {
  const [tel, setTel] = useState<Record<string, Telemetry[]> | null>(null);
  useEffect(() => {
    Promise.all(STATIONS.map((s) => telemetryFor(s.id).then((t) => [s.id, t] as const))).then((all) => setTel(Object.fromEntries(all)));
  }, [minuteKey]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Folder className="h-4 w-4 text-muted-foreground" aria-hidden /> Incoming data folders
        </h2>
        <p className="text-xs text-muted-foreground">
          Each station uploads its files to its own folder. Once read, a file is moved into that folder&apos;s{' '}
          <code className="rounded bg-muted px-1">Processed/</code> subfolder, so the site folder only ever holds files still
          waiting and stays quick to list. Files are moved, never deleted.
        </p>
      </header>

      <div className="scroll-x-hint overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {['Folder', 'Station', 'Logger', 'Waiting', 'Moved to Processed/ today'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATIONS.map((s) => {
              const rows = tel?.[s.id] ?? [];
              const today = rows.reduce((n, t) => n + t.messagesToday, 0);
              const waiting = rows.reduce((n, t) => n + t.bufferedReadings, 0);
              return (
                <tr key={s.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    <span className="flex items-center gap-1.5">
                      <Folder className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      /MTS/Sydney/Site-{s.ordinal}/
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 pl-5 text-muted-foreground">
                      <FolderCheck className="h-3.5 w-3.5" aria-hidden />
                      Processed/
                    </span>
                  </td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-xs">{s.loggers.map((l) => l.id).join(', ')}</td>
                  <td className="tabular px-3 py-2">{tel ? waiting : '–'}</td>
                  <td className="tabular px-3 py-2">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {tel ? today.toLocaleString('en-AU') : '–'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
        <li>
          <strong className="text-foreground">To confirm with MTS:</strong> &quot;Site-N&quot; is replaced by the station&apos;s name; and
          whether Lady Game Drive&apos;s two tunnel loggers share Site-6 or get a folder each.
        </li>
        <li>Delivery is by SFTP to a fixed public IP; the server and address are being arranged for testing.</li>
      </ul>
    </section>
  );
}
