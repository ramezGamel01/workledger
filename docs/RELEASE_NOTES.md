# WorkLedger V1 release notes

- **Version:** 1.0.0
- **Release date:** 2026-09-20
- **Database schema:** 1
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

## Verification

The release passes Prettier, ESLint, strict TypeScript, 13 deterministic
unit/integration tests, and a production build. The repository includes a
Playwright first-run smoke test. This managed build environment exposes no
launchable Chromium binary, so that one browser process could not be executed
locally; the limitation is documented in ADR-021 and does not change the
deployed static application.

## Data continuity

WorkLedger is local-first. Records and evidence are stored in IndexedDB for the
production origin and are not synchronized to another device. Export a complete
backup from Settings before clearing browser storage, changing devices, or
moving to another origin. Restore always validates the archive before replacing
the current dataset.

## Upgrade notes

This is the first production schema and backup format. No data migration is
required. Future releases must preserve schema migrations and declare any
backup-format compatibility change here.
