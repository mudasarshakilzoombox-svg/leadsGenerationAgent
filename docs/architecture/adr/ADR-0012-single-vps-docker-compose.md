# ADR-0012: Single-VPS Docker Compose deployment with on-demand staging

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-12, AD-21

## Context
The budget favors one Hostinger KVM 2 (2 vCPU, 8 GB, 100 GB NVMe). Kubernetes or managed platforms add cost and complexity. A second server only for staging isn't affordable before revenue.

## Decision
- Production runs on **one VPS with Docker Compose**: nginx (only published ports), web, api, worker, postgres, valkey, backup, observability agent. Memory limits per container total ≈ 6.9 GB plus swap.
- CI/CD: GitHub Actions → GHCR images tagged by git SHA → SSH deploy (`pull`, `migrate`, `up -d`, health check, auto-rollback).
- **Staging** is a scaled-down second compose project on the same VPS, started only during release windows (separate DB, Valkey, env and subdomain). Production worker concurrency is reduced while it runs.
- Optional Cloudflare proxy (free) in front for TLS edge and DDoS absorption.

## Alternatives considered
- **Kubernetes (k3s):** unnecessary overhead on 8 GB.
- **PaaS (Render, Fly, Railway):** convenient, but higher monthly cost for DB, workers and Valkey.
- **Separate staging VPS:** preferred later when revenue allows.

## Consequences
- ➕ Lowest cost. Simple operations. Reproducible from git + bootstrap script.
- ➖ Single point of failure (99.5% target). Mitigated by backups and a documented 4–8 h rebuild.
- ➖ Staging shares hardware with production. Mitigated by limits, release-window-only operation and memory alerts.

## Verification
Quarterly DR drill (rebuild on a fresh VPS). Memory and disk alerts. Deploy rollback tests.
