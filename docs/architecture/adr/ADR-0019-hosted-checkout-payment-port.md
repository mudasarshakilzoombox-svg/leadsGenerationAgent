# ADR-0019: Hosted checkout behind a `PaymentProvider` port

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-19, PRD D8

## Context
Self-serve billing is in MVP. The company's country isn't confirmed, and Stripe isn't available everywhere. We must avoid handling card data (PCI scope) and tax calculation ourselves.

## Decision
- Billing goes through a `PaymentProvider` port with a **Stripe** adapter (Checkout, Customer Portal, Stripe Tax) as default, and a **merchant-of-record** adapter (Paddle or Lemon Squeezy) as an alternative if Stripe can't be used.
- Only hosted checkout and portal pages are used, so no card data touches our servers.
- Webhooks are verified, deduplicated and processed by **re-fetching authoritative objects** from the provider. Plans, prices and limits come from our catalog (`plans.ts` + per-env price map), never from client input or payload amounts.
- No overage billing in MVP. Limits stop usage and prompt an upgrade or pack purchase.

## Alternatives considered
- **Embedded card elements:** more UI control, but larger PCI scope and more code.
- **Usage-based metered billing:** deferred. Credit packs are simpler and avoid surprise bills.

## Consequences
- ➕ Lightest PCI posture. Tax handled by the provider. The provider can be swapped.
- ➖ Less checkout UI customization. Merchant-of-record fees are higher than Stripe's.

## Verification
Sandbox E2E lifecycle test (ROADMAP Phase 5 exit), webhook replay and ordering tests, nightly `billing.reconcile`.
