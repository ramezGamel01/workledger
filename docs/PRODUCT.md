# WorkLedger product specification

- **Document status:** Accepted cloud-continuity release
- **Baseline version:** 1.1.0
- **Last updated:** 2026-09-21
- **Product type:** Private single-user cloud-backed web application with a local cache

## 1. Product statement

WorkLedger helps an hourly contractor record what they worked on, prove that work, calculate what they earned, and produce professional billing documents from one trusted set of work sessions.

The product is designed first for the owner's current contracting workflow, while its data model supports multiple clients and projects from day one.

## 2. Primary user and job

### Primary user

A single freelance or contract worker who is paid by the hour and needs defensible records of time and completed work.

### Primary job

> Record live or past work quickly, attach evidence, verify hours and earnings, and turn approved sessions into an invoice and a separate work report.

### Product promise

The same work session drives the work log, timesheet, earnings, reports, invoices, and proof of work. The user must never re-enter the same time merely to create a different view.

## 3. Product principles

1. **Sessions are the source of truth.** Derived screens do not maintain competing totals.
2. **Data survives browser and device changes.** Records sync to a private owner-scoped cloud store while IndexedDB remains the fast local working cache.
3. **Past work is first-class.** The user can enter work completed before installation.
4. **Money is explainable.** Every displayed total can be traced to billable sessions and frozen rates.
5. **History is preserved.** Material edits create audit events; issued invoices remain immutable.
6. **Failure is contained.** An attachment failure must not destroy time already recorded.
7. **The product is useful before it is broad.** This release solves one contractor's workflow well; teams, collaborative editing, and surveillance features are not included.

## 4. Canonical product flow

```text
Create freelancer profile
        ↓
Create client
        ↓
Create project and rate
        ↓
Track live work OR add previous work
        ↓
Add session proof or daily proof
        ↓
Review work log, timesheet, and earnings
        ↓
Issue invoice + generate separate work report
        ↓
Export backup
```

## 5. V1 scope

### 5.1 Setup and organization

- One freelancer profile with contact, billing, payment, locale, and timezone settings.
- Multiple clients.
- Multiple projects per client.
- Project-specific currency and hourly rate.
- Optional reusable tasks within a project.
- Active and archived project states.

### 5.2 Time capture

- Live timer with start, pause, resume, and stop.
- Persistent active timer recovery after reload or browser restart.
- At most one active live timer across the application.
- Multiple completed sessions per day.
- Historical entry using a start/end range and break duration.
- Historical entry using duration only.
- Quick historical entry for several dates, with details added later.
- Billable and non-billable sessions.
- Clear `TRACKED`, `MANUAL RANGE`, or `MANUAL DURATION` source labels.

### 5.3 Work documentation

- Description on every completed session.
- Screenshot and file evidence stored in private object storage and cached locally.
- Link evidence with captions.
- Evidence attached to a specific session or to a project day.
- Evidence count and thumbnails in work records.

### 5.4 Review and reporting

- Work Log grouped by local work date.
- Filterable Timesheet.
- Dashboard totals for today, week, month, and selected period.
- Earnings breakdown by client, project, date, and billable status.
- Activity charts derived from sessions.

### 5.5 Billing documents

- Draft invoice creation for one client and one currency.
- Selection of eligible, uninvoiced billable sessions.
- Frozen client, freelancer, project, time, rate, and total snapshots when issued.
- Professional invoice PDF with payment details.
- Separate work-activity report PDF with sessions and optional evidence.
- Deterministic invoice numbering.

### 5.6 Integrity and continuity

- Append-only edit history for business-sensitive changes.
- Soft deletion and restoration of eligible work records.
- Versioned database migrations.
- Validated ZIP backup with evidence files.
- Restore preview and atomic restore.
- Authenticated cloud persistence and automatic migration of the existing local ledger.
- Responsive desktop and mobile workflows.

## 6. Explicit V1 non-goals

The following are not part of V1:

- In-app passwords, public registration, or account administration; private Site authentication supplies the owner identity.
- Team-oriented multi-user synchronization or collaborative editing.
- Team members, approvals, permissions, or manager dashboards.
- Automatic desktop screenshots, activity monitoring, keystroke tracking, or surveillance.
- Native desktop or mobile applications.
- Payroll, accounting, tax calculation, VAT logic, or expense tracking.
- Online payments, payment collection, or bank integrations.
- Automatic email delivery.
- Recurring invoices, subscriptions, retainers, fixed-price contracts, or multi-currency conversion.
- General-purpose rule engines or custom report builders.
- OCR, AI analysis, automatic redaction, or evidence annotation.
- Collaboration or client portals.
- Dark mode and custom visual themes.

These ideas require a future roadmap decision; they must not appear as partially implemented V1 features.

## 7. Primary workflows and acceptance outcomes

### 7.1 First-run setup

The user can:

1. Enter freelancer identity and invoice/payment details.
2. Create a client.
3. Create a project with timezone, currency, and hourly rate.
4. Reach an immediately usable dashboard.

**Outcome:** setup data is cached locally and synchronized to the owner's private cloud without changing snapshots already frozen in issued invoices.

### 7.2 Add previous work

The user can choose:

- **Time range:** date, start, end, and optional break.
- **Duration only:** date, hours, and minutes.
- **Quick historical entry:** several date/duration rows followed by later detail editing.

Every entry supports project, optional task, description, billable status, and evidence after the base session is saved.

**Outcome:** valid entries immediately appear in Work Log, Timesheet, Dashboard, and Earnings. They are marked as manual for the owner, but invoice presentation never exposes the source. A work report may show it only when the owner enables that report option.

