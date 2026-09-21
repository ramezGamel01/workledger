# WorkLedger business rules

- **Document status:** Accepted Phase 0 baseline
- **Rules version:** 1.1.1
- **Last updated:** 2026-09-21

Rule identifiers are stable references for code, tests, change discussions, and future migrations.

## 1. General rules

### WL-GEN-001 — Canonical records

Clients, projects, tasks, work sessions, segments, evidence assets, audit events, and invoices are canonical records. Dashboard cards, charts, timesheets, earnings summaries, and report previews are derived projections and must not become competing stores.

### WL-GEN-002 — Explicit units

- Durations are integer seconds.
- Money is integer minor units.
- Instants are UTC ISO 8601 strings.
- Calendar dates are `YYYY-MM-DD`.
- Currency is an ISO 4217 code.
- Timezone is an IANA identifier.

Formatted strings are presentation only.

### WL-GEN-003 — Deterministic dependencies

Any rule that needs a clock, identifier, locale, timezone, or rounding policy receives it explicitly. Tests must not depend on the machine's current clock or locale.

### WL-GEN-004 — Optimistic concurrency

Every update to a mutable aggregate supplies its expected `version`. If the persisted version differs, the mutation fails with a conflict and the UI reloads current data rather than overwriting another tab's update.

### WL-GEN-005 — No future historical work

A manual session's `workDate` cannot be later than “today” in the project's timezone. A live session may naturally continue from the current instant but is partitioned at local midnight.

## 2. Client, project, and task rules

### WL-ORG-001 — Active parent for new work

New work can be created only under an active project whose client is also active. Archived clients, projects, and tasks remain visible in history but are absent from new-work selectors.

### WL-ORG-002 — Project ownership

A project belongs to exactly one client and cannot be moved to another client after it has sessions or invoices. Before use, a project may be corrected through an audited update.

### WL-ORG-003 — Task ownership

An optional task must belong to the selected project. A task cannot be reassigned to another project after use.

### WL-ORG-004 — Rate snapshot

A new session copies the project's current hourly rate and currency. Later project changes affect only sessions created afterward.

For historical work, the form defaults to the current project rate but permits an explicit historical-rate override before save. The override is visible in review and recorded in the creation audit event.

### WL-ORG-005 — Project timezone

A new session copies the project's current timezone. Later timezone changes do not move prior sessions to different dates.

### WL-ORG-006 — Project date boundaries

Project start and end dates are planning metadata, not destructive billing barriers. New or historical work outside those dates requires a visible warning and explicit confirmation, but remains allowed while the client and project are active.

### WL-ORG-007 — Permanent deletion before use

An unreferenced task may be permanently deleted. An unreferenced project may
be permanently deleted together with its unused tasks. Any work-session
reference blocks task deletion; any work-session, evidence, or invoice-line
reference blocks project deletion. Referenced projects and tasks must be
archived instead. The reference check, deletion, and append-only audit events
are one atomic transaction.

## 3. Live timer state rules

### WL-TMR-001 — One active timer

Across the local application, at most one tracked session may have status `running` or `paused`.

Starting while another active session exists fails with a conflict and returns the existing session for navigation.

### WL-TMR-002 — Start

Starting a timer atomically:

1. Revalidates that no active session exists.
2. Captures project, task label, rate, currency, and timezone snapshots.
3. Creates one `tracked` session in `running` state.
4. Creates sequence 1 with `startedAt = now` and `endedAt = null`.
5. Appends the creation audit event.

A repeated start command with the same command identifier returns the existing result rather than creating a duplicate.

### WL-TMR-003 — Pause

Pause is valid only for a running session. It closes the one open segment at `now`, recalculates cached duration, and changes status to `paused` in one transaction.

Pausing an already paused session is a harmless no-op only when it repeats the same command identifier; otherwise it returns a state conflict.

### WL-TMR-004 — Resume

