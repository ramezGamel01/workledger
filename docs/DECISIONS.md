# WorkLedger architectural decisions

- **Document status:** Accepted V1 decisions
- **Decision log version:** 1.0.0
- **Last updated:** 2026-09-20

Each decision is binding until a later accepted decision explicitly supersedes it. A code change must not silently rewrite an accepted decision.

## ADR-001 — V1 is local-first

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

The product stores work history, billing data, and confidential evidence for one contractor. V1 must be useful without the cost and risk of accounts, servers, storage credentials, and sync conflict handling.

### Decision

V1 stores canonical data in browser IndexedDB and performs no product-managed upload or synchronization. Browser storage is paired with an explicit backup/restore workflow.

### Consequences

- The owner controls data on the device and deployed origin.
- There is no automatic cross-device continuity.
- Clearing site data can erase records; backup is critical.
- A future cloud version requires an explicit migration and sync design.

### Rejected alternatives

- Building Node/PostgreSQL/authentication in V1: too much security and operational scope before the core workflow is validated.
- Using only `localStorage`: unsuitable for indexed records, transactions, and blobs.

## ADR-002 — React, TypeScript, and Vite form the UI baseline

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

The application has multi-route workflows, persistent timer state, forms, evidence, reports, and non-trivial business rules.

### Decision

Use React with strict TypeScript and Vite. React Router handles application routes.

### Consequences

- State and entity boundaries are explicit and type checked.
- The production application can be delivered as static assets.
- Phase 1 owns exact configuration and versions.

### Rejected alternatives

- One large HTML/CSS/JavaScript application: possible, but less maintainable for the approved scope and future backend boundary.
- A server-rendered framework in V1: no server-rendered or backend capability requires it.

## ADR-003 — Enforce layered dependencies

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Direct database use in components would couple UI behavior to Dexie and make business rules difficult to test or move to a backend later.

### Decision

Use UI/features → application services → domain/repository ports, with Dexie in infrastructure adapters. Components do not import the database.

### Consequences

- Business rules can be tested without React or IndexedDB.
- Repository implementations can be replaced later.
- Some use cases require small service and mapping layers instead of direct table calls.

## ADR-004 — WorkSession is the canonical unit of work

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Dashboard, Timesheet, Earnings, Invoice, and Work Report must not maintain inconsistent copies of worked time.

### Decision

All work originates as a `WorkSession`. Other product surfaces are projections from sessions or immutable invoice snapshots.

### Consequences

- Reconciliation has one traceable path.
- Historical and tracked work share downstream behavior.
- Session rules require careful design because they affect the whole product.

## ADR-005 — Tracked time uses persisted segments

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

`now - initialStart` cannot exclude several pause intervals and is fragile under reload and tab suspension.

### Decision

A tracked session contains ordered continuous `SessionSegment` intervals. Worked duration is the sum of closed segments.

### Consequences

- Pause/resume is exact and explainable.
- Reload does not require persisting timer ticks.
- Timer mutations must preserve open-segment invariants.

## ADR-006 — Use integer seconds and integer minor currency units

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Floating-point hours and currency produce avoidable rounding errors.

### Decision

Persist time as integer seconds and money as integer minor units. Calculate a session amount with integer-safe half-up rounding once per session, and sum those results everywhere.

### Consequences

- Dashboard and invoice totals reconcile.
- Displayed decimal hours are never calculation inputs.
- Currency metadata is required for formatting fraction digits.

## ADR-007 — Snapshot rate, currency, timezone, and task label on sessions

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Project rates, currency, timezone, and task names can change after work occurs.

### Decision

A session captures the rate, currency, timezone, and current task label needed to interpret that work historically.

### Consequences

- Historical earnings do not drift after project edits.
- Rate corrections must be explicit and audited.
- Some denormalization is intentional.

## ADR-008 — IndexedDB stores evidence blobs in independent records

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Screenshots and files are too large for `localStorage` and should not inflate session records or audit history.

