# WorkLedger delivery roadmap

- **Document status:** V1.1 cloud-continuity release record
- **Roadmap version:** 1.1.1
- **Last updated:** 2026-09-21

## 1. Delivery policy

WorkLedger is delivered in narrow, verifiable phases. A later phase does not begin until the current phase meets its exit criteria or the user explicitly changes the order.

Status values:

- `COMPLETE` — exit criteria verified.
- `IN PROGRESS` — actively being delivered.
- `PENDING` — approved but not started.
- `BLOCKED` — cannot proceed without a decision or external requirement.
- `COMPLETE*` — implementation is complete with a documented environment-only
  verification limitation.

## 2. Roadmap summary

| Phase | Name                                   | Status    | User-visible milestone                           |
| ----: | -------------------------------------- | --------- | ------------------------------------------------ |
|     0 | Product and architecture baseline      | COMPLETE  | Complete implementation contract                 |
|     1 | Repository and quality foundation      | COMPLETE  | Clean runnable application shell baseline        |
|     2 | Design system and navigation shell     | COMPLETE  | Recognizable responsive WorkLedger UI            |
|     3 | Domain and persistence foundation      | COMPLETE  | Versioned local database and repositories        |
|     4 | Profile, clients, projects, and tasks  | COMPLETE  | User can configure billable work                 |
|     5 | Previous work and manual entry         | COMPLETE  | **Milestone 1: existing work can be entered**    |
|     6 | Live timer                             | COMPLETE  | **Milestone 2: new work can be tracked live**    |
|     7 | Evidence and proof of work             | COMPLETE  | **Milestone 3: proof can be attached privately** |
|     8 | Work Log and Timesheet                 | COMPLETE  | Complete review and correction workflow          |
|     9 | Dashboard                              | COMPLETE  | At-a-glance activity view                        |
|    10 | Earnings and analytical reports        | COMPLETE  | **Milestone 4: earnings reconcile visibly**      |
|    11 | Invoice engine                         | COMPLETE  | Draft and issued billing records                 |
|    12 | Invoice PDF                            | COMPLETE  | **Milestone 5: professional invoice download**   |
|    13 | Work Report PDF                        | COMPLETE  | Detailed proof-backed client report              |
|    14 | Audit history experience               | COMPLETE  | User can inspect material edits                  |
|    15 | Backup and restore                     | COMPLETE  | Complete local continuity workflow               |
|    16 | Critical end-to-end verification       | COMPLETE* | Core journeys protected                          |
|    17 | Accessibility, performance, and polish | COMPLETE  | Release-quality interaction and scale            |
|    18 | Production release                     | COMPLETE  | Private stable deployment and release package    |
|    19 | Private cloud continuity               | COMPLETE  | Cross-device records and evidence persistence    |

## 3. Phase 0 — Product and architecture baseline

### Goal

Freeze V1 terminology, scope, data semantics, business rules, architecture, and delivery constraints before application code exists.

### Deliverables

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `DATA_MODEL.md`
- `BUSINESS_RULES.md`
- `ROADMAP.md`
- `DECISIONS.md`
- `CODEX.md`
- Repository-level `AGENTS.md`

### Exit criteria

- V1 scope and non-goals are explicit.
- The session, segment, evidence, invoice, and audit models are internally consistent.
- Timezone, midnight, overlap, rounding, and invoice rules are deterministic.
- Local storage and backup boundaries are explicit.
- Every later phase has bounded scope and acceptance criteria.
- No application code or dependencies were introduced.

### Status

`COMPLETE` on 2026-09-20 after cross-document validation.

## 4. Phase 1 — Repository and quality foundation

### Goal

Create the smallest clean React/TypeScript/Vite repository with reproducible quality gates and no product feature implementation.

### In scope

- Initialize Git and the application.
- TypeScript strict mode.
- Vite configuration and path aliases.
- ESLint and Prettier.
- Vitest and React Testing Library setup.
- Playwright skeleton and isolated browser profile.
- Package scripts for format, lint, typecheck, test, end-to-end test, and build.
- Environment/documentation conventions.
- Base error boundary and test utilities only where required for setup.
- Preserve all Phase 0 documents.

