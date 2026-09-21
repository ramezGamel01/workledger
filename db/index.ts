import { env } from "cloudflare:workers";

export function getDatabase(): D1Database {
  if (!env.DB) throw new Error("WorkLedger cloud database is unavailable.");
  return env.DB;
}

export function getBucket(): R2Bucket {
  if (!env.BUCKET)
    throw new Error("WorkLedger cloud file storage is unavailable.");
  return env.BUCKET;
}
