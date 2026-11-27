// Guards the tenancy invariants of schema.prisma so new tables cannot silently skip isolation.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_SCOPES, type ModelName, modelScope } from './tenant-models.js';

interface Field {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  attributes: string;
}
interface Model {
  name: string;
  fields: Field[];
  blockAttributes: string[];
}

function parseSchema(source: string): Model[] {
  return [...source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => {
    const fields: Field[] = [];
    const blockAttributes: string[] = [];
    for (const raw of body!.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      if (line.startsWith('@@')) {
        blockAttributes.push(line);
        continue;
      }
      const match = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (match) {
        fields.push({
          name: match[1]!,
          type: match[2]!,
          list: Boolean(match[3]),
          optional: Boolean(match[4]),
          attributes: match[5] ?? '',
        });
      }
    }
    return { name: name!, fields, blockAttributes };
  });
}

function listArg(attributes: string, arg: 'fields' | 'references'): string[] {
  const match = new RegExp(`${arg}:\\s*\\[([^\\]]*)\\]`).exec(attributes);
  return match ? match[1]!.split(',').map((s) => s.trim()) : [];
}

const schema = readFileSync(
  path.resolve(import.meta.dirname, '../../prisma/schema.prisma'),
  'utf8',
);
const models = parseSchema(schema);
const isScoped = (model: string) => {
  const scope = modelScope(model);
  return scope === 'tenant' || scope === 'tenant-optional';
};

describe('tenancy invariants in schema.prisma', () => {
  it('classifies every model exactly once', () => {
    expect(models.map((m) => m.name).sort()).toEqual(Object.keys(MODEL_SCOPES).sort());
  });

  it.each(models.map((m) => [m.name, m] as const))(
    '%s has the workspace_id its scope requires',
    (name, model) => {
      const scope = MODEL_SCOPES[name as ModelName];
      const workspaceId = model.fields.find((f) => f.name === 'workspaceId');
      if (scope === 'tenant') {
        expect(workspaceId).toMatchObject({ type: 'String', optional: false });
      } else if (scope === 'tenant-optional' || scope === 'system') {
        expect(workspaceId).toMatchObject({ type: 'String', optional: true });
      } else {
        expect(workspaceId).toBeUndefined();
      }
    },
  );

  it.each(models.filter((m) => isScoped(m.name)).map((m) => [m.name, m] as const))(
    '%s cascades from its workspace and exposes (workspace_id, id) for composite keys',
    (name, model) => {
      const workspace = model.fields.find((f) => f.name === 'workspace');
      expect(workspace?.type).toBe('Workspace');
      expect(listArg(workspace!.attributes, 'fields')).toEqual(['workspaceId']);
      expect(workspace!.attributes).toContain('onDelete: Cascade');
      // Nullable-workspace logs (audit, payments) are never referenced, and PostgreSQL itself
      // refuses a composite FK to a table without this unique, so only NOT NULL tenants need it.
      if (
        MODEL_SCOPES[name as ModelName] === 'tenant' &&
        model.fields.some((f) => f.name === 'id')
      ) {
        expect(model.blockAttributes).toContain('@@unique([workspaceId, id])');
      }
    },
  );

  const relations = models.flatMap((model) =>
    model.fields
      .filter((f) => f.attributes.includes('@relation(') && f.attributes.includes('fields:'))
      .map((f) => ({ model: model.name, field: f })),
  );

  it.each(
    relations
      .filter(({ field }) => isScoped(field.type))
      .map(({ model, field }) => [`${model}.${field.name}`, model, field] as const),
  )('%s references a workspace-scoped model through a composite key', (_label, model, field) => {
    expect(isScoped(model), `${model} must itself be workspace-scoped`).toBe(true);
    const fields = listArg(field.attributes, 'fields');
    const references = listArg(field.attributes, 'references');
    expect(fields[0]).toBe('workspaceId');
    expect(references).toEqual(['workspaceId', 'id']);
  });

  it.each(
    relations
      .filter(({ field }) => listArg(field.attributes, 'fields').length > 1)
      .map(({ model, field }) => [`${model}.${field.name}`, field] as const),
  )('%s declares a delete policy that never nulls workspace_id', (_label, field) => {
    // Prisma defaults optional relations to SetNull, which would null workspace_id as well.
    expect(field.attributes).toMatch(/onDelete: (Cascade|NoAction|Restrict)/);
  });
});