### Decision

Use a separate `EvidenceAsset` entity. Store original binary content as `Blob` in IndexedDB, with scope, metadata, checksum, and optional derived thumbnail.

### Consequences

- Sessions remain lightweight.
- Evidence can target one session or one project day.
- Storage quota handling and backup extraction are explicit concerns.

## ADR-009 — Material mutations and audit events are atomic

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

An edit history that can diverge from time or financial data is not trustworthy.

### Decision

Every required audit event commits in the same Dexie transaction as the business mutation. Audit events are append-only and omit blobs.

### Consequences

- A material mutation cannot exist without its history.
- Transaction boundaries live in the application/infrastructure layer.
- Restore must validate imported audit references.

## ADR-010 — Issued invoices are immutable snapshots

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

An invoice must not change when the user later edits a name, address, project, task, or rate.

### Decision

Drafts reference current eligible sessions. Issuing atomically freezes parties, payment details, projects, session billing data, lines, totals, dates, and invoice number. The issued graph has no update or delete workflow in V1.

### Consequences

- PDF regeneration is stable.
- Sessions linked to an issued invoice are locked.
- Credit notes, voids, and formal revisions require a future decision.

## ADR-011 — A session can belong to only one invoice graph

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Selecting the same session for more than one invoice creates accidental double billing.

### Decision

`InvoiceSessionLink.sessionId` is unique. A session can belong to at most one draft or issued invoice. Removing it from a draft releases it; issued links are permanent.

### Consequences

- Duplicate billing is prevented early and revalidated on issue.
- A session cannot sit in several competing drafts.
- Partial billing of one session is not supported in V1.

## ADR-012 — Work dates are stable timezone-derived values

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Recalculating dates in the device's current timezone can move old work between days. Midnight and daylight-saving transitions also affect duration.

### Decision

Persist UTC instants, session timezone, and the derived local `workDate`. Split live work at local midnight. Resolve manual local times through timezone-aware rules.

### Consequences

- Historical daily totals remain stable when the user travels.
- Midnight partitioning and DST cases require dedicated tests.
- A timezone adapter may be justified in Phase 1.

## ADR-013 — Timer concurrency is coordinated across tabs

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

The user may open WorkLedger in multiple tabs, and in-memory state cannot enforce one active timer.

### Decision

Use browser locking when available, database invariant checks in every timer transaction, optimistic versions, and cross-tab notifications.

### Consequences

- One tab may receive a recoverable conflict when another tab acts first.
- Browser locks are an optimization/coordination layer, not the only integrity control.

## ADR-014 — Backup is a portable, versioned ZIP and restore is replacement-only

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

A raw database dump is brittle, while merge restore introduces difficult identity, audit, invoice, and evidence conflicts.

### Decision

Export a manifest, logical JSON data, and separate evidence files with checksums. V1 import validates and previews, then atomically replaces the whole dataset. Merge is deferred.

### Consequences

- Backups are understandable and migratable independently from Dexie internals.
- Restore behavior is predictable.
- Import cannot casually combine two devices' histories.

## ADR-015 — Invoice and Work Report are separate documents

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

An invoice should be concise, while proof of work can contain detailed descriptions and confidential screenshots.

### Decision

Generate a clean invoice PDF and a separate work-activity report PDF. Evidence enters the work report only after explicit user selection.

### Consequences

- Clients receive the appropriate level of detail.
- Invoice rendering remains stable and lightweight.
- Report failures do not affect invoice issuance.

## ADR-016 — V1 is single-user and has no application authentication

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Authentication without a server does not create meaningful multi-user security, and team workflows are outside the primary job.

### Decision

Model one local freelancer profile. Do not add user, role, permission, session, or team entities to V1.

### Consequences

- Product and schema stay focused.
- Site-level private access may protect the deployed URL, but it is not an in-app account system.
- V2 authentication requires tenant and authorization decisions.

