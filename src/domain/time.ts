import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export interface ManualRangeResolution {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  breakSeconds: number;
}

export function resolveManualRange(input: {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  timeZone: string;
}): ManualRangeResolution {
  const { workDate, startTime, endTime, timeZone } = input;
  const breakSeconds = Math.round(input.breakMinutes * 60);
  const startLabel = `${workDate}T${startTime}:00`;
  const endLabel = `${workDate}T${endTime}:00`;
  const start = fromZonedTime(startLabel, timeZone);
  const end = fromZonedTime(endLabel, timeZone);

  const startRoundTrip = formatInTimeZone(
    start,
    timeZone,
    "yyyy-MM-dd'T'HH:mm:ss",
  );
  const endRoundTrip = formatInTimeZone(end, timeZone, "yyyy-MM-dd'T'HH:mm:ss");
  if (startRoundTrip !== startLabel || endRoundTrip !== endLabel) {
    throw new Error(
      "That clock time does not exist in the project timezone. Choose another time.",
    );
  }
  const wallSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);
  if (wallSeconds <= 0) {
    throw new Error("End time must be later than start time on the same day.");
  }
  if (breakSeconds < 0 || breakSeconds >= wallSeconds) {
    throw new Error("Break must be shorter than the selected time range.");
  }
  const durationSeconds = wallSeconds - breakSeconds;
  if (durationSeconds < 60) {
    throw new Error("A work session must be at least one minute.");
  }
  return {
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationSeconds,
    breakSeconds,
  };
}

export function partitionIntervalByLocalDay(
  startedAt: string,
  endedAt: string,
  timeZone: string,
): Array<{ workDate: string; startedAt: string; endedAt: string }> {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (end <= start) return [];
  const pieces: Array<{
    workDate: string;
    startedAt: string;
    endedAt: string;
  }> = [];
  let cursor = start;
  while (cursor < end) {
    const workDate = formatInTimeZone(cursor, timeZone, "yyyy-MM-dd");
    const nextDate = new Date(`${workDate}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextLabel = `${nextDate.toISOString().slice(0, 10)}T00:00:00`;
    const nextMidnight = fromZonedTime(nextLabel, timeZone);
    const pieceEnd = nextMidnight < end ? nextMidnight : end;
    pieces.push({
      workDate,
      startedAt: cursor.toISOString(),
      endedAt: pieceEnd.toISOString(),
    });
    cursor = pieceEnd;
  }
  return pieces;
}

export function sumClosedSegments(
  segments: Array<{ startedAt: string; endedAt: string | null }>,
): number {
  return segments.reduce((total, segment) => {
    if (segment.endedAt === null) return total;
    return (
      total +
      Math.max(
        0,
        Math.floor(
          (new Date(segment.endedAt).getTime() -
            new Date(segment.startedAt).getTime()) /
            1000,
        ),
      )
    );
  }, 0);
}
