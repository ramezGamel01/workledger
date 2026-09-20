export type RecordStatus = "active" | "archived";
export type WorkSessionSource = "tracked" | "manual_range" | "manual_duration";
export type WorkSessionStatus = "running" | "paused" | "completed";
export type SessionDetailStatus = "complete" | "incomplete";
export type EvidenceScope = "session" | "day";
export type EvidenceKind = "screenshot" | "file" | "link";
export type InvoiceStatus = "draft" | "issued";
export type AuditActor = "local_user" | "system" | "restore";

export interface MutableRecord {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostalAddress {
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
}

export interface PaymentDetails {
  accountName: string | null;
  bankName: string | null;
  accountReference: string | null;
  swiftBic: string | null;
  paymentInstructions: string | null;
}

export interface FreelancerProfile extends MutableRecord {
  id: "owner";
  displayName: string;
  legalName: string | null;
  email: string;
  phone: string | null;
  address: PostalAddress | null;
  taxIdentifier: string | null;
  paymentDetails: PaymentDetails | null;
}

export interface AppSettings extends MutableRecord {
  id: "settings";
  locale: string;
  defaultTimeZone: string;
  defaultCurrency: string;
  weekStartsOn: 0 | 1 | 6;
  hourCycle: "h12" | "h23";
  invoicePrefix: string;
  defaultPaymentTermsDays: number | null;
}

export interface Client extends MutableRecord {
  displayName: string;
  normalizedName: string;
  legalName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: PostalAddress | null;
  taxIdentifier: string | null;
  defaultCurrency: string;
  invoiceNotes: string | null;
  status: RecordStatus;
  archivedAt: string | null;
}

export interface Project extends MutableRecord {
  clientId: string;
  name: string;
  normalizedName: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  hourlyRateMinor: number;
  currency: string;
  timeZone: string;
  colorToken: string | null;
  status: RecordStatus;
  archivedAt: string | null;
}

export interface Task extends MutableRecord {
  projectId: string;
  name: string;
  normalizedName: string;
  description: string | null;
  status: RecordStatus;
  archivedAt: string | null;
}

export interface WorkSession extends MutableRecord {
  projectId: string;
  taskId: string | null;
  taskNameSnapshot: string | null;
  source: WorkSessionSource;
  status: WorkSessionStatus;
  detailStatus: SessionDetailStatus;
  workDate: string;
  timeZone: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  breakSeconds: number;
  description: string | null;
  billable: boolean;
  hourlyRateMinorSnapshot: number;
  currencySnapshot: string;
  continuationGroupId: string | null;
  finalizedAt: string | null;
  deletedAt: string | null;
  deletedReason: string | null;
}

export interface SessionSegment {
  id: string;
  sessionId: string;
  sequence: number;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceAsset extends MutableRecord {
  projectId: string;
  scope: EvidenceScope;
  sessionId: string | null;
  workDate: string | null;
  kind: EvidenceKind;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  blob: Blob | null;
  thumbnailBlob: Blob | null;
  url: string | null;
  sha256: string | null;
  caption: string | null;
  capturedAt: string | null;
  uploadedAt: string;
  deletedAt: string | null;
}

export interface AuditEvent {
  id: string;
  operationId: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: AuditActor;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changedFields: string[];
  reason: string | null;
  createdAt: string;
}

export interface InvoiceSequence extends MutableRecord {
  key: string;
  prefix: string;
  year: number;
  nextValue: number;
}

export interface FreelancerInvoiceSnapshot {
  displayName: string;
  legalName: string | null;
  email: string;
  phone: string | null;
  address: PostalAddress | null;
  taxIdentifier: string | null;
}

export interface ClientInvoiceSnapshot {
  displayName: string;
  legalName: string | null;
  companyName: string | null;
  email: string | null;
  billingAddress: PostalAddress | null;
  taxIdentifier: string | null;
}

export interface Invoice extends MutableRecord {
  status: InvoiceStatus;
  invoiceNumber: string | null;
  clientId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string | null;
  dueDate: string | null;
  freelancerSnapshot: FreelancerInvoiceSnapshot | null;
  clientSnapshot: ClientInvoiceSnapshot | null;
  paymentSnapshot: PaymentDetails | null;
  totalSeconds: number;
  subtotalMinor: number;
  totalMinor: number;
  notes: string | null;
  issuedAt: string | null;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  ordinal: number;
  projectId: string;
  projectNameSnapshot: string;
  periodStart: string;
  periodEnd: string;
  description: string;
  durationSeconds: number;
  hourlyRateMinor: number;
  currency: string;
  amountMinor: number;
  createdAt: string;
}

export interface SessionBillingSnapshot {
  workDate: string;
  projectId: string;
  projectName: string;
  taskName: string | null;
  description: string;
  durationSeconds: number;
  hourlyRateMinor: number;
  currency: string;
  amountMinor: number;
}

export interface InvoiceSessionLink {
  id: string;
  invoiceId: string;
  invoiceLineId: string | null;
  sessionId: string;
  sessionSnapshot: SessionBillingSnapshot | null;
  createdAt: string;
}

export interface LedgerSnapshot {
  profile: FreelancerProfile | null;
  settings: AppSettings;
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  sessions: WorkSession[];
  segments: SessionSegment[];
  evidence: EvidenceAsset[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  invoiceLinks: InvoiceSessionLink[];
  invoiceSequences: InvoiceSequence[];
  auditEvents: AuditEvent[];
}
