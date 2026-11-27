// OpenAPI drift check (03-api §1, ADR-0039): every route is documented with contract schemas,
// every registry entry matches a real route, and the document is valid enough to serve.
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/openapi/document.js';
import { ROUTE_DOCS } from '../src/openapi/registry.js';
import { apiRoutes } from '../src/openapi/route-table.js';

describe('OpenAPI document', () => {
  const routes = apiRoutes();

  it('documents every route and nothing else', () => {
    const live = routes.map((r) => r.key).sort();
    expect(live.filter((key) => !ROUTE_DOCS[key])).toEqual([]);
    expect(Object.keys(ROUTE_DOCS).filter((key) => !live.includes(key))).toEqual([]);
  });

  it('builds an OpenAPI 3.1 document with security facts from the route table', () => {
    const doc = buildOpenApiDocument() as {
      openapi: string;
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    expect(doc.openapi).toBe('3.1.0');
    const operations = Object.values(doc.paths).flatMap((p) => Object.values(p));
    expect(operations).toHaveLength(routes.length);

    const patch = doc.paths['/api/v1/workspaces/{workspaceId}']!.patch!;
    const names = (patch.parameters as { name: string }[]).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['workspaceId', 'If-Match', 'X-Requested-With']));
    expect(patch.description).toContain('workspace.settings');
    expect(patch.security).toEqual([{ session: [] }]);

    expect(doc.paths['/api/v1/auth/login']!.post!.security).toEqual([]);
    expect(doc.paths['/health/ready']).toBeDefined();
    const invite = doc.paths['/api/v1/workspaces/{workspaceId}/invitations']!.post!;
    expect((invite.parameters as { name: string }[]).map((p) => p.name)).toContain(
      'Idempotency-Key',
    );
  });
});