### Out of scope

- Product routes, sidebar, design system, database, entities, forms, or business logic.

### Exit criteria

- Fresh install succeeds from the lockfile.
- Development server shows a minimal WorkLedger placeholder, not a product feature.
- `format:check`, `lint`, `typecheck`, `test`, and `build` pass.
- One smoke unit test and one Playwright smoke test pass.
- No unnecessary dependency is present.
- README contains exact development commands.

### Status

`COMPLETE`. Repository setup, dependency lockfile, formatting, linting, strict
type checking, deterministic tests, and the production build are verified.
The Playwright smoke specification is implemented and discovered correctly.

## 5. Phase 2 — Design system and navigation shell

### Goal

Build a coherent, accessible, responsive application shell before feature screens diverge visually.

### In scope

- Design tokens: color, typography, spacing, radius, shadows, layers, breakpoints, focus, and motion.
- Shared primitives: button, input, textarea, select, checkbox, radio group, switch, card, badge, dialog, sheet, dropdown, table, tooltip, toast, empty state, and skeleton.
- Responsive sidebar and mobile navigation.
- App header and global action area.
- Persistent inactive/active timer strip shell with mock presentation state only.
- Route placeholders for approved information architecture.
- Site-specific favicon and document metadata.
- Accessibility baseline and reduced-motion behavior.

### Out of scope

- IndexedDB, real timer behavior, client/project forms, session persistence, and charts.

### Exit criteria

- The app is recognizable as WorkLedger at 1440, 1200, 1024, 768, and 390 pixels.
- Navigation works by mouse, touch, and keyboard.
- Dialog focus, labels, and errors follow accessible patterns.
- No page-specific duplicate primitives exist.
- No unintended horizontal scrolling exists at supported widths.
- Quality gates pass.

## 6. Phase 3 — Domain and persistence foundation

### Goal

Implement the versioned local data layer and pure domain foundation without complete feature UI.

### In scope

- Domain types and value validation.
- Time and money utilities.
- Typed application errors and result pattern.
- Repository interfaces.
- Dexie database version 1, tables, and indexes.
- Repository adapters for all V1 entities.
- Transaction coordinator.
- Audit append foundation.
- Deterministic clock and ID test adapters.
- Migration test harness.

### Out of scope

- User-facing CRUD workflows, timer controls, evidence UI, invoices, and backup ZIPs.

### Exit criteria

- Database schema matches `DATA_MODEL.md`.
- Repository tests cover create/read/update, conflict, soft deletion, indexes, and transactions.
- A business record and audit event can commit atomically.
- Money and duration examples from `BUSINESS_RULES.md` are executable tests.
- Schema versioning can migrate a seeded prior-version fixture without clearing data.
- UI code has no direct database import.
- Quality gates pass.

## 7. Phase 4 — Profile, clients, projects, and tasks

### Goal

Let the user configure identity, billing parties, projects, rates, and reusable task labels.

### In scope

- First-run freelancer settings.
- Client create, edit, archive, restore, and list.
- Project create, edit, archive, restore, and list.
- Task create, edit, archive, restore, and list.
- Currency and IANA timezone selection.
- Invoice prefix/payment settings required by later phases.
- Validation, conflict handling, and audit events.

### Out of scope

- Work sessions, timer, evidence, earnings, and invoices.

### Exit criteria

- First-run journey creates profile, client, project, and optional task.
- Active/archive behavior matches business rules.
- Duplicate normalized names are handled.
- Rate is stored as integer minor units.
- Editing a project cannot silently mutate historical snapshots in seeded tests.
- Responsive and keyboard flows pass component tests.
- Quality gates pass.

## 8. Phase 5 — Previous work and manual entry

### Goal

Deliver the first operational milestone: enter work that occurred before WorkLedger existed.

### Subphases

#### 5.1 Manual duration entry

