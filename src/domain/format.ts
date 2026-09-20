import { formatInTimeZone } from "date-fns-tz";

import type { WorkSession } from "@/domain/models";

export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function clampText(value: string | null | undefined): string | null {
  const normalized = value?.normalize("NFKC").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export function formatTimer(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

export function sessionAmountMinor(session: WorkSession): number {
  if (
    !session.billable ||
    session.status !== "completed" ||
    session.deletedAt !== null
  ) {
    return 0;
  }
  const result =
    (BigInt(session.durationSeconds) * BigInt(session.hourlyRateMinorSnapshot) +
      1800n) /
    3600n;
  const value = Number(result);
  if (!Number.isSafeInteger(value)) {
    throw new Error("The calculated amount is outside the supported range.");
  }
  return value;
}

export function formatMoney(
  minor: number,
  currency: string,
  locale = "en-US",
): string {
  const fractionDigits =
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(minor / 10 ** fractionDigits);
}

export function moneyToMinor(value: string, currency: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Enter a valid non-negative hourly rate.");
  }
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const minor = Math.round(parsed * 10 ** digits);
  if (!Number.isSafeInteger(minor)) {
    throw new Error("The hourly rate is outside the supported range.");
  }
  return minor;
}

export function minorToMoney(minor: number, currency: string): string {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  return (minor / 10 ** digits).toFixed(digits);
}

export function localDateAt(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

export function todayIn(timeZone: string): string {
  return localDateAt(new Date(), timeZone);
}

export function fileSize(bytes: number | null): string {
  if (bytes === null) return "Link";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
