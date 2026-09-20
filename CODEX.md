# Codex operating contract

This file contains standing rules for every implementation task in WorkLedger. It is intentionally strict because the application stores evidence and data used to calculate money.

## 1. Required reading

Before any change, read:

1. `docs/PRODUCT.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DATA_MODEL.md`
4. `docs/BUSINESS_RULES.md`
5. `docs/ROADMAP.md`
6. `docs/DECISIONS.md`

Then inspect only the source files needed for the active task. Do not begin implementation until the requested scope and the active roadmap phase agree.

## 2. Scope discipline

- Implement only the requested phase or subphase.
- Do not pre-build later features, placeholder business logic, speculative routes, or unused abstractions.
- Do not silently change architecture, business rules, terminology, entity semantics, or roadmap order.
- If implementation exposes a material contradiction, stop and report it. Propose a documentation change before changing behavior.
- Do not rewrite a working feature while delivering an unrelated feature.
- Do not change or add a dependency without stating the need and receiving approval, except when the dependency is already explicitly approved in `docs/ARCHITECTURE.md` for the current phase.
- Do not commit unless the user explicitly asks for a commit.

## 3. Sources of truth

Use this precedence when resolving product behavior:

1. The user's latest explicit instruction.
2. `docs/BUSINESS_RULES.md` for behavioral rules and calculations.
3. `docs/DATA_MODEL.md` for persisted concepts and invariants.
4. `docs/ARCHITECTURE.md` for code boundaries and runtime design.
5. `docs/PRODUCT.md` for scope and user experience.
6. `docs/DECISIONS.md` for rationale and constraints.
7. `docs/ROADMAP.md` for delivery order.

Never duplicate a canonical rule in code with a different interpretation.

## 4. Architecture rules

- UI components must not access Dexie or IndexedDB directly.
- UI components call feature-level application services or commands.
- Repositories implement persistence interfaces; domain code must not import Dexie, React, browser storage, or PDF libraries.
- All duration calculations use the canonical time utilities or `TimeCalculationService`.
- All monetary calculations use the canonical billing utilities or `BillingService`.
- All timestamps persisted as instants use UTC ISO 8601 strings. Local calendar dates use `YYYY-MM-DD` plus an IANA timezone where needed.
- Money is stored as integer minor units. Never persist floating-point currency values.
- Durations are stored as integer seconds. Never use formatted strings as source data.
- Issued invoices are immutable snapshots.
- Evidence binary data belongs in IndexedDB as `Blob`; never put base64 evidence in `localStorage`.
- Zustand is not the database. Persisted business records remain in repositories.
- A mutation that changes time or money and its audit event must commit atomically.
- Database schema changes require an additive Dexie version and an explicit migration. Never clear user data to make a migration pass.

## 5. Data safety

- Never delete or reset IndexedDB as an implementation shortcut.
- Never delete an existing migration.
- Never overwrite a user's backup or evidence file without an explicit action.
- Treat imports as untrusted input: validate schema, version, identifiers, references, file metadata, and checksums before mutation.
- Restore must be all-or-nothing. A failed restore leaves the prior database unchanged.
- Large evidence blobs must not be copied into audit records, logs, test snapshots, or console output.
- Never log private evidence contents, billing addresses, payment details, or full backup payloads.

## 6. UI and accessibility rules

- WorkLedger is a working surface, not a marketing page. Core work controls must be immediately available.
- Use semantic HTML and accessible labels. Every interaction must work by keyboard.
- Main body text is at least `1rem`; routine labels are normally at least `0.875rem`.
- Support the agreed responsive widths: 1440, 1200, 1024, 768, and 390 pixels.
- Prevent unintended horizontal scrolling and clipped dialogs.
- Use the shared design tokens and UI primitives. Do not create page-specific versions of buttons, fields, badges, dialogs, tables, toasts, or empty states without a documented need.
- Include loading, empty, validation, failure, and success states for every data workflow.
- A failed evidence save must not discard a successfully saved work session.
- Do not use decorative imagery in the application shell. Charts and evidence thumbnails must serve the workflow.

## 7. Implementation workflow

For every task:

1. Restate the exact scope internally and list explicit non-goals.
2. Inspect repository status and preserve unrelated user changes.
3. Identify affected rules, entities, services, repositories, and UI surfaces.
4. Make the smallest coherent change.
5. Add or update tests at the same boundary as the behavior.
6. Run the quality gates available for the phase.
7. Review the diff for unrelated changes and accidental generated files.
8. Update documentation only when behavior, architecture, schema, or roadmap status changed.

Do not weaken a test merely to make a change pass. Fix the behavior or explain the documented rule that must change.

## 8. Required quality gates

Once Phase 1 defines the scripts, run all of these before claiming a phase is complete:

```text
format:check
lint
typecheck
test
build
```

Run relevant integration and Playwright tests when the phase introduces or changes a user workflow. Report any gate that could not run and why.

## 9. Testing expectations

- Prefer pure unit tests for time, money, date partitioning, invoice totals, validation, and state transitions.
- Use repository integration tests for Dexie schemas, transactions, indexes, migrations, backup, and restore.
- Use component tests for validation, accessibility, and interaction states.
- Use Playwright for complete critical journeys only.
- Use deterministic clocks, IDs, and timezone fixtures in tests. Do not rely on the machine's current locale or wall clock.
- Include boundary cases: zero/negative values, midnight, DST changes, pause/resume cycles, rate changes, rounding, duplicate actions, reload recovery, failed blob writes, and schema mismatch.

## 10. Definition of done

A phase is complete only when:

- Its implementation and documented acceptance criteria are complete.
- TypeScript has no errors.
- Formatting, linting, tests, and build pass.
- There are no blocking console or runtime errors.
- Relevant desktop and mobile layouts have been checked.
- Existing functionality still works.
- Schema changes have migrations and migration tests.
- Business-sensitive mutations have audit coverage.
- No unrelated files changed.
- The roadmap status and any affected documentation are current.

## 11. Task report format

At the end of an implementation task, report:

1. Outcome.
2. Changed files and their purpose.
3. Tests and quality gates run, with results.
4. Any assumptions, deferred items, or risks.
5. The next roadmap step, without implementing it.

Never say “implemented successfully” without evidence from the relevant quality gates.