- Project/date/duration/task/description/billable/rate input.
- Rate override review.
- Complete session creation and earnings preview.

#### 5.2 Manual range entry

- Start/end/break input.
- Timezone resolution.
- Duration preview.
- Overlap prevention.
- Cross-midnight split preview.

#### 5.3 Quick historical entry

- Multiple date/duration rows.
- Atomic validation and save.
- Incomplete-detail labels.
- “Add details later” workflow.

#### 5.4 Completed-session correction

- Edit eligible session.
- Required reason for material changes.
- Soft delete and restore.
- Audit recording.

### Out of scope

- Live timer, evidence, invoice generation, and dashboard charts.

### Exit criteria

- User can enter both existing work days without starting from zero.
- Manual range and duration-only records retain distinct semantics.
- Quick rows cannot be invoiced until completed.
- Invalid, future, zero, excessive, overlapping, and cross-midnight cases behave as documented.
- Work totals and amount previews use central services.
- Data survives reload.
- Quality gates and Phase 5 Playwright journey pass.

## 9. Phase 6 — Live timer

### Goal

Reliably track new work through pause/resume, reload, suspension, midnight, and multi-tab use.

### In scope

- Start, pause, resume, stop, and discard-zero-time actions.
- Segment creation and duration projection.
- Persisted active state and global timer strip.
- Recovery after reload/browser restart.
- Cross-tab locking and notifications.
- Local-midnight partitioning.
- Clock-anomaly handling.
- Timer-specific audit events and tests.

### Out of scope

- Automatic screenshots, idle detection, activity monitoring, and background native services.

### Exit criteria

- Exactly one active timer invariant holds under concurrent test actions.
- Pause time is excluded.
- Reload and simulated sleep do not lose elapsed time.
- Midnight recovery partitions exactly with no missing or duplicated seconds.
- Duplicate commands are safe.
- Visible timer remains usable across routes and supported widths.
- Playwright start/pause/reload/resume/stop journey passes.
- Quality gates pass.

## 10. Phase 7 — Evidence and proof of work

### Goal

Attach confidential proof locally without threatening saved time records.

### In scope

- Screenshot, file, and link evidence.
- Session and daily scope.
- Blob storage, checksums, thumbnails, and previews.
- Per-item progress and partial-failure handling.
- File validation and quota messaging.
- Proof of Work browsing/filtering surface.
- Soft deletion and audit metadata.

### Out of scope

- Cloud uploads, automatic capture, OCR, annotation, or redaction.

### Exit criteria

- Supported evidence survives reload and is linked correctly.
- Failed evidence does not remove or roll back a session.
- Unsafe links and disallowed files are rejected.
- Object URLs are cleaned up.
- Quota failures are actionable.
- Audit logs contain metadata but no blob contents.
- Quality gates and evidence Playwright journey pass.

## 11. Phase 8 — Work Log and Timesheet

### Goal

Provide a complete daily and tabular review workflow over the canonical sessions.

### In scope

- Work Log grouped by work date.
- Timesheet table/list adaptations.
- Filters: period, client, project, task, source, billable state, and detail status.
- Daily totals and period totals per currency.
- Evidence counts and links.
- Edit, archive, restore, and history entry points.
- Pagination/windowing only if measured data requires it.

### Exit criteria

- Manual and tracked sessions render correctly.
- Duration-only sessions show no invented range.
- Filters produce deterministic totals.
- Deleted sessions are hidden by default and recoverable through an explicit view.
- Incomplete sessions are obvious.
- Desktop table and mobile list remain fully usable.
- Quality gates pass.

## 12. Phase 9 — Dashboard

### Goal

Make the first screen immediately useful for starting work and understanding current activity.

### In scope

- Active timer or ready-to-start control in first viewport.
- Today, current week, current month, and per-currency earnings.
- Weekly activity chart.
- Recent sessions.
- Project distribution.
- New-user and no-results states.

### Exit criteria

