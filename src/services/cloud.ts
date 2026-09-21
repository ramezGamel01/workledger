import {
  ensureDatabaseDefaults,
  getLedgerSnapshot,
  replaceLedgerSnapshot,
} from "@/db/database";
import type { EvidenceAsset, LedgerSnapshot } from "@/domain/models";

type CloudEvidenceAsset = Omit<EvidenceAsset, "blob" | "thumbnailBlob">;

export interface CloudLedgerSnapshot extends Omit<LedgerSnapshot, "evidence"> {
  evidence: CloudEvidenceAsset[];
}

export type CloudSyncState =
  "connecting" | "syncing" | "synced" | "pending" | "conflict";

export interface CloudSyncStatus {
  state: CloudSyncState;
  message: string;
  version: number;
}

interface CloudReadResponse {
  version: number;
  snapshot: CloudLedgerSnapshot | null;
}

interface CloudWriteResponse {
  version?: number;
  currentVersion?: number;
  error?: string;
}

const DIRTY_KEY = "workledger-cloud-dirty-v1";
const VERSION_KEY = "workledger-cloud-version-v1";
const RETRY_DELAY_MS = 10_000;

let cloudVersion = 0;
let initialized = false;
let initializing: Promise<void> | null = null;
let syncQueue: Promise<void> = Promise.resolve();
let retryTimer: number | null = null;
let browserListenersAttached = false;
let dirtyInMemory = false;
const uploadedEvidence = new Set<string>();
const subscribers = new Set<(status: CloudSyncStatus) => void>();
let currentStatus: CloudSyncStatus = {
  state: "connecting",
  message: "Connecting to private cloud storage…",
  version: 0,
};

function cloudEnabled(): boolean {
  return typeof window !== "undefined" && import.meta.env.MODE !== "test";
}

function publish(
  state: CloudSyncState,
  message: string,
  version = cloudVersion,
): void {
  currentStatus = { state, message, version };
  for (const subscriber of subscribers) subscriber(currentStatus);
}

function localGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // IndexedDB remains the durable local queue if localStorage is unavailable.
  }
}

function dirty(): boolean {
  return dirtyInMemory || localGet(DIRTY_KEY) === "1";
}

function setDirty(value: boolean): void {
  dirtyInMemory = value;
  localSet(DIRTY_KEY, value ? "1" : "0");
}

function rememberVersion(version: number): void {
  cloudVersion = version;
  localSet(VERSION_KEY, String(version));
}

function rememberedVersion(): number {
  const value = Number(localGet(VERSION_KEY));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function evidenceKey(evidence: CloudEvidenceAsset): string {
  return `${evidence.id}:${evidence.sha256 ?? "no-checksum"}`;
}

async function blobSha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function serializeCloudSnapshot(
  snapshot: LedgerSnapshot,
): CloudLedgerSnapshot {
  return {
    ...snapshot,
    evidence: snapshot.evidence.map((item) => {
      const { blob: _blob, thumbnailBlob: _thumbnailBlob, ...metadata } = item;
      void _blob;
      void _thumbnailBlob;
      return metadata;
    }),
  };
}

export function hasMeaningfulLedgerData(snapshot: LedgerSnapshot): boolean {
  return (
    snapshot.profile !== null ||
    snapshot.settings.version > 1 ||
    snapshot.clients.length > 0 ||
    snapshot.projects.length > 0 ||
    snapshot.tasks.length > 0 ||
    snapshot.sessions.length > 0 ||
    snapshot.evidence.length > 0 ||
    snapshot.invoices.length > 0
  );
}

function isCloudSnapshot(value: unknown): value is CloudLedgerSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.settings !== null &&
    typeof candidate.settings === "object" &&
    [
      "clients",
      "projects",
      "tasks",
      "sessions",
      "segments",
      "evidence",
      "invoices",
      "invoiceLines",
      "invoiceLinks",
      "invoiceSequences",
      "auditEvents",
    ].every((key) => Array.isArray(candidate[key]))
  );
}

async function readCloud(): Promise<CloudReadResponse> {
  const response = await fetch("/api/cloud", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = (await response.json().catch(() => null)) as
    CloudReadResponse | { error?: string } | null;
  if (!response.ok) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Private cloud records are temporarily unavailable.",
    );
  }
  if (
    !body ||
    !("version" in body) ||
    !Number.isSafeInteger(body.version) ||
    body.version < 0 ||
    (body.snapshot !== null && !isCloudSnapshot(body.snapshot))
  ) {
    throw new Error("Private cloud records returned an invalid response.");
  }
  return body;
}

