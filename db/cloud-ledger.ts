import { getDatabase } from "./index";

const CHUNK_CODE_UNITS = 400_000;
const MAX_PAYLOAD_BYTES = 16_000_000;
const RETAINED_VERSIONS = 5;

interface VersionRow {
  version: number;
  chunk_count: number;
  byte_length: number;
}

interface ChunkRow {
  chunk_index: number;
  payload: string;
}

export class CloudLedgerConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super("Cloud version changed.");
    this.name = "CloudLedgerConflictError";
    this.currentVersion = currentVersion;
  }
}

async function latestVersion(userId: string): Promise<VersionRow | null> {
  return getDatabase()
    .prepare(
      `SELECT version, chunk_count, byte_length
       FROM ledger_versions
       WHERE user_id = ?
       ORDER BY version DESC
       LIMIT 1`,
    )
    .bind(userId)
    .first<VersionRow>();
}

function splitPayload(payload: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < payload.length;) {
    let end = Math.min(payload.length, start + CHUNK_CODE_UNITS);
    const finalCodeUnit = payload.charCodeAt(end - 1);
    if (
      end < payload.length &&
      finalCodeUnit >= 0xd800 &&
      finalCodeUnit <= 0xdbff
    ) {
      end -= 1;
    }
    chunks.push(payload.slice(start, end));
    start = end;
  }
  return chunks.length > 0 ? chunks : [""];
}

export async function readLedgerPayload(userId: string): Promise<{
  version: number;
  payload: string | null;
}> {
  const current = await latestVersion(userId);
  if (!current) return { version: 0, payload: null };
  const result = await getDatabase()
    .prepare(
      `SELECT chunk_index, payload
       FROM ledger_snapshot_chunks
       WHERE user_id = ? AND version = ?
       ORDER BY chunk_index ASC`,
    )
    .bind(userId, current.version)
    .all<ChunkRow>();
  const rows = result.results;
  if (
    rows.length !== current.chunk_count ||
    rows.some((row, index) => row.chunk_index !== index)
  ) {
    throw new Error("Cloud ledger chunks are incomplete.");
  }
  const payload = rows.map((row) => row.payload).join("");
  if (new TextEncoder().encode(payload).byteLength !== current.byte_length) {
    throw new Error("Cloud ledger length check failed.");
  }
  return { version: current.version, payload };
}

export async function writeLedgerPayload(input: {
  userId: string;
  email: string;
  expectedVersion: number;
  payload: string;
}): Promise<number> {
  const byteLength = new TextEncoder().encode(input.payload).byteLength;
  if (byteLength > MAX_PAYLOAD_BYTES) {
    throw new RangeError("The structured ledger is too large to sync.");
  }
  const current = await latestVersion(input.userId);
  const currentVersion = current?.version ?? 0;
  if (currentVersion !== input.expectedVersion) {
    throw new CloudLedgerConflictError(currentVersion);
  }
  const nextVersion = currentVersion + 1;
  const chunks = splitPayload(input.payload);
  const database = getDatabase();
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO ledger_versions
          (user_id, version, email, chunk_count, byte_length, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.userId,
        nextVersion,
        input.email,
        chunks.length,
        byteLength,
        new Date().toISOString(),
      ),
    ...chunks.map((chunk, index) =>
      database
        .prepare(
          `INSERT INTO ledger_snapshot_chunks
            (user_id, version, chunk_index, payload)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(input.userId, nextVersion, index, chunk),
    ),
  ];
  const retentionFloor = nextVersion - RETAINED_VERSIONS + 1;
  if (retentionFloor > 1) {
    statements.push(
      database
        .prepare(
          `DELETE FROM ledger_snapshot_chunks
           WHERE user_id = ? AND version < ?`,
        )
        .bind(input.userId, retentionFloor),
      database
        .prepare(
          `DELETE FROM ledger_versions
           WHERE user_id = ? AND version < ?`,
        )
        .bind(input.userId, retentionFloor),
    );
  }
  try {
    await database.batch(statements);
  } catch (error) {
    const latest = await latestVersion(input.userId);
    if ((latest?.version ?? 0) !== currentVersion) {
      throw new CloudLedgerConflictError(latest?.version ?? 0);
    }
    throw error;
  }
  return nextVersion;
}