### 7.3 Track live work

The user selects a project and optional task, enters or selects a description, and starts the timer. They can pause, resume, stop, reload the page, or reopen the application without silently losing elapsed segments.

**Outcome:** stopped time becomes a completed work session with duration calculated from closed segments. Paused time is excluded.

### 7.4 Add proof of work

The user can attach screenshots, files, or links to a session, or add general proof for a project day.

**Outcome:** evidence failure is reported independently. Existing time remains intact, and the user can retry the private upload.

### 7.5 Review work and earnings

The user can filter by period, client, project, task, source, and billable state.

**Outcome:** every total uses the same duration and billing rules. Filters never mutate source data.

### 7.6 Issue an invoice

The user selects a client, period, currency, and eligible sessions, reviews a draft, then issues it.

**Outcome:** the issued invoice is a permanent snapshot, selected sessions cannot be included in a second issued invoice, and the PDF can be regenerated identically from the snapshot.

### 7.7 Generate a work report

The user selects a client/project period and whether to include evidence thumbnails.

**Outcome:** the PDF summarizes totals and lists work by date and session. It remains a report of current session data unless explicitly generated from an invoice snapshot.

### 7.8 Backup and restore

The user exports a ZIP containing structured data, evidence files, manifest metadata, and checksums. On import, the application validates and previews the backup before the user confirms replacement.

**Outcome:** restore is atomic; a validation or write failure leaves the prior database unchanged.

## 8. Information architecture

The V1 navigation is:

```text
WorkLedger

Dashboard
Timer
Work Log
Timesheet
Proof of Work

Clients
Projects

Reports
Earnings
Invoices

Settings
```

`Add Previous Work` is a prominent global action on Dashboard, Timer, and Work Log. When a timer is active, a persistent timer strip remains available throughout the application.

## 9. Key screens

### Dashboard

- Active timer or a ready-to-start control.
- Today, current week, current month, and estimated earnings.
- Weekly activity chart.
- Recent sessions.
- Project distribution.
- Clear empty state for a new user.

### Timer

- Project and task selection.
- Description.
- Start, pause, resume, and stop controls.
- Current elapsed billable duration.
- Today's completed sessions.

### Work Log

- Sessions grouped by work date.
- Time range or duration, description, source badge, evidence count, and earnings.
- Edit, archive, restore, and view-history actions where allowed.

### Timesheet

- Dense, accessible table on desktop.
- Card/list adaptation on narrow screens.
- Period and entity filters.
- Daily and total duration summaries.

### Proof of Work

- Evidence grouped by date and session.
- Preview, caption, linked record, and file metadata.
- Filters and orphan-prevention behavior.

### Invoices

- Draft list and issued list.
- Invoice builder with eligibility reasons.
- Snapshot preview and PDF generation.

### Settings

- Freelancer profile.
- Locale, timezone, week start, date/time formats.
- Invoice numbering and payment details.
- Local-cache storage usage and cloud-sync state.
- Backup export and restore.

## 10. UX and visual direction

WorkLedger is a focused professional ledger, not a marketing site. The visual system should feel calm, precise, and trustworthy:

- Deep navy/ink navigation and neutral work surfaces.
- A restrained blue accent for primary actions.
- Green only for confirmed success or currently healthy state.
- Tabular numerals for timers, durations, and money.
- Compact but readable desktop information density.
- Strong separation between editable drafts and frozen records.
- Minimal decoration and no stock imagery.
- Motion limited to useful state transitions and reduced-motion safe.

Desktop is primary, but at 390 pixels the user must still be able to start or stop a timer, add past work, upload proof, and review hours.

## 11. Product terminology

| Term             | Definition                                                             |
| ---------------- | ---------------------------------------------------------------------- |
| Client           | The person or organization that receives work and invoices.            |
| Project          | A billable or non-billable body of work owned by one client.           |
| Task             | An optional reusable activity label within a project.                  |
| Work Session     | One coherent unit of work and the source record for time.              |
| Segment          | A continuous tracked interval within a live session.                   |
| Historical Entry | A completed session entered after the work occurred.                   |
| Daily Evidence   | Proof tied to one project and local work date rather than one session. |
| Billable Time    | Completed session time eligible for invoicing.                         |
| Invoice          | A billing snapshot issued to one client in one currency.               |
| Work Report      | A detailed activity document, separate from the invoice.               |
| Audit Event      | An immutable record of a meaningful data change.                       |

Interface copy and code should use these terms consistently. Do not introduce synonyms such as “shift,” “log item,” or “customer” for the same concepts without an approved terminology change.

## 12. Product success criteria

V1 is successful when the user can:

1. Enter existing work without starting over.
2. Reliably track new work across pause/resume and page reloads.
3. Keep evidence beside the work it supports.
4. Reconcile hours and earnings from one calculation path.
5. Produce a clean invoice and a detailed work report.
6. Recover all data from a validated backup.
7. Understand whether every material record is editable, archived, or frozen.

## 13. Baseline assumptions

- The release has one authenticated owner and no team/role model.
- Default timezone may be set to `Africa/Cairo` during onboarding but remains configurable before the first project is saved.
- Default display currency may be USD but every project explicitly stores an ISO 4217 currency.
- English is the initial application language; localization is deferred.
- The application is deployed on one stable private HTTPS origin backed by D1 structured storage and R2 evidence storage.
- IndexedDB is a recoverable local cache. The first cloud-backed load migrates an existing ledger from the same origin when no cloud ledger exists.
- Cloud continuity is not a substitute for a portable user-controlled backup. The UI keeps ZIP export and validated restore available.
