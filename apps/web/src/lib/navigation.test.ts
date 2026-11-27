import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOTTOM_NAV_PATHS, NAV_ITEMS } from './navigation';

// Every sidebar destination must be a real page: no dead links (ADR-0036).
const appDir = path.resolve(import.meta.dirname, '../app/(app)/[workspaceSlug]');

describe('navigation config', () => {
  it.each(NAV_ITEMS.map((i) => [i.label, i.path] as const))('%s has a page', (_label, p) => {
    expect(existsSync(path.join(appDir, p, 'page.tsx'))).toBe(true);
  });

  it('has unique paths and a bottom nav made of real destinations', () => {
    const paths = NAV_ITEMS.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of BOTTOM_NAV_PATHS) expect(paths).toContain(p);
  });

  it('never offers a LinkedIn destination (email-only, AGENTS.md)', () => {
    expect(NAV_ITEMS.some((i) => /linkedin/i.test(`${i.label} ${i.path}`))).toBe(false);
  });
});