- No dashboard business data is independently persisted.
- Cards reconcile with filtered Work Log/Timesheet fixtures.
- Active timer controls remain primary and accessible.
- Charts have accessible text/table summaries.
- Empty and multi-currency states are clear.
- Quality gates pass.

## 13. Phase 10 — Earnings and analytical reports

### Goal

Let the user reconcile worked time and earnings before invoicing.

### In scope

- Period, client, project, task, and billable filters.
- Time and earnings summaries per currency.
- Daily/weekly trend and project breakdown.
- Reconciliation drill-down to source sessions.
- Export-friendly report view; no final PDFs yet.

### Exit criteria

- Every amount uses per-session canonical rounding.
- Mixed currencies never collapse into one number.
- Drill-down session sums equal every summary.
- Boundary periods and empty states are tested.
- Charts have accessible alternatives.
- Quality gates pass.

## 14. Phase 11 — Invoice engine

### Goal

Create defensible draft and issued invoice records before rendering PDFs.

### Subphases

#### 11.1 Eligibility and draft builder

- Client/period/currency selection.
- Eligible and excluded lists with reason codes.
- Session selection and draft links.
- Draft totals and release behavior.

#### 11.2 Line construction

- Deterministic weekly/project/rate grouping.
- Session and line reconciliation.

#### 11.3 Issue transaction

- Revalidation.
- Atomic sequence allocation.
- Complete snapshots.
- Immutable issued graph.
- Session locking and audit events.

### Exit criteria

- One session cannot enter two drafts or invoices.
- Concurrent issue attempts cannot duplicate a number or bill a session twice.
- Issued totals reconcile to linked session snapshots.
- Later source edits cannot change an issued fixture.
- Invalid issue leaves the entire draft unissued.
- Quality gates and invoice-engine integration tests pass.

## 15. Phase 12 — Invoice PDF

### Goal

Render a clean, professional invoice from an issued snapshot.

### In scope

- Document-specific view model.
- Freelancer/client blocks.
- Invoice number, issue date, due date, and period.
- Weekly/project/rate lines.
- Human duration, rate, subtotal, and total.
- Payment details and notes.
- Multipage behavior and filename rules.
- Regeneration from issued snapshots.

### Exit criteria

- The same issued record regenerates the same semantic document.
- Long names, addresses, notes, and many lines paginate cleanly.
- Fonts and characters render without clipping.
- The document has no tracked/manual label.
- Currency and totals match the invoice engine exactly.
- Representative PDFs receive visual review.
- Quality gates pass.

## 16. Phase 13 — Work Report PDF

### Goal

Generate a separate detailed activity report with deliberate evidence inclusion.

### In scope

- Period-based and invoice-based report sources.
- Summary metrics.
- Date and session sections.
- Optional source labels.
- User-selected evidence thumbnails.
- Missing evidence warning behavior.
- Multipage layout and image sizing.

### Exit criteria

- Invoice-based time reconciles to invoice snapshots.
- Current-period report reconciles to filters.
- Evidence is included only after explicit selection.
- Corrupt/missing evidence does not destroy the report.
- Large report layout is visually reviewed.
- Quality gates pass.

## 17. Phase 14 — Audit history experience

### Goal

Expose the audit foundation as readable history without allowing mutation.

### In scope

- Entity history panels.
- Before/after field presentation.
- Operation grouping.
- Edit timestamps and reasons.
- Filters for material actions.

### Exit criteria

- Time and financial edits are understandable in plain language.
- History is read-only.
- Blobs and sensitive redundant payloads are absent.
- Creation, correction, deletion, restore, and invoice issue fixtures render correctly.
- Quality gates pass.

## 18. Phase 15 — Backup and restore

### Goal

Protect all local records and evidence with a versioned, validated continuity workflow.

### Subphases

#### 15.1 Export

- Portable serialization.
- ZIP structure and checksums.
- Consistent snapshot.
- Progress and download naming.

#### 15.2 Import validation and preview

- Safe archive parsing.
- Schema/reference/checksum validation.
- Preview counts, dates, sizes, and replacement warning.

#### 15.3 Atomic replacement restore

