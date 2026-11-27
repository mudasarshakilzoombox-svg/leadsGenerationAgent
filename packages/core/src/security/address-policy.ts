import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * Egress address policy (ADR-0022, SECURITY.md §7.2, threat model TM-06). Shared by `SafeFetch`
 * and, later, the SMTP/IMAP host checks: a user-influenced host may only reach public unicast
 * addresses on the internet, never loopback, private, link-local/metadata, CGNAT, multicast,
 * documentation/benchmark ranges or Docker service names.
 */

export type EgressBlockReason =
  | 'INVALID_URL'
  | 'SCHEME_NOT_ALLOWED'
  | 'PORT_NOT_ALLOWED'
  | 'CREDENTIALS_IN_URL'
  | 'HOST_NOT_ALLOWED'
  | 'DNS_FAILED'
  | 'BLOCKED_ADDRESS'
  | 'TOO_MANY_REDIRECTS'
  | 'TIMEOUT'
  | 'BODY_TOO_LARGE'
  | 'CONTENT_TYPE_NOT_ALLOWED'
  | 'UNSUPPORTED_ENCODING'
  | 'CONNECTION_FAILED';

/** Reasons that mean "the policy refused this target" (as opposed to the target misbehaving). */
export const POLICY_BLOCK_REASONS: ReadonlySet<EgressBlockReason> = new Set([
  'INVALID_URL',
  'SCHEME_NOT_ALLOWED',
  'PORT_NOT_ALLOWED',
  'CREDENTIALS_IN_URL',
  'HOST_NOT_ALLOWED',
  'BLOCKED_ADDRESS',
  'TOO_MANY_REDIRECTS',
]);

/** Thrown for every refused or failed egress attempt. The message never contains the URL. */
export class SafeFetchError extends Error {
  constructor(
    readonly reason: EgressBlockReason,
    message: string = reason,
  ) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

// IPv4: everything that is not public unicast.
const blockedV4: ReadonlyArray<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // CGNAT (RFC 6598)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // RFC 1918 (Docker bridge networks live here)
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

// IPv6: only global unicast (2000::/3) is allowed, minus these special-purpose blocks. Everything
// outside 2000::/3 (::, ::1, IPv4-mapped/compatible, NAT64 64:ff9b::/96, discard 100::/64,
// ULA fc00::/7, link-local fe80::/10, site-local fec0::/10, multicast ff00::/8) is refused.
const blockedV6: ReadonlyArray<[string, number]> = [
  ['2001::', 23], // IETF protocol assignments incl. Teredo 2001::/32 (embeds IPv4)
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds an IPv4 address)
  ['3fff::', 20], // documentation (RFC 9637)
];

const blockList = new BlockList();
for (const [network, prefix] of blockedV4) blockList.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of blockedV6) blockList.addSubnet(network, prefix, 'ipv6');
const globalUnicastV6 = new BlockList();
globalUnicastV6.addSubnet('2000::', 3, 'ipv6');

/** Strip the brackets WHATWG URL keeps around IPv6 hostnames. */
export function unbracket(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** True when `ip` (an IPv4 or IPv6 literal) must never be reached. Non-IPs are blocked. */
export function isBlockedAddress(ip: string): boolean {
  const address = unbracket(ip);
  const family = isIP(address);
  if (family === 4) return blockList.check(address, 'ipv4');
  if (family === 6) {
    // Zone ids (fe80::1%eth0) are link-local by definition.
    if (address.includes('%')) return true;
    if (!globalUnicastV6.check(address, 'ipv6')) return true;
    return blockList.check(address, 'ipv6');
  }
  return true;
}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan', '.test'];

/**
 * Validate a hostname from a parsed URL (already lower-cased and punycoded by WHATWG URL).
 * Single-label names are refused: they can only resolve through local search domains, which is
 * exactly how Docker service names (`postgres`, `valkey`, `api`) and `localhost` resolve.
 */
export function checkHostname(hostname: string): void {
  const host = unbracket(hostname);
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new SafeFetchError('BLOCKED_ADDRESS', 'Address not allowed');
    return;
  }
  const name = host.endsWith('.') ? host.slice(0, -1) : host;
  if (!name || name.length > 253 || !name.includes('.')) {
    throw new SafeFetchError('HOST_NOT_ALLOWED', 'Host not allowed');
  }
  if (name === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
    throw new SafeFetchError('HOST_NOT_ALLOWED', 'Host not allowed');
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/** DNS seam: the real implementation uses the OS resolver; tests inject a fake. */
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: Resolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

/**
 * Resolve `hostname` and return its addresses only if **every** answer is public. Refusing a
 * mixed answer (one public, one private) closes the "pick the private one" trick. The caller
 * must connect to one of the returned addresses (pinning), never resolve the name again.
 */
export async function resolvePublicAddresses(
  hostname: string,
  resolver: Resolver = systemResolver,
): Promise<ResolvedAddress[]> {
  const host = unbracket(hostname);
  checkHostname(host);
  const family = isIP(host);
  if (family) return [{ address: host, family: family === 6 ? 6 : 4 }];

  let records: ResolvedAddress[];
  try {
    records = await resolver(host.endsWith('.') ? host.slice(0, -1) : host);
  } catch {
    throw new SafeFetchError('DNS_FAILED', 'Host could not be resolved');
  }
  if (records.length === 0) throw new SafeFetchError('DNS_FAILED', 'Host could not be resolved');
  if (records.some((r) => isBlockedAddress(r.address))) {
    throw new SafeFetchError('BLOCKED_ADDRESS', 'Host resolves to a non-public address');
  }
  return records;
}
