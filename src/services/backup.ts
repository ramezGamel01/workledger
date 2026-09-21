import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";

import { database, getLedgerSnapshot } from "@/db/database";
import type {
  AuditEvent,
  EvidenceAsset,
  LedgerSnapshot,
} from "@/domain/models";
import { persistCloudSnapshot } from "@/services/cloud";
import { WorkLedgerError } from "@/services/errors";

const BACKUP_FORMAT_VERSION = 1;
const DATABASE_SCHEMA_VERSION = 1;

interface EvidenceBackupRecord extends Omit<
  EvidenceAsset,
  "blob" | "thumbnailBlob"
> {
  blobPath: string | null;
}

interface BackupData {
  formatVersion: number;
  profile: LedgerSnapshot["profile"];
  settings: LedgerSnapshot["settings"];
  clients: LedgerSnapshot["clients"];
  projects: LedgerSnapshot["projects"];
  tasks: LedgerSnapshot["tasks"];
  sessions: LedgerSnapshot["sessions"];
  segments: LedgerSnapshot["segments"];
  evidence: EvidenceBackupRecord[];
  invoices: LedgerSnapshot["invoices"];
  invoiceLines: LedgerSnapshot["invoiceLines"];
  invoiceLinks: LedgerSnapshot["invoiceLinks"];
  invoiceSequences: LedgerSnapshot["invoiceSequences"];
  auditEvents: LedgerSnapshot["auditEvents"];
}

interface BackupManifest {
  product: "WorkLedger";
  productVersion: string;
  formatVersion: number;
  databaseSchemaVersion: number;
  createdAt: string;
  recordCounts: Record<string, number>;
  checksums: Record<string, string>;
}

export interface BackupPreview {
  createdAt: string;
  formatVersion: number;
  databaseSchemaVersion: number;
  clients: number;
  projects: number;
  sessions: number;
  invoices: number;
  evidence: number;
  evidenceBytes: number;
  dateStart: string | null;
  dateEnd: string | null;
}

const manifestSchema = z.object({
  product: z.literal("WorkLedger"),
  productVersion: z.string(),
  formatVersion: z.number().int(),
  databaseSchemaVersion: z.number().int(),
  createdAt: z.string(),
  recordCounts: z.record(z.string(), z.number().int().nonnegative()),
  checksums: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
});

const dataEnvelopeSchema = z.object({
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  profile: z.record(z.string(), z.unknown()).nullable(),
  settings: z.record(z.string(), z.unknown()),
  clients: z.array(z.record(z.string(), z.unknown())),
  projects: z.array(z.record(z.string(), z.unknown())),
  tasks: z.array(z.record(z.string(), z.unknown())),
  sessions: z.array(z.record(z.string(), z.unknown())),
  segments: z.array(z.record(z.string(), z.unknown())),
  evidence: z.array(z.record(z.string(), z.unknown())),
  invoices: z.array(z.record(z.string(), z.unknown())),
  invoiceLines: z.array(z.record(z.string(), z.unknown())),
  invoiceLinks: z.array(z.record(z.string(), z.unknown())),
  invoiceSequences: z.array(z.record(z.string(), z.unknown())),
  auditEvents: z.array(z.record(z.string(), z.unknown())),
});

async function sha256(bytes: Uint8Array): Promise<string> {
  const safeBytes = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", safeBytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function assertSafePaths(files: Record<string, Uint8Array>): void {
  for (const path of Object.keys(files)) {
    if (
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").some((part) => part === ".." || part === "")
    ) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "Backup contains an unsafe path.",
      );
    }
  }
}

function assertUnique(records: Array<{ id: string }>, label: string): void {
  const ids = new Set<string>();
  for (const record of records) {
    if (
      typeof record.id !== "string" ||
      record.id.length === 0 ||
      ids.has(record.id)
    ) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        `Backup contains duplicate or invalid ${label} identifiers.`,
      );
    }
    ids.add(record.id);
  }
}

