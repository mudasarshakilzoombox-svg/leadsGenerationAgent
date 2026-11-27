import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { type AddressInfo, connect, type Socket } from 'node:net';
import { Duplex } from 'node:stream';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Resolver, SafeFetchError } from './address-policy.js';
import {
  type DialTarget,
  type Dialer,
  IntervalHostThrottle,
  noHostThrottle,
  SafeFetch,
  type SafeFetchConfig,
} from './safe-fetch.js';

// A local server stands in for "the internet". The fake resolver maps test hostnames to public
// IPs; the fake dialer routes those (already validated) IPs to the local server. The policy code
// under test is the real one.

const seen: Array<{ url: string; method: string; headers: IncomingHttpHeaders }> = [];
let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? '', method: req.method ?? '', headers: req.headers });
    const url = new URL(req.url ?? '/', 'http://local');
    const path = url.pathname;
    if (path === '/ok') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'a=b' });
      res.end('<h1>hello</h1>');
    } else if (path === '/json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    } else if (path === '/image') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end('png');
    } else if (path === '/no-type') {
      res.writeHead(200);
      res.end('mystery');
    } else if (path === '/big-declared') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-length': '5000' });
      res.end('x'.repeat(5000));
    } else if (path === '/big-chunked') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      for (let i = 0; i < 10; i += 1) res.write('y'.repeat(500));
      res.end();
    } else if (path === '/gzip') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' });
      res.end(gzipSync('compressed hello'));
    } else if (path === '/br') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'br' });
      res.end(brotliCompressSync('brotli hello'));
    } else if (path === '/gzip-bomb') {
      // ~1 KB on the wire, 1 MB decoded.
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' });
      res.end(gzipSync(Buffer.alloc(1024 * 1024)));
    } else if (path === '/weird-encoding') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'compress' });
      res.end('???');
    } else if (path === '/missing') {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('not here');
    } else if (path === '/redirect') {
      res.writeHead(Number(url.searchParams.get('status') ?? 302), {
        location: url.searchParams.get('to') ?? '/ok',
      });
      res.end();
    } else if (path.startsWith('/chain/')) {
      const left = Number(path.split('/')[2]);
      res.writeHead(302, { location: left > 0 ? `/chain/${left - 1}` : '/ok' });
      res.end();
    } else if (path === '/slow-headers') {
      // Never answers.
    } else if (path === '/slow-body') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('partial');
    } else if (path === '/truncated') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-length': '100' });
      res.write('only ten b');
      setTimeout(() => res.socket?.destroy(), 20);
    } else {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const PUBLIC = '93.184.216.34';

function fakeResolver(): Resolver & { calls: string[] } {
  const rebindAnswers = [[PUBLIC], ['127.0.0.1']];
  const calls: string[] = [];
  const resolver = (host: string) => {
    calls.push(host);
    const table: Record<string, string[]> = {
      'site.example.com': [PUBLIC],
      'other.example.com': ['1.1.1.1'],
      'internal.example.com': ['10.0.0.7'],
    };
    if (host === 'rebind.example.com') {
      const answer = rebindAnswers.shift() ?? ['127.0.0.1'];
      return Promise.resolve(answer.map((address) => ({ address, family: 4 as const })));
    }
    const answer = table[host];
    if (!answer) return Promise.reject(new Error('ENOTFOUND'));
    return Promise.resolve(answer.map((address) => ({ address, family: 4 as const })));
  };
  return Object.assign(resolver, { calls });
}

function fakeDialer(): Dialer & { targets: DialTarget[] } {
  const targets: DialTarget[] = [];
  const dialer = (target: DialTarget) => {
    targets.push(target);
    return connect({ host: '127.0.0.1', port });
  };
  return Object.assign(dialer, { targets });
}

function client(overrides: Partial<SafeFetchConfig> = {}) {
  const resolver = fakeResolver();
  const dialer = fakeDialer();
  const sf = new SafeFetch({
    userAgent: 'LeadGenAgentBot/1.0 (+https://app.example.com/bot)',
    resolver,
    dialer,
    throttle: noHostThrottle,
    maxBytes: 4096,
    ...overrides,
  });
  return { sf, resolver, dialer };
}

/** A connection that never completes: accepts writes, never emits 'connect' or data. */
function stalledSocket(): Socket {
  return new Duplex({ read() {}, write: (_chunk, _encoding, done) => done() }) as unknown as Socket;
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SafeFetchError) return error.reason;
    throw error;
  }
  return 'OK';
}

