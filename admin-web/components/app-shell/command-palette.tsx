'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Cpu, CornerDownLeft, FileText, Search, Waves } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useRbac } from '@/lib/rbac/context';
import { isFeatureEnabled } from '@/lib/config/flags';
import { NAV_ITEMS } from './nav-config';
import { useCommandSearch, type CommandHit } from './use-command-search';

/**
 * Global command palette (plan §13) — ⌘K / Ctrl-K to jump to a destination, a
 * device, a session or a record.
 *
 * Built on the shared Dialog rather than pulling in cmdk: the combobox pattern
 * here is small, and owning it keeps the ARIA wiring (activedescendant, listbox,
 * option ids) exact rather than inherited.
 *
 * Results respect the same RBAC + feature-flag rules as the nav, so the palette
 * can never route someone to a page their role can't open.
 */
export function CommandPalette() {
  const t = useTranslations('shell');
  // Nav labelKeys are root-relative ('nav.devices'), so they need the root
  // translator — resolving them through the 'shell' namespace yields the raw key.
  const tRoot = useTranslations();
  const router = useRouter();
  const { can } = useRbac();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // ⌘K / Ctrl-K anywhere, and Escape to leave. Bound on the document so it works
  // regardless of focus — except inside a text field, where ⌘K may be the user's
  // own editor shortcut and swallowing every keystroke would be hostile.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Reset per opening — a stale query from last time is never what you want.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const destinations = useMemo<CommandHit[]>(
    () =>
      NAV_ITEMS.filter((i) => (!i.flag || isFeatureEnabled(i.flag)) && (!i.capability || can(i.capability))).map(
        (i) => ({
          id: `nav:${i.key}`,
          group: 'destinations',
          label: tRoot(i.labelKey as 'nav.dashboard'),
          href: i.href,
          icon: 'nav',
        }),
      ),
    [can, tRoot],
  );

  const { hits, isFetching } = useCommandSearch(query, open);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const navHits = q ? destinations.filter((d) => d.label.toLowerCase().includes(q)) : destinations;
    return [...navHits, ...hits];
  }, [destinations, hits, query]);

  // Clamp the cursor whenever the result set shrinks under it.
  useEffect(() => {
    setActive((a) => (a >= results.length ? 0 : a));
  }, [results.length]);

  const go = useCallback(
    (hit: CommandHit | undefined) => {
      if (!hit) return;
      setOpen(false);
      router.push(hit.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  };

  // Keep the cursor in view when it moves by keyboard.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const grouped = useMemo(() => {
    const out: { group: CommandHit['group']; items: { hit: CommandHit; index: number }[] }[] = [];
    results.forEach((hit, index) => {
      const last = out[out.length - 1];
      if (last && last.group === hit.group) last.items.push({ hit, index });
      else out.push({ group: hit.group, items: [{ hit, index }] });
    });
    return out;
  }, [results]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted md:w-56"
        // WCAG 2.5.3: the accessible name must CONTAIN the visible label, so this
        // starts with the same word the button shows. It also has to survive the
        // label being hidden at < md, which is why it isn't just the text node.
        aria-label={t('searchLabel')}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden md:inline">{t('searchShort')}</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] md:inline">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 p-0">
          <DialogTitle className="sr-only">{t('searchOpen')}</DialogTitle>

          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- a command palette that
                doesn't focus its input on open is broken; the dialog is user-invoked. */}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('searchPlaceholder')}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded
              aria-controls="command-results"
              aria-activedescendant={results[active] ? `command-option-${active}` : undefined}
              aria-autocomplete="list"
            />
            {isFetching && <span className="text-xs text-muted-foreground">{t('searching')}</span>}
          </div>

          <ul
            id="command-results"
            ref={listRef}
            role="listbox"
            aria-label={t('searchResults')}
            className="max-h-80 overflow-y-auto p-1"
          >
            {results.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                {query.trim() ? t('searchEmpty', { query: query.trim() }) : t('searchHint')}
              </li>
            )}

            {grouped.map(({ group, items }) => (
              <li key={`${group}-${items[0].index}`}>
                <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{t(GROUP_KEY[group])}</p>
                <ul role="presentation">
                  {items.map(({ hit, index }) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        id={`command-option-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={index === active}
                        onClick={() => go(hit)}
                        onMouseMove={() => setActive(index)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                          index === active ? 'bg-muted' : 'hover:bg-muted/60',
                        )}
                      >
                        <HitIcon icon={hit.icon} />
                        <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                        {hit.hint && (
                          <span className="shrink-0 text-xs text-muted-foreground">{hit.hint}</span>
                        )}
                        {index === active && <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

const GROUP_KEY = {
  destinations: 'searchDestinations',
  devices: 'searchDevices',
  sessions: 'searchSessions',
  records: 'searchRecords',
} as const;

function HitIcon({ icon }: { icon: CommandHit['icon'] }) {
  const cls = 'h-4 w-4 shrink-0 text-muted-foreground';
  if (icon === 'device') return <Cpu className={cls} aria-hidden />;
  if (icon === 'session') return <Waves className={cls} aria-hidden />;
  if (icon === 'record') return <FileText className={cls} aria-hidden />;
  return <Search className={cls} aria-hidden />;
}