function validateReferences(data: BackupData): void {
  assertUnique(data.clients, "client");
  assertUnique(data.projects, "project");
  assertUnique(data.tasks, "task");
  assertUnique(data.sessions, "session");
  assertUnique(data.segments, "segment");
  assertUnique(data.evidence, "evidence");
  assertUnique(data.invoices, "invoice");
  assertUnique(data.invoiceLines, "invoice line");
  assertUnique(data.invoiceLinks, "invoice link");
  assertUnique(data.invoiceSequences, "invoice sequence");
  assertUnique(data.auditEvents, "audit event");

  const clientIds = new Set(data.clients.map((item) => item.id));
  const projectIds = new Set(data.projects.map((item) => item.id));
  const taskIds = new Set(data.tasks.map((item) => item.id));
  const sessionIds = new Set(data.sessions.map((item) => item.id));
  const invoiceIds = new Set(data.invoices.map((item) => item.id));
  const lineIds = new Set(data.invoiceLines.map((item) => item.id));
  for (const project of data.projects) {
    if (!clientIds.has(project.clientId)) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "A project references a missing client.",
      );
    }
  }
  for (const task of data.tasks) {
    if (!projectIds.has(task.projectId)) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "A task references a missing project.",
      );
    }
  }
  for (const session of data.sessions) {
    if (!projectIds.has(session.projectId)) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "A session references a missing project.",
      );
    }
    if (session.taskId && !taskIds.has(session.taskId)) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "A session references a missing task.",
      );
    }
  }
  for (const segment of data.segments) {
    if (!sessionIds.has(segment.sessionId)) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "A segment references a missing session.",
      );
    }
  }
  for (const evidence of data.evidence) {
    if (!projectIds.has(evidence.projectId)) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "Evidence references a missing project.",
      );
    }
    if (evidence.sessionId && !sessionIds.has(evidence.sessionId)) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "Evidence references a missing session.",
      );
    }
  }
  const linkedSessions = new Set<string>();
  for (const link of data.invoiceLinks) {
    if (
      !invoiceIds.has(link.invoiceId) ||
      !sessionIds.has(link.sessionId) ||
      (link.invoiceLineId !== null && !lineIds.has(link.invoiceLineId)) ||
      linkedSessions.has(link.sessionId)
    ) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "Invoice links are missing references or allocate a session twice.",
      );
    }
    linkedSessions.add(link.sessionId);
  }
}

async function parseBackup(file: File): Promise<{
  data: BackupData;
  manifest: BackupManifest;
  evidenceBlobs: Map<string, Blob>;
  preview: BackupPreview;
}> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new WorkLedgerError(
      "BACKUP_INVALID",
      "This is not a readable WorkLedger ZIP.",
    );
  }
  assertSafePaths(files);
  const manifestBytes = files["manifest.json"];
  const dataBytes = files["data.json"];
  if (!manifestBytes || !dataBytes) {
    throw new WorkLedgerError(
      "BACKUP_INVALID",
      "Backup must contain manifest.json and data.json.",
    );
  }
  let manifest: BackupManifest;
  let data: BackupData;
  try {
    manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
    dataEnvelopeSchema.parse(JSON.parse(strFromU8(dataBytes)));
    data = JSON.parse(strFromU8(dataBytes)) as BackupData;
  } catch {
    throw new WorkLedgerError(
      "BACKUP_INVALID",
      "Backup metadata or records do not match the supported format.",
    );
  }
  if (
    manifest.formatVersion !== BACKUP_FORMAT_VERSION ||
    manifest.databaseSchemaVersion > DATABASE_SCHEMA_VERSION
  ) {
    throw new WorkLedgerError(
      "BACKUP_VERSION_UNSUPPORTED",
      "This backup was created by a newer unsupported WorkLedger version.",
    );
  }
  if ((await sha256(dataBytes)) !== manifest.checksums["data.json"]) {
    throw new WorkLedgerError(
      "BACKUP_INVALID",
      "Backup data checksum does not match.",
    );
  }
  validateReferences(data);
  const evidenceBlobs = new Map<string, Blob>();
  for (const evidence of data.evidence) {
    if (!evidence.blobPath) continue;
    const bytes = files[evidence.blobPath];
    if (!bytes || !manifest.checksums[evidence.blobPath]) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "An evidence file is missing.",
      );
    }
    if ((await sha256(bytes)) !== manifest.checksums[evidence.blobPath]) {
      throw new WorkLedgerError(
        "BACKUP_INVALID",
        "An evidence file checksum does not match.",
      );
    }
    evidenceBlobs.set(
      evidence.id,
      new Blob([new Uint8Array(bytes)], {
        type: evidence.mimeType ?? "application/octet-stream",
      }),
    );
  }
  const dates = data.sessions.map((session) => session.workDate).sort();
  const preview: BackupPreview = {
    createdAt: manifest.createdAt,
    formatVersion: manifest.formatVersion,
    databaseSchemaVersion: manifest.databaseSchemaVersion,
    clients: data.clients.length,
    projects: data.projects.length,
    sessions: data.sessions.length,
    invoices: data.invoices.length,
    evidence: data.evidence.length,
    evidenceBytes: [...evidenceBlobs.values()].reduce(
      (total, blob) => total + blob.size,
      0,
    ),
    dateStart: dates[0] ?? null,
    dateEnd: dates[dates.length - 1] ?? null,
  };
  return { data, manifest, evidenceBlobs, preview };
}

