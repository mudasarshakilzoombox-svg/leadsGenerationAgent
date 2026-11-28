// Sentry scrubbing end to end (12-observability §4, P0.6): a real Sentry client sends to a local
// HTTP sink posing as the DSN. A 5xx whose message, context and request carry a fake email must
// arrive without it; an expected 4xx DomainError must not be sent at all.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';
import type { ArgumentsHost } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../errors/domain-error.js';
import { ProblemDetailsFilter } from '../errors/problem-details.filter.js';
import { flushSentry, initSentry, sentryEnabled } from './sentry.js';

const FAKE_EMAIL = 'jane.doe@example.com';

let server: Server;
const envelopes: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      envelopes.push(
        (req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw).toString('utf8'),
      );
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function httpHost(url: string): ArgumentsHost {
  const req = {
    id: 'req-test-1',
    url,
    originalUrl: url,
    method: 'POST',
    headers: { cookie: `session=abc; mail=${FAKE_EMAIL}`, 'x-request-id': 'req-test-1' },
    body: { email: FAKE_EMAIL },
  };
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
}

const logger = { error: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;

describe('Sentry reporting with PII scrubbing', () => {
  it('stays off without a DSN', () => {
    expect(initSentry('api', { RELEASE: 'x', APP_ENV: 'test', SENTRY_TRACES_SAMPLE_RATE: 0 })).toBe(
      false,
    );
    expect(sentryEnabled()).toBe(false);
  });

  it('sends 5xx errors without the fake email, and never sends expected 4xx', async () => {
    const { port } = server.address() as AddressInfo;
    expect(
      initSentry('api', {
        SENTRY_DSN: `http://publickey@127.0.0.1:${port}/1`,
        SENTRY_TRACES_SAMPLE_RATE: 0,
        RELEASE: 'test-sha-123',
        APP_ENV: 'test',
      }),
    ).toBe(true);

    const filter = new ProblemDetailsFilter(logger);
    // Expected 4xx: logged as a warning, not reported.
    filter.catch(
      new DomainError('VALIDATION_FAILED', `Bad input for ${FAKE_EMAIL}`),
      httpHost('/api/v1/x'),
    );
    // Unexpected error: reported (5xx).
    const boom = Object.assign(new Error(`Database exploded while saving ${FAKE_EMAIL}`), {
      context: { email: FAKE_EMAIL, note: `contact ${FAKE_EMAIL}` },
    });
    filter.catch(boom, httpHost(`/api/v1/workspaces/1?invite=${FAKE_EMAIL}`));
    await flushSentry(5_000);

    const events = envelopes.filter((e) => e.includes('"type":"event"'));
    expect(events).toHaveLength(1);
    const body = events[0]!;
    expect(body).toContain('test-sha-123'); // release
    expect(body).toContain('"environment":"test"');
    expect(body).toContain('[EMAIL]'); // the message survived, scrubbed
    expect(body).not.toContain('example.com');
    expect(body).not.toContain('session=abc');
    // Exactly one event: the 5xx. The 4xx DomainError above was never sent.
    const eventLine = body.split('\n').find((line) => line.includes('"exception"'))!;
    const event = JSON.parse(eventLine) as {
      exception: { values: Array<{ value: string }> };
      tags: Record<string, string>;
    };
    expect(event.exception.values[0]!.value).toBe('Database exploded while saving [EMAIL]');
    expect(event.tags).toMatchObject({ service: 'api', status: '500', requestId: 'req-test-1' });
  });
});
