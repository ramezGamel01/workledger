import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { database } from "@/db/database";
import { seedDemoLedger } from "@/demo/seed";
import { ledgerService } from "@/services/workledger";

describe("demo ledger", () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it("seeds a complete, valid workspace through the service layer", async () => {
    await seedDemoLedger();
    const snapshot = await ledgerService.getSnapshot();

    expect(snapshot.profile?.displayName).toBe("Alex Morgan");
    expect(snapshot.clients).toHaveLength(3);
    expect(snapshot.projects).toHaveLength(3);
    const completed = snapshot.sessions.filter(
      (session) => session.status === "completed",
    );
    expect(completed.length).toBeGreaterThan(25);
    expect(
      snapshot.sessions.filter((session) => session.status === "running"),
    ).toHaveLength(1);
    expect(snapshot.invoices.map((invoice) => invoice.status).sort()).toEqual([
      "draft",
      "issued",
    ]);
    expect(snapshot.evidence.length).toBeGreaterThan(0);
  });

  it("leaves an existing workspace alone", async () => {
    await seedDemoLedger();
    const before = await ledgerService.getSnapshot();
    await seedDemoLedger();
    const after = await ledgerService.getSnapshot();
    expect(after.sessions).toHaveLength(before.sessions.length);
    expect(after.invoices).toHaveLength(before.invoices.length);
  });
});