Resume is valid only for a paused session. It creates the next segment with `startedAt = now`, `endedAt = null`, then changes status to `running` in one transaction.

### WL-TMR-005 — Stop

- Stopping a running session closes its open segment at `now`.
- Stopping a paused session creates no additional elapsed time.
- Stop recalculates duration, sets `endedAt`, `finalizedAt`, and `status = completed`, and appends an audit event atomically.
- A zero-duration session cannot be completed; the UI offers discard instead.

### WL-TMR-006 — Canonical tracked duration

For a tracked session:

```text
durationSeconds = Σ (segment.endedAt - segment.startedAt)
```

Only closed segments contribute to persisted `durationSeconds`. For display while running, the UI adds `now - openSegment.startedAt` without persisting ticks.

### WL-TMR-007 — Pause time

Gaps between segments are excluded from worked duration. Displayed break duration may be derived from gaps, but it is never subtracted from segment duration again.

### WL-TMR-008 — Reload and sleep recovery

Page reload, tab suspension, browser restart, or device sleep does not stop a running timer. On recovery, elapsed time is reconstructed from persisted timestamps. The user must explicitly pause or stop it.

### WL-TMR-009 — Clock anomaly

If `now` is earlier than an open segment's start, the command fails safely and asks the user to correct the device clock or edit the completed record manually. Negative duration is never stored.

### WL-TMR-010 — Cross-tab action

Timer commands are serialized. A tab that loses a race does not retry blindly; it reloads the authoritative timer and presents the current state.

## 4. Midnight and timezone rules

### WL-DATE-001 — Stable work date

`workDate` is the local calendar date in the session's persisted timezone. Changing device timezone or display locale does not recategorize historical work.

### WL-DATE-002 — Live midnight partition

A tracked interval crossing local midnight is represented as one completed session per local date. Split sessions:

- share a `continuationGroupId`;
- copy project, task, description, billable state, rate, currency, and timezone snapshots;
- partition segments exactly at the local midnight instant;
- have independent durations and work dates;
- are aggregated normally in reports and invoices.

If the browser is suspended at midnight, partitioning is performed on recovery before the next timer mutation completes.

### WL-DATE-003 — Manual range crossing midnight

A single manual range cannot cross local midnight. When start/end imply different dates, the UI offers to create separate per-day entries and shows the calculated split before confirmation.

### WL-DATE-004 — Daylight-saving transitions

Manual range calculations use actual instants in the project timezone, not simple subtraction of clock labels.

- Nonexistent local times are rejected with an explanation.
- When a local time is ambiguous, the UI exposes the offset and defaults to the earlier valid instant.
- The resolved instants are stored so later timezone-database changes do not alter duration.

## 5. Historical work rules

### WL-MAN-001 — Manual range

A manual range requires:

- A non-future work date.
- Start and end local times on that date.
- End strictly after start after timezone resolution.
- `0 <= breakSeconds < wallClockSeconds`.

The canonical duration is:

```text
durationSeconds = resolvedEndInstant - resolvedStartInstant - breakSeconds
```

Duration must be at least 60 seconds.

### WL-MAN-002 — Duration only

A duration-only entry:

- Has no start or end time.
- Uses whole-minute input.
- Has a minimum of 1 minute and maximum of 24 hours.
- Stores `breakSeconds = 0`.

It appears in time-based views with its duration but no invented clock range.

### WL-MAN-003 — Quick historical entry

Each valid quick-entry row creates a separate completed `manual_duration` session with:

- Project and work date.
- Duration and rate/currency snapshot.
- `detailStatus = incomplete`.
- Null description.

Rows commit together only after every row validates. An incomplete row contributes to dashboard/time totals but is clearly marked and cannot be invoiced until its required details are completed.

### WL-MAN-004 — Multiple sessions per day

There is no arbitrary count limit on completed sessions for a date. Each session remains individually editable and auditable.

### WL-MAN-005 — Exact-range overlap

