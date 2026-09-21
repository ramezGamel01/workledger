import { getBucket } from "@server/db";
import { readLedgerPayload } from "@server/db/cloud-ledger";

export const dynamic = "force-dynamic";

const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

function userId(request: Request): string | null {
  return request.headers.get("oai-authenticated-user-id")?.trim() || null;
}

function validId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value);
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

async function idFrom(context: {
  params: Promise<{ id: string }>;
}): Promise<string> {
  return (await context.params).id;
}

async function ownsEvidence(
  ownerId: string,
  evidenceId: string,
): Promise<boolean> {
  const stored = await readLedgerPayload(ownerId);
  if (!stored.payload) return false;
  try {
    const payload = JSON.parse(stored.payload) as {
      evidence?: Array<{ id?: string; kind?: string }>;
    };
    return Boolean(
      payload.evidence?.some(
        (item) => item.id === evidenceId && item.kind !== "link",
      ),
    );
  } catch {
    return false;
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ownerId = userId(request);
  const evidenceId = await idFrom(context);
  if (!ownerId)
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!sameOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (!validId(evidenceId)) {
    return Response.json(
      { error: "Invalid evidence identifier." },
      { status: 400 },
    );
  }
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_EVIDENCE_BYTES) {
    return Response.json(
      { error: "Evidence is larger than 25 MiB." },
      { status: 413 },
    );
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_EVIDENCE_BYTES) {
    return Response.json(
      { error: "Evidence size is invalid." },
      { status: 413 },
    );
  }
  const contentType =
    request.headers.get("content-type") ?? "application/octet-stream";
  const declaredChecksum = request.headers.get("x-workledger-sha256") ?? "";
  if (declaredChecksum && !/^[a-f0-9]{64}$/.test(declaredChecksum)) {
    return Response.json(
      { error: "Invalid evidence checksum." },
      { status: 400 },
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (declaredChecksum && declaredChecksum !== checksum) {
    return Response.json(
      { error: "Evidence checksum did not match." },
      { status: 400 },
    );
  }
  const options: R2PutOptions = { httpMetadata: { contentType } };
  options.customMetadata = { sha256: checksum };
  await getBucket().put(`${ownerId}/${evidenceId}`, bytes, options);
  return Response.json(
    { stored: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ownerId = userId(request);
  const evidenceId = await idFrom(context);
  if (!ownerId) return new Response(null, { status: 401 });
  if (!validId(evidenceId) || !(await ownsEvidence(ownerId, evidenceId))) {
    return new Response(null, { status: 404 });
  }
  const object = await getBucket().get(`${ownerId}/${evidenceId}`);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  if (object.customMetadata?.sha256) {
    headers.set("ETag", `"${object.customMetadata.sha256}"`);
  }
  return new Response(object.body, { headers });
}
