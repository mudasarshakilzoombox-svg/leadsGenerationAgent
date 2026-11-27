// The selected project (business profile) per workspace (ADR-0036). A UI preference only: every
// API call re-validates the id inside the tenant, so a tampered cookie can only produce a 404.

export function projectCookieName(workspaceId: string): string {
  return `lga_project_${workspaceId}`;
}

/** Client-side: remember the project for this workspace for a year. */
export function rememberProject(workspaceId: string, projectId: string): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${projectCookieName(workspaceId)}=${encodeURIComponent(projectId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