- Active-timer precondition.
- Safety export offer.
- Transactional replacement.
- Restore audit event.

### Exit criteria

- Export/import round trip preserves every canonical field and original evidence checksum.
- Corrupt, truncated, malicious-path, unsupported-version, and broken-reference fixtures are rejected before mutation.
- Simulated write failure leaves current data unchanged.
- Merge is not implied or performed.
- Quality gates and restore Playwright journey pass.

## 19. Phase 16 — Critical end-to-end verification

### Goal

Protect complete user outcomes across features.

### Required journeys

1. First run → profile → client → project.
2. Two historical days using range and duration modes.
3. Quick entry → complete details → invoice eligibility.
4. Start → pause → reload → resume → stop.
5. Upload evidence with one simulated item failure.
6. Work Log/Timesheet/Earnings reconciliation.
7. Draft → issue invoice → generate invoice PDF.
8. Generate invoice-based work report.
9. Export → replace in isolated browser → restore → reconcile.

### Exit criteria

- Required journeys pass in supported Chromium baseline.
- Critical domain cases remain covered by faster tests.
- Test data is deterministic and isolated.
- No test requires network data or real confidential files.
- Quality gates pass as one clean run.

## 20. Phase 17 — Accessibility, performance, and polish

### Goal

Harden the complete product without expanding scope.

### In scope

- Keyboard-only walkthrough.
- Screen-reader names, landmarks, live regions, and error association.
- Contrast and 200% text zoom.
- Reduced motion.
- Large-dataset measurement and targeted optimization.
- Large-evidence memory behavior.
- Storage estimate and persistence request UX.
- Error message and empty-state copy review.
- Supported viewport regression check.

### Exit criteria

- No critical automated accessibility violations on primary routes.
- All critical journeys work by keyboard.
- 200% text enlargement remains usable.
- Agreed large fixture remains responsive without loading the full database into routine screens.
- PDF/backup paths do not retain avoidable object URLs or blobs.
- No scope-expanding “polish” features were added.
- Quality gates pass.

## 21. Phase 18 — Production release

### Goal

Release a private, stable V1 without risking local data continuity.

### In scope

- Final production build.
- Stable HTTPS origin and private access configuration.
- Content Security Policy and production metadata.
- Clean favicon and application title.
- Release notes with schema and backup versions.
- Smoke test on deployed origin.
- First-backup prompt and storage warning.
- Source tag/version after explicit approval.

### Exit criteria

- Deployed application loads with no blocking console/runtime errors.
- IndexedDB persists across normal reloads on the deployed origin.
- Manual entry, timer, evidence, invoice PDF, report PDF, and backup smoke checks pass.
- No credentials, private samples, or debug fixtures are shipped.
- A fresh V1 backup can be exported from the deployed build.
- User receives the private application URL and release summary.

## 22. Phase 19 — Private cloud continuity

### Goal

Keep the owner's complete ledger and evidence available after browser restarts,
browser/device changes, and ordinary redeployments without discarding the fast
local workflow.

### In scope

- Private Site identity as the storage ownership boundary.
- D1 migrations and owner-scoped versioned structured snapshots.
- R2 persistence for original evidence files.
- Existing same-origin IndexedDB migration on first cloud-backed load.
- Local pending-write recovery after network failure.
- Optimistic multi-writer conflict detection with no silent overwrite.
- Visible synchronization state.
- Cloud synchronization after validated backup restore.
- Same stable private production URL.

### Exit criteria

- An empty cloud account receives the complete existing local ledger and all
  evidence before reporting synchronized state.
- A later browser/device load hydrates the same records and evidence from cloud.
- Every application mutation queues and awaits its cloud snapshot attempt.
- Network failure leaves local records intact and retries after reconnection or
  reload.
- Competing stale versions fail without overwriting the accepted cloud version.
- Evidence download verifies ownership through the current structured snapshot.
- D1 structured payloads are chunked below the platform row limit.
- Backup export and atomic restore continue to work.
- Formatting, linting, type checking, tests, build, private deployment, and live
  API smoke checks pass.

