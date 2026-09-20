import type { WorkSession } from "@/domain/models";

export function eligibleForInvoice(
  session: WorkSession,
  projectClientId: string | null,
  input: { clientId: string; currency: string; start: string; end: string },
  allocatedSessionIds: Set<string>,
): boolean {
  return (
    session.status === "completed" &&
    session.detailStatus === "complete" &&
    session.billable &&
    session.deletedAt === null &&
    session.durationSeconds > 0 &&
    projectClientId === input.clientId &&
    session.currencySnapshot === input.currency &&
    session.workDate >= input.start &&
    session.workDate <= input.end &&
    !allocatedSessionIds.has(session.id)
  );
}
