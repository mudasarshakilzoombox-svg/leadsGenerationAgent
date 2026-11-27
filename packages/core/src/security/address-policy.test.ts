import { describe, expect, it } from 'vitest';
import {
  checkHostname,
  isBlockedAddress,
  type Resolver,
  resolvePublicAddresses,
  SafeFetchError,
} from './address-policy.js';
import { assertFetchableUrl } from './safe-fetch.js';

function reasonOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof SafeFetchError) return error.reason;
    throw error;
  }
  return 'ALLOWED';
}

async function asyncReasonOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof SafeFetchError) return error.reason;
    throw error;
  }
  return 'ALLOWED';
}

describe('isBlockedAddress', () => {
  it.each([
    ['0.0.0.0', 'this network'],
    ['10.1.2.3', 'RFC 1918 10/8'],
    ['100.64.0.1', 'CGNAT'],
    ['100.127.255.254', 'CGNAT upper edge'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback range'],
    ['169.254.169.254', 'cloud metadata'],
    ['172.16.0.1', 'RFC 1918 172.16/12'],
    ['172.31.255.255', 'RFC 1918 upper edge (Docker bridges)'],
    ['192.0.0.8', 'IETF assignments'],
    ['192.0.2.10', 'TEST-NET-1'],
    ['192.88.99.1', '6to4 relay'],
    ['192.168.1.1', 'RFC 1918 192.168/16'],
    ['198.18.0.1', 'benchmarking'],
    ['198.51.100.7', 'TEST-NET-2'],
    ['203.0.113.9', 'TEST-NET-3'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'SSDP multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
    ['::', 'IPv6 unspecified'],
    ['::1', 'IPv6 loopback'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback (hex)'],
    ['::ffff:8.8.8.8', 'IPv4-mapped public (refused: never needed)'],
    ['::127.0.0.1', 'IPv4-compatible'],
    ['64:ff9b::7f00:1', 'NAT64 to loopback'],
    ['64:ff9b:1::1', 'local-use NAT64'],
    ['100::1', 'discard prefix'],
    ['2001::1', 'Teredo'],
    ['2001:db8::1', 'documentation'],
    ['2002:7f00:1::', '6to4 embedding loopback'],
    ['3fff::1', 'documentation (RFC 9637)'],
    ['fc00::1', 'ULA'],
    ['fd12:3456::1', 'ULA'],
    ['fe80::1', 'link-local'],
    ['fe80::1%eth0', 'link-local with zone'],
    ['fec0::1', 'site-local'],
    ['ff02::1', 'multicast'],
    ['not-an-ip', 'non-IP input'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.32.0.1',
    '100.128.0.1',
    '2606:4700:4700::1111',
    '2a00:1450:4001::200e',
    '[2606:4700::1]',
  ])('allows public address %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('assertFetchableUrl (URL policy, no DNS)', () => {
  it.each([
    ['http://2130706433/', 'BLOCKED_ADDRESS'], // decimal 127.0.0.1
    ['http://0x7f000001/', 'BLOCKED_ADDRESS'], // hex
    ['http://0177.0.0.1/', 'BLOCKED_ADDRESS'], // octal
    ['http://127.1/', 'BLOCKED_ADDRESS'], // short form
    ['http://0/', 'BLOCKED_ADDRESS'],
    ['http://[::1]/', 'BLOCKED_ADDRESS'],
    ['http://[::ffff:127.0.0.1]/', 'BLOCKED_ADDRESS'],
    ['http://[::ffff:7f00:1]/', 'BLOCKED_ADDRESS'],
    ['http://[64:ff9b::7f00:1]/', 'BLOCKED_ADDRESS'],
    ['http://[2002:7f00:1::]/', 'BLOCKED_ADDRESS'],
    ['http://[fd00::1]/', 'BLOCKED_ADDRESS'],
    ['http://[fe80::1]/', 'BLOCKED_ADDRESS'],
    ['http://169.254.169.254/latest/meta-data/', 'BLOCKED_ADDRESS'],
    ['http://localhost/', 'HOST_NOT_ALLOWED'],
    ['http://LOCALHOST./', 'HOST_NOT_ALLOWED'],
    ['http://postgres:443/', 'HOST_NOT_ALLOWED'],
    ['http://valkey/', 'HOST_NOT_ALLOWED'],
    ['http://api/admin', 'HOST_NOT_ALLOWED'],
    ['http://worker/', 'HOST_NOT_ALLOWED'],
    ['http://foo.localhost/', 'HOST_NOT_ALLOWED'],
    ['http://printer.local/', 'HOST_NOT_ALLOWED'],
    ['http://metadata.google.internal/', 'HOST_NOT_ALLOWED'],
    ['http://router.home.arpa/', 'HOST_NOT_ALLOWED'],
    ['http://nas.lan/', 'HOST_NOT_ALLOWED'],
    ['file:///etc/passwd', 'SCHEME_NOT_ALLOWED'],
    ['ftp://example.com/', 'SCHEME_NOT_ALLOWED'],
    ['gopher://example.com/', 'SCHEME_NOT_ALLOWED'],
    ['data:text/html,hi', 'SCHEME_NOT_ALLOWED'],
    ['javascript:alert(1)', 'SCHEME_NOT_ALLOWED'],
    ['https://example.com:22/', 'PORT_NOT_ALLOWED'],
    ['https://example.com:6379/', 'PORT_NOT_ALLOWED'],
    ['http://example.com:8080/', 'PORT_NOT_ALLOWED'],
    ['https://user:pass@example.com/', 'CREDENTIALS_IN_URL'],
    ['https://user@example.com/', 'CREDENTIALS_IN_URL'],
    ['not a url', 'INVALID_URL'],
    ['', 'INVALID_URL'],
    [`https://example.com/${'a'.repeat(2100)}`, 'INVALID_URL'],
  ])('%s -> %s', (url, reason) => {
    expect(reasonOf(() => assertFetchableUrl(url))).toBe(reason);
  });

  it.each([
    'https://example.com/',
    'http://example.com:80/about',
    'https://example.com:443/',
    'http://example.com:443/',
    'https://www.example.co.uk/pricing?plan=pro',
    'https://xn--bcher-kva.example/',
    'https://8.8.8.8/',
    'https://[2606:4700:4700::1111]/',
  ])('allows %s', (url) => {
    expect(reasonOf(() => assertFetchableUrl(url))).toBe('ALLOWED');
  });

  it('drops the fragment', () => {
    expect(assertFetchableUrl('https://example.com/a#section').href).toBe('https://example.com/a');
  });

  it('checkHostname accepts a fully qualified name with a trailing dot', () => {
    expect(reasonOf(() => checkHostname('example.com.'))).toBe('ALLOWED');
  });
});

describe('resolvePublicAddresses', () => {
  const resolver =
    (answers: Record<string, string[]>): Resolver =>
    (host) => {
      const list = answers[host];
      if (!list) return Promise.reject(new Error('ENOTFOUND'));
      return Promise.resolve(
        list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
      );
    };

  it('returns the addresses when every answer is public', async () => {
    const addresses = await resolvePublicAddresses(
      'site.example.com',
      resolver({ 'site.example.com': ['93.184.216.34', '2606:2800:220:1::1'] }),
    );
    expect(addresses.map((a) => a.address)).toEqual(['93.184.216.34', '2606:2800:220:1::1']);
  });

  it.each([
    [['10.0.0.5'], 'BLOCKED_ADDRESS'],
    [['93.184.216.34', '127.0.0.1'], 'BLOCKED_ADDRESS'], // mixed answer
    [['93.184.216.34', '::1'], 'BLOCKED_ADDRESS'],
    [['169.254.169.254'], 'BLOCKED_ADDRESS'],
    [['172.18.0.3'], 'BLOCKED_ADDRESS'], // a Docker bridge address
    [[], 'DNS_FAILED'],
  ])('refuses answers %j with %s', async (answers, reason) => {
    expect(
      await asyncReasonOf(() =>
        resolvePublicAddresses('site.example.com', resolver({ 'site.example.com': answers })),
      ),
    ).toBe(reason);
  });

  it('maps resolver failures to DNS_FAILED', async () => {
    expect(await asyncReasonOf(() => resolvePublicAddresses('nx.example.com', resolver({})))).toBe(
      'DNS_FAILED',
    );
  });

  it('checks IP literals without calling the resolver', async () => {
    const never: Resolver = () => Promise.reject(new Error('should not resolve'));
    expect(await resolvePublicAddresses('8.8.8.8', never)).toEqual([
      { address: '8.8.8.8', family: 4 },
    ]);
    expect(await asyncReasonOf(() => resolvePublicAddresses('[::1]', never))).toBe(
      'BLOCKED_ADDRESS',
    );
  });
});
