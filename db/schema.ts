import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const ledgerSnapshots = sqliteTable("ledger_snapshots", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  version: integer("version").notNull().default(1),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const ledgerVersions = sqliteTable(
  "ledger_versions",
  {
    userId: text("user_id").notNull(),
    version: integer("version").notNull(),
    email: text("email").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    byteLength: integer("byte_length").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.version] })],
);

export const ledgerSnapshotChunks = sqliteTable(
  "ledger_snapshot_chunks",
  {
    userId: text("user_id").notNull(),
    version: integer("version").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.version, table.chunkIndex],
    }),
  ],
);
