# ADR-0017: Campaign launch approval workflow

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-18, PRD APR-03, APR-04

## Context
Teams and agencies need control over what goes out under their brand. Per-email draft approval (autonomy L1) controls content, but not *whether* a campaign goes live with a given audience, mailboxes and schedule.

## Decision
- Workspace setting `launchRequiresApproval` (default **ON**). When ON, Members don't have `campaigns.launch`. They `submit-for-approval`, which creates a `campaign_approvals` row (`PENDING`, a launch-check snapshot and a `config_hash` of leads, sequence and mailboxes).
- Owners and Admins approve or reject (with comment). Launch checks re-run at approval time.
- Any change to leads, sequence or mailboxes after submission or approval changes `config_hash`. The pending request is canceled, or the approved but not-yet-started campaign returns to `DRAFT` (APR-04 AC3).
- `SendPolicy` SP-13 re-verifies approval at send time (defense in depth).

## Alternatives considered
- **Draft approval only:** misses audience and mailbox mistakes.
- **Multi-step approval chains:** unnecessary for target customers. They can be added later on the same table.

## Consequences
- ➕ Clear accountability with an audit trail. Agencies can delegate safely.
- ➖ Friction for small teams. Owners and Admins launch directly, and the setting can be turned off.

## Verification
Permission tests (a Member can't launch or approve when ON), `config_hash` invalidation tests, SP-13 tests.
