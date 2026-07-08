'use client';

import type { ReactNode } from 'react';
import { Table2, LineChart as LineIcon, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * ChartFrame — the shared chrome every chart wears (plan §14): a title, the
 * table-view toggle (DoD requires every chart to have a table view), and a
 * CSV/PNG export menu. Keeps chart bodies focused on the visualization.
 */
export function ChartFrame({
  title,
  unit,
  children,
  tableView,
  onToggleTableView,
  onExportCsv,
  onExportPng,
  actions,
}: {
  title?: string;
  unit?: string;
  children: ReactNode;
  tableView?: boolean;
  onToggleTableView?: () => void;
  onExportCsv?: () => void;
  onExportPng?: () => void;
  actions?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      {(title || onToggleTableView || onExportCsv) && (
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            {title}
            {unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">({unit})</span> : null}
          </h3>
          <div className="flex items-center gap-1">
            {actions}
            {onToggleTableView ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onToggleTableView}
                aria-pressed={tableView}
                aria-label={tableView ? 'Show chart' : 'Show table'}
                title={tableView ? 'Show chart' : 'Show table'}
              >
                {tableView ? <LineIcon className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
              </Button>
            ) : null}
            {onExportCsv || onExportPng ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Export chart">
                    <Download className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onExportCsv ? <DropdownMenuItem onClick={onExportCsv}>Export CSV</DropdownMenuItem> : null}
                  {onExportPng ? <DropdownMenuItem onClick={onExportPng}>Export PNG</DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      )}
      {children}
    </Card>
  );
}
