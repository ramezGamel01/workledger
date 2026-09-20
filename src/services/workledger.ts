import { format, parseISO, startOfWeek } from "date-fns";
import { liveQuery } from "dexie";

import {
  database,
  ensureDatabaseDefaults,
  getLedgerSnapshot,
} from "@/db/database";
import {
  clampText,
  localDateAt,
  normalizeName,
  sessionAmountMinor,
  todayIn,
} from "@/domain/format";
import type {
  AppSettings,
  AuditEvent,
  Client,
  EvidenceAsset,
  EvidenceScope,
  FreelancerProfile,
  Invoice,
  InvoiceLine,
  InvoiceSessionLink,
  LedgerSnapshot,
  Project,
  SessionSegment,
  Task,
  WorkSession,
} from "@/domain/models";
import {
  partitionIntervalByLocalDay,
  resolveManualRange,
  sumClosedSegments,
} from "@/domain/time";
import { WorkLedgerError } from "@/services/errors";

export interface ProfileInput {
  displayName: string;
  legalName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  taxIdentifier: string;
  accountName: string;
  bankName: string;
  accountReference: string;
  swiftBic: string;
  paymentInstructions: string;
}

export interface ClientInput {
  displayName: string;
  legalName: string;
  companyName: string;
  email: string;
  phone: string;
  defaultCurrency: string;
  invoiceNotes: string;
}

export interface ProjectInput {
  clientId: string;
  name: string;
  description: string;
  hourlyRateMinor: number;
  currency: string;
  timeZone: string;
  colorToken: string;
  startDate: string;
  endDate: string;
}

export interface TaskInput {
  projectId: string;
  name: string;
  description: string;
}

export interface ManualSessionInput {
  projectId: string;
  taskId: string | null;
  workDate: string;
  mode: "range" | "duration";
  startTime: string;
  endTime: string;
  breakMinutes: number;
  hours: number;
  minutes: number;
  description: string;
  billable: boolean;
  hourlyRateMinorOverride: number | null;
  incomplete: boolean;
}

export interface TimerStartInput {
  projectId: string;
  taskId: string | null;
  description: string;
  billable: boolean;
}

export interface EvidenceFileInput {
  projectId: string;
  scope: EvidenceScope;
  sessionId: string | null;
  workDate: string | null;
  file: File;
  caption: string;
}

export interface EvidenceLinkInput {
  projectId: string;
  scope: EvidenceScope;
  sessionId: string | null;
  workDate: string | null;
  url: string;
  caption: string;
}

export interface InvoiceDraftInput {
  clientId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  sessionIds: string[];
  notes: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function id(): string {
  return crypto.randomUUID();
}

function requiredText(value: string, label: string, max = 120): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new WorkLedgerError("VALIDATION_ERROR", `${label} is required.`);
  }
  if (normalized.length > max) {
    throw new WorkLedgerError(
      "VALIDATION_ERROR",
      `${label} must be ${max} characters or fewer.`,
    );
  }
  return normalized;
}

function audit(input: {
  entityType: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changedFields: string[];
  reason: string | null;
  actor?: AuditEvent["actor"];
  operationId?: string;
  at?: string;
}): AuditEvent {
  return {
    id: id(),
    operationId: input.operationId ?? id(),
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actor: input.actor ?? "local_user",
    before: input.before,
    after: input.after,
    changedFields: input.changedFields,
    reason: input.reason,
    createdAt: input.at ?? nowIso(),
  };
}

function notifyChange(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("workledger-changes");
  channel.postMessage({ type: "changed", at: Date.now() });
  channel.close();
}

async function withTimerLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("workledger-active-timer", operation);
  }
  return operation();
}

async function activeSession(): Promise<WorkSession | undefined> {
  return database.workSessions
    .where("status")
    .anyOf(["running", "paused"])
    .first();
}

async function resolveProjectForWork(
  projectId: string,
  taskId: string | null,
): Promise<{ project: Project; client: Client; task: Task | null }> {
  const project = await database.projects.get(projectId);
  if (!project) throw new WorkLedgerError("NOT_FOUND", "Project not found.");
  const client = await database.clients.get(project.clientId);
  if (!client) throw new WorkLedgerError("NOT_FOUND", "Client not found.");
  if (project.status !== "active" || client.status !== "active") {
    throw new WorkLedgerError(
      "VALIDATION_ERROR",
      "Restore the client and project before adding new work.",
    );
  }
  const task = taskId ? ((await database.tasks.get(taskId)) ?? null) : null;
  if (taskId && (!task || task.projectId !== projectId)) {
    throw new WorkLedgerError(
      "VALIDATION_ERROR",
      "The selected task does not belong to this project.",
    );
  }
  if (task?.status === "archived") {
    throw new WorkLedgerError(
      "VALIDATION_ERROR",
      "Restore the task before using it for new work.",
    );
  }
  return { project, client, task };
}

async function assertNoOverlap(
  startedAt: string,
  endedAt: string,
  excludedSessionId: string | null = null,
): Promise<void> {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const sessions = await database.workSessions.toArray();
  const overlap = sessions.find(
    (session) =>
      session.id !== excludedSessionId &&
      session.deletedAt === null &&
      session.startedAt !== null &&
      session.endedAt !== null &&
      new Date(session.startedAt).getTime() < end &&
      new Date(session.endedAt).getTime() > start,
  );
  if (overlap) {
    throw new WorkLedgerError(
      "OVERLAPPING_SESSION",
      `This time overlaps work already recorded on ${overlap.workDate}.`,
    );
  }
}