async function writeCloud(
  snapshot: CloudLedgerSnapshot,
  expectedVersion: number,
): Promise<number> {
  const response = await fetch("/api/cloud", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ expectedVersion, snapshot }),
  });
  const body = (await response
    .json()
    .catch(() => null)) as CloudWriteResponse | null;
  if (response.status === 409) {
    const current = body?.currentVersion;
    const error = new Error(
      "Cloud records changed in another open copy of WorkLedger.",
    );
    Object.assign(error, {
      code: "CLOUD_CONFLICT",
      currentVersion:
        typeof current === "number" && Number.isSafeInteger(current)
          ? current
          : undefined,
    });
    throw error;
  }
  if (!response.ok || !body?.version || !Number.isSafeInteger(body.version)) {
    throw new Error(
      body?.error ?? "Changes could not be saved to private cloud storage.",
    );
  }
  return body.version;
}

async function uploadEvidence(snapshot: LedgerSnapshot): Promise<void> {
  for (const evidence of snapshot.evidence) {
    if (evidence.kind === "link" || !evidence.blob) continue;
    const key = evidenceKey(evidence);
    if (uploadedEvidence.has(key)) continue;
    const response = await fetch(
      `/api/evidence/${encodeURIComponent(evidence.id)}`,
      {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": evidence.mimeType ?? "application/octet-stream",
          ...(evidence.sha256
            ? { "X-WorkLedger-Sha256": evidence.sha256 }
            : {}),
        },
        body: evidence.blob,
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(
        body?.error ??
          `Evidence ${evidence.originalName ?? evidence.id} could not be uploaded.`,
      );
    }
    uploadedEvidence.add(key);
  }
}

