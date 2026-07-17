'use client';

import { Download, FileArchive, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Can } from '@/lib/rbac/guard';

export interface ExportOption {
  key: string;
  label: string;
  /** Same-origin BFF href — a plain download link; the session cookie rides along. */
  href: string;
  hint?: string;
  icon?: 'csv' | 'zip';
  disabled?: boolean;
  disabledReason?: string;
}

const ICONS = { csv: FileSpreadsheet, zip: FileArchive } as const;

/**
 * ExportMenu (plan §14) — the one place export downloads are offered, so the
 * affordance reads the same on every surface. Exports are plain links, not fetches:
 * the BFF streams the body and forwards `content-disposition`, so the browser's own
 * download UI handles progress and naming.
 *
 * Gated on `exportData` (viewer and up, §17 #7). A disabled option still renders,
 * with its reason — a menu that silently omits what you're looking for is worse
 * than one that tells you why it can't.
 */
export function ExportMenu({
  options,
  label = 'Export',
  align = 'end',
}: {
  options: ExportOption[];
  label?: string;
  align?: 'start' | 'end';
}) {
  const usable = options.filter((o) => !o.disabled);

  return (
    <Can capability="exportData">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={options.length === 0}>
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-72">
          <DropdownMenuLabel>Download</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((o) => {
            const Icon = ICONS[o.icon ?? 'csv'];
            if (o.disabled) {
              return (
                <DropdownMenuItem key={o.key} disabled className="flex-col items-start gap-0.5">
                  <span className="flex items-center">
                    <Icon className="mr-2 h-4 w-4" aria-hidden />
                    {o.label}
                  </span>
                  {o.disabledReason && (
                    <span className="pl-6 text-xs text-muted-foreground">{o.disabledReason}</span>
                  )}
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem key={o.key} asChild>
                <a href={o.href} download className="flex-col items-start gap-0.5">
                  <span className="flex items-center">
                    <Icon className="mr-2 h-4 w-4" aria-hidden />
                    {o.label}
                  </span>
                  {o.hint && <span className="pl-6 text-xs text-muted-foreground">{o.hint}</span>}
                </a>
              </DropdownMenuItem>
            );
          })}
          {usable.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nothing to export yet.</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Can>
  );
}