## ADR-017 — Referenced business records are archived or soft-deleted

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Hard deletion can break history, reports, evidence links, and reconciliation.

### Decision

Archive clients, projects, and tasks. Soft-delete eligible sessions and evidence. Preserve issued records permanently in V1.

### Consequences

- History remains resolvable and restorable.
- Queries must hide inactive records by default.
- Permanent purge and retention policies are deferred.

## ADR-018 — Use a stable HTTPS origin for production

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

IndexedDB is scoped to the web origin. Moving between origins makes the same local data appear absent.

### Decision

V1 is a static production build deployed to one stable private HTTPS origin. Origin changes require an explicit backup/export and restore migration plan.

### Consequences

- Deployment naming and ownership matter to data continuity.
- Preview origins are not production data stores.
- Release instructions emphasize backup before origin changes.

## ADR-019 — No analytics, telemetry, or remote asset dependency in V1

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

The product handles confidential proof and is designed to keep it local. Remote logging or runtime fonts/icons would add privacy and reliability dependencies.

### Decision

V1 sends no analytics or product telemetry. Use bundled or system assets for normal application rendering.

### Consequences

- Debugging relies on local, non-sensitive diagnostics.
- The application remains usable without third-party runtime asset hosts after load.
- Any future telemetry requires explicit consent, data classification, and a new decision.

## ADR-020 — Delivery is phase-gated

- **Status:** Superseded by ADR-021
- **Date:** 2026-09-20

### Context

Asking an agent to build the entire product in one pass makes architectural drift, untested behavior, and unrelated changes difficult to control.

### Decision

Deliver the product in the phases defined by `ROADMAP.md`. Each task has explicit scope, non-goals, acceptance criteria, and quality gates. Commits occur only when explicitly requested.

### Consequences

- Progress is reviewable and reversible.
- Later features cannot be used to excuse incomplete current-phase quality.
- Documentation is part of the implementation contract.

## ADR-021 — Continuous V1 completion is explicitly authorized

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

The user explicitly requested uninterrupted execution through the finished
product rather than pausing at each roadmap gate. The managed runtime also does
not expose a launchable Chromium binary, although all non-browser release gates
and deterministic workflow tests run successfully.

### Decision

Continue through Phases 2–18 in one owned delivery, preserving every business
invariant and quality gate. Treat the unavailable local Chromium launch as an
environment-only verification limitation: keep the Playwright smoke test in the
repository, record the limitation, and do not misclassify it as a product
failure or stop an otherwise verified private release.

### Consequences

- ADR-020 remains the historical default but no longer pauses this V1 delivery.
- Source, tests, documentation, packaging, and private deployment are completed
  as one release unit.
- Browser-enabled environments can run the checked-in Playwright specification
  without changing product code.

## ADR-022 — Add timezone and ZIP adapters for V1 semantics

- **Status:** Accepted
- **Date:** 2026-09-20

### Context

Stable local work dates require IANA timezone conversion independent of the
device timezone. Portable backups require safe ZIP creation and inspection in
the browser without a server.

### Decision

Use `date-fns-tz` for explicit timezone conversion and `fflate` for versioned
backup archives. Keep all canonical time, duration, money, reference, and
checksum rules in WorkLedger services rather than delegating business meaning
to either adapter.

### Consequences

- Midnight and daylight-saving boundaries are testable and device-independent.
- Backups remain downloadable, inspectable, and restorable entirely in the
  browser.
- Both dependencies are documented implementation adapters rather than hidden
  sources of domain policy.

## Decision change process

To change an accepted decision:

1. Describe the concrete problem with the current decision.
2. Identify affected rules, entities, migrations, tests, and shipped data.
3. Add a new ADR marked `Proposed`; do not edit history to make the old decision disappear.
4. Obtain explicit approval.
5. Mark the old ADR `Superseded by ADR-NNN` and the new one `Accepted`.
6. Update all affected source-of-truth documents in the same change.
