import Dexie, { type EntityTable } from "dexie";

import type {
  AppSettings,
  AuditEvent,
  Client,
  EvidenceAsset,
  FreelancerProfile,
  Invoice,
  InvoiceLine,
  InvoiceSequence,
  InvoiceSessionLink,
  LedgerSnapshot,
  Project,
  SessionSegment,
  Task,
  WorkSession,
} from "@/domain/models";

export class WorkLedgerDatabase extends Dexie {
  freelancerProfiles!: EntityTable<FreelancerProfile, "id">;
  appSettings!: EntityTable<AppSettings, "id">;
  clients!: EntityTable<Client, "id">;
  projects!: EntityTable<Project, "id">;
  tasks!: EntityTable<Task, "id">;
  workSessions!: EntityTable<WorkSession, "id">;
  sessionSegments!: EntityTable<SessionSegment, "id">;
  evidenceAssets!: EntityTable<EvidenceAsset, "id">;
  auditEvents!: EntityTable<AuditEvent, "id">;
  invoices!: EntityTable<Invoice, "id">;
  invoiceLines!: EntityTable<InvoiceLine, "id">;
  invoiceSessionLinks!: EntityTable<InvoiceSessionLink, "id">;
  invoiceSequences!: EntityTable<InvoiceSequence, "id">;

  constructor(name = "workledger") {
    super(name);
    this.version(1).stores({
      freelancerProfiles: "&id,updatedAt",
      appSettings: "&id,updatedAt",
      clients:
        "&id,status,normalizedName,[status+normalizedName],createdAt,updatedAt",
      projects:
        "&id,clientId,status,normalizedName,[clientId+status],[clientId+normalizedName],createdAt,updatedAt",
      tasks:
        "&id,projectId,status,normalizedName,[projectId+status],[projectId+normalizedName],createdAt,updatedAt",
      workSessions:
        "&id,projectId,workDate,status,source,detailStatus,deletedAt,[projectId+workDate],[status+source],[workDate+status],createdAt,updatedAt",
      sessionSegments: "&id,sessionId,&[sessionId+sequence],startedAt",
      evidenceAssets:
        "&id,projectId,scope,sessionId,workDate,kind,deletedAt,[projectId+workDate],[sessionId+deletedAt],uploadedAt",
      auditEvents:
        "&id,operationId,entityType,entityId,[entityType+entityId],createdAt",
      invoices:
        "&id,clientId,status,currency,periodStart,periodEnd,invoiceNumber,[clientId+status],createdAt,updatedAt",
      invoiceLines: "&id,invoiceId,&[invoiceId+ordinal]",
      invoiceSessionLinks: "&id,invoiceId,&sessionId,invoiceLineId",
      invoiceSequences: "&id,&key,year,prefix,updatedAt",
    });
  }
}

export const database = new WorkLedgerDatabase();

export function makeDefaultSettings(
  now = new Date().toISOString(),
): AppSettings {
  return {
    id: "settings",
    version: 1,
    createdAt: now,
    updatedAt: now,
    locale: "en-US",
    defaultTimeZone: "Africa/Cairo",
    defaultCurrency: "USD",
    weekStartsOn: 1,
    hourCycle: "h12",
    invoicePrefix: "INV",
    defaultPaymentTermsDays: 14,
  };
}

export async function ensureDatabaseDefaults(): Promise<AppSettings> {
  const existing = await database.appSettings.get("settings");
  if (existing) return existing;
  const settings = makeDefaultSettings();
  await database.appSettings.add(settings);
  return settings;
}

export async function getLedgerSnapshot(): Promise<LedgerSnapshot> {
  const settings = await ensureDatabaseDefaults();
  const [
    profile,
    clients,
    projects,
    tasks,
    sessions,
    segments,
    evidence,
    invoices,
    invoiceLines,
    invoiceLinks,
    invoiceSequences,
    auditEvents,
  ] = await Promise.all([
    database.freelancerProfiles.get("owner"),
    database.clients.orderBy("createdAt").reverse().toArray(),
    database.projects.orderBy("createdAt").reverse().toArray(),
    database.tasks.orderBy("createdAt").reverse().toArray(),
    database.workSessions.orderBy("workDate").reverse().toArray(),
    database.sessionSegments.orderBy("startedAt").toArray(),
    database.evidenceAssets.orderBy("uploadedAt").reverse().toArray(),
    database.invoices.orderBy("createdAt").reverse().toArray(),
    database.invoiceLines.toArray(),
    database.invoiceSessionLinks.toArray(),
    database.invoiceSequences.toArray(),
    database.auditEvents.orderBy("createdAt").reverse().toArray(),
  ]);
  return {
    profile: profile ?? null,
    settings,
    clients,
    projects,
    tasks,
    sessions,
    segments,
    evidence,
    invoices,
    invoiceLines,
    invoiceLinks,
    invoiceSequences,
    auditEvents,
  };
}

export async function replaceLedgerSnapshot(
  snapshot: LedgerSnapshot,
): Promise<void> {
  await database.transaction(
    "rw",
    [
      database.freelancerProfiles,
      database.appSettings,
      database.clients,
      database.projects,
      database.tasks,
      database.workSessions,
      database.sessionSegments,
      database.evidenceAssets,
      database.auditEvents,
      database.invoices,
      database.invoiceLines,
      database.invoiceSessionLinks,
      database.invoiceSequences,
    ],
    async () => {
      await Promise.all([
        database.freelancerProfiles.clear(),
        database.appSettings.clear(),
        database.clients.clear(),
        database.projects.clear(),
        database.tasks.clear(),
        database.workSessions.clear(),
        database.sessionSegments.clear(),
        database.evidenceAssets.clear(),
        database.auditEvents.clear(),
        database.invoices.clear(),
        database.invoiceLines.clear(),
        database.invoiceSessionLinks.clear(),
        database.invoiceSequences.clear(),
      ]);
      if (snapshot.profile) {
        await database.freelancerProfiles.add(snapshot.profile);
      }
      await database.appSettings.add(snapshot.settings);
      await Promise.all([
        database.clients.bulkAdd(snapshot.clients),
        database.projects.bulkAdd(snapshot.projects),
        database.tasks.bulkAdd(snapshot.tasks),
        database.workSessions.bulkAdd(snapshot.sessions),
        database.sessionSegments.bulkAdd(snapshot.segments),
        database.evidenceAssets.bulkAdd(snapshot.evidence),
        database.auditEvents.bulkAdd(snapshot.auditEvents),
        database.invoices.bulkAdd(snapshot.invoices),
        database.invoiceLines.bulkAdd(snapshot.invoiceLines),
        database.invoiceSessionLinks.bulkAdd(snapshot.invoiceLinks),
        database.invoiceSequences.bulkAdd(snapshot.invoiceSequences),
      ]);
    },
  );
}