describe('SafeFetch', () => {
  it('fetches an allowed page through the pinned, validated IP', async () => {
    const { sf, dialer } = client();
    const res = await sf.fetch('http://site.example.com/ok?x=1#frag');
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('text/html');
    expect(res.body.toString()).toBe('<h1>hello</h1>');
    expect(res.finalUrl).toBe('http://site.example.com/ok?x=1');
    expect(res.redirects).toEqual([]);
    expect(dialer.targets).toEqual([
      { address: PUBLIC, family: 4, port: 80, hostname: 'site.example.com', tls: false },
    ]);
  });

  it('sends only its own headers: fixed UA, no cookies or credentials', async () => {
    const { sf } = client();
    seen.length = 0;
    await sf.fetch('http://site.example.com/ok');
    const headers = seen[0]?.headers ?? {};
    expect(headers['user-agent']).toBe('LeadGenAgentBot/1.0 (+https://app.example.com/bot)');
    expect(headers.host).toBe('site.example.com');
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(headers['accept-encoding']).toBe('gzip, deflate, br');
  });

  it('uses port 443 and TLS for https', async () => {
    const dialer = vi.fn<Dialer>(stalledSocket);
    const { sf } = client({ dialer, connectTimeoutMs: 50 });
    await reasonOf(sf.fetch('https://site.example.com/'));
    expect(dialer).toHaveBeenCalledWith(
      expect.objectContaining({
        address: PUBLIC,
        port: 443,
        tls: true,
        hostname: 'site.example.com',
      }),
    );
  });

  it.each([
    ['http://localhost/', 'HOST_NOT_ALLOWED'],
    ['http://127.0.0.1/', 'BLOCKED_ADDRESS'],
    ['http://internal.example.com/ok', 'BLOCKED_ADDRESS'],
    ['http://nx.example.com/', 'DNS_FAILED'],
    ['file:///etc/passwd', 'SCHEME_NOT_ALLOWED'],
    ['http://site.example.com:8080/', 'PORT_NOT_ALLOWED'],
    ['http://a:b@site.example.com/', 'CREDENTIALS_IN_URL'],
  ])('refuses %s before connecting (%s)', async (url, reason) => {
    const { sf, dialer } = client();
    expect(await reasonOf(sf.fetch(url))).toBe(reason);
    expect(dialer.targets).toEqual([]);
  });

  describe('redirects', () => {
    it('follows a relative redirect and reports it', async () => {
      const { sf } = client();
      const res = await sf.fetch('http://site.example.com/redirect?to=/ok');
      expect(res.status).toBe(200);
      expect(res.redirects).toEqual(['http://site.example.com/ok']);
      expect(res.finalUrl).toBe('http://site.example.com/ok');
    });

    it('re-validates the target host of every hop', async () => {
      const { sf, dialer } = client();
      const res = await sf.fetch(
        'http://site.example.com/redirect?to=http://other.example.com/json',
      );
      expect(res.body.toString()).toBe('{"ok":true}');
      expect(dialer.targets.map((t) => t.address)).toEqual([PUBLIC, '1.1.1.1']);
    });

    it.each([
      ['http://127.0.0.1/admin', 'BLOCKED_ADDRESS'],
      ['http://169.254.169.254/latest/meta-data/', 'BLOCKED_ADDRESS'],
      ['http://internal.example.com/', 'BLOCKED_ADDRESS'],
      ['http://valkey:6379/', 'PORT_NOT_ALLOWED'],
      ['http://postgres/', 'HOST_NOT_ALLOWED'],
      ['file:///etc/passwd', 'SCHEME_NOT_ALLOWED'],
      ['http://[::1]/', 'BLOCKED_ADDRESS'],
    ])('refuses a redirect to %s (%s)', async (target, reason) => {
      const { sf, dialer } = client();
      const url = `http://site.example.com/redirect?to=${encodeURIComponent(target)}`;
      expect(await reasonOf(sf.fetch(url))).toBe(reason);
      expect(dialer.targets).toHaveLength(1);
    });

    it('allows 5 redirects and refuses the 6th', async () => {
      const { sf } = client();
      expect((await sf.fetch('http://site.example.com/chain/4')).redirects).toHaveLength(5);
      expect(await reasonOf(sf.fetch('http://site.example.com/chain/5'))).toBe(
        'TOO_MANY_REDIRECTS',
      );
    });

    it('defeats DNS rebinding: the re-resolved private answer is refused, never dialed', async () => {
      const { sf, dialer, resolver } = client();
      expect(await reasonOf(sf.fetch('http://rebind.example.com/redirect?to=/ok'))).toBe(
        'BLOCKED_ADDRESS',
      );
      expect(resolver.calls).toEqual(['rebind.example.com', 'rebind.example.com']);
      expect(dialer.targets.map((t) => t.address)).toEqual([PUBLIC]);
    });

    it('keeps HEAD across redirects and returns no body', async () => {
      const { sf } = client();
      seen.length = 0;
      const res = await sf.fetch('http://site.example.com/redirect?to=/ok&status=303', {
        method: 'HEAD',
      });
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
      expect(seen.map((s) => s.method)).toEqual(['HEAD', 'HEAD']);
    });
  });

  describe('responses', () => {
    it('returns non-2xx statuses without reading the body', async () => {
      const { sf } = client();
      const res = await sf.fetch('http://site.example.com/missing');
      expect(res.status).toBe(404);
      expect(res.body.length).toBe(0);
    });

    it.each([
      ['/image', 'CONTENT_TYPE_NOT_ALLOWED'],
      ['/no-type', 'CONTENT_TYPE_NOT_ALLOWED'],
      ['/big-declared', 'BODY_TOO_LARGE'],
      ['/big-chunked', 'BODY_TOO_LARGE'],
      ['/gzip-bomb', 'BODY_TOO_LARGE'],
      ['/weird-encoding', 'UNSUPPORTED_ENCODING'],
      ['/truncated', 'CONNECTION_FAILED'],
    ])('%s -> %s', async (path, reason) => {
      const { sf } = client();
      expect(await reasonOf(sf.fetch(`http://site.example.com${path}`))).toBe(reason);
    });

    it('lets a caller narrow the content-type allowlist and the size cap', async () => {
      const { sf } = client();
      expect(
        await reasonOf(
          sf.fetch('http://site.example.com/ok', { contentTypes: ['application/json'] }),
        ),
      ).toBe('CONTENT_TYPE_NOT_ALLOWED');
      expect(await reasonOf(sf.fetch('http://site.example.com/ok', { maxBytes: 5 }))).toBe(
        'BODY_TOO_LARGE',
      );
    });

    it('decodes gzip and brotli bodies', async () => {
      const { sf } = client();
      expect((await sf.fetch('http://site.example.com/gzip')).body.toString()).toBe(
        'compressed hello',
      );
      expect((await sf.fetch('http://site.example.com/br')).body.toString()).toBe('brotli hello');
    });
  });

  describe('timeouts', () => {
    it('times out when the connection never opens', async () => {
      const { sf } = client({ dialer: stalledSocket, connectTimeoutMs: 50 });
      expect(await reasonOf(sf.fetch('http://site.example.com/ok'))).toBe('TIMEOUT');
    });

    it.each(['/slow-headers', '/slow-body'])('times out on %s', async (path) => {
      const { sf } = client({ totalTimeoutMs: 150 });
      expect(await reasonOf(sf.fetch(`http://site.example.com${path}`))).toBe('TIMEOUT');
    });

    it('honours a caller abort signal', async () => {
      const { sf } = client();
      const controller = new AbortController();
      const pending = sf.fetch('http://site.example.com/slow-headers', {
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 30);
      expect(await reasonOf(pending)).toBe('TIMEOUT');
    });
  });

  it('spaces requests to the same host', async () => {
    const { sf } = client({ throttle: new IntervalHostThrottle(120) });
    const started = Date.now();
    await sf.fetch('http://site.example.com/ok');
    await sf.fetch('http://site.example.com/json');
    expect(Date.now() - started).toBeGreaterThanOrEqual(110);
  });

  it('logs blocked attempts with the reason and workspace, never the URL', async () => {
    const warn = vi.fn();
    const { sf } = client({ logger: { warn } });
    await reasonOf(sf.fetch('http://localhost/secret-path?token=abc123', { workspaceId: 'ws-1' }));
    expect(warn).toHaveBeenCalledTimes(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toEqual({
      event: 'safe_fetch_blocked',
      reason: 'HOST_NOT_ALLOWED',
      workspaceId: 'ws-1',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-path|abc123|localhost/);
  });

  it('checkUrl validates including DNS', async () => {
    const { sf } = client();
    expect((await sf.checkUrl('https://site.example.com/a')).href).toBe(
      'https://site.example.com/a',
    );
    expect(await reasonOf(sf.checkUrl('https://internal.example.com/'))).toBe('BLOCKED_ADDRESS');
  });
});
