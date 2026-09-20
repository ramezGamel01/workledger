import { useEffect } from "react";

import { sessionAmountMinor } from "@/domain/format";
import { ledgerService } from "@/services/workledger";

interface WebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute(input: unknown): unknown | Promise<unknown>;
}

interface WebModelContext {
  registerTool(
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ): void | Promise<void>;
}

declare global {
  interface Document {
    readonly modelContext?: WebModelContext;
  }
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Input must be an object.");
  }
  return input as Record<string, unknown>;
}

function textValue(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function optionalText(
  input: Record<string, unknown>,
  key: string,
): string | null {
  const value = input[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${key} must be text.`);
  return value.trim() || null;
}

function booleanValue(
  input: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean.`);
  return value;
}

export function useWebMcp(): void {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const options = { signal: lifecycle.signal };
    const tools: WebMcpTool[] = [
      {
        name: "read_workledger_summary",
        title: "Read WorkLedger summary",
        description:
          "Read a concise local summary of active organization records, completed sessions, active timer state, and per-currency earnings.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        async execute() {
          const snapshot = await ledgerService.getSnapshot();
          const visible = snapshot.sessions.filter(
            (session) =>
              session.status === "completed" && session.deletedAt === null,
          );
          const earnings: Record<string, number> = {};
          for (const session of visible) {
            earnings[session.currencySnapshot] =
              (earnings[session.currencySnapshot] ?? 0) +
              sessionAmountMinor(session);
          }
          const active = snapshot.sessions.find((session) =>
            ["running", "paused"].includes(session.status),
          );
          return {
            clients: snapshot.clients.filter(
              (client) => client.status === "active",
            ).length,
            projects: snapshot.projects.filter(
              (project) => project.status === "active",
            ).length,
            completedSessions: visible.length,
            earningsMinorByCurrency: earnings,
            activeTimer: active
              ? {
                  id: active.id,
                  status: active.status,
                  projectId: active.projectId,
                }
              : null,
          };
        },
      },
      {
        name: "create_manual_work_session",
        title: "Create manual work session",
        description:
          "Create one completed duration-only WorkLedger session after validating its project, date, duration, description, rate snapshot, and audit event.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            taskId: { type: ["string", "null"] },
            workDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
            description: { type: "string", minLength: 1, maxLength: 2000 },
            billable: { type: "boolean", default: true },
          },
          required: ["projectId", "workDate", "durationMinutes", "description"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(rawInput) {
          const input = objectInput(rawInput);
          const durationMinutes = input.durationMinutes;
          if (
            typeof durationMinutes !== "number" ||
            !Number.isInteger(durationMinutes) ||
            durationMinutes < 1 ||
            durationMinutes > 1440
          ) {
            throw new Error(
              "durationMinutes must be an integer from 1 to 1440.",
            );
          }
          const taskId = optionalText(input, "taskId");
          const created = await ledgerService.addManualSession({
            projectId: textValue(input, "projectId"),
            taskId,
            workDate: textValue(input, "workDate"),
            mode: "duration",
            startTime: "",
            endTime: "",
            breakMinutes: 0,
            hours: Math.floor(durationMinutes / 60),
            minutes: durationMinutes % 60,
            description: textValue(input, "description"),
            billable: booleanValue(input, "billable", true),
            hourlyRateMinorOverride: null,
            incomplete: false,
          });
          return {
            id: created.id,
            status: created.status,
            workDate: created.workDate,
            durationSeconds: created.durationSeconds,
          };
        },
      },
      {
        name: "start_work_timer",
        title: "Start WorkLedger timer",
        description:
          "Start the one allowed live timer using a project, optional task, description, and billable state.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            taskId: { type: ["string", "null"] },
            description: { type: "string", minLength: 1, maxLength: 2000 },
            billable: { type: "boolean", default: true },
          },
          required: ["projectId", "description"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(rawInput) {
          const input = objectInput(rawInput);
          const started = await ledgerService.startTimer({
            projectId: textValue(input, "projectId"),
            taskId: optionalText(input, "taskId"),
            description: textValue(input, "description"),
            billable: booleanValue(input, "billable", true),
          });
          return {
            id: started.id,
            status: started.status,
            startedAt: started.startedAt,
          };
        },
      },
      {
        name: "pause_work_timer",
        title: "Pause WorkLedger timer",
        description:
          "Pause a currently running WorkLedger timer and persist its closed segment.",
        inputSchema: {
          type: "object",
          properties: { sessionId: { type: "string" } },
          required: ["sessionId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(rawInput) {
          const input = objectInput(rawInput);
          const sessionId = textValue(input, "sessionId");
          await ledgerService.pauseTimer(sessionId);
          return { id: sessionId, status: "paused" };
        },
      },
      {
        name: "resume_work_timer",
        title: "Resume WorkLedger timer",
        description:
          "Resume a paused WorkLedger timer and persist its next work segment.",
        inputSchema: {
          type: "object",
          properties: { sessionId: { type: "string" } },
          required: ["sessionId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(rawInput) {
          const input = objectInput(rawInput);
          const activeId = await ledgerService.resumeTimer(
            textValue(input, "sessionId"),
          );
          return { id: activeId, status: "running" };
        },
      },
      {
        name: "stop_work_timer",
        title: "Stop WorkLedger timer",
        description:
          "Stop and finalize an active WorkLedger timer, partitioning tracked time by local work date when needed.",
        inputSchema: {
          type: "object",
          properties: { sessionId: { type: "string" } },
          required: ["sessionId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(rawInput) {
          const input = objectInput(rawInput);
          const sessionId = textValue(input, "sessionId");
          await ledgerService.stopTimer(sessionId);
          return { id: sessionId, status: "completed" };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, options)).catch(
          () => undefined,
        );
      } catch {
        // Unsupported or rejected registration leaves the visible product unaffected.
      }
    }
    return () => lifecycle.abort();
  }, []);
}