export function observeLedgerSnapshot(
  onValue: (snapshot: LedgerSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  let cancelled = false;
  let subscription: { unsubscribe: () => void } | null = null;
  void ensureDatabaseDefaults()
    .then(() => {
      if (cancelled) return;
      subscription = liveQuery(getLedgerSnapshot).subscribe({
        next: onValue,
        error: onError,
      });
    })
    .catch(onError);
  return () => {
    cancelled = true;
    subscription?.unsubscribe();
  };
}

export const ledgerService = {
  getSnapshot: getLedgerSnapshot,

  async saveProfile(input: ProfileInput): Promise<void> {
    const displayName = requiredText(input.displayName, "Display name");
    const email = requiredText(input.email, "Email", 254);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Enter a valid email address.",
      );
    }
    const timestamp = nowIso();
    await database.transaction(
      "rw",
      database.freelancerProfiles,
      database.auditEvents,
      async () => {
        const existing = await database.freelancerProfiles.get("owner");
        const line1 = clampText(input.addressLine1);
        const city = clampText(input.city);
        const countryCode = clampText(input.countryCode)?.toUpperCase() ?? null;
        const hasAddress = Boolean(line1 || city || countryCode);
        if (hasAddress && (!line1 || !city || !countryCode)) {
          throw new WorkLedgerError(
            "VALIDATION_ERROR",
            "Address line, city, and country are required when adding an address.",
          );
        }
        const hasPayment = Boolean(
          clampText(input.accountName) ||
          clampText(input.bankName) ||
          clampText(input.accountReference) ||
          clampText(input.swiftBic) ||
          clampText(input.paymentInstructions),
        );
        const record: FreelancerProfile = {
          id: "owner",
          version: (existing?.version ?? 0) + 1,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
          displayName,
          legalName: clampText(input.legalName),
          email,
          phone: clampText(input.phone),
          address: hasAddress
            ? {
                line1: line1 ?? "",
                line2: clampText(input.addressLine2),
                city: city ?? "",
                region: clampText(input.region),
                postalCode: clampText(input.postalCode),
                countryCode: countryCode ?? "",
              }
            : null,
          taxIdentifier: clampText(input.taxIdentifier),
          paymentDetails: hasPayment
            ? {
                accountName: clampText(input.accountName),
                bankName: clampText(input.bankName),
                accountReference: clampText(input.accountReference),
                swiftBic: clampText(input.swiftBic),
                paymentInstructions: clampText(input.paymentInstructions),
              }
            : null,
        };
        await database.freelancerProfiles.put(record);
        await database.auditEvents.add(
          audit({
            entityType: "FreelancerProfile",
            entityId: "owner",
            action: existing ? "updated" : "created",
            before: existing ? { version: existing.version } : null,
            after: { displayName: record.displayName, email: record.email },
            changedFields: [
              "displayName",
              "contact",
              "billing",
              "paymentDetails",
            ],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async saveSettings(
    input: Pick<
      AppSettings,
      | "locale"
      | "defaultTimeZone"
      | "defaultCurrency"
      | "weekStartsOn"
      | "hourCycle"
      | "invoicePrefix"
      | "defaultPaymentTermsDays"
    >,
  ): Promise<void> {
    const existing = await database.appSettings.get("settings");
    if (!existing)
      throw new WorkLedgerError("NOT_FOUND", "Settings not found.");
    const prefix = input.invoicePrefix.trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,12}$/.test(prefix)) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Invoice prefix must use 1–12 uppercase letters, digits, or hyphens.",
      );
    }
    try {
      new Intl.DateTimeFormat(input.locale);
      new Intl.DateTimeFormat("en", { timeZone: input.defaultTimeZone });
      new Intl.NumberFormat(input.locale, {
        style: "currency",
        currency: input.defaultCurrency,
      });
    } catch {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Locale, timezone, or currency is not supported by this browser.",
      );
    }
    const timestamp = nowIso();
    const next: AppSettings = {
      ...existing,
      ...input,
      invoicePrefix: prefix,
      defaultCurrency: input.defaultCurrency.toUpperCase(),
      version: existing.version + 1,
      updatedAt: timestamp,
    };
    await database.transaction(
      "rw",
      database.appSettings,
      database.auditEvents,
      async () => {
        await database.appSettings.put(next);
        await database.auditEvents.add(
          audit({
            entityType: "AppSettings",
            entityId: "settings",
            action: "updated",
            before: { version: existing.version },
            after: { version: next.version },
            changedFields: Object.keys(input),
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async createClient(input: ClientInput): Promise<Client> {
    const displayName = requiredText(input.displayName, "Client name");
    const normalizedName = normalizeName(displayName);
    const duplicate = await database.clients
      .where("[status+normalizedName]")
      .equals(["active", normalizedName])
      .first();
    if (duplicate) {
      throw new WorkLedgerError(
        "CONFLICT",
        "An active client with this name already exists.",
      );
    }
    const timestamp = nowIso();
    const record: Client = {
      id: id(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      displayName,
      normalizedName,
      legalName: clampText(input.legalName),
      companyName: clampText(input.companyName),
      email: clampText(input.email),
      phone: clampText(input.phone),
      billingAddress: null,
      taxIdentifier: null,
      defaultCurrency: input.defaultCurrency.toUpperCase(),
      invoiceNotes: clampText(input.invoiceNotes),
      status: "active",
      archivedAt: null,
    };
    await database.transaction(
      "rw",
      database.clients,
      database.auditEvents,
      async () => {
        await database.clients.add(record);
        await database.auditEvents.add(
          audit({
            entityType: "Client",
            entityId: record.id,
            action: "created",
            before: null,
            after: { displayName: record.displayName },
            changedFields: ["displayName", "defaultCurrency"],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
    return record;
  },

  async updateClient(clientId: string, input: ClientInput): Promise<void> {
    const existing = await database.clients.get(clientId);
    if (!existing) throw new WorkLedgerError("NOT_FOUND", "Client not found.");
    const displayName = requiredText(input.displayName, "Client name");
    const normalizedName = normalizeName(displayName);
    const duplicate = await database.clients
      .where("[status+normalizedName]")
      .equals(["active", normalizedName])
      .filter((client) => client.id !== clientId)
      .first();
    if (existing.status === "active" && duplicate) {
      throw new WorkLedgerError(
        "CONFLICT",
        "An active client with this name already exists.",
      );
    }
    const email = clampText(input.email);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Enter a valid billing email address.",
      );
    }
    const currency = input.defaultCurrency.toUpperCase();
    try {
      new Intl.NumberFormat("en", { style: "currency", currency });
    } catch {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Enter a supported client currency.",
      );
    }
    const timestamp = nowIso();
    const next: Client = {
      ...existing,
      displayName,
      normalizedName,
      legalName: clampText(input.legalName),
      companyName: clampText(input.companyName),
      email,
      phone: clampText(input.phone),
      defaultCurrency: currency,
      invoiceNotes: clampText(input.invoiceNotes),
      version: existing.version + 1,
      updatedAt: timestamp,
    };
    await database.transaction(
      "rw",
      database.clients,
      database.auditEvents,
      async () => {
        await database.clients.put(next);
        await database.auditEvents.add(
          audit({
            entityType: "Client",
            entityId: clientId,
            action: "updated",
            before: {
              displayName: existing.displayName,
              companyName: existing.companyName,
              email: existing.email,
              defaultCurrency: existing.defaultCurrency,
            },
            after: {
              displayName: next.displayName,
              companyName: next.companyName,
              email: next.email,
              defaultCurrency: next.defaultCurrency,
            },
            changedFields: [
              "displayName",
              "companyName",
              "email",
              "phone",
              "defaultCurrency",
              "invoiceNotes",
            ],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async setClientArchived(clientId: string, archived: boolean): Promise<void> {
    const existing = await database.clients.get(clientId);
    if (!existing) throw new WorkLedgerError("NOT_FOUND", "Client not found.");
    const timestamp = nowIso();
    const next: Client = {
      ...existing,
      status: archived ? "archived" : "active",
      archivedAt: archived ? timestamp : null,
      version: existing.version + 1,
      updatedAt: timestamp,
    };
    if (!archived) {
      const duplicate = await database.clients
        .where("[status+normalizedName]")
        .equals(["active", existing.normalizedName])
        .first();
      if (duplicate && duplicate.id !== existing.id) {
        throw new WorkLedgerError(
          "CONFLICT",
          "Rename the other active client before restoring this one.",
        );
      }
    }
    await database.transaction(
      "rw",
      database.clients,
      database.auditEvents,
      async () => {
        await database.clients.put(next);
        await database.auditEvents.add(
          audit({
            entityType: "Client",
            entityId: clientId,
            action: archived ? "archived" : "restored",
            before: { status: existing.status },
            after: { status: next.status },
            changedFields: ["status"],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async createProject(input: ProjectInput): Promise<Project> {
    const client = await database.clients.get(input.clientId);
    if (!client || client.status !== "active") {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Select an active client for this project.",
      );
    }
    const name = requiredText(input.name, "Project name");
    const normalizedName = normalizeName(name);
    const duplicate = await database.projects
      .where("[clientId+normalizedName]")
      .equals([input.clientId, normalizedName])
      .filter((project) => project.status === "active")
      .first();
    if (duplicate) {
      throw new WorkLedgerError(
        "CONFLICT",
        "This client already has an active project with that name.",
      );
    }
    if (
      !Number.isSafeInteger(input.hourlyRateMinor) ||
      input.hourlyRateMinor < 0
    ) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Enter a valid hourly rate.",
      );
    }
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timeZone });
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: input.currency,
      });
    } catch {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Timezone or currency is not supported by this browser.",
      );
    }
    if (input.startDate && input.endDate && input.endDate < input.startDate) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Project end date cannot be before its start date.",
      );
    }
    const timestamp = nowIso();
    const record: Project = {
      id: id(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      clientId: input.clientId,
      name,
      normalizedName,
      description: clampText(input.description),
      startDate: clampText(input.startDate),
      endDate: clampText(input.endDate),
      hourlyRateMinor: input.hourlyRateMinor,
      currency: input.currency.toUpperCase(),
      timeZone: input.timeZone,
      colorToken: clampText(input.colorToken) ?? "blue",
      status: "active",
      archivedAt: null,
    };
    await database.transaction(
      "rw",
      database.projects,
      database.auditEvents,
      async () => {
        await database.projects.add(record);
        await database.auditEvents.add(
          audit({
            entityType: "Project",
            entityId: record.id,
            action: "created",
            before: null,
            after: {
              clientId: record.clientId,
              name: record.name,
              hourlyRateMinor: record.hourlyRateMinor,
              currency: record.currency,
              timeZone: record.timeZone,
            },
            changedFields: [
              "clientId",
              "name",
              "hourlyRateMinor",
              "currency",
              "timeZone",
            ],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
    return record;
  },

  async updateProject(projectId: string, input: ProjectInput): Promise<void> {
    const existing = await database.projects.get(projectId);
    if (!existing) throw new WorkLedgerError("NOT_FOUND", "Project not found.");
    const client = await database.clients.get(input.clientId);
    if (!client || client.status !== "active") {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Select an active client for this project.",
      );
    }
    const name = requiredText(input.name, "Project name");
    const normalizedName = normalizeName(name);
    const duplicate = await database.projects
      .where("[clientId+normalizedName]")
      .equals([input.clientId, normalizedName])
      .filter(
        (project) => project.status === "active" && project.id !== projectId,
      )
      .first();
    if (existing.status === "active" && duplicate) {
      throw new WorkLedgerError(
        "CONFLICT",
        "This client already has an active project with that name.",
      );
    }
    if (
      !Number.isSafeInteger(input.hourlyRateMinor) ||
      input.hourlyRateMinor < 0
    ) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Enter a valid hourly rate.",
      );
    }
    const currency = input.currency.toUpperCase();
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timeZone });
      new Intl.NumberFormat("en", { style: "currency", currency });
    } catch {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Timezone or currency is not supported by this browser.",
      );
    }
    if (input.startDate && input.endDate && input.endDate < input.startDate) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Project end date cannot be before its start date.",
      );
    }
    const timestamp = nowIso();
    const next: Project = {
      ...existing,
      clientId: input.clientId,
      name,
      normalizedName,
      description: clampText(input.description),
      startDate: clampText(input.startDate),
      endDate: clampText(input.endDate),
      hourlyRateMinor: input.hourlyRateMinor,
      currency,
      timeZone: input.timeZone,
      colorToken: clampText(input.colorToken) ?? "blue",
      version: existing.version + 1,
      updatedAt: timestamp,
    };
    await database.transaction(
      "rw",
      database.projects,
      database.auditEvents,
      async () => {
        await database.projects.put(next);
        await database.auditEvents.add(
          audit({
            entityType: "Project",
            entityId: projectId,
            action: "updated",
            before: {
              clientId: existing.clientId,
              name: existing.name,
              hourlyRateMinor: existing.hourlyRateMinor,
              currency: existing.currency,
              timeZone: existing.timeZone,
            },
            after: {
              clientId: next.clientId,
              name: next.name,
              hourlyRateMinor: next.hourlyRateMinor,
              currency: next.currency,
              timeZone: next.timeZone,
            },
            changedFields: [
              "clientId",
              "name",
              "description",
              "hourlyRateMinor",
              "currency",
              "timeZone",
            ],
            reason:
              "Project defaults changed; historical work snapshots preserved",
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async setProjectArchived(
    projectId: string,
    archived: boolean,
  ): Promise<void> {
    const existing = await database.projects.get(projectId);
    if (!existing) throw new WorkLedgerError("NOT_FOUND", "Project not found.");
    if (archived) {
      const active = await activeSession();
      if (active?.projectId === projectId) {
        throw new WorkLedgerError(
          "CONFLICT",
          "Stop the active timer before archiving this project.",
        );
      }
    }
    const timestamp = nowIso();
    await database.transaction(
      "rw",
      database.projects,
      database.auditEvents,
      async () => {
        await database.projects.update(projectId, {
          status: archived ? "archived" : "active",
          archivedAt: archived ? timestamp : null,
          version: existing.version + 1,
          updatedAt: timestamp,
        });
        await database.auditEvents.add(
          audit({
            entityType: "Project",
            entityId: projectId,
            action: archived ? "archived" : "restored",
            before: { status: existing.status },
            after: { status: archived ? "archived" : "active" },
            changedFields: ["status"],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async createTask(input: TaskInput): Promise<Task> {
    const project = await database.projects.get(input.projectId);
    if (!project || project.status !== "active") {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Select an active project.",
      );
    }
    const name = requiredText(input.name, "Task name");
    const normalizedName = normalizeName(name);
    const duplicate = await database.tasks
      .where("[projectId+normalizedName]")
      .equals([input.projectId, normalizedName])
      .filter((task) => task.status === "active")
      .first();
    if (duplicate) {
      throw new WorkLedgerError(
        "CONFLICT",
        "This project already has an active task with that name.",
      );
    }
    const timestamp = nowIso();
    const record: Task = {
      id: id(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      projectId: input.projectId,
      name,
      normalizedName,
      description: clampText(input.description),
      status: "active",
      archivedAt: null,
    };
    await database.transaction(
      "rw",
      database.tasks,
      database.auditEvents,
      async () => {
        await database.tasks.add(record);
        await database.auditEvents.add(
          audit({
            entityType: "Task",
            entityId: record.id,
            action: "created",
            before: null,
            after: { projectId: record.projectId, name: record.name },
            changedFields: ["projectId", "name"],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
    return record;
  },

  async updateTask(taskId: string, input: TaskInput): Promise<void> {
    const existing = await database.tasks.get(taskId);
    if (!existing) throw new WorkLedgerError("NOT_FOUND", "Task not found.");
    const project = await database.projects.get(input.projectId);
    if (!project || project.status !== "active") {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Select an active project.",
      );
    }
    const name = requiredText(input.name, "Task name");
    const normalizedName = normalizeName(name);
    const duplicate = await database.tasks
      .where("[projectId+normalizedName]")
      .equals([input.projectId, normalizedName])
      .filter((task) => task.status === "active" && task.id !== taskId)
      .first();
    if (existing.status === "active" && duplicate) {
      throw new WorkLedgerError(
        "CONFLICT",
        "This project already has an active task with that name.",
      );
    }
    const timestamp = nowIso();
    const next: Task = {
      ...existing,
      projectId: input.projectId,
      name,
      normalizedName,
      description: clampText(input.description),
      version: existing.version + 1,
      updatedAt: timestamp,
    };
    await database.transaction(
      "rw",
      database.tasks,
      database.auditEvents,
      async () => {
        await database.tasks.put(next);
        await database.auditEvents.add(
          audit({
            entityType: "Task",
            entityId: taskId,
            action: "updated",
            before: { projectId: existing.projectId, name: existing.name },
            after: { projectId: next.projectId, name: next.name },
            changedFields: ["projectId", "name", "description"],
            reason: "Historical task-name snapshots preserved",
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async setTaskArchived(taskId: string, archived: boolean): Promise<void> {
    const existing = await database.tasks.get(taskId);
    if (!existing) throw new WorkLedgerError("NOT_FOUND", "Task not found.");
    const timestamp = nowIso();
    await database.transaction(
      "rw",
      database.tasks,
      database.auditEvents,
      async () => {
        await database.tasks.update(taskId, {
          status: archived ? "archived" : "active",
          archivedAt: archived ? timestamp : null,
          version: existing.version + 1,
          updatedAt: timestamp,
        });
        await database.auditEvents.add(
          audit({
            entityType: "Task",
            entityId: taskId,
            action: archived ? "archived" : "restored",
            before: { status: existing.status },
            after: { status: archived ? "archived" : "active" },
            changedFields: ["status"],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async addManualSession(input: ManualSessionInput): Promise<WorkSession> {
    const { project, task } = await resolveProjectForWork(
      input.projectId,
      input.taskId,
    );
    if (input.workDate > todayIn(project.timeZone)) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Historical work cannot be dated in the future.",
      );
    }
    const description = input.incomplete
      ? null
      : requiredText(input.description, "Description", 2000);
    let startedAt: string | null = null;
    let endedAt: string | null = null;
    let breakSeconds = 0;
    let durationSeconds = 0;
    if (input.mode === "range") {
      const resolved = resolveManualRange({
        workDate: input.workDate,
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes,
        timeZone: project.timeZone,
      });
      startedAt = resolved.startedAt;
      endedAt = resolved.endedAt;
      breakSeconds = resolved.breakSeconds;
      durationSeconds = resolved.durationSeconds;
      await assertNoOverlap(startedAt, endedAt);
    } else {
      durationSeconds = Math.round(input.hours * 3600 + input.minutes * 60);
      if (durationSeconds < 60 || durationSeconds > 86_400) {
        throw new WorkLedgerError(
          "VALIDATION_ERROR",
          "Duration must be between one minute and 24 hours.",
        );
      }
    }
    const timestamp = nowIso();
    const record: WorkSession = {
      id: id(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      projectId: project.id,
      taskId: task?.id ?? null,
      taskNameSnapshot: task?.name ?? null,
      source: input.mode === "range" ? "manual_range" : "manual_duration",
      status: "completed",
      detailStatus: input.incomplete ? "incomplete" : "complete",
      workDate: input.workDate,
      timeZone: project.timeZone,
      startedAt,
      endedAt,
      durationSeconds,
      breakSeconds,
      description,
      billable: input.billable,
      hourlyRateMinorSnapshot:
        input.hourlyRateMinorOverride ?? project.hourlyRateMinor,
      currencySnapshot: project.currency,
      continuationGroupId: null,
      finalizedAt: timestamp,
      deletedAt: null,
      deletedReason: null,
    };
    await database.transaction(
      "rw",
      database.workSessions,
      database.auditEvents,
      async () => {
        await database.workSessions.add(record);
        await database.auditEvents.add(
          audit({
            entityType: "WorkSession",
            entityId: record.id,
            action: "created",
            before: null,
            after: {
              source: record.source,
              workDate: record.workDate,
              durationSeconds: record.durationSeconds,
              billable: record.billable,
              hourlyRateMinorSnapshot: record.hourlyRateMinorSnapshot,
            },
            changedFields: [
              "projectId",
              "taskId",
              "source",
              "workDate",
              "durationSeconds",
              "billable",
              "hourlyRateMinorSnapshot",
            ],
            reason:
              input.hourlyRateMinorOverride !== null
                ? "Historical rate override supplied at creation"
                : null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
    return record;
  },

  async addQuickSessions(
    projectId: string,
    rows: Array<{ workDate: string; hours: number; minutes: number }>,
  ): Promise<void> {
    if (rows.length === 0) {
      throw new WorkLedgerError("VALIDATION_ERROR", "Add at least one row.");
    }
    const { project } = await resolveProjectForWork(projectId, null);
    const timestamp = nowIso();
    const records = rows.map((row) => {
      const durationSeconds = Math.round(row.hours * 3600 + row.minutes * 60);
      if (row.workDate > todayIn(project.timeZone)) {
        throw new WorkLedgerError(
          "VALIDATION_ERROR",
          "Quick-entry dates cannot be in the future.",
        );
      }
      if (durationSeconds < 60 || durationSeconds > 86_400) {
        throw new WorkLedgerError(
          "VALIDATION_ERROR",
          "Every quick-entry duration must be between one minute and 24 hours.",
        );
      }
      const record: WorkSession = {
        id: id(),
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        projectId: project.id,
        taskId: null,
        taskNameSnapshot: null,
        source: "manual_duration",
        status: "completed",
        detailStatus: "incomplete",
        workDate: row.workDate,
        timeZone: project.timeZone,
        startedAt: null,
        endedAt: null,
        durationSeconds,
        breakSeconds: 0,
        description: null,
        billable: true,
        hourlyRateMinorSnapshot: project.hourlyRateMinor,
        currencySnapshot: project.currency,
        continuationGroupId: null,
        finalizedAt: timestamp,
        deletedAt: null,
        deletedReason: null,
      };
      return record;
    });
    const operationId = id();
    await database.transaction(
      "rw",
      database.workSessions,
      database.auditEvents,
      async () => {
        await database.workSessions.bulkAdd(records);
        await database.auditEvents.bulkAdd(
          records.map((record) =>
            audit({
              entityType: "WorkSession",
              entityId: record.id,
              action: "quick_created",
              before: null,
              after: {
                workDate: record.workDate,
                durationSeconds: record.durationSeconds,
                detailStatus: record.detailStatus,
              },
              changedFields: ["workDate", "durationSeconds", "detailStatus"],
              reason: null,
              operationId,
              at: timestamp,
            }),
          ),
        );
      },
    );
    notifyChange();
  },

  async updateSessionDetails(input: {
    sessionId: string;
    description: string;
    taskId: string | null;
    billable: boolean;
    reason: string;
  }): Promise<void> {
    const existing = await database.workSessions.get(input.sessionId);
    if (!existing)
      throw new WorkLedgerError("NOT_FOUND", "Work session not found.");
    const link = await database.invoiceSessionLinks
      .where("sessionId")
      .equals(existing.id)
      .first();
    if (link) {
      const invoice = await database.invoices.get(link.invoiceId);
      if (invoice?.status === "issued") {
        throw new WorkLedgerError(
          "CONFLICT",
          "Issued invoice sessions are frozen and cannot be edited.",
        );
      }
    }
    const { task } = await resolveProjectForWork(
      existing.projectId,
      input.taskId,
    );
    const description = requiredText(input.description, "Description", 2000);
    const materiallyChanged =
      existing.billable !== input.billable || existing.taskId !== input.taskId;
    const reason = clampText(input.reason);
    if (materiallyChanged && !reason) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Add a reason for changes that affect billing or classification.",
      );
    }
    const timestamp = nowIso();
    const next: WorkSession = {
      ...existing,
      taskId: task?.id ?? null,
      taskNameSnapshot: task?.name ?? null,
      description,
      billable: input.billable,
      detailStatus: "complete",
      version: existing.version + 1,
      updatedAt: timestamp,
    };
    await database.transaction(
      "rw",
      database.workSessions,
      database.auditEvents,
      async () => {
        await database.workSessions.put(next);
        await database.auditEvents.add(
          audit({
            entityType: "WorkSession",
            entityId: next.id,
            action: "updated",
            before: {
              taskId: existing.taskId,
              description: existing.description,
              billable: existing.billable,
              detailStatus: existing.detailStatus,
            },
            after: {
              taskId: next.taskId,
              description: next.description,
              billable: next.billable,
              detailStatus: next.detailStatus,
            },
            changedFields: [
              "taskId",
              "description",
              "billable",
              "detailStatus",
            ],
            reason,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async setSessionDeleted(
    sessionId: string,
    deleted: boolean,
    reason: string,
  ): Promise<void> {
    const existing = await database.workSessions.get(sessionId);
    if (!existing)
      throw new WorkLedgerError("NOT_FOUND", "Work session not found.");
    if (existing.status !== "completed") {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Stop the timer before deleting this session.",
      );
    }
    const link = await database.invoiceSessionLinks
      .where("sessionId")
      .equals(sessionId)
      .first();
    if (link) {
      throw new WorkLedgerError(
        "CONFLICT",
        "Remove this session from its draft invoice before changing it.",
      );
    }
    const normalizedReason = requiredText(reason, "Reason", 500);
    if (!deleted && existing.startedAt && existing.endedAt) {
      await assertNoOverlap(existing.startedAt, existing.endedAt, existing.id);
    }
    const timestamp = nowIso();
    await database.transaction(
      "rw",
      database.workSessions,
      database.auditEvents,
      async () => {
        await database.workSessions.update(sessionId, {
          deletedAt: deleted ? timestamp : null,
          deletedReason: deleted ? normalizedReason : null,
          version: existing.version + 1,
          updatedAt: timestamp,
        });
        await database.auditEvents.add(
          audit({
            entityType: "WorkSession",
            entityId: sessionId,
            action: deleted ? "deleted" : "restored",
            before: { deletedAt: existing.deletedAt },
            after: { deletedAt: deleted ? timestamp : null },
            changedFields: ["deletedAt", "deletedReason"],
            reason: normalizedReason,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async startTimer(input: TimerStartInput): Promise<WorkSession> {
    return withTimerLock(async () => {
      const { project, task } = await resolveProjectForWork(
        input.projectId,
        input.taskId,
      );
      const description = requiredText(input.description, "Description", 2000);
      const timestamp = nowIso();
      const record: WorkSession = {
        id: id(),
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        projectId: project.id,
        taskId: task?.id ?? null,
        taskNameSnapshot: task?.name ?? null,
        source: "tracked",
        status: "running",
        detailStatus: "complete",
        workDate: localDateAt(new Date(timestamp), project.timeZone),
        timeZone: project.timeZone,
        startedAt: timestamp,
        endedAt: null,
        durationSeconds: 0,
        breakSeconds: 0,
        description,
        billable: input.billable,
        hourlyRateMinorSnapshot: project.hourlyRateMinor,
        currencySnapshot: project.currency,
        continuationGroupId: null,
        finalizedAt: null,
        deletedAt: null,
        deletedReason: null,
      };
      const segment: SessionSegment = {
        id: id(),
        sessionId: record.id,
        sequence: 1,
        startedAt: timestamp,
        endedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await database.transaction(
        "rw",
        database.workSessions,
        database.sessionSegments,
        database.auditEvents,
        async () => {
          const current = await activeSession();
          if (current) {
            throw new WorkLedgerError(
              "TIMER_STATE_CONFLICT",
              "Another timer is already active.",
            );
          }
          await database.workSessions.add(record);
          await database.sessionSegments.add(segment);
          await database.auditEvents.add(
            audit({
              entityType: "WorkSession",
              entityId: record.id,
              action: "timer_started",
              before: null,
              after: { status: "running", startedAt: timestamp },
              changedFields: ["status", "startedAt"],
              reason: null,
              at: timestamp,
            }),
          );
        },
      );
      notifyChange();
      return record;
    });
  },

  async pauseTimer(sessionId: string): Promise<void> {
    await withTimerLock(async () => {
      const timestamp = nowIso();
      await database.transaction(
        "rw",
        database.workSessions,
        database.sessionSegments,
        database.auditEvents,
        async () => {
          const session = await database.workSessions.get(sessionId);
          if (!session || session.status !== "running") {
            throw new WorkLedgerError(
              "TIMER_STATE_CONFLICT",
              "The timer is no longer running.",
            );
          }
          const segments = await database.sessionSegments
            .where("sessionId")
            .equals(sessionId)
            .sortBy("sequence");
          const open = segments.find((segment) => segment.endedAt === null);
          if (!open || new Date(timestamp) <= new Date(open.startedAt)) {
            throw new WorkLedgerError(
              "TIMER_STATE_CONFLICT",
              "The device clock changed. Correct it before pausing.",
            );
          }
          await database.sessionSegments.update(open.id, {
            endedAt: timestamp,
            updatedAt: timestamp,
          });
          const nextSegments = segments.map((segment) =>
            segment.id === open.id
              ? { ...segment, endedAt: timestamp, updatedAt: timestamp }
              : segment,
          );
          const durationSeconds = sumClosedSegments(nextSegments);
          const pieces = nextSegments.flatMap((segment) =>
            partitionIntervalByLocalDay(
              segment.startedAt,
              segment.endedAt ?? timestamp,
              session.timeZone,
            ),
          );
          const grouped = new Map<string, typeof pieces>();
          for (const piece of pieces) {
            const group = grouped.get(piece.workDate) ?? [];
            group.push(piece);
            grouped.set(piece.workDate, group);
          }
          const dates = [...grouped.keys()].sort();
          if (dates.length <= 1) {
            await database.workSessions.update(sessionId, {
              status: "paused",
              durationSeconds,
              version: session.version + 1,
              updatedAt: timestamp,
            });
            await database.auditEvents.add(
              audit({
                entityType: "WorkSession",
                entityId: sessionId,
                action: "timer_paused",
                before: { status: "running" },
                after: { status: "paused", durationSeconds },
                changedFields: ["status", "durationSeconds"],
                reason: null,
                at: timestamp,
              }),
            );
          } else {
            const continuationGroupId = session.continuationGroupId ?? id();
            const operationId = id();
            await database.sessionSegments
              .where("sessionId")
              .equals(sessionId)
              .delete();
            for (const [dateIndex, workDate] of dates.entries()) {
              const dayPieces = grouped.get(workDate) ?? [];
              const isLast = dateIndex === dates.length - 1;
              const targetId = isLast ? sessionId : id();
              const daySegments: SessionSegment[] = dayPieces.map(
                (piece, index) => ({
                  id: id(),
                  sessionId: targetId,
                  sequence: index + 1,
                  startedAt: piece.startedAt,
                  endedAt: piece.endedAt,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                }),
              );
              const dayDuration = sumClosedSegments(daySegments);
              const firstStart = daySegments[0]?.startedAt ?? timestamp;
              const lastEnd =
                daySegments[daySegments.length - 1]?.endedAt ?? timestamp;
              const wallSeconds = Math.max(
                0,
                Math.floor(
                  (new Date(lastEnd).getTime() -
                    new Date(firstStart).getTime()) /
                    1000,
                ),
              );
              const record: WorkSession = {
                ...session,
                id: targetId,
                version: isLast ? session.version + 1 : 1,
                createdAt: isLast ? session.createdAt : timestamp,
                updatedAt: timestamp,
                status: isLast ? "paused" : "completed",
                workDate,
                startedAt: firstStart,
                endedAt: isLast ? null : lastEnd,
                durationSeconds: dayDuration,
                breakSeconds: Math.max(0, wallSeconds - dayDuration),
                continuationGroupId,
                finalizedAt: isLast ? null : timestamp,
              };
              await database.workSessions.put(record);
              await database.sessionSegments.bulkAdd(daySegments);
              await database.auditEvents.add(
                audit({
                  entityType: "WorkSession",
                  entityId: targetId,
                  action: isLast
                    ? "timer_paused"
                    : "midnight_partition_created",
                  before: isLast ? { status: "running" } : null,
                  after: {
                    status: record.status,
                    workDate,
                    durationSeconds: dayDuration,
                  },
                  changedFields: ["status", "workDate", "durationSeconds"],
                  reason: null,
                  operationId,
                  at: timestamp,
                }),
              );
            }
          }
        },
      );
      notifyChange();
    });
  },

  async resumeTimer(sessionId: string): Promise<string> {
    return withTimerLock(async () => {
      const timestamp = nowIso();
      let activeId = sessionId;
      await database.transaction(
        "rw",
        database.workSessions,
        database.sessionSegments,
        database.auditEvents,
        async () => {
          const session = await database.workSessions.get(sessionId);
          if (!session || session.status !== "paused") {
            throw new WorkLedgerError(
              "TIMER_STATE_CONFLICT",
              "The timer is no longer paused.",
            );
          }
          const segments = await database.sessionSegments
            .where("sessionId")
            .equals(sessionId)
            .sortBy("sequence");
          const currentDate = localDateAt(
            new Date(timestamp),
            session.timeZone,
          );
          if (currentDate !== session.workDate) {
            const continuationGroupId = session.continuationGroupId ?? id();
            const finalSegmentEnd =
              segments[segments.length - 1]?.endedAt ?? session.startedAt;
            await database.workSessions.update(session.id, {
              status: "completed",
              endedAt: finalSegmentEnd,
              finalizedAt: timestamp,
              continuationGroupId,
              version: session.version + 1,
              updatedAt: timestamp,
            });
            const nextId = id();
            activeId = nextId;
            const next: WorkSession = {
              ...session,
              id: nextId,
              version: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
              workDate: currentDate,
              status: "running",
              startedAt: timestamp,
              endedAt: null,
              durationSeconds: 0,
              breakSeconds: 0,
              continuationGroupId,
              finalizedAt: null,
            };
            await database.workSessions.add(next);
            await database.sessionSegments.add({
              id: id(),
              sessionId: nextId,
              sequence: 1,
              startedAt: timestamp,
              endedAt: null,
              createdAt: timestamp,
              updatedAt: timestamp,
            });
          } else {
            await database.sessionSegments.add({
              id: id(),
              sessionId,
              sequence: segments.length + 1,
              startedAt: timestamp,
              endedAt: null,
              createdAt: timestamp,
              updatedAt: timestamp,
            });
            await database.workSessions.update(sessionId, {
              status: "running",
              version: session.version + 1,
              updatedAt: timestamp,
            });
          }
          await database.auditEvents.add(
            audit({
              entityType: "WorkSession",
              entityId: activeId,
              action: "timer_resumed",
              before: { status: "paused" },
              after: { status: "running", resumedAt: timestamp },
              changedFields: ["status"],
              reason: null,
              at: timestamp,
            }),
          );
        },
      );
      notifyChange();
      return activeId;
    });
  },

  async stopTimer(sessionId: string): Promise<void> {
    await withTimerLock(async () => {
      const timestamp = nowIso();
      await database.transaction(
        "rw",
        database.workSessions,
        database.sessionSegments,
        database.auditEvents,
        async () => {
          const session = await database.workSessions.get(sessionId);
          if (!session || !["running", "paused"].includes(session.status)) {
            throw new WorkLedgerError(
              "TIMER_STATE_CONFLICT",
              "The timer is already stopped.",
            );
          }
          const segments = await database.sessionSegments
            .where("sessionId")
            .equals(sessionId)
            .sortBy("sequence");
          const closed = segments.map((segment) => {
            if (segment.endedAt !== null) return segment;
            if (new Date(timestamp) <= new Date(segment.startedAt)) {
              throw new WorkLedgerError(
                "TIMER_STATE_CONFLICT",
                "The device clock changed. Correct it before stopping.",
              );
            }
            return { ...segment, endedAt: timestamp, updatedAt: timestamp };
          });
          const durationSeconds = sumClosedSegments(closed);
          if (durationSeconds <= 0) {
            throw new WorkLedgerError(
              "VALIDATION_ERROR",
              "A zero-duration timer cannot be completed.",
            );
          }
          const pieces = closed.flatMap((segment) =>
            partitionIntervalByLocalDay(
              segment.startedAt,
              segment.endedAt ?? timestamp,
              session.timeZone,
            ),
          );
          const grouped = new Map<string, typeof pieces>();
          for (const piece of pieces) {
            const group = grouped.get(piece.workDate) ?? [];
            group.push(piece);
            grouped.set(piece.workDate, group);
          }
          const dates = [...grouped.keys()].sort();
          const continuationGroupId =
            dates.length > 1
              ? (session.continuationGroupId ?? id())
              : session.continuationGroupId;
          await database.sessionSegments
            .where("sessionId")
            .equals(sessionId)
            .delete();
          const operationId = id();
          for (const [dateIndex, workDate] of dates.entries()) {
            const dayPieces = grouped.get(workDate) ?? [];
            const isLast = dateIndex === dates.length - 1;
            const targetId = isLast ? sessionId : id();
            const daySegments: SessionSegment[] = dayPieces.map(
              (piece, index) => ({
                id: id(),
                sessionId: targetId,
                sequence: index + 1,
                startedAt: piece.startedAt,
                endedAt: piece.endedAt,
                createdAt: timestamp,
                updatedAt: timestamp,
              }),
            );
            const dayDuration = sumClosedSegments(daySegments);
            const firstStart = daySegments[0]?.startedAt ?? session.startedAt;
            const lastEnd =
              daySegments[daySegments.length - 1]?.endedAt ?? timestamp;
            const wallSeconds =
              firstStart === null
                ? dayDuration
                : Math.max(
                    0,
                    Math.floor(
                      (new Date(lastEnd).getTime() -
                        new Date(firstStart).getTime()) /
                        1000,
                    ),
                  );
            const record: WorkSession = {
              ...session,
              id: targetId,
              version: isLast ? session.version + 1 : 1,
              createdAt: isLast ? session.createdAt : timestamp,
              updatedAt: timestamp,
              status: "completed",
              workDate,
              startedAt: firstStart,
              endedAt: lastEnd,
              durationSeconds: dayDuration,
              breakSeconds: Math.max(0, wallSeconds - dayDuration),
              continuationGroupId: continuationGroupId ?? null,
              finalizedAt: timestamp,
            };
            await database.workSessions.put(record);
            await database.sessionSegments.bulkAdd(daySegments);
            await database.auditEvents.add(
              audit({
                entityType: "WorkSession",
                entityId: targetId,
                action: isLast ? "timer_stopped" : "midnight_partition_created",
                before: isLast ? { status: session.status } : null,
                after: {
                  status: "completed",
                  workDate,
                  durationSeconds: dayDuration,
                },
                changedFields: [
                  "status",
                  "workDate",
                  "durationSeconds",
                  "endedAt",
                ],
                reason: null,
                operationId,
                at: timestamp,
              }),
            );
          }
        },
      );
      notifyChange();
    });
  },

  async addEvidenceFile(input: EvidenceFileInput): Promise<EvidenceAsset> {
    const file = input.file;
    const isImage = ["image/png", "image/jpeg", "image/webp"].includes(
      file.type,
    );
    const executable = /\.(exe|msi|bat|cmd|com|scr|js|mjs|ps1|sh|app)$/i.test(
      file.name,
    );
    if (executable) {
      throw new WorkLedgerError(
        "UNSUPPORTED_FILE",
        "Executable and script files cannot be stored as evidence.",
      );
    }
    const max = isImage ? 15 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > max) {
      throw new WorkLedgerError(
        "UNSUPPORTED_FILE",
        `This file is larger than the ${isImage ? "15" : "25"} MiB limit.`,
      );
    }
    await this.validateEvidenceTarget(
      input.projectId,
      input.scope,
      input.sessionId,
      input.workDate,
    );
    const timestamp = nowIso();
    const hash = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    const sha256 = [...new Uint8Array(hash)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const record: EvidenceAsset = {
      id: id(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      projectId: input.projectId,
      scope: input.scope,
      sessionId: input.scope === "session" ? input.sessionId : null,
      workDate: input.scope === "day" ? input.workDate : null,
      kind: isImage ? "screenshot" : "file",
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      blob: file,
      thumbnailBlob: null,
      url: null,
      sha256,
      caption: clampText(input.caption),
      capturedAt: null,
      uploadedAt: timestamp,
      deletedAt: null,
    };
    await database.transaction(
      "rw",
      database.evidenceAssets,
      database.auditEvents,
      async () => {
        await database.evidenceAssets.add(record);
        await database.auditEvents.add(
          audit({
            entityType: "EvidenceAsset",
            entityId: record.id,
            action: "created",
            before: null,
            after: {
              projectId: record.projectId,
              scope: record.scope,
              sessionId: record.sessionId,
              workDate: record.workDate,
              kind: record.kind,
              originalName: record.originalName,
              sizeBytes: record.sizeBytes,
              sha256: record.sha256,
            },
            changedFields: ["scope", "kind", "metadata"],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
    return record;
  },

  async validateEvidenceTarget(
    projectId: string,
    scope: EvidenceScope,
    sessionId: string | null,
    workDate: string | null,
  ): Promise<void> {
    const project = await database.projects.get(projectId);
    if (!project) throw new WorkLedgerError("NOT_FOUND", "Project not found.");
    if (scope === "session") {
      const session = sessionId
        ? await database.workSessions.get(sessionId)
        : null;
      if (!session || session.projectId !== projectId) {
        throw new WorkLedgerError(
          "VALIDATION_ERROR",
          "Select a session from the chosen project.",
        );
      }
    } else if (!workDate) {
      throw new WorkLedgerError("VALIDATION_ERROR", "Choose a work date.");
    }
  },

  async addEvidenceLink(input: EvidenceLinkInput): Promise<EvidenceAsset> {
    await this.validateEvidenceTarget(
      input.projectId,
      input.scope,
      input.sessionId,
      input.workDate,
    );
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Enter a complete web address.",
      );
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Evidence links must use http or https.",
      );
    }
    const timestamp = nowIso();
    const record: EvidenceAsset = {
      id: id(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      projectId: input.projectId,
      scope: input.scope,
      sessionId: input.scope === "session" ? input.sessionId : null,
      workDate: input.scope === "day" ? input.workDate : null,
      kind: "link",
      originalName: null,
      mimeType: null,
      sizeBytes: null,
      blob: null,
      thumbnailBlob: null,
      url: url.toString(),
      sha256: null,
      caption: clampText(input.caption),
      capturedAt: null,
      uploadedAt: timestamp,
      deletedAt: null,
    };
    await database.transaction(
      "rw",
      database.evidenceAssets,
      database.auditEvents,
      async () => {
        await database.evidenceAssets.add(record);
        await database.auditEvents.add(
          audit({
            entityType: "EvidenceAsset",
            entityId: record.id,
            action: "created",
            before: null,
            after: {
              projectId: record.projectId,
              scope: record.scope,
              kind: "link",
              url: record.url,
            },
            changedFields: ["scope", "kind", "url"],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
    return record;
  },

  async deleteEvidence(evidenceId: string): Promise<void> {
    const existing = await database.evidenceAssets.get(evidenceId);
    if (!existing)
      throw new WorkLedgerError("NOT_FOUND", "Evidence not found.");
    const timestamp = nowIso();
    await database.transaction(
      "rw",
      database.evidenceAssets,
      database.auditEvents,
      async () => {
        await database.evidenceAssets.update(evidenceId, {
          deletedAt: timestamp,
          version: existing.version + 1,
          updatedAt: timestamp,
        });
        await database.auditEvents.add(
          audit({
            entityType: "EvidenceAsset",
            entityId: evidenceId,
            action: "deleted",
            before: { deletedAt: null },
            after: { deletedAt: timestamp },
            changedFields: ["deletedAt"],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async createInvoiceDraft(input: InvoiceDraftInput): Promise<Invoice> {
    if (input.periodEnd < input.periodStart) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Invoice period end cannot be before its start.",
      );
    }
    if (input.sessionIds.length === 0) {
      throw new WorkLedgerError(
        "VALIDATION_ERROR",
        "Select at least one eligible session.",
      );
    }
    const client = await database.clients.get(input.clientId);
    if (!client) throw new WorkLedgerError("NOT_FOUND", "Client not found.");
    const timestamp = nowIso();
    const invoice: Invoice = {
      id: id(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "draft",
      invoiceNumber: null,
      clientId: input.clientId,
      currency: input.currency,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      issueDate: null,
      dueDate: null,
      freelancerSnapshot: null,
      clientSnapshot: null,
      paymentSnapshot: null,
      totalSeconds: 0,
      subtotalMinor: 0,
      totalMinor: 0,
      notes: clampText(input.notes),
      issuedAt: null,
    };
    await database.transaction(
      "rw",
      database.invoices,
      database.invoiceSessionLinks,
      database.workSessions,
      database.projects,
      database.auditEvents,
      async () => {
        let totalSeconds = 0;
        let totalMinor = 0;
        const links: InvoiceSessionLink[] = [];
        for (const sessionId of [...new Set(input.sessionIds)]) {
          const session = await database.workSessions.get(sessionId);
          const project = session
            ? await database.projects.get(session.projectId)
            : undefined;
          const allocated = await database.invoiceSessionLinks
            .where("sessionId")
            .equals(sessionId)
            .first();
          if (
            !session ||
            !project ||
            session.status !== "completed" ||
            session.detailStatus !== "complete" ||
            !session.billable ||
            session.deletedAt !== null ||
            project.clientId !== input.clientId ||
            session.currencySnapshot !== input.currency ||
            session.workDate < input.periodStart ||
            session.workDate > input.periodEnd ||
            allocated
          ) {
            throw new WorkLedgerError(
              "INVOICE_INELIGIBLE",
              "One or more selected sessions are no longer eligible.",
            );
          }
          totalSeconds += session.durationSeconds;
          totalMinor += sessionAmountMinor(session);
          links.push({
            id: id(),
            invoiceId: invoice.id,
            invoiceLineId: null,
            sessionId,
            sessionSnapshot: null,
            createdAt: timestamp,
          });
        }
        invoice.totalSeconds = totalSeconds;
        invoice.subtotalMinor = totalMinor;
        invoice.totalMinor = totalMinor;
        await database.invoices.add(invoice);
        await database.invoiceSessionLinks.bulkAdd(links);
        await database.auditEvents.add(
          audit({
            entityType: "Invoice",
            entityId: invoice.id,
            action: "draft_created",
            before: null,
            after: {
              clientId: input.clientId,
              currency: input.currency,
              sessionCount: links.length,
              totalMinor,
            },
            changedFields: [
              "clientId",
              "period",
              "currency",
              "sessions",
              "totals",
            ],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
    return invoice;
  },

  async deleteDraft(invoiceId: string): Promise<void> {
    const invoice = await database.invoices.get(invoiceId);
    if (!invoice || invoice.status !== "draft") {
      throw new WorkLedgerError(
        "CONFLICT",
        "Only draft invoices can be deleted.",
      );
    }
    const timestamp = nowIso();
    await database.transaction(
      "rw",
      database.invoices,
      database.invoiceLines,
      database.invoiceSessionLinks,
      database.auditEvents,
      async () => {
        await database.invoiceSessionLinks
          .where("invoiceId")
          .equals(invoiceId)
          .delete();
        await database.invoiceLines
          .where("invoiceId")
          .equals(invoiceId)
          .delete();
        await database.invoices.delete(invoiceId);
        await database.auditEvents.add(
          audit({
            entityType: "Invoice",
            entityId: invoiceId,
            action: "draft_deleted",
            before: { status: "draft", totalMinor: invoice.totalMinor },
            after: null,
            changedFields: ["status"],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
  },

  async issueInvoice(
    invoiceId: string,
    issueDate: string,
    dueDate: string | null,
  ): Promise<Invoice> {
    await ensureDatabaseDefaults();
    const timestamp = nowIso();
    let issued: Invoice | null = null;
    await database.transaction(
      "rw",
      [
        database.invoices,
        database.invoiceLines,
        database.invoiceSessionLinks,
        database.invoiceSequences,
        database.workSessions,
        database.projects,
        database.clients,
        database.freelancerProfiles,
        database.appSettings,
        database.auditEvents,
      ],
      async () => {
        const invoice = await database.invoices.get(invoiceId);
        const profile = await database.freelancerProfiles.get("owner");
        const settings = await database.appSettings.get("settings");
        const client = invoice
          ? await database.clients.get(invoice.clientId)
          : undefined;
        if (
          !invoice ||
          invoice.status !== "draft" ||
          !profile ||
          !settings ||
          !client
        ) {
          throw new WorkLedgerError(
            "INVOICE_INELIGIBLE",
            "Complete your profile and select a valid draft before issuing.",
          );
        }
        if (issueDate > todayIn(settings.defaultTimeZone)) {
          throw new WorkLedgerError(
            "VALIDATION_ERROR",
            "Issue date cannot be in the future.",
          );
        }
        if (dueDate && dueDate < issueDate) {
          throw new WorkLedgerError(
            "VALIDATION_ERROR",
            "Due date cannot be before the issue date.",
          );
        }
        const links = await database.invoiceSessionLinks
          .where("invoiceId")
          .equals(invoiceId)
          .toArray();
        if (links.length === 0) {
          throw new WorkLedgerError(
            "INVOICE_INELIGIBLE",
            "The draft has no selected sessions.",
          );
        }
        const sessions: WorkSession[] = [];
        const projects = new Map<string, Project>();
        for (const link of links) {
          const session = await database.workSessions.get(link.sessionId);
          const project = session
            ? await database.projects.get(session.projectId)
            : undefined;
          if (
            !session ||
            !project ||
            session.status !== "completed" ||
            session.detailStatus !== "complete" ||
            !session.billable ||
            session.deletedAt !== null ||
            project.clientId !== invoice.clientId ||
            session.currencySnapshot !== invoice.currency ||
            session.workDate < invoice.periodStart ||
            session.workDate > invoice.periodEnd
          ) {
            throw new WorkLedgerError(
              "INVOICE_INELIGIBLE",
              "A selected session changed. Review the draft before issuing.",
            );
          }
          sessions.push(session);
          projects.set(project.id, project);
        }
        const grouped = new Map<string, WorkSession[]>();
        for (const session of sessions) {
          const week = format(
            startOfWeek(parseISO(session.workDate), {
              weekStartsOn: settings.weekStartsOn,
            }),
            "yyyy-MM-dd",
          );
          const key = `${session.projectId}|${session.hourlyRateMinorSnapshot}|${week}`;
          const group = grouped.get(key) ?? [];
          group.push(session);
          grouped.set(key, group);
        }
        const lines: InvoiceLine[] = [];
        const sessionToLine = new Map<string, InvoiceLine>();
        for (const [ordinal, group] of [...grouped.values()]
          .sort((a, b) => a[0]!.workDate.localeCompare(b[0]!.workDate))
          .entries()) {
          const first = group[0]!;
          const project = projects.get(first.projectId)!;
          const dates = group.map((session) => session.workDate).sort();
          const line: InvoiceLine = {
            id: id(),
            invoiceId,
            ordinal: ordinal + 1,
            projectId: project.id,
            projectNameSnapshot: project.name,
            periodStart: dates[0]!,
            periodEnd: dates[dates.length - 1]!,
            description: `${project.name} — professional services`,
            durationSeconds: group.reduce(
              (sum, session) => sum + session.durationSeconds,
              0,
            ),
            hourlyRateMinor: first.hourlyRateMinorSnapshot,
            currency: first.currencySnapshot,
            amountMinor: group.reduce(
              (sum, session) => sum + sessionAmountMinor(session),
              0,
            ),
            createdAt: timestamp,
          };
          lines.push(line);
          for (const session of group) sessionToLine.set(session.id, line);
        }
        const year = Number(issueDate.slice(0, 4));
        const sequenceKey = `${settings.invoicePrefix}-${year}`;
        const existingSequence = await database.invoiceSequences
          .where("key")
          .equals(sequenceKey)
          .first();
        const nextValue = existingSequence?.nextValue ?? 1;
        const invoiceNumber = `${settings.invoicePrefix}-${year}-${String(nextValue).padStart(3, "0")}`;
        if (existingSequence) {
          await database.invoiceSequences.update(existingSequence.id, {
            nextValue: nextValue + 1,
            version: existingSequence.version + 1,
            updatedAt: timestamp,
          });
        } else {
          await database.invoiceSequences.add({
            id: sequenceKey,
            key: sequenceKey,
            prefix: settings.invoicePrefix,
            year,
            nextValue: 2,
            version: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
        await database.invoiceLines.bulkAdd(lines);
        for (const link of links) {
          const session = sessions.find((item) => item.id === link.sessionId)!;
          const project = projects.get(session.projectId)!;
          const line = sessionToLine.get(session.id)!;
          await database.invoiceSessionLinks.update(link.id, {
            invoiceLineId: line.id,
            sessionSnapshot: {
              workDate: session.workDate,
              projectId: project.id,
              projectName: project.name,
              taskName: session.taskNameSnapshot,
              description: session.description ?? "",
              durationSeconds: session.durationSeconds,
              hourlyRateMinor: session.hourlyRateMinorSnapshot,
              currency: session.currencySnapshot,
              amountMinor: sessionAmountMinor(session),
            },
          });
        }
        const totalSeconds = lines.reduce(
          (sum, line) => sum + line.durationSeconds,
          0,
        );
        const totalMinor = lines.reduce(
          (sum, line) => sum + line.amountMinor,
          0,
        );
        issued = {
          ...invoice,
          version: invoice.version + 1,
          updatedAt: timestamp,
          status: "issued",
          invoiceNumber,
          issueDate,
          dueDate,
          freelancerSnapshot: {
            displayName: profile.displayName,
            legalName: profile.legalName,
            email: profile.email,
            phone: profile.phone,
            address: profile.address,
            taxIdentifier: profile.taxIdentifier,
          },
          clientSnapshot: {
            displayName: client.displayName,
            legalName: client.legalName,
            companyName: client.companyName,
            email: client.email,
            billingAddress: client.billingAddress,
            taxIdentifier: client.taxIdentifier,
          },
          paymentSnapshot: profile.paymentDetails,
          totalSeconds,
          subtotalMinor: totalMinor,
          totalMinor,
          issuedAt: timestamp,
        };
        await database.invoices.put(issued);
        await database.auditEvents.add(
          audit({
            entityType: "Invoice",
            entityId: invoiceId,
            action: "issued",
            before: { status: "draft" },
            after: {
              status: "issued",
              invoiceNumber,
              sessionCount: sessions.length,
              totalMinor,
            },
            changedFields: [
              "status",
              "invoiceNumber",
              "snapshots",
              "lines",
              "totals",
            ],
            reason: null,
            at: timestamp,
          }),
        );
      },
    );
    notifyChange();
    if (!issued) {
      throw new WorkLedgerError(
        "PERSISTENCE_FAILED",
        "Invoice could not be issued.",
      );
    }
    return issued;
  },
};