### Status

`COMPLETE`. The owner-private server-backed version is deployed on the stable
production origin. The live D1 binding contains the version and snapshot-chunk
tables, and the deployment includes the R2 evidence binding. Existing browser
data migrates on the owner's first load from the browser that holds that data.

## 23. Milestone acceptance statements

### Milestone 1 — Historical work operational

> I can create my profile, client, and project, then enter the work I already completed on prior days using exact time ranges or duration only.

### Milestone 2 — Live tracking operational

> I can start work, pause, reload, resume, and stop without losing or double-counting time.

### Milestone 3 — Proof operational

> I can attach local screenshots, files, and links to sessions or days without risking the time record.

### Milestone 4 — Reconciliation operational

> Dashboard, Timesheet, and Earnings show explainable totals derived from the same sessions.

### Milestone 5 — Billing operational

> I can issue an immutable invoice and download it with a separate detailed work report.

### Milestone 6 — Continuity operational

> I can export everything and restore it safely after validation.

## 24. Global definition of done

Every phase must satisfy `CODEX.md` and additionally show:

- Traceability to the relevant business rules.
- No undocumented schema or dependency change.
- No direct IndexedDB access from UI.
- No duplicated duration or billing calculation.
- No unrelated source changes.
- Passing format, lint, typecheck, tests, and build.
- Updated phase status only after evidence is available.

## 25. Risk register

| Risk                               | Impact                      | Planned control                                                |
| ---------------------------------- | --------------------------- | -------------------------------------------------------------- |
| Browser data is cleared or evicted | Pending local edits at risk | Visible cloud state, retry queue, and portable backup          |
| Timer open in multiple tabs        | Duplicate/conflicting time  | Web Locks, database invariant, version checks, broadcasts      |
| System clock changes               | Invalid duration            | Instant validation, anomaly error, audited correction          |
| DST/midnight boundaries            | Wrong date or duration      | Stored timezone/instants, deterministic partition tests        |
| Large evidence exhausts quota      | Failed proof save           | Size limits, usage estimate, partial failure, backup guidance  |
| Floating-point math                | Incorrect earnings          | Integer seconds/minor units and `bigint` calculation           |
| Project/rate changes               | Historical totals drift     | Session and invoice snapshots                                  |
| Duplicate billing                  | Financial error             | Unique session link and issue-time revalidation                |
| Schema evolution                   | Existing data breaks        | Versioned migrations and prior-version fixtures                |
| Invalid backup                     | Corruption on restore       | Full validation and atomic replacement                         |
| Generated PDFs clip content        | Unprofessional documents    | Representative visual rendering checks                         |
| Scope growth                       | Delayed, unstable V1        | Phase boundaries and explicit non-goals                        |
| Stale device writes                | Cross-device data loss      | Optimistic cloud version keys; preserve local copy on conflict |
| Cloud outage                       | Delayed cross-device save   | IndexedDB pending queue, visible status, retry, ZIP backup     |
| D1 row-size limit                  | Structured sync failure     | Ordered bounded snapshot chunks and UTF-8 length validation    |

## 26. V1 verification record

- Formatting, ESLint, strict TypeScript, 18 unit/integration tests, and the
  server-backed production build pass as one release gate.
- Tests cover integer billing, duration formatting, organization edits without
  historical mutation, manual work, timer pause/resume, midnight partitioning,
  invoice issuance and immutability, WebMCP operations, and backup
  validation/restore.
- The Playwright first-run smoke specification is checked in. Execution inside
  the managed build runtime is unavailable because it exposes no launchable
  Chromium binary; this is an environment-only limitation recorded under
  ADR-021.
- The production Site remains owner-private and uses one stable origin. D1 and
  R2 provide owner-scoped continuity, while IndexedDB remains a local cache and
  pending-write safety layer.
- The server-backed production version deployed successfully, and its live D1
  binding exposes the expected version and snapshot-chunk tables. Production
  data was not seeded or modified during deployment verification.
