// Architecture boundaries (AGENTS.md "Non-negotiable architecture rules", ADR-0032, ADR-0039).
// Run with `pnpm boundaries`. Paths are resolved files relative to the repo root.

const SERVER_NAMES = [
  '@lga/core',
  '@prisma/[^/]+',
  'pg',
  'ioredis',
  'bullmq',
  '@nestjs/[^/]+',
  'nestjs-pino',
  'openai',
  '@anthropic-ai/sdk',
  'openid-client',
  'nodemailer',
];

/**
 * A server package, matched two ways: resolved under node_modules (unanchored, so pnpm's
 * .pnpm/<id>/node_modules/ matches too), or as the bare name when the importing package does not
 * declare it and the import cannot be resolved (e.g. the web app importing @lga/core).
 */
const SERVER_PACKAGES = `node_modules/(${SERVER_NAMES.join('|')})/|^(${SERVER_NAMES.join('|')})(/|$)`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'module-internals',
      comment:
        'A core module imports another module only through its index.ts, or its pure ' +
        'domain/index.ts (AGENTS.md rule 3). modules.ts (Nest wiring) and the package barrel ' +
        'are the composition roots.',
      severity: 'error',
      from: {
        path: '^packages/core/src/modules/([^/]+)/',
        pathNot: '^packages/core/src/modules/modules\\.ts$',
      },
      to: {
        path: '^packages/core/src/modules/([^/]+)/.+',
        pathNot: [
          '^packages/core/src/modules/$1/',
          '^packages/core/src/modules/[^/]+/index\\.ts$',
          // Pure domain helpers may be shared: no I/O and no cross-module dependencies.
          '^packages/core/src/modules/[^/]+/domain/index\\.ts$',
        ],
      },
    },
    {
      name: 'domain-is-pure',
      comment:
        'domain/ holds pure business logic with unit tests: no I/O, no framework, no Prisma.',
      severity: 'error',
      from: { path: '^packages/core/src/modules/[^/]+/domain/', pathNot: '\\.test\\.ts$' },
      to: {
        path: [
          '^packages/core/src/modules/[^/]+/(application|infrastructure|api|jobs)/',
          '^packages/core/src/(generated|database|redis|queue)/',
          SERVER_PACKAGES,
        ],
      },
    },
    {
      name: 'domain-no-io-builtins',
      severity: 'error',
      from: { path: '^packages/core/src/modules/[^/]+/domain/', pathNot: '\\.test\\.ts$' },
      to: {
        dependencyTypes: ['core'],
        path: '^(node:)?(fs|net|http|https|http2|dns|child_process|tls|dgram)(/|$)',
      },
    },
    {
      name: 'prisma-client-scope',
      comment:
        'The generated Prisma client is used by the data layer only: never by domain logic, ' +
        'contracts, shared, the web app or HTTP controllers.',
      severity: 'error',
      from: {
        pathNot: [
          '^packages/core/src/(database|tenancy|platform|seed|generated|errors)/',
          '^packages/core/src/modules/[^/]+/(application|infrastructure)/',
          '^packages/core/src/modules/(audit|notifications|insights|prospects|outreach|account)/[^/]+\\.ts$',
          '^packages/core/(test|prisma)/',
          '^packages/core/prisma\\.config\\.ts$',
        ],
      },
      to: { path: '^packages/core/src/generated/prisma/' },
    },
    {
      name: 'web-no-server',
      comment:
        'Next.js never touches the database, Valkey, LLMs or backend code (AGENTS.md rule 2). ' +
        'It talks to the API over HTTP and shares only @lga/contracts, @lga/shared and @lga/ui.',
      severity: 'error',
      from: { path: '^apps/web/src/' },
      to: { path: ['^packages/core/', '^apps/(api|worker)/', SERVER_PACKAGES] },
    },
    {
      name: 'web-no-node-builtins',
      severity: 'error',
      from: { path: '^apps/web/src/', pathNot: '\\.test\\.tsx?$' },
      to: {
        dependencyTypes: ['core'],
        path: '^(node:)?(fs|net|http|https|http2|dns|child_process|tls|dgram|worker_threads)(/|$)',
      },
    },
    {
      name: 'isomorphic-packages',
      comment: 'contracts, shared and ui run in the browser too: no backend or app imports.',
      severity: 'error',
      from: { path: '^packages/(contracts|shared|ui)/src/' },
      to: { path: ['^packages/core/', '^apps/', SERVER_PACKAGES] },
    },
    {
      name: 'isomorphic-no-node-builtins',
      severity: 'error',
      from: { path: '^packages/(contracts|shared|ui)/src/', pathNot: '\\.test\\.tsx?$' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-app-cross-imports',
      comment: 'Apps share code through packages, never by importing each other (ADR-0032).',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'no-circular',
      comment: 'Runtime import cycles break NestJS DI and ESM initialisation order.',
      severity: 'error',
      from: { pathNot: '^packages/core/src/generated/' },
      to: { circular: true, dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', '^packages/core/src/generated/'] },
    exclude: {
      path: [
        '(^|/)(dist|\\.next|\\.turbo|coverage|playwright-report|test-results)/',
        '^infra/',
        '^docs/',
        '(^|/)next-env\\.d\\.ts$',
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'apps/web/tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['@lga/source', 'import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
      extensions: ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.d.ts'],
    },
    skipAnalysisNotInRules: true,
    reporterOptions: { text: { highlightFocused: true } },
  },
};
