import 'server-only';
import { type Project, ProjectsSchema } from '@lga/contracts';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { serverApi, wsPath } from './api/server';
import { projectCookieName } from './project-cookie';

/**
 * The workspace's projects and the selected one (cookie, else the first). Cached per request so
 * the layout and the page share one API call.
 */
export const loadProjects = cache(
  async (
    workspaceId: string,
  ): Promise<{ projects: Project[]; project: Project | null; unreadReplies: number }> => {
    const { data, unreadReplies } = await serverApi(
      wsPath(workspaceId, 'projects'),
      ProjectsSchema,
    );
    const chosen = (await cookies()).get(projectCookieName(workspaceId))?.value;
    return {
      projects: data,
      project: data.find((p) => p.id === chosen) ?? data[0] ?? null,
      unreadReplies,
    };
  },
);
