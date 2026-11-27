'use client';

import { ErrorPanel } from '@/components/states';

/** Page/data error: replaces the content, keeps navigation usable (PRD §9.1). */
export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel
      title="This page could not be loaded"
      message="Something went wrong while loading this page. Try again, and contact support if it keeps happening."
      requestId={error.digest}
      onRetry={retry}
    />
  );
}
