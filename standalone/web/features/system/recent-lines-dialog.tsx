'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getRecentStreamLines } from '@/lib/api/endpoints';
import type { RecentStreamLine } from '@/lib/api/types';

/**
 * The last 100 lines the sensor sent, and what became of each — what a
 * technician sends support when readings do not arrive (client, 9 Oct 2026: his
 * sensor spoke NMEA, and only the last line was visible). Offered as a text file:
 * the clipboard API needs https, and a site PC is reached over plain http.
 */

export function recentLinesText(rows: readonly RecentStreamLine[]): string {
  return rows.map((r) => `${r.at}  ${r.line}    [${r.outcome}]`).join('\r\n') + '\r\n';
}

export function RecentLinesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useQuery({
    queryKey: ['stream', 'recent-lines'],
    queryFn: ({ signal }) => getRecentStreamLines(signal),
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const rows = q.data ?? [];
  const text = recentLinesText(rows);

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sensor-lines-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recent lines from the sensor</DialogTitle>
          <DialogDescription>
            The last {rows.length || 100} lines received, oldest first, with what became of each. Download them to send
            to support.
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has arrived from the sensor since the service started.</p>
        ) : (
          <textarea
            readOnly
            aria-label="Recent lines"
            value={text}
            className="h-80 w-full resize-none rounded-md border bg-muted p-2 font-mono text-xs leading-5"
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </Button>
          <Button onClick={download} disabled={rows.length === 0}>
            <Download className="h-4 w-4" aria-hidden /> Download as text file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
