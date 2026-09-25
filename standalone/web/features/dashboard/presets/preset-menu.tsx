'use client';

import { useState } from 'react';
import { SlidersHorizontal, Star, Trash2, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { cn } from '@/lib/utils';
import type { DashboardLayout } from '@/lib/api/types';
import { MET_STATION_WIDGETS, ALL_WIDGET_KEYS, keysToTiles, tilesToKeys } from './tile-catalog';
import {
  useDashboardLayouts,
  useCreateLayout,
  useDeleteLayout,
  useSetDefaultLayout,
} from './use-layouts';

/**
 * Saved-views menu for the MET station dashboard (plan §Month 11). Lets a user
 * apply / save / set-default / delete per-device tile presets and toggle which
 * instrument tiles are visible. Backed by the `dashboard-layouts` endpoints.
 */
export function PresetMenu({
  deviceId,
  visibleKeys,
  onChange,
  appliedId,
  onApplied,
}: {
  deviceId: string;
  visibleKeys: string[];
  onChange: (keys: string[]) => void;
  appliedId: string | null;
  onApplied: (id: string | null) => void;
}) {
  const toast = useApiToast();
  const { data: layouts = [] } = useDashboardLayouts(deviceId);
  const create = useCreateLayout();
  const del = useDeleteLayout();
  const setDefault = useSetDefaultLayout();

  const [name, setName] = useState('');
  const visible = new Set(visibleKeys);

  const applyLayout = (l: DashboardLayout) => {
    onChange(tilesToKeys(l.tiles));
    onApplied(l._id);
  };

  const toggle = (key: string) => {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(MET_STATION_WIDGETS.filter((w) => next.has(w.key)).map((w) => w.key));
    onApplied(null); // manual edit → no longer matches a saved view
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (visibleKeys.length === 0) {
      toast.error(new Error('Select at least one tile to save a view'));
      return;
    }
    try {
      const layout = await create.mutateAsync({ deviceId, name: trimmed, tiles: keysToTiles(visibleKeys) });
      onApplied(layout._id);
      setName('');
      toast.success('View saved');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Views
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved views</p>
            {layouts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved views yet for this device.</p>
            ) : (
              <ul className="space-y-0.5">
                {layouts.map((l) => (
                  <li key={l._id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyLayout(l)}
                      className={cn(
                        'flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-accent',
                        appliedId === l._id && 'bg-accent',
                      )}
                    >
                      {l.isDefault ? <Star className="h-3 w-3 fill-status-warn text-status-warn" /> : <span className="w-3" />}
                      <span className="truncate">{l.name}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Set as default"
                      title="Set as default"
                      onClick={() => setDefault.mutate(l._id)}
                    >
                      <Star className={cn('h-3.5 w-3.5', l.isDefault && 'fill-status-warn text-status-warn')} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Delete view"
                      onClick={async () => {
                        try {
                          await del.mutateAsync(l._id);
                          if (appliedId === l._id) onApplied(null);
                        } catch (e) {
                          toast.error(e);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-status-error" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Separator />

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show tiles</p>
              <div className="flex gap-1">
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => { onChange([...ALL_WIDGET_KEYS]); onApplied(null); }}>
                  All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-0.5">
              {MET_STATION_WIDGETS.map((w) => {
                const on = visible.has(w.key);
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => toggle(w.key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-accent',
                      on ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded border', on && 'border-primary bg-primary/10')}>
                      {on ? <Check className="h-2.5 w-2.5" /> : null}
                    </span>
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Save current view as…"
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <Button size="sm" className="h-8 gap-1" onClick={save} disabled={create.isPending || !name.trim()}>
              <Plus className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
