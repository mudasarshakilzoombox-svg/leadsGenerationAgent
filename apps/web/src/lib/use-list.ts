'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api, toQuery } from './api/client';
import { useWorkspace } from './workspace-context';

type Params = Record<string, string | undefined>;

/**
 * A workspace list with filters and "Load more" over the API's signed cursors.
 * Query key: ['ws', workspaceId, resource, params] (01-frontend §5.2). The first page is
 * hydrated from the Server Component when the filters match its defaults.
 */
export function useWorkspaceList<T extends z.ZodType>(
  resource: string,
  item: T,
  params: Params,
  initial?: { data: z.output<T>[]; nextCursor: string | null; params: Params },
) {
  const { base, membership } = useWorkspace();
  const schema = z.object({ data: z.array(item), nextCursor: z.string().nullable() });
  const sameAsInitial =
    initial !== undefined && JSON.stringify(initial.params) === JSON.stringify(params);

  const query = useInfiniteQuery({
    queryKey: ['ws', membership.workspace.id, resource, params],
    queryFn: ({ pageParam }) =>
      api(`${base}/${resource}${toQuery({ ...params, cursor: pageParam })}`, schema),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    ...(sameAsInitial
      ? {
          initialData: {
            pages: [{ data: initial.data, nextCursor: initial.nextCursor }],
            pageParams: [undefined],
          },
        }
      : {}),
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  return { ...query, rows };
}
