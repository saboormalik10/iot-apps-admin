'use client';

import { useState } from 'react';
import { FileText, Trash2, ImageOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/data/confirm-dialog';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useRbac } from '@/lib/rbac/context';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import type { SessionFile } from '@/lib/api/types';
import { useSessionFiles, useDeleteSessionFile } from './use-sessions';

const isImage = (mime: string) => mime.startsWith('image/');
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Session file gallery (plan §6) — the session's Cloudinary photos/maps/thumbnails.
 * Images show as thumbnails (CSP allows res.cloudinary.com); other files link out.
 * Delete is gated on `editContent` (operator/admin) with a confirm + toast.
 */
export function SessionFiles({ sessionId }: { sessionId: string }) {
  const { can } = useRbac();
  const toast = useApiToast();
  const { data: files, isLoading } = useSessionFiles(sessionId);
  const del = useDeleteSessionFile(sessionId);
  const [pending, setPending] = useState<SessionFile | null>(null);

  const onDelete = async () => {
    if (!pending) return;
    try {
      await del.mutateAsync(pending._id);
      toast.success('File deleted.');
      setPending(null);
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-medium">Files</h3>
      {isLoading ? (
        <LoadingState label="Loading files…" />
      ) : !files || files.length === 0 ? (
        <EmptyState title="No files" body="Photos and map snapshots captured in the field appear here." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((f) => (
            <div key={f._id} className="group relative overflow-hidden rounded-md border">
              <a href={f.url} target="_blank" rel="noreferrer" className="block">
                {isImage(f.mimeType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.fileType} className="h-28 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
                    <FileText className="h-6 w-6" />
                    <span className="text-xs">{f.mimeType.split('/')[1] ?? 'file'}</span>
                  </div>
                )}
              </a>
              <div className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="capitalize text-muted-foreground">{f.fileType}</span>
                <span className="tabular-nums text-muted-foreground">{kb(f.sizeBytes)}</span>
              </div>
              {can('editContent') ? (
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => setPending(f)}
                  aria-label="Delete file"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pending != null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Delete file?"
        description={
          <span className="flex items-center gap-2">
            <ImageOff className="h-4 w-4" />
            This removes the file from the session and from storage. This can’t be undone.
          </span>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
    </Card>
  );
}
