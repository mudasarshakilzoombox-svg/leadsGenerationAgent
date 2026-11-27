# ADR-0022: SafeFetch as the only egress path for user-influenced URLs

- **Status:** Accepted · **Date:** 2026-11-26 · **Implemented:** 2026-11-27 in `packages/core/src/security/{address-policy,safe-fetch}.ts` (robots.txt is evaluated by the crawler, see SECURITY.md §7.2)

## Context
The product fetches URLs supplied directly or indirectly by users: business websites, company domains from data, research results, and SMTP/IMAP hosts. SSRF (TM-06) could reach Docker services (`postgres`, `valkey`, `api`), localhost or metadata endpoints.

## Decision
All such egress goes through `common/safe-fetch`: WHATWG URL parsing, http(s) on ports 80/443 only, DNS resolution with an IP blocklist (loopback, private, link-local and metadata, CGNAT, ULA, multicast, IPv4-mapped IPv6), **connection pinned to the validated IP**, every redirect re-validated (max 5), 5 s connect and 15 s total timeouts, a 2 MB streamed body cap, a content-type allowlist, robots.txt respect with an identifiable User-Agent, 1 rps per host, and no forwarded cookies or auth. Mail-host connection tests use the same resolver policy. Other HTTP clients and global `fetch` are banned by lint outside SafeFetch and the provider HTTP client (fixed provider hosts).

## Alternatives considered
- **Egress proxy (Smokescreen-style) container:** strong, but another service to run. A possible later hardening step.
- **Network-level egress firewall only:** can't distinguish provider calls from user URLs on the same host.

## Consequences
- ➕ One audited choke point. Testable.
- ➖ Some legitimate sites (unusual ports, JS-only) can't be analyzed. The UX offers manual entry or pasted text (BIZ-02 AC3).

## Verification
A suite of 40+ tests (encodings, IPv6 forms, DNS rebinding with a test resolver, redirect chains). Lint bans.
