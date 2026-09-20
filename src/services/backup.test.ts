import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { database } from "@/db/database";
import { backupService } from "@/services/backup";
import { ledgerService } from "@/services/workledger";

describe("WorkLedger backup service", () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });

  afterEach(async () => {
    await database.delete();
  });

  it("validates and restores a complete replacement archive", async () => {
    await ledgerService.saveProfile({
      displayName: "Ramez Gamel",
      legalName: "",
      email: "ramez@example.com",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      region: "",
      postalCode: "",
      countryCode: "",
      taxIdentifier: "",
      accountName: "",
      bankName: "",
      accountReference: "",
      swiftBic: "",
      paymentInstructions: "",
    });
    const client = await ledgerService.createClient({
      displayName: "Northstar",
      legalName: "",
      companyName: "Northstar Studio",
      email: "billing@example.com",
      phone: "",
      defaultCurrency: "USD",
      invoiceNotes: "",
    });
    const project = await ledgerService.createProject({
      clientId: client.id,
      name: "Product delivery",
      description: "",
      hourlyRateMinor: 2_000,
      currency: "USD",
      timeZone: "Africa/Cairo",
      colorToken: "blue",
      startDate: "",
      endDate: "",
    });
    await ledgerService.addManualSession({
      projectId: project.id,
      taskId: null,
      workDate: "2026-09-20",
      mode: "duration",
      startTime: "",
      endTime: "",
      breakMinutes: 0,
      hours: 1,
      minutes: 30,
      description: "Backup fixture",
      billable: true,
      hourlyRateMinorOverride: null,
      incomplete: false,
    });
    await ledgerService.addEvidenceLink({
      projectId: project.id,
      scope: "day",
      sessionId: null,
      workDate: "2026-09-20",
      url: "https://example.com/proof",
      caption: "Reference",
    });
    const archive = await backupService.createBackupArchive();
    const backupFile = new File([archive.blob], archive.filename, {
      type: archive.blob.type,
    });
    const preview = await backupService.inspectBackup(backupFile);
    expect(preview).toMatchObject({
      clients: 1,
      projects: 1,
      sessions: 1,
      evidence: 1,
      evidenceBytes: 0,
      dateStart: "2026-09-20",
      dateEnd: "2026-09-20",
    });

    await ledgerService.createClient({
      displayName: "Temporary client",
      legalName: "",
      companyName: "",
      email: "",
      phone: "",
      defaultCurrency: "USD",
      invoiceNotes: "",
    });
    await backupService.restoreBackup(backupFile);

    const restored = await ledgerService.getSnapshot();
    expect(restored.clients.map((item) => item.displayName)).toEqual([
      "Northstar",
    ]);
    expect(restored.sessions).toHaveLength(1);
    expect(restored.evidence).toHaveLength(1);
    expect(
      restored.auditEvents.some((event) => event.action === "restored"),
    ).toBe(true);
  });

  it("rejects a checksum mismatch before changing local data", async () => {
    const archive = await backupService.createBackupArchive();
    const files = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
    files["data.json"] = strToU8(
      strFromU8(files["data.json"]!).replace("en-US", "en-GB"),
    );
    const corrupted = new File(
      [new Uint8Array(zipSync(files))],
      "corrupted-workledger.zip",
      { type: "application/zip" },
    );

    await expect(backupService.inspectBackup(corrupted)).rejects.toThrow(
      /checksum/i,
    );
    expect(await database.clients.count()).toBe(0);
  });
});
