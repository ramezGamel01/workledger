# WorkLedger V1.1 cloud continuity release notes

- **Version:** 1.1.0
- **Release date:** 2026-09-21
- **Database schema:** 1
- **Cloud schema migrations:** 2
- **Backup format:** 1
- **Audience:** private, owner-only Site

## What is included

- Freelancer identity, invoice defaults, payment details, and storage controls.
- Client, project, and task creation, editing, archive, and restore workflows.
- Historical duration, exact-range, and multi-day quick entry.
- Persistent live timer with pause/resume, reload recovery, cross-tab locking,
  clock checks, and local-midnight partitioning.
- Session corrections, recoverable deletion, readable audit history, and stable
  historical rate/task/timezone snapshots.
- Local screenshots, safe files, and web-link evidence with SHA-256 checksums.
- Dashboard, Work Log, Timesheet, Proof of Work, reports, and multi-currency
  earnings reconciliation.
- Draft and immutable issued invoices with deterministic numbering and frozen
  billing snapshots.
- Downloadable invoice PDFs and evidence-selective work-report PDFs.
- Versioned ZIP export, checksum/reference validation, preview, and atomic
  replacement restore.
- Feature-detected WebMCP tools for safe summary, manual-entry, and timer
  operations through the same application services.
- Owner-scoped D1 persistence for structured records with bounded snapshot
  chunks and optimistic version conflicts.
- Owner-scoped R2 persistence for screenshots and evidence files.
- Automatic first-load migration from the existing production-origin
  IndexedDB ledger when the cloud ledger is empty.
- Visible synchronized, pending, and conflict states with reconnect/reload
  retry behavior.

## Verification

The cloud release passes Prettier, ESLint, strict TypeScript, 15 deterministic
unit/integration tests, and a server-backed production build. The repository
includes a Playwright first-run smoke test. This managed build environment
exposes no launchable Chromium binary, so that one browser process could not be
executed locally; the limitation is documented in ADR-021 and does not change
the deployed application.

The owner-private production deployment completed on the stable Site origin.
Its live D1 binding contains the expected version and snapshot-chunk tables;
deployment verification did not seed or alter owner records.

## Data continuity

WorkLedger now stores structured records in the owner's private D1-backed
ledger, original evidence in owner-scoped R2 storage, and a hydrated copy in
IndexedDB. Normal close/reopen and same-account device changes load the latest
complete cloud version. Pending network writes remain on the originating device
and retry; version conflicts never overwrite silently. Export a complete backup
from Settings as a separate portable recovery copy. Restore always validates the
archive before replacing and resynchronizing the current dataset.

## Upgrade notes

The local Dexie schema and backup format remain version 1. Cloud migrations add
version and chunk tables without clearing IndexedDB. The first cloud-backed load
automatically uploads existing same-origin data only when no owner cloud ledger
exists. Future releases must preserve both local and cloud migrations and
declare any backup-format compatibility change here.
