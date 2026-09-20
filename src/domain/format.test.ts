import { sessionAmountMinor } from "@/domain/format";
import type { WorkSession } from "@/domain/models";
import { partitionIntervalByLocalDay, resolveManualRange } from "@/domain/time";

function session(overrides: Partial<WorkSession> = {}): WorkSession {
  return {
    id: "session-1",
    version: 1,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    projectId: "project-1",
    taskId: null,
    taskNameSnapshot: null,
    source: "manual_duration",
    status: "completed",
    detailStatus: "complete",
    workDate: "2026-09-20",
    timeZone: "Africa/Cairo",
    startedAt: null,
    endedAt: null,
    durationSeconds: 12_600,
    breakSeconds: 0,
    description: "Completed delivery",
    billable: true,
    hourlyRateMinorSnapshot: 1_500,
    currencySnapshot: "USD",
    continuationGroupId: null,
    finalizedAt: "2026-09-20T04:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    ...overrides,
  };
}

describe("canonical calculations", () => {
  it("rounds the documented tracked-session example once per session", () => {
    expect(sessionAmountMinor(session())).toBe(5_250);
  });

  it("returns zero for non-billable and deleted sessions", () => {
    expect(sessionAmountMinor(session({ billable: false }))).toBe(0);
    expect(
      sessionAmountMinor(session({ deletedAt: "2026-09-21T00:00:00.000Z" })),
    ).toBe(0);
  });

  it("calculates manual range duration from resolved instants and break", () => {
    const result = resolveManualRange({
      workDate: "2026-09-20",
      startTime: "09:30",
      endTime: "14:15",
      breakMinutes: 30,
      timeZone: "Africa/Cairo",
    });
    expect(result.durationSeconds).toBe(15_300);
  });

  it("partitions a tracked interval at local midnight without losing seconds", () => {
    const pieces = partitionIntervalByLocalDay(
      "2026-09-20T20:30:00.000Z",
      "2026-09-20T22:30:00.000Z",
      "Africa/Cairo",
    );
    expect(pieces).toHaveLength(2);
    expect(pieces.map((piece) => piece.workDate)).toEqual([
      "2026-09-20",
      "2026-09-21",
    ]);
    expect(
      pieces.reduce(
        (sum, piece) =>
          sum +
          (new Date(piece.endedAt).getTime() -
            new Date(piece.startedAt).getTime()) /
            1000,
        0,
      ),
    ).toBe(7_200);
  });
});
