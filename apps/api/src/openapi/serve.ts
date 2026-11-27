// Serves the generated OpenAPI document and a reference page at /api/docs outside production
// (03-api §1). The page loads Scalar API Reference from jsDelivr at a pinned version.
import type { ApiEnv } from '@lga/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { buildOpenApiDocument } from './document.js';

export const API_DOCS_PATH = '/api/docs';
const SCALAR = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.78.1';

export function mountApiDocs(app: NestExpressApplication, env: ApiEnv): void {
  if (env.APP_ENV === 'production') return;
  let cached: string | undefined;
  const json = () => (cached ??= JSON.stringify(buildOpenApiDocument({ release: env.RELEASE })));

  app.use(`${API_DOCS_PATH}/openapi.json`, (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json').send(json());
  });
  app.use(API_DOCS_PATH, (req: Request, res: Response, next: () => void) => {
    if (req.path !== '/' && req.path !== '') return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.type('text/html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lead Generation Agent API</title>
  </head>
  <body>
    <script id="api-reference" data-url="${API_DOCS_PATH}/openapi.json"></script>
    <script src="${SCALAR}"></script>
  </body>
</html>`);
  });
}
