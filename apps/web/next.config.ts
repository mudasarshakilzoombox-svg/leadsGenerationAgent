import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Next runs with cwd = apps/web. Load the monorepo root .env (real env vars win).
const repoRoot = path.resolve(process.cwd(), '../..');
if (existsSync(path.join(repoRoot, 'pnpm-workspace.yaml'))) {
  loadEnvConfig(repoRoot, process.env.NODE_ENV !== 'production');
}

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  transpilePackages: ['@lga/ui'],
  poweredByHeader: false,
  reactStrictMode: true,
  // The floating dev badge covers the mobile bottom navigation and the sidebar user menu.
  devIndicators: false,
  // Few images and a small VPS: skip the image optimizer (01-frontend §2).
  images: { unoptimized: true },
  async rewrites() {
    // Local development without nginx: proxy same-origin /api/* to the API.
    // In production nginx routes /api/* before requests reach Next.js.
    const target = process.env.INTERNAL_API_URL;
    return target ? [{ source: '/api/:path*', destination: `${target}/api/:path*` }] : [];
  },
};

export default config;
