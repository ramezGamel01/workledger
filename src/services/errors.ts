export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TIMER_STATE_CONFLICT"
  | "OVERLAPPING_SESSION"
  | "INVOICE_INELIGIBLE"
  | "STORAGE_QUOTA_EXCEEDED"
  | "UNSUPPORTED_FILE"
  | "BACKUP_INVALID"
  | "BACKUP_VERSION_UNSUPPORTED"
  | "PDF_GENERATION_FAILED"
  | "PERSISTENCE_FAILED";

export class WorkLedgerError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "WorkLedgerError";
    this.code = code;
  }
}

export function userMessage(error: unknown): string {
  if (error instanceof WorkLedgerError || error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Your existing data was not changed.";
}
