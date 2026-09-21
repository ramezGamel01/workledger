import { makeDefaultSettings } from "@/db/database";
import type { LedgerSnapshot } from "@/domain/models";
import {
  hasMeaningfulLedgerData,
  serializeCloudSnapshot,
} from "@/services/cloud";

describe("cloud snapshot serialization", () => {
  it("keeps evidence metadata without placing binary data in D1", () => {
    const timestamp = "2026-09-20T12:00:00.000Z";
    const snapshot: LedgerSnapshot = {
      profile: null,
      settings: makeDefaultSettings(timestamp),
      clients: [],
      projects: [],
      tasks: [],
      sessions: [],
      segments: [],
      evidence: [
        {
          id: "evidence-1",
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          projectId: "project-1",
          scope: "day",
          sessionId: null,
          workDate: "2026-09-20",
          kind: "file",
          originalName: "proof.pdf",
          mimeType: "application/pdf",
          sizeBytes: 5,
          blob: new Blob(["proof"], { type: "application/pdf" }),
          thumbnailBlob: new Blob(["thumb"], { type: "image/png" }),
          url: null,
          sha256: "a".repeat(64),
          caption: "Delivery proof",
          capturedAt: null,
          uploadedAt: timestamp,
          deletedAt: null,
        },
      ],
      invoices: [],
      invoiceLines: [],
      invoiceLinks: [],
      invoiceSequences: [],
      auditEvents: [],
    };

    const serialized = serializeCloudSnapshot(snapshot);

    expect(serialized.evidence[0]).not.toHaveProperty("blob");
    expect(serialized.evidence[0]).not.toHaveProperty("thumbnailBlob");
    expect(serialized.evidence[0]).toMatchObject({
      id: "evidence-1",
      originalName: "proof.pdf",
      sha256: "a".repeat(64),
    });
  });

  it("does not let a new empty browser claim an empty cloud ledger", () => {
    const timestamp = "2026-09-20T12:00:00.000Z";
    const empty: LedgerSnapshot = {
      profile: null,
      settings: makeDefaultSettings(timestamp),
      clients: [],
      projects: [],
      tasks: [],
      sessions: [],
      segments: [],
      evidence: [],
      invoices: [],
      invoiceLines: [],
      invoiceLinks: [],
      invoiceSequences: [],
      auditEvents: [],
    };

    expect(hasMeaningfulLedgerData(empty)).toBe(false);
    expect(
      hasMeaningfulLedgerData({
        ...empty,
        auditEvents: [
          {
            id: "audit-1",
            operationId: "operation-1",
            entityType: "Backup",
            entityId: "database",
            action: "exported",
            actor: "local_user",
            before: null,
            after: null,
            changedFields: ["archive"],
            reason: null,
            createdAt: timestamp,
          },
        ],
      }),
    ).toBe(false);
    expect(
      hasMeaningfulLedgerData({
        ...empty,
        profile: {
          id: "owner",
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          displayName: "Ramez",
          legalName: null,
          email: "ramez@example.com",
          phone: null,
          address: null,
          taxIdentifier: null,
          paymentDetails: null,
        },
      }),
    ).toBe(true);
  });
});