export const backupService = {
  async createBackupArchive(): Promise<{ blob: Blob; filename: string }> {
    const snapshot = await getLedgerSnapshot();
    const createdAt = new Date().toISOString();
    const files: Record<string, Uint8Array> = {};
    const checksums: Record<string, string> = {};
    const evidence: EvidenceBackupRecord[] = [];
    for (const item of snapshot.evidence) {
      let blobPath: string | null = null;
      if (item.blob) {
        const extension = item.originalName?.includes(".")
          ? `.${item.originalName
              .split(".")
              .pop()!
              .replace(/[^a-zA-Z0-9]/g, "")
              .slice(0, 10)}`
          : "";
        blobPath = `evidence/${item.id}${extension}`;
        const bytes = new Uint8Array(await item.blob.arrayBuffer());
        files[blobPath] = bytes;
        checksums[blobPath] = await sha256(bytes);
      }
      const { blob: _blob, thumbnailBlob: _thumbnail, ...metadata } = item;
      void _blob;
      void _thumbnail;
      evidence.push({ ...metadata, blobPath });
    }
    const data: BackupData = {
      formatVersion: BACKUP_FORMAT_VERSION,
      profile: snapshot.profile,
      settings: snapshot.settings,
      clients: snapshot.clients,
      projects: snapshot.projects,
      tasks: snapshot.tasks,
      sessions: snapshot.sessions,
      segments: snapshot.segments,
      evidence,
      invoices: snapshot.invoices,
      invoiceLines: snapshot.invoiceLines,
      invoiceLinks: snapshot.invoiceLinks,
      invoiceSequences: snapshot.invoiceSequences,
      auditEvents: snapshot.auditEvents,
    };
    const dataBytes = strToU8(JSON.stringify(data));
    files["data.json"] = dataBytes;
    checksums["data.json"] = await sha256(dataBytes);
    const manifest: BackupManifest = {
      product: "WorkLedger",
      productVersion: "1.1.1",
      formatVersion: BACKUP_FORMAT_VERSION,
      databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
      createdAt,
      recordCounts: {
        clients: data.clients.length,
        projects: data.projects.length,
        tasks: data.tasks.length,
        sessions: data.sessions.length,
        segments: data.segments.length,
        evidence: data.evidence.length,
        invoices: data.invoices.length,
        invoiceSequences: data.invoiceSequences.length,
        auditEvents: data.auditEvents.length,
      },
      checksums,
    };
    files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
    const archive = zipSync(files, { level: 6 });
    return {
      blob: new Blob([new Uint8Array(archive)], { type: "application/zip" }),
      filename: `workledger-backup-${createdAt.slice(0, 10)}.zip`,
    };
  },

  async exportBackup(): Promise<void> {
    const { blob, filename } = await this.createBackupArchive();
    download(blob, filename);
    const createdAt = new Date().toISOString();
    await database.auditEvents.add({
      id: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      entityType: "Backup",
      entityId: "database",
      action: "exported",
      actor: "local_user",
      before: null,
      after: { filename, sizeBytes: blob.size },
      changedFields: ["archive"],
      reason: "Complete local backup exported",
      createdAt,
    });
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("workledger-changes");
      channel.postMessage({ type: "changed", at: Date.now() });
      channel.close();
    }
    await persistCloudSnapshot();
  },

  async inspectBackup(file: File): Promise<BackupPreview> {
    return (await parseBackup(file)).preview;
  },

  async restoreBackup(file: File): Promise<void> {
    const { data, evidenceBlobs } = await parseBackup(file);
    const active = await database.workSessions
      .where("status")
      .anyOf(["running", "paused"])
      .first();
    if (active) {
      throw new WorkLedgerError(
        "CONFLICT",
        "Stop the active timer before replacing local data.",
      );
    }
    const evidence: EvidenceAsset[] = data.evidence.map((item) => {
      const { blobPath: _blobPath, ...metadata } = item;
      void _blobPath;
      return {
        ...metadata,
        blob: evidenceBlobs.get(item.id) ?? null,
        thumbnailBlob: null,
      };
    });
    const timestamp = new Date().toISOString();
    const restoreEvent: AuditEvent = {
      id: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      entityType: "Backup",
      entityId: "database",
      action: "restored",
      actor: "restore",
      before: null,
      after: {
        clients: data.clients.length,
        projects: data.projects.length,
        sessions: data.sessions.length,
        evidence: data.evidence.length,
        invoices: data.invoices.length,
      },
      changedFields: ["database"],
      reason: "Full replacement restore",
      createdAt: timestamp,
    };
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
        if (data.profile) await database.freelancerProfiles.add(data.profile);
        await database.appSettings.add(data.settings);
        await database.clients.bulkAdd(data.clients);
        await database.projects.bulkAdd(data.projects);
        await database.tasks.bulkAdd(data.tasks);
        await database.workSessions.bulkAdd(data.sessions);
        await database.sessionSegments.bulkAdd(data.segments);
        await database.evidenceAssets.bulkAdd(evidence);
        await database.auditEvents.bulkAdd([...data.auditEvents, restoreEvent]);
        await database.invoices.bulkAdd(data.invoices);
        await database.invoiceLines.bulkAdd(data.invoiceLines);
        await database.invoiceSessionLinks.bulkAdd(data.invoiceLinks);
        await database.invoiceSequences.bulkAdd(data.invoiceSequences);
      },
    );
    await persistCloudSnapshot();
  },
};
