import { z } from "zod";

import {
  CloudLedgerConflictError,
  readLedgerPayload,
  writeLedgerPayload,
} from "@server/db/cloud-ledger";

export const dynamic = "force-dynamic";

const record = z.record(z.string(), z.unknown());
const records = z.array(record).max(100_000);
const ledgerSchema = z.object({
  profile: record.nullable(),
  settings: record,
  clients: records,
  projects: records,
  tasks: records,
  sessions: records,
  segments: records,
  evidence: records,
  invoices: records,
  invoiceLines: records,
  invoiceLinks: records,
  invoiceSequences: records,
  auditEvents: records,
});

const updateSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  snapshot: ledgerSchema,
});

function identity(request: Request): { userId: string; email: string } | null {
  const userId = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = request.headers.get("oai-authenticated-user-email")?.trim();
  return userId && email ? { userId, email } : null;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const user = identity(request);
  if (!user) return response({ error: "Sign in is required." }, 401);
  try {
    const stored = await readLedgerPayload(user.userId);
    return response({
      version: stored.version,
      snapshot: stored.payload === null ? null : JSON.parse(stored.payload),
    });
  } catch (error) {
    console.error("cloud snapshot read failed", error);
    return response(
      { error: "Cloud records are temporarily unavailable." },
      503,
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  const user = identity(request);
  if (!user) return response({ error: "Sign in is required." }, 401);
  if (!sameOrigin(request))
    return response({ error: "Invalid request origin." }, 403);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 17_000_000) {
    return response(
      { error: "The structured ledger is too large to sync." },
      413,
    );
  }
  try {
    const body = updateSchema.parse(await request.json());
    const payload = JSON.stringify(body.snapshot);
    const version = await writeLedgerPayload({
      userId: user.userId,
      email: user.email,
      expectedVersion: body.expectedVersion,
      payload,
    });
    return response({ version });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return response(
        { error: "Cloud sync rejected invalid ledger data." },
        400,
      );
    }
    if (error instanceof CloudLedgerConflictError) {
      return response(
        { error: error.message, currentVersion: error.currentVersion },
        409,
      );
    }
    if (error instanceof RangeError) {
      return response({ error: error.message }, 413);
    }
    console.error("cloud snapshot write failed", error);
    return response({ error: "Cloud records could not be saved." }, 503);
  }
}