Two non-deleted sessions with known instants (`tracked` or `manual_range`) may not overlap. Boundary contact is allowed: one session may start exactly when another ends.

Duration-only sessions have no inferred interval and therefore cannot participate in overlap detection. The interface makes that limitation visible.

### WL-MAN-006 — Manual labels

Manual source labels are visible to the owner in Work Log and history. Invoice PDFs do not expose tracked/manual source. A work report may include source labels when the owner enables that report option.

## 6. Session detail and editing rules

### WL-SES-001 — Completed detail

A `complete` session requires a project, positive duration, description, work date, timezone, billable state, rate snapshot, and currency snapshot.

### WL-SES-002 — Incomplete session behavior

Only quick historical entry may create an incomplete completed session. Incomplete sessions:

- Remain included in worked-time summaries.
- Are visually flagged in Work Log and Timesheet.
- Are excluded from invoice selection.
- Become complete only after a valid description is saved.

### WL-SES-003 — Source immutability

The source (`tracked`, `manual_range`, or `manual_duration`) never changes. If the original source is wrong, the user soft-deletes the entry and creates a correct replacement, preserving both audit trails.

### WL-SES-004 — Editing an active session

While running or paused, the user may edit description, task, and billable state. They may not directly edit segments, date, timezone, project, rate, or source. These changes take effect without resetting elapsed time and are audited when financially material.

### WL-SES-005 — Editing completed time

A completed, uninvoiced session may be corrected. Changes to date, project, task, time range, duration, segments, break, billable state, rate, currency, or deletion state:

- Require an explicit reason.
- Revalidate overlaps and all entity relationships.
- Recalculate duration and earnings centrally.
- Increment version.
- Append before/after audit details in the same transaction.

### WL-SES-006 — Invoiced session lock

A session linked to an issued invoice cannot be edited or deleted. This protects reconciliation with the issued document. Automated credit notes and invoice revisions are deferred beyond V1.

### WL-SES-007 — Soft deletion

Deleting an eligible session sets `deletedAt` and `deletedReason`; it does not remove the record, segments, evidence, or audit history. Restore revalidates parent status, overlap, and invoice allocation before clearing deletion fields.

## 7. Duration display rules

### WL-DUR-001 — Calculation precision

All calculations use exact integer seconds. Display rounding never changes persisted duration.

### WL-DUR-002 — Human duration

Work logs display compact human duration, for example `3h 05m`. A running timer displays `HH:MM:SS` and is not capped at 24 hours across its continuation group.

### WL-DUR-003 — Decimal invoice hours

Invoices may display both human duration and decimal hours rounded to two decimal places for readability. Billing uses seconds, not the displayed decimal value.

## 8. Billing and earnings rules

### WL-BIL-001 — Billable seconds

For a completed, non-deleted session:

```text
billableSeconds = billable ? durationSeconds : 0
```

Running, paused, deleted, or non-billable sessions contribute zero to earnings.

### WL-BIL-002 — Session amount

For a billable completed session, amount in minor units is rounded half up:

```text
numerator = durationSeconds × hourlyRateMinorSnapshot
amountMinor = floor((numerator + 1800) / 3600)
```

The implementation uses integer-safe arithmetic, preferably `bigint` inside the calculation, then verifies the result is a safe integer before persistence or display.

### WL-BIL-003 — Rounding boundary

Rounding occurs once per session. Dashboard earnings, reports, invoice-session snapshots, invoice lines, and invoice totals all sum the same per-session `amountMinor` results. This guarantees reconciliation across product surfaces.

### WL-BIL-004 — No currency conversion

Amounts of different currencies are never added into one monetary total. A multi-currency dashboard shows one total per currency.

### WL-BIL-005 — Non-billable changes

Changing a completed, uninvoiced session between billable and non-billable is an audited financial change. The stored rate snapshot remains available in both states.

## 9. Invoice rules

### WL-INV-001 — Eligibility

