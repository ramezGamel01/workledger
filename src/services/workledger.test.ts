import { database } from "@/db/database";
import { SUPPORTED_CURRENCIES } from "@/domain/currencies";
import { ledgerService } from "@/services/workledger";

async function seedOrganization(): Promise<{
  clientId: string;
  projectId: string;
}> {
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
    accountName: "Ramez Gamel",
    bankName: "Example Bank",
    accountReference: "ACC-123",
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
    hourlyRateMinor: 1_500,
    currency: "USD",
    timeZone: "Africa/Cairo",
    colorToken: "blue",
    startDate: "",
    endDate: "",
  });
  return { clientId: client.id, projectId: project.id };
}

describe("WorkLedger application service", () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await database.delete();
  });

  it("stores organization, manual work, and audit records atomically", async () => {
    const { projectId } = await seedOrganization();
    const created = await ledgerService.addManualSession({
      projectId,
      taskId: null,
      workDate: "2026-09-20",
      mode: "duration",
      startTime: "",
      endTime: "",
      breakMinutes: 0,
      hours: 4,
      minutes: 30,
      description: "Implemented the approved workflow",
      billable: true,
      hourlyRateMinorOverride: null,
      incomplete: false,
    });
    const snapshot = await ledgerService.getSnapshot();
    expect(snapshot.sessions).toHaveLength(1);
    expect(created.durationSeconds).toBe(16_200);
    expect(
      snapshot.auditEvents.some(
        (event) =>
          event.entityType === "WorkSession" && event.entityId === created.id,
      ),
    ).toBe(true);
  });

  it("edits organization defaults without rewriting historical work", async () => {
    const { clientId, projectId } = await seedOrganization();
    const task = await ledgerService.createTask({
      projectId,
      name: "Implementation",
      description: "",
    });
    const session = await ledgerService.addManualSession({
      projectId,
      taskId: task.id,
      workDate: "2026-09-20",
      mode: "duration",
      startTime: "",
      endTime: "",
      breakMinutes: 0,
      hours: 2,
      minutes: 0,
      description: "Historical delivery",
      billable: true,
      hourlyRateMinorOverride: null,
      incomplete: false,
    });

    await ledgerService.updateClient(clientId, {
      displayName: "Northstar Labs",
      legalName: "",
      companyName: "Northstar Studio",
      email: "accounts@example.com",
      phone: "",
      defaultCurrency: "EUR",
      invoiceNotes: "Updated terms",
    });
    await ledgerService.updateProject(projectId, {
      clientId,
      name: "Product delivery V2",
      description: "Current defaults",
      hourlyRateMinor: 3_000,
      currency: "EUR",
      timeZone: "Europe/Berlin",
      colorToken: "blue",
      startDate: "",
      endDate: "",
    });
    await ledgerService.updateTask(task.id, {
      projectId,
      name: "Build",
      description: "Current label",
    });

    const historical = await database.workSessions.get(session.id);
    expect(historical?.hourlyRateMinorSnapshot).toBe(1_500);
    expect(historical?.currencySnapshot).toBe("USD");
    expect(historical?.timeZone).toBe("Africa/Cairo");
    expect(historical?.taskNameSnapshot).toBe("Implementation");
    expect(
      (await database.auditEvents.toArray()).filter(
        (event) => event.action === "updated",
      ),
    ).toHaveLength(3);
  });

  it("offers Canadian dollars as a supported organization currency", async () => {
    expect(SUPPORTED_CURRENCIES.map((item) => item.code)).toContain("CAD");
    const client = await ledgerService.createClient({
      displayName: "Maple Studio",
      legalName: "",
      companyName: "",
      email: "",
      phone: "",
      defaultCurrency: "CAD",
      invoiceNotes: "",
    });
    const project = await ledgerService.createProject({
      clientId: client.id,
      name: "Canadian delivery",
      description: "",
      hourlyRateMinor: 7_000,
      currency: "CAD",
      timeZone: "America/Toronto",
      colorToken: "blue",
      startDate: "",
      endDate: "",
    });
    expect(client.defaultCurrency).toBe("CAD");
    expect(project.currency).toBe("CAD");
  });

  it("permanently deletes unused tasks and projects with an audit trail", async () => {
    const { projectId } = await seedOrganization();
    const removedTask = await ledgerService.createTask({
      projectId,
      name: "Wrong task",
      description: "",
    });
    const cascadedTask = await ledgerService.createTask({
      projectId,
      name: "Unused task",
      description: "",
    });

    await ledgerService.deleteTask(removedTask.id);
    expect(await database.tasks.get(removedTask.id)).toBeUndefined();

    await ledgerService.deleteProject(projectId);
    expect(await database.projects.get(projectId)).toBeUndefined();
    expect(await database.tasks.get(cascadedTask.id)).toBeUndefined();
    const deletedEvents = (await database.auditEvents.toArray()).filter(
      (event) => event.action === "deleted",
    );
    expect(
      deletedEvents.map((event) => [event.entityType, event.entityId]),
    ).toEqual(
      expect.arrayContaining([
        ["Task", removedTask.id],
        ["Task", cascadedTask.id],
        ["Project", projectId],
      ]),
    );
  });

  it("requires archive when a task or project has work history", async () => {
    const { projectId } = await seedOrganization();
    const task = await ledgerService.createTask({
      projectId,
      name: "Delivery",
      description: "",
    });
    await ledgerService.addManualSession({
      projectId,
      taskId: task.id,
      workDate: "2026-09-20",
      mode: "duration",
      startTime: "",
      endTime: "",
      breakMinutes: 0,
      hours: 1,
      minutes: 0,
      description: "Referenced work",
      billable: true,
      hourlyRateMinorOverride: null,
      incomplete: false,
    });

    await expect(ledgerService.deleteTask(task.id)).rejects.toThrow(/archive/i);
    await expect(ledgerService.deleteProject(projectId)).rejects.toThrow(
      /archive/i,
    );
    expect(await database.tasks.get(task.id)).toBeDefined();
    expect(await database.projects.get(projectId)).toBeDefined();
  });

  it("persists pause and resume segments and excludes the paused interval", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-20T09:00:00.000Z"));
    const { projectId } = await seedOrganization();
    const active = await ledgerService.startTimer({
      projectId,
      taskId: null,
      description: "Tracked delivery",
      billable: true,
    });
    vi.setSystemTime(new Date("2026-09-20T10:00:00.000Z"));
    await ledgerService.pauseTimer(active.id);
    vi.setSystemTime(new Date("2026-09-20T10:30:00.000Z"));
    await ledgerService.resumeTimer(active.id);
    vi.setSystemTime(new Date("2026-09-20T11:00:00.000Z"));
    await ledgerService.stopTimer(active.id);
    const completed = await database.workSessions.get(active.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.durationSeconds).toBe(5_400);
    expect(
      await database.sessionSegments
        .where("sessionId")
        .equals(active.id)
        .count(),
    ).toBe(2);
  });

  it("partitions a running timer when pause crosses local midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-20T20:30:00.000Z"));
    const { projectId } = await seedOrganization();
    const active = await ledgerService.startTimer({
      projectId,
      taskId: null,
      description: "Late deployment",
      billable: true,
    });
    vi.setSystemTime(new Date("2026-09-20T22:30:00.000Z"));
    await ledgerService.pauseTimer(active.id);
    const sessions = await database.workSessions.toArray();
    expect(sessions).toHaveLength(2);
    expect(sessions.map((item) => item.workDate).sort()).toEqual([
      "2026-09-20",
      "2026-09-21",
    ]);
    expect(sessions.reduce((sum, item) => sum + item.durationSeconds, 0)).toBe(
      7_200,
    );
    expect(sessions.filter((item) => item.status === "paused")).toHaveLength(1);
  });

  it("issues an immutable invoice snapshot with deterministic numbering", async () => {
    const { clientId, projectId } = await seedOrganization();
    const created = await ledgerService.addManualSession({
      projectId,
      taskId: null,
      workDate: "2026-09-20",
      mode: "duration",
      startTime: "",
      endTime: "",
      breakMinutes: 0,
      hours: 3,
      minutes: 30,
      description: "Completed delivery",
      billable: true,
      hourlyRateMinorOverride: null,
      incomplete: false,
    });
    const draft = await ledgerService.createInvoiceDraft({
      clientId,
      currency: "USD",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      sessionIds: [created.id],
      notes: "",
    });
    const issued = await ledgerService.issueInvoice(
      draft.id,
      "2026-09-20",
      "2026-10-04",
    );
    expect(issued.invoiceNumber).toBe("INV-2026-001");
    expect(issued.status).toBe("issued");
    expect(issued.totalMinor).toBe(5_250);
    await expect(
      ledgerService.updateSessionDetails({
        sessionId: created.id,
        description: "Changed",
        taskId: null,
        billable: true,
        reason: "Correction",
      }),
    ).rejects.toThrow(/frozen/i);
  });
});
