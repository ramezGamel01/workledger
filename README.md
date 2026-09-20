# WorkLedger

WorkLedger is a local-first work tracking application for hourly contractors. It records live and historical work, keeps proof of work beside the time it supports, calculates earnings, and produces professional invoices and work-activity reports.

## Current state

**WorkLedger V1 is complete and prepared for its private production release.**

The application now covers the full local-first workflow: freelancer setup,
clients, projects and tasks, historical entry, a resilient live timer, proof of
work, logs and timesheets, earnings analysis, immutable invoices, invoice and
work-report PDFs, read-only audit history, plus validated ZIP backup and atomic
restore.

Formatting, linting, strict type checking, 13 deterministic tests, and the
production build pass. A Chromium smoke specification is included; its local
execution is unavailable in this managed runtime because no launchable browser
binary is exposed. This environment limitation does not affect the deployed
static application.

The Phase 0 baseline is defined by:

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — users, outcomes, scope, and workflows.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — boundaries, layers, storage, and quality strategy.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — entities, fields, relationships, indexes, and invariants.
- [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — canonical time, money, evidence, invoice, and backup rules.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased delivery plan and acceptance gates.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — accepted architectural decision records.
- [`CODEX.md`](CODEX.md) — permanent implementation rules for Codex.

`AGENTS.md` makes these instructions discoverable to coding agents. `CODEX.md` remains the detailed source of truth.

## Product flow

```text
Freelancer Profile
        ↓
Client → Project → Work Session → Evidence
                         ↓
          Work Log / Timesheet / Earnings
                         ↓
                Invoice / Work Report
```

## V1 technology baseline

- React, TypeScript, and Vite
- React Router
- Dexie over IndexedDB
- Zustand for transient application state only
- React Hook Form and Zod
- date-fns, with one approved timezone adapter if implementation proves it necessary
- Recharts
- `@react-pdf/renderer`
- Vitest, React Testing Library, and Playwright
- ESLint and Prettier

## Privacy and continuity

- Canonical records and evidence stay in browser IndexedDB on the production
  origin.
- WorkLedger has no application account, analytics, telemetry, cloud sync, or
  automatic evidence upload.
- Export a complete ZIP from **Settings → Backup & restore** before clearing
  browser data, changing devices, or moving to a different origin.
- Restoring a backup validates versions, references, paths, and checksums before
  replacing the current local dataset atomically.

## Development

```bash
pnpm install
pnpm dev
```

Quality gates:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Install the Playwright browser once on a browser-enabled development machine:

```bash
pnpm exec playwright install chromium
```

## Release record

See [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md) for the V1 feature,
storage, compatibility, and verification summary.