A session is eligible for a draft invoice only when all conditions hold:

- Status is `completed`.
- Detail status is `complete`.
- It is billable and not deleted.
- Duration is positive.
- Its project belongs to the selected client.
- Its currency snapshot equals the invoice currency.
- Its work date is inside the inclusive invoice period.
- It is not present in any existing invoice-session link.

Evidence is not required for invoice eligibility.

### WL-INV-002 — Draft behavior

- A draft has no final invoice number.
- Draft totals are recalculated from its selected sessions.
- A session may belong to only one draft or issued invoice at a time.
- Removing a session or deleting the draft releases the session.
- Draft changes are audited at summary level; transient preview recalculations are not.

### WL-INV-003 — One client and currency

One invoice belongs to one client and one currency. It may include several projects for that client when all session currency snapshots match.

### WL-INV-004 — Line grouping

At issue time, selected sessions are ordered and grouped by:

1. Project.
2. Hourly rate snapshot.
3. Work week using the configured week-start rule.

A line's period is the minimum and maximum `workDate` in that group. Its duration is the sum of session durations. Its amount is the sum of canonical per-session amounts.

### WL-INV-005 — Issue validation

Issuing revalidates every eligibility rule inside the issue transaction. If any session changed, was deleted, became non-billable, or was allocated elsewhere, nothing is issued and the draft returns an actionable conflict list.

### WL-INV-006 — Invoice number

The final number format is:

```text
<PREFIX>-<ISSUE_YEAR>-<SEQUENCE>
```

Default example: `INV-2026-001`.

- Sequence is at least three digits and expands naturally after 999.
- It increments atomically at issue.
- It is unique.
- Issued numbers are never reused.
- Drafts do not consume numbers.

### WL-INV-007 — Issue and due dates

- `issueDate` cannot be in the future in the configured default timezone.
- `dueDate`, when present, is not before `issueDate`.
- Default due date is issue date plus the configured payment terms; the user may adjust it before issue.

### WL-INV-008 — Issue snapshot

Issue freezes:

- Freelancer identity and address.
- Client identity and billing address.
- Payment details.
- Invoice dates, notes, and currency.
- Project names.
- Session descriptions, task names, dates, durations, rates, and amounts.
- Lines and totals.

Later edits to profiles, projects, tasks, rates, or settings do not alter the issued graph.

### WL-INV-009 — Issued immutability

Issued invoices, lines, and invoice-session links cannot be edited or deleted in V1. PDF regeneration reads only their frozen snapshots.

### WL-INV-010 — Totals

V1 supports no tax, discount, or fee calculations:

```text
subtotalMinor = Σ line.amountMinor
totalMinor = subtotalMinor
totalSeconds = Σ linkedSession.durationSeconds
```

### WL-INV-011 — Source privacy

Invoice output does not label time as tracked or manual. It presents accepted billable work uniformly.

## 10. Work report rules

### WL-RPT-001 — Separate document

The work report is a separate PDF from the invoice. Generating or downloading one never changes invoice status.

### WL-RPT-002 — Current-period report

A report generated from filters uses the current eligible session data at generation time and includes:

- Client/project and period.
- Total worked and billable duration.
- Days worked and session count.
- Evidence count.
- Sessions grouped by work date.
- Optional evidence thumbnails.

### WL-RPT-003 — Invoice-based report

When generated from an issued invoice, time, descriptions, rates, and amounts come from the invoice session snapshots so they reconcile with the invoice. Evidence is resolved at generation time and may be omitted if deleted or unavailable; the PDF shows a non-fatal note.

### WL-RPT-004 — Evidence selection

The user explicitly chooses whether to include evidence and which evidence items are included. WorkLedger does not automatically place every confidential attachment into a client-facing document.

## 11. Evidence rules

### WL-EVD-001 — Save order

Work time is saved before evidence. Evidence failure never rolls back an already valid session.

### WL-EVD-002 — Scope

