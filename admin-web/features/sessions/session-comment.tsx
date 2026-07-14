'use client';

import { useState } from 'react';
import { MessageSquare, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/screen-states';
import { useRbac } from '@/lib/rbac/context';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { sessionCommentSchema } from '@/lib/api/schemas';
import { useUpdateSessionComment } from './use-sessions';

/**
 * Session comment (plan §6.1) — the field note attached to the session. Editable
 * by operator/admin (`editContent`); client-bounded to 2000 chars (§10.6). Saving
 * invalidates the session + list + audit.
 */
export function SessionComment({ sessionId, comment }: { sessionId: string; comment: string }) {
  const { can } = useRbac();
  const toast = useApiToast();
  const mutation = useUpdateSessionComment(sessionId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(comment);
  const [error, setError] = useState<string | null>(null);

  const canEdit = can('editContent');

  const save = async () => {
    const parsed = sessionCommentSchema.safeParse({ comment: value });
    if (!parsed.success) {
      setError('Comment is too long (max 2000 characters).');
      return;
    }
    try {
      await mutation.mutateAsync(value.trim());
      toast.success('Comment saved.');
      setEditing(false);
      setError(null);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Comment
        </h3>
        {canEdit && !editing ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              setValue(comment);
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        ) : null}
      </div>

      {mutation.isPending ? (
        <LoadingState label="Saving…" />
      ) : editing ? (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Add a note about this session…"
          />
          {error ? <p className="text-xs text-status-error">{error}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={save}>
              Save
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{comment?.trim() ? comment : 'No comment on this session.'}</p>
      )}
    </Card>
  );
}
