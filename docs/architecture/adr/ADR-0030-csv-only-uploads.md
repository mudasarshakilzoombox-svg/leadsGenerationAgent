# ADR-0030: CSV-only uploads, streamed to private storage

- **Status:** Proposed · **Date:** 2026-11-26 · PRD DISC-04, threat TM-08

## Context
Users import contacts and suppression lists. File uploads are a classic attack vector (malicious content, resource exhaustion, stored XSS, path traversal), and malware scanning is memory-heavy on our VPS.

## Decision
- MVP accepts **only CSV** (≤ 20 MB, ≤ 50,000 rows, field and row size caps), validated by extension plus a content sniff. There are no images, avatars, attachments or archives.
- Uploads **stream** through the API (busboy) directly to private object storage under random keys `ws/{workspaceId}/imports/{uuid}.csv` while hashing. They're parsed by the worker with a streaming CSV parser.
- Downloads use short-lived signed URLs with `Content-Disposition: attachment`, `text/csv` and `nosniff`. Every export escapes spreadsheet formulas.
- Any future file type requires a new ADR with a malware-scanning design.

## Alternatives considered
- **Presigned direct-to-storage uploads:** less API load, but weaker size enforcement on some S3-compatible providers and an extra validation round-trip. Streaming 20 MB through Node is cheap.
- **XLSX support:** a larger parser attack surface (zip, XML). Users can export CSV.

## Consequences
- ➕ A minimal attack surface and bounded memory.
- ➖ Slightly less convenient for users with Excel files.

## Verification
Upload threat tests (TM-08 in [14-threat-model.md](../14-threat-model.md)) and export escaping tests.
