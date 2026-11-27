import { describe, expect, it } from 'vitest';
import { scopeTenantArgs, TenantIsolationError } from './tenant-client.js';

const A = '0195f000-0000-7000-8000-00000000000a';
const B = '0195f000-0000-7000-8000-00000000000b';

describe('scopeTenantArgs', () => {
  it('ANDs the workspace into filter operations', () => {
    expect(scopeTenantArgs('Contact', 'findMany', { where: { title: 'CEO' } }, A)).toEqual({
      where: { AND: [{ title: 'CEO' }, { workspaceId: A }] },
    });
    expect(scopeTenantArgs('Contact', 'count', undefined, A)).toEqual({
      where: { workspaceId: A },
    });
    expect(scopeTenantArgs('AuditLog', 'deleteMany', {}, A)).toEqual({ where: { workspaceId: A } });
  });

  it('extends unique selectors with the workspace', () => {
    expect(scopeTenantArgs('Campaign', 'findUnique', { where: { id: 'x' } }, A)).toEqual({
      where: { id: 'x', workspaceId: A },
    });
    expect(
      scopeTenantArgs(
        'Lead',
        'delete',
        { where: { workspaceId_id: { workspaceId: A, id: 'x' } } },
        A,
      ),
    ).toEqual({ where: { workspaceId_id: { workspaceId: A, id: 'x' }, workspaceId: A } });
  });

  it('injects the workspace into creates', () => {
    expect(scopeTenantArgs('Company', 'create', { data: { name: 'Acme' } }, A)).toEqual({
      data: { name: 'Acme', workspaceId: A },
    });
    expect(
      scopeTenantArgs('Company', 'createMany', { data: [{ name: 'a' }, { name: 'b' }] }, A),
    ).toEqual({
      data: [
        { name: 'a', workspaceId: A },
        { name: 'b', workspaceId: A },
      ],
    });
    const upsert = scopeTenantArgs(
      'Suppression',
      'upsert',
      { where: { id: 'x' }, create: { reason: 'MANUAL' }, update: {} },
      A,
    );
    expect(upsert).toEqual({
      where: { id: 'x', workspaceId: A },
      create: { reason: 'MANUAL', workspaceId: A },
      update: {},
    });
  });

  it('does not mutate the caller arguments', () => {
    const args = { data: { name: 'Acme' } };
    scopeTenantArgs('Company', 'create', args, A);
    expect(args).toEqual({ data: { name: 'Acme' } });
  });

  it.each([
    ['findMany', { where: { workspaceId: B } }],
    ['findFirst', { where: { workspaceId: { in: [A, B] } } }],
    ['findUnique', { where: { workspaceId_id: { workspaceId: B, id: 'x' } } }],
    ['create', { data: { workspaceId: B, name: 'x' } }],
    ['create', { data: { workspace: { connect: { id: B } }, name: 'x' } }],
    ['createMany', { data: [{ name: 'ok' }, { workspaceId: B, name: 'x' }] }],
    ['update', { where: { id: 'x' }, data: { workspaceId: B } }],
    ['updateMany', { where: {}, data: { workspaceId: B } }],
    ['upsert', { where: { id: 'x' }, create: { workspaceId: B }, update: {} }],
    ['upsert', { where: { id: 'x' }, create: {}, update: { workspaceId: B } }],
    ['update', { data: {} }],
  ])('rejects %s that targets another workspace or is malformed (%j)', (operation, args) => {
    expect(() => scopeTenantArgs('Contact', operation, args, A)).toThrow(TenantIsolationError);
  });

  it('allows catalog reads but not catalog writes', () => {
    expect(scopeTenantArgs('Plan', 'findMany', { where: { isPublic: true } }, A)).toEqual({
      where: { isPublic: true },
    });
    expect(() =>
      scopeTenantArgs('Role', 'update', { where: { key: 'OWNER' }, data: {} }, A),
    ).toThrow(TenantIsolationError);
  });

  it.each(['User', 'Session', 'Workspace', 'WebhookEvent', 'NotAModel'])(
    'blocks %s, which is not workspace-scoped',
    (model) => {
      expect(() => scopeTenantArgs(model, 'findMany', {}, A)).toThrow(TenantIsolationError);
    },
  );

  it('fails closed for unknown operations', () => {
    expect(() => scopeTenantArgs('Contact', 'findRaw', {}, A)).toThrow(TenantIsolationError);
  });
});
