import { act, render, waitFor } from "@testing-library/react";

import { database } from "@/db/database";
import { useWebMcp } from "@/hooks/useWebMcp";
import { ledgerService } from "@/services/workledger";

interface RegisteredTool {
  name: string;
  execute(input: unknown): unknown | Promise<unknown>;
}

function ToolHost(): React.JSX.Element {
  useWebMcp();
  return <div />;
}

describe("WorkLedger WebMCP tools", () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });

  afterEach(async () => {
    await database.delete();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: undefined,
    });
  });

  it("registers tools and routes a validated write through the application service", async () => {
    const tools: RegisteredTool[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: RegisteredTool) {
          tools.push(tool);
        },
      },
    });
    render(<ToolHost />);
    await waitFor(() => expect(tools.length).toBe(6));

    const client = await ledgerService.createClient({
      displayName: "WebMCP Client",
      legalName: "",
      companyName: "",
      email: "",
      phone: "",
      defaultCurrency: "USD",
      invoiceNotes: "",
    });
    const project = await ledgerService.createProject({
      clientId: client.id,
      name: "WebMCP Project",
      description: "",
      hourlyRateMinor: 2_000,
      currency: "USD",
      timeZone: "Africa/Cairo",
      colorToken: "blue",
      startDate: "",
      endDate: "",
    });
    const create = tools.find(
      (tool) => tool.name === "create_manual_work_session",
    );
    expect(create).toBeDefined();
    await expect(create!.execute({ durationMinutes: 60 })).rejects.toThrow(
      /projectId is required/,
    );
    await act(async () => {
      await create!.execute({
        projectId: project.id,
        workDate: "2026-09-20",
        durationMinutes: 90,
        description: "Validated agent-created work",
        billable: true,
      });
    });
    const snapshot = await ledgerService.getSnapshot();
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]?.durationSeconds).toBe(5_400);
  });
});
