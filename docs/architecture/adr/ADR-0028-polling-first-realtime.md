# ADR-0028: Polling first for realtime UI, SSE later

- **Status:** Proposed · **Date:** 2026-11-26

## Context
The UI shows progress for long jobs (analysis, discovery, imports, draft generation) and new inbox replies. WebSockets or SSE need connection management, nginx tuning and fan-out (Valkey pub/sub), which adds complexity before it's needed.

## Decision
MVP uses TanStack Query polling: 3 s while a job is non-terminal (backing off to 10 s after 2 min), 30 s for the inbox list when focused, and none when the tab is hidden. Progress comes from DB status, so reloads keep progress. Later, Server-Sent Events (`GET /workspaces/:id/events`) fed by Valkey pub/sub replace polling for the inbox and jobs.

## Alternatives considered
- **WebSockets:** bidirectional capability isn't needed.
- **SSE from day one:** small gain at launch, with long-lived connection overhead on a small VPS.

## Consequences
- ➕ Simple, robust, cache-friendly.
- ➖ More requests (indexed reads, rate-limited). Up to a few seconds of UI lag.

## Verification
API load test includes polling traffic at launch capacity.