An evidence item is attached either to one session or to one project/date, never both. Session evidence must reference a session in the same project.

### WL-EVD-003 — Binary storage

Screenshots and files are stored in owner-scoped private object storage and cached as `Blob` values in IndexedDB. Base64 content is not stored in `localStorage`, structured JSON, audit events, or console logs.

### WL-EVD-004 — Allowed screenshots

Screenshot kinds accept PNG, JPEG, and WebP images up to 15 MiB each. The application verifies detected media type where browser APIs make that possible; filename extension alone is not trusted.

### WL-EVD-005 — General files

General evidence files may be up to 25 MiB each. Executable/script file types are rejected. Unsupported preview types may still be stored if safe, but are download-only and clearly labeled.

### WL-EVD-006 — Links

Link evidence accepts only absolute `http:` or `https:` URLs. Captions are optional; unsafe schemes are rejected.

### WL-EVD-007 — Checksum and filename

Blob evidence stores its SHA-256 checksum. The original filename is retained as metadata; an export-safe filename derived from the evidence ID is used inside backups.

### WL-EVD-008 — Storage pressure

When supported, the application displays storage usage and quota estimate. It warns at 70% estimated use and escalates at 85%. A quota failure returns an item-level error and never removes existing evidence.

### WL-EVD-009 — Confidentiality

Evidence is available only through the authenticated private Site and is scoped to the authenticated owner before upload or download. The user must actively select evidence for a client-facing report or backup download. Object URLs are temporary and revoked after use.

## 12. Audit rules

### WL-AUD-001 — Audited actions

At minimum, audit events cover:

- Create/update/archive/restore client, project, and task.
- Start/pause/resume/stop and correction of a session.
- Billable, rate, currency, date, duration, project, and deletion changes.
- Add/update/delete evidence metadata.
- Create/delete draft and issue invoice.
- Restore a backup.

### WL-AUD-002 — Atomicity

The business mutation and its required audit event commit in the same database transaction. Neither is allowed to succeed alone.

### WL-AUD-003 — Before and after

Updates record the changed business fields before and after. Unchanged fields, blobs, thumbnails, and full document snapshots are omitted.

### WL-AUD-004 — Edit reason

A reason is mandatory for completed-session changes that affect time, project, date, rate, currency, billable state, or deletion. Cosmetic caption or contact-detail edits do not require a reason.

### WL-AUD-005 — Append-only history

Product behavior never edits or deletes an audit event. Restore imports validated historical events and appends a separate restore event for the operation.

## 13. Backup and restore rules

### WL-BKP-001 — Backup contents

A complete backup contains all logical records, all non-deleted and soft-deleted evidence blobs, a versioned manifest, record counts, and SHA-256 checksums.

### WL-BKP-002 — Consistent export

Export reads a consistent database snapshot. If a timer is running, its persisted state and segments are included; the unpersisted on-screen tick is not invented in the backup.

### WL-BKP-003 — No raw database dump

Backup serialization uses the documented portable schema. Dexie internal metadata, temporary object URLs, UI state, caches, and generated thumbnails may be omitted or regenerated as specified by the backup format.

### WL-BKP-004 — Validation before preview

Import validates, without mutating current data:

- ZIP structure and safe paths.
- Backup format and supported database versions.
- JSON schemas and enum values.
- Identifier uniqueness.
- Referential integrity.
- Counts, sizes, and checksums.
- Required evidence file presence.
- Issued invoice invariants and session uniqueness.

### WL-BKP-005 — Preview

Before confirmation, show backup creation time, product/schema versions, record counts, evidence size, date range, clients/projects, and whether current data will be replaced.

### WL-BKP-006 — Restore preconditions

- No timer may be running or paused.
- The user must type or activate an explicit replacement confirmation.
- The UI offers a current-data safety export immediately before replacement.

### WL-BKP-007 — Atomic replacement

