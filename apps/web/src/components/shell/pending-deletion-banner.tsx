'use client';

import { WorkspaceDetailSchema } from '@lga/contracts';
import { Button } from '@lga/ui/components/button';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { applyApiError } from '@/components/forms';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace-context';

/**
 * PRD WS-07: while a workspace waits for deletion, everyone sees when it goes and the Owner can
 * restore it. Writes are blocked by the API meanwhile (WORKSPACE_RESTRICTED).
 */
export function PendingDeletionBanner() {
  const { membership } = useWorkspace();
  const router = useRouter();
  const restore = useMutation({
    mutationFn: () =>
      api(`/workspaces/${membership.workspace.id}/restore`, WorkspaceDetailSchema, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Workspace restored.');
      router.refresh();
    },
    onError: (error) => applyApiError(error),
  });

  if (membership.workspace.status !== 'PENDING_DELETION') return null;
  const isOwner = membership.permissions.includes('workspace.delete');
  const when = formatDate(membership.workspace.purgeAfter ?? null);
  return (
    <div
      role="status"
      className="flex flex-col gap-3 border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10"
    >
      <p className="flex items-start gap-2">
        <Trash2 className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <span>
          <span className="font-medium">This workspace will be permanently deleted on {when}.</span>{' '}
          <span className="text-muted-foreground">
            Sending has stopped and changes are paused.{' '}
            {isOwner ? 'You can restore it until then.' : 'Ask the Owner to restore it.'}
          </span>
        </span>
      </p>
      {isOwner && (
        <Button
          variant="outline"
          className="h-11 shrink-0 sm:h-9"
          onClick={() => restore.mutate()}
          disabled={restore.isPending}
        >
          {restore.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Restore workspace
        </Button>
      )}
    </div>
  );
}
