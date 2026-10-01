'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, History, RotateCcw, ShieldCheck } from 'lucide-react';
import type { RuleVersion } from '@/lib/api/types';
import { listRuleVersions, restoreRuleVersion } from '@/lib/api/endpoints';
import { Button } from '@/components/ui/button';
import { fmtDateTime } from '@/lib/format';
import { toast } from '@/lib/hooks/use-toast';
import { useDataRevision } from '@/lib/use-data';
import { cn } from '@/lib/utils';

/**
 * The rule set's version history (§7.3: "validated, version-controlled and
 * recorded against the user who made them").
 *
 * Each version says what changed in the drawer's own words — field, old value,
 * new value — because "S. Chen edited a rule" answers nothing at a post-incident
 * review, and "Wind — gust (alert): ≥ 80 → ≥ 85 km/h" answers the question
 * before it is asked. A restore republishes the old table as a new version, so
 * history only ever grows.
 */
export function RuleHistory() {
  const revision = useDataRevision();
  const [versions, setVersions] = useState<RuleVersion[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    listRuleVersions().then(setVersions);
  }, [revision]);

  if (!versions) return null;
  const current = versions[0]?.version;
  const shown = showAll ? versions : versions.slice(0, 4);

  return (
    <section className="rounded-lg border bg-card" aria-labelledby="rule-history">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 id="rule-history" className="flex items-center gap-1.5 text-sm font-semibold">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden /> Version history
        </h2>
        <span className="text-xs text-muted-foreground">
          {versions.length} versions · current v{current}
        </span>
      </header>

      <ol className="divide-y">
        {shown.map((v) => {
          const expanded = open === v.version;
          const at = typeof v.at === 'number' ? v.at : 0;
          return (
            <li key={v.version} className="px-4 py-2.5">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <span
                  className={cn(
                    'tabular mt-0.5 inline-flex h-5 min-w-[2.25rem] items-center justify-center rounded px-1.5 text-[11px] font-semibold',
                    v.version === current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  v{v.version}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{v.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.by} · <span className="tabular">{fmtDateTime(at)}</span>
                    {v.version === current ? ' · current' : ''}
                    {v.session ? ' · this session (simulated)' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : v.version)}
                    aria-expanded={expanded}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {v.changes.length} change{v.changes.length === 1 ? '' : 's'}
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
                  </button>
                  {v.version !== current ? (
                    confirm === v.version ? (
                      <span className="flex items-center gap-1">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={async () => {
                            await restoreRuleVersion(v.version);
                            setConfirm(null);
                            toast({
                              variant: 'success',
                              title: `v${v.version} restored as v${(current ?? 0) + 1} (simulated)`,
                              description: 'Published as a new version — nothing in the history was overwritten.',
                            });
                          }}
                        >
                          Restore as v{(current ?? 0) + 1}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirm(null)}>
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirm(v.version)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                        aria-label={`Restore version ${v.version}`}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore
                      </button>
                    )
                  ) : null}
                </div>
              </div>

              {expanded ? (
                <div className="mt-2 overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        {['Rule', 'Field', 'Was', 'Now'].map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {v.changes.map((c, i) => (
                        <tr key={i} className="border-t align-top">
                          <td className="whitespace-nowrap px-2 py-1.5 font-medium">{c.rule}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{c.field}</td>
                          <td className="px-2 py-1.5 text-muted-foreground line-through decoration-muted-foreground/50">{c.from}</td>
                          <td className="px-2 py-1.5">{c.to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {versions.length > 4 ? (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="w-full border-t px-4 py-2 text-left text-xs font-medium text-primary-strong hover:bg-muted/40"
        >
          {showAll ? 'Show recent only' : `Show all ${versions.length} versions`}
        </button>
      ) : null}

      <footer className="flex gap-2 border-t bg-muted/30 px-4 py-2.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          Rule edits are configuration: validated, versioned and live across the network on save, with no software change
          (§7.3). Changes to the portal itself, and non-like-for-like equipment changes, go to MTS&apos;s Change Control
          Board under the Principal&apos;s Configuration Management Plan (§13).
        </p>
      </footer>
    </section>
  );
}