V1 restore replaces the entire local dataset in one coordinated transaction. On any validation or persistence failure, the prior dataset remains usable and unchanged.

### WL-BKP-008 — Merge deferred

Backup merge is not supported in V1. Import never silently combines records by name, date, or identifier.

## 14. Failure and resilience rules

### WL-ERR-001 — Typed failures

Known domain, conflict, validation, storage, quota, PDF, and backup errors use stable codes. User messages explain what failed, whether data was preserved, and the next safe action.

### WL-ERR-002 — No destructive recovery

Schema errors, migration failures, or invalid backups never trigger automatic database deletion or reset.

### WL-ERR-003 — Independent derived features

A chart, PDF, thumbnail, or download failure does not alter source sessions, invoices, or evidence.

### WL-ERR-004 — Retry safety

Commands likely to be retried after UI interruption use operation identifiers or state/version checks so retry cannot duplicate sessions, segments, invoice issuance, or audit events.

## 15. Validation limits

Unless a later accepted decision changes them:

| Input                      | V1 rule                                          |
| -------------------------- | ------------------------------------------------ |
| Client/project/task name   | 1–120 trimmed characters                         |
| Session description        | 1–2,000 trimmed characters when complete         |
| Evidence caption           | 0–500 trimmed characters                         |
| Invoice notes/instructions | 0–2,000 trimmed characters                       |
| Manual duration            | 1 minute–24 hours                                |
| Screenshot                 | PNG/JPEG/WebP, at most 15 MiB                    |
| General evidence file      | At most 25 MiB; executable/script types rejected |
| Invoice prefix             | 1–12 uppercase letters, digits, or hyphens       |

Text length is measured consistently after Unicode normalization and trimming. Validation messages identify the limit and preserve unsaved form input where safe.

## 16. Reconciliation examples

### Tracked session

```text
09:00–10:20 = 4,800 seconds
10:35–12:00 = 5,100 seconds
12:30–13:15 = 2,700 seconds

Total = 12,600 seconds = 3h 30m
```

At USD 15.00/hour:

```text
amountMinor = floor((12,600 × 1,500 + 1,800) / 3,600)
            = 5,250 cents
            = USD 52.50
```

### Manual range

```text
09:30–14:15 = 17,100 seconds
Break         =  1,800 seconds
Worked        = 15,300 seconds = 4h 15m
```

### Duration only

```text
Entered       = 4h 30m
Stored        = 16,200 seconds
Clock range   = none
```

These examples become executable tests when their implementation phase begins.

## 17. Cloud continuity rules

### WL-CLD-001 — Authenticated ownership

Every D1 record and R2 key is scoped by the authenticated Site user identifier supplied by the trusted hosting boundary. Client-provided profile identifiers never select another owner's storage.

### WL-CLD-002 — First-load migration

When no cloud ledger exists, the first cloud-backed load uploads the complete existing IndexedDB ledger and all evidence from the same stable origin before marking cloud synchronization complete. Existing local data is never cleared as a migration shortcut.

### WL-CLD-003 — Local working cache

Commands continue to commit their business records and audit events atomically in IndexedDB. After each successful local transaction, WorkLedger uploads new evidence and then a structured snapshot. A failed network write leaves the local result and a durable pending-sync marker intact for retry.

### WL-CLD-004 — Version conflicts

Cloud snapshots use monotonically increasing optimistic versions. Competing writers cannot overwrite the same next version. On a mismatch, WorkLedger preserves the local copy, stops automatic overwrites, and tells the owner to protect the local state with an export before resolving the conflict.

### WL-CLD-005 — Structured and binary separation

Structured records are stored in bounded D1 chunks. Original evidence bytes are stored separately in R2 and must be uploaded successfully before a snapshot that references them is committed.

### WL-CLD-006 — Portable recovery remains available

Cloud synchronization does not remove ZIP backup and restore. A validated restore replaces the local dataset atomically and then synchronizes the complete restored ledger to the current owner's cloud storage.