async function hydrateEvidence(
  snapshot: CloudLedgerSnapshot,
  localSnapshot: LedgerSnapshot,
): Promise<LedgerSnapshot> {
  const localEvidence = new Map(
    localSnapshot.evidence.map((item) => [item.id, item] as const),
  );
  const evidence: EvidenceAsset[] = [];
  for (const metadata of snapshot.evidence) {
    if (metadata.kind === "link") {
      evidence.push({ ...metadata, blob: null, thumbnailBlob: null });
      continue;
    }
    const existing = localEvidence.get(metadata.id);
    let blob: Blob | null =
      existing?.sha256 === metadata.sha256 ? existing.blob : null;
    if (!blob) {
      const response = await fetch(
        `/api/evidence/${encodeURIComponent(metadata.id)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(
          `Evidence ${metadata.originalName ?? metadata.id} is missing from private cloud storage.`,
        );
      }
      blob = await response.blob();
      if (metadata.sha256 && (await blobSha256(blob)) !== metadata.sha256) {
        throw new Error(
          `Evidence ${metadata.originalName ?? metadata.id} failed its cloud checksum.`,
        );
      }
    }
    evidence.push({ ...metadata, blob, thumbnailBlob: null });
    uploadedEvidence.add(evidenceKey(metadata));
  }
  return { ...snapshot, evidence };
}

function scheduleRetry(): void {
  if (!cloudEnabled() || retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    if (dirty() && navigator.onLine) void persistCloudSnapshot();
  }, RETRY_DELAY_MS);
}

function attachBrowserListeners(): void {
  if (browserListenersAttached || !cloudEnabled()) return;
  browserListenersAttached = true;
  window.addEventListener("online", () => {
    if (dirty()) void persistCloudSnapshot();
  });
  window.addEventListener("beforeunload", (event) => {
    if (!dirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

async function flushSnapshot(expectedVersion = cloudVersion): Promise<void> {
  publish("syncing", "Saving changes to private cloud storage…");
  const snapshot = await getLedgerSnapshot();
  if (expectedVersion === 0 && !hasMeaningfulLedgerData(snapshot)) {
    setDirty(false);
    publish(
      "synced",
      "Private cloud is ready. Your first saved record will create the ledger.",
    );
    return;
  }
  await uploadEvidence(snapshot);
  const nextVersion = await writeCloud(
    serializeCloudSnapshot(snapshot),
    expectedVersion,
  );
  rememberVersion(nextVersion);
  setDirty(false);
  publish("synced", "Saved locally and in your private cloud.");
}

export async function initializeCloudPersistence(): Promise<void> {
  if (!cloudEnabled() || initialized) return;
  if (initializing) return initializing;
  initializing = (async () => {
    attachBrowserListeners();
    await ensureDatabaseDefaults();
    const localSnapshot = await getLedgerSnapshot();
    publish("connecting", "Loading your private cloud ledger…");
    try {
      const remote = await readCloud();
      const hadRememberedVersion = localGet(VERSION_KEY) !== null;
      const cachedVersion = rememberedVersion();
      if (dirty()) {
        if (!hadRememberedVersion || remote.version !== cachedVersion) {
          publish(
            "conflict",
            "This device and another copy both have unsynced changes. Your local copy is preserved; export a backup before resolving the conflict.",
          );
          return;
        }
        await flushSnapshot(remote.version);
        return;
      }
      if (remote.snapshot) {
        if (!hadRememberedVersion && hasMeaningfulLedgerData(localSnapshot)) {
          setDirty(true);
          publish(
            "conflict",
            "This browser has an existing ledger and your cloud already has data. The browser copy was preserved; export it before choosing which copy to keep.",
          );
          return;
        }
        const hydrated = await hydrateEvidence(remote.snapshot, localSnapshot);
        await replaceLedgerSnapshot(hydrated);
        rememberVersion(remote.version);
        setDirty(false);
        publish("synced", "Loaded from your private cloud.");
        return;
      }
      if (!hasMeaningfulLedgerData(localSnapshot)) {
        rememberVersion(0);
        setDirty(false);
        publish(
          "synced",
          "Private cloud is ready. Your first saved record will create the ledger.",
        );
        return;
      }
      setDirty(true);
      await flushSnapshot(0);
    } catch (error) {
      publish(
        "pending",
        error instanceof Error
          ? `${error.message} Your on-device copy is still available.`
          : "Cloud sync is pending. Your on-device copy is still available.",
      );
      scheduleRetry();
    } finally {
      initialized = true;
    }
  })();
  return initializing;
}

export async function persistCloudSnapshot(): Promise<void> {
  if (!cloudEnabled()) return;
  setDirty(true);
  syncQueue = syncQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        if (!initialized) await initializeCloudPersistence();
        if (!dirty() || currentStatus.state === "conflict") return;
        await flushSnapshot();
      } catch (error) {
        const conflict =
          error instanceof Error &&
          "code" in error &&
          error.code === "CLOUD_CONFLICT";
        publish(
          conflict ? "conflict" : "pending",
          conflict
            ? "Another open copy changed the cloud ledger. Your changes remain on this device; reload after exporting a backup."
            : error instanceof Error
              ? `${error.message} Changes remain queued on this device.`
              : "Cloud sync is pending. Changes remain queued on this device.",
        );
        if (!conflict) scheduleRetry();
      }
    });
  return syncQueue;
}

export function subscribeCloudStatus(
  subscriber: (status: CloudSyncStatus) => void,
): () => void {
  subscribers.add(subscriber);
  subscriber(currentStatus);
  return () => subscribers.delete(subscriber);
}

export async function resolveCloudConflictWithLocal(): Promise<void> {
  if (!cloudEnabled()) return;
  syncQueue = syncQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const remote = await readCloud();
        cloudVersion = remote.version;
        setDirty(true);
        await flushSnapshot(remote.version);
      } catch (error) {
        publish(
          "conflict",
          error instanceof Error
            ? `${error.message} This device copy is still preserved.`
            : "The conflict was not resolved. This device copy is still preserved.",
        );
        throw error;
      }
    });
  return syncQueue;
}

export async function resolveCloudConflictWithCloud(): Promise<void> {
  if (!cloudEnabled()) return;
  syncQueue = syncQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        publish("connecting", "Loading the selected private cloud copy…");
        const remote = await readCloud();
        if (!remote.snapshot) {
          throw new Error(
            "There is no cloud ledger to restore on this device.",
          );
        }
        const localSnapshot = await getLedgerSnapshot();
        const hydrated = await hydrateEvidence(remote.snapshot, localSnapshot);
        await replaceLedgerSnapshot(hydrated);
        rememberVersion(remote.version);
        setDirty(false);
        publish("synced", "This device now matches your private cloud.");
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("workledger-changes");
          channel.postMessage({ type: "changed", at: Date.now() });
          channel.close();
        }
      } catch (error) {
        publish(
          "conflict",
          error instanceof Error
            ? `${error.message} This device copy is still preserved.`
            : "The conflict was not resolved. This device copy is still preserved.",
        );
        throw error;
      }
    });
  return syncQueue;
}
