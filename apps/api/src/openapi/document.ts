// OpenAPI 3.1 document generated from the shared Zod contracts (03-api §1, ADR-0039).
// Zod 4's built-in JSON Schema output (draft 2020-12, what OpenAPI 3.1 uses): no extra library.
import { ProblemDetailsSchema } from '@lga/contracts';
import { z } from 'zod';
import { API_PREFIX } from '../api-prefix.js';
import { ROUTE_DOCS, type RouteDoc } from './registry.js';
import { type ApiRoute, apiRoutes } from './route-table.js';

type Json = Record<string, unknown>;

const jsonSchema = (schema: z.ZodType, io: 'input' | 'output'): Json => {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
  }) as Json;
  return rest;
};

const CSRF_HEADER = {
  name: 'X-Requested-With',
  in: 'header',
  required: true,
  description: 'CSRF defence: must be `lga-web` on every state-changing request (08 §8).',
  schema: { type: 'string', const: 'lga-web' },
};

function parameters(route: ApiRoute, doc: RouteDoc): Json[] {
  const params: Json[] = [];
  for (const name of route.path.match(/:(\w+)/g) ?? []) {
    const key = name.slice(1);
    params.push({
      name: key,
      in: 'path',
      required: true,
      schema: key.endsWith('Id') ? { type: 'string', format: 'uuid' } : { type: 'string' },
    });
  }
  if (doc.query) {
    const shape = doc.query.shape as Record<string, z.ZodType>;
    for (const [key, field] of Object.entries(shape)) {
      params.push({
        name: key,
        in: 'query',
        required: !field.safeParse(undefined).success,
        schema: jsonSchema(field, 'input'),
      });
    }
  }
  if (route.method !== 'GET') params.push(CSRF_HEADER);
  if (doc.ifMatch) {
    params.push({
      name: 'If-Match',
      in: 'header',
      required: true,
      description: 'The ETag from the last GET, e.g. `W/"7"`. Missing: 428. Stale: 412.',
      schema: { type: 'string' },
    });
  }
  if (route.idempotent) {
    params.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description: 'One key per user intent; reuse it for retries (03-api §6).',
      schema: { type: 'string', maxLength: 200 },
    });
  }
  return params;
}

function successResponse(route: ApiRoute, doc: RouteDoc): [string, Json] {
  if (doc.response === 'redirect') return ['302', { description: 'Redirect' }];
  if (doc.response === 'html') {
    return ['200', { description: 'HTML page', content: { 'text/html': {} } }];
  }
  if (!doc.response)
    return [String(route.status === 201 ? 204 : route.status), { description: 'No content' }];
  const headers =
    doc.ifMatch || route.path === 'workspaces/:workspaceId'
      ? { ETag: { description: 'Row version for If-Match', schema: { type: 'string' } } }
      : undefined;
  return [
    String(route.status),
    {
      description: 'Success',
      ...(headers ? { headers } : {}),
      content: { 'application/json': { schema: jsonSchema(doc.response, 'output') } },
    },
  ];
}

function description(route: ApiRoute): string | undefined {
  const notes: string[] = [];
  if (route.permissions.length) notes.push(`Permission: \`${route.permissions.join('`, `')}\`.`);
  if (route.selfService) notes.push('Permission depends on the target (checked by the service).');
  if (route.recentAuthSeconds !== undefined) {
    notes.push(
      `Needs a password confirmation in the last ${route.recentAuthSeconds / 60} minutes (403 REAUTH_REQUIRED).`,
    );
  }
  if (route.verifiedEmail) notes.push('Needs a verified email address.');
  if (route.allowRestricted)
    notes.push('Allowed while the workspace is read-only or pending deletion.');
  else if (route.tenantGuarded && route.method !== 'GET') {
    notes.push('403 WORKSPACE_RESTRICTED while the workspace is read-only or pending deletion.');
  }
  return notes.length ? notes.join(' ') : undefined;
}

export interface OpenApiOptions {
  /** Shown in `info.version`. */
  release?: string;
}

/** Throws when a route has no RouteDoc, so a new endpoint cannot ship undocumented. */
export function buildOpenApiDocument(options: OpenApiOptions = {}): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const route of apiRoutes()) {
    const doc = ROUTE_DOCS[route.key];
    if (!doc) throw new Error(`OpenAPI: no RouteDoc for "${route.key}" (src/openapi/registry.ts)`);
    const url = `/${doc.unversioned ? '' : `${API_PREFIX}/`}${route.path.replace(/:(\w+)/g, '{$1}')}`;
    const [status, success] = successResponse(route, doc);
    const operation: Json = {
      tags: [doc.tag],
      summary: doc.summary,
      operationId: `${route.method.toLowerCase()}_${route.path.replace(/[/:-]+/g, '_')}`,
      ...(description(route) ? { description: description(route) } : {}),
      security: route.isPublic ? [] : [{ session: [] }],
      parameters: parameters(route, doc),
      ...(doc.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: jsonSchema(doc.body, 'input') } },
            },
          }
        : {}),
      responses: {
        [status]: success,
        default: {
          description: 'Problem details (RFC 9457) with a stable `code`',
          content: {
            'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
          },
        },
      },
    };
    (paths[url] ??= {})[route.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Lead Generation Agent API',
      version: options.release ?? 'dev',
      description:
        'Generated from the shared Zod contracts (@lga/contracts). Non-production only. ' +
        'Authentication is the `__Host-lga_session` cookie; state-changing requests also need ' +
        '`X-Requested-With: lga-web` from the app origin.',
    },
    servers: [{ url: '/' }],
    tags: [
      'Auth',
      'Sign-in providers',
      'Profile',
      'Workspaces',
      'Members',
      'Invitations',
      'Dashboard',
      'System',
    ].map((name) => ({ name })),
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
    components: {
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: '__Host-lga_session' },
      },
      schemas: { Problem: jsonSchema(ProblemDetailsSchema, 'output') },
    },
  };
}
