/* eslint-disable react-refresh/only-export-components */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";

import { database } from "@/db/database";
import {
  formatDuration,
  formatMoney,
  sessionAmountMinor,
} from "@/domain/format";
import type { Invoice, InvoiceLine, InvoiceSessionLink } from "@/domain/models";
import { WorkLedgerError } from "@/services/errors";

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 42,
    paddingBottom: 52,
    paddingLeft: 42,
    fontFamily: "Helvetica",
    color: "#162033",
    fontSize: 9.5,
    lineHeight: 1.45,
  },
  brand: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#2759d7" },
  title: {
    marginTop: 10,
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.5,
  },
  muted: { color: "#61708a" },
  row: { display: "flex", flexDirection: "row", gap: 16 },
  between: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
  },
  block: { marginTop: 20 },
  half: { width: "48%" },
  label: {
    marginBottom: 4,
    color: "#61708a",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  value: { fontSize: 10.5 },
  table: { marginTop: 22, borderTopWidth: 1, borderTopColor: "#cfd8e8" },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: "#f3f6fb",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#53617a",
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    paddingTop: 9,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  colDescription: { width: "43%", paddingRight: 8 },
  colDate: { width: "19%" },
  colHours: { width: "13%", textAlign: "right" },
  colRate: { width: "12%", textAlign: "right" },
  colAmount: { width: "13%", textAlign: "right" },
  totals: { marginTop: 15, marginLeft: "auto", width: "42%" },
  totalRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    paddingBottom: 6,
  },
  grandTotal: {
    borderTopWidth: 1.5,
    borderTopColor: "#162033",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
  },
  note: {
    marginTop: 22,
    padding: 12,
    backgroundColor: "#f3f6fb",
    borderRadius: 4,
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  session: {
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  evidenceImage: {
    width: 210,
    maxHeight: 150,
    objectFit: "contain",
    marginTop: 8,
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    left: 42,
    right: 42,
    bottom: 24,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#718096",
    fontSize: 8,
  },
});

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function InvoiceDocument(props: {
  invoice: Invoice;
  lines: InvoiceLine[];
}): React.JSX.Element {
  const { invoice, lines } = props;
  const freelancer = invoice.freelancerSnapshot!;
  const client = invoice.clientSnapshot!;
  return (
    <Document title={`Invoice ${invoice.invoiceNumber ?? ""}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.between}>
          <View>
            <Text style={styles.brand}>WORKLEDGER</Text>
            <Text style={styles.title}>INVOICE</Text>
          </View>
          <View style={{ textAlign: "right" }}>
            <Text style={styles.label}>Invoice number</Text>
            <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>
              {invoice.invoiceNumber}
            </Text>
            <Text style={[styles.muted, { marginTop: 4 }]}>
              Issued {invoice.issueDate}
            </Text>
            <Text style={styles.muted}>
              Due {invoice.dueDate ?? "On receipt"}
            </Text>
          </View>
        </View>

        <View style={[styles.row, styles.block]}>
          <View style={styles.half}>
            <Text style={styles.label}>From</Text>
            <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>
              {freelancer.legalName ?? freelancer.displayName}
            </Text>
            <Text>{freelancer.email}</Text>
            {freelancer.phone ? <Text>{freelancer.phone}</Text> : null}
            {freelancer.address ? (
              <>
                <Text>{freelancer.address.line1}</Text>
                <Text>
                  {freelancer.address.city}{" "}
                  {freelancer.address.postalCode ?? ""}
                </Text>
                <Text>{freelancer.address.countryCode}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Bill to</Text>
            <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>
              {client.companyName ?? client.legalName ?? client.displayName}
            </Text>
            {client.email ? <Text>{client.email}</Text> : null}
            {client.billingAddress ? (
              <>
                <Text>{client.billingAddress.line1}</Text>
                <Text>
                  {client.billingAddress.city}{" "}
                  {client.billingAddress.postalCode ?? ""}
                </Text>
                <Text>{client.billingAddress.countryCode}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colDate}>Period</Text>
            <Text style={styles.colHours}>Hours</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          {lines.map((line) => (
            <View key={line.id} style={styles.tableRow} wrap={false}>
              <Text style={styles.colDescription}>{line.description}</Text>
              <Text style={styles.colDate}>
                {line.periodStart === line.periodEnd
                  ? line.periodStart
                  : `${line.periodStart}\n${line.periodEnd}`}
              </Text>
              <Text style={styles.colHours}>
                {(line.durationSeconds / 3600).toFixed(2)}
              </Text>
              <Text style={styles.colRate}>
                {formatMoney(line.hourlyRateMinor, line.currency)}
              </Text>
              <Text style={styles.colAmount}>
                {formatMoney(line.amountMinor, line.currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Total time</Text>
            <Text>{formatDuration(invoice.totalSeconds)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text>Total due</Text>
            <Text>{formatMoney(invoice.totalMinor, invoice.currency)}</Text>
          </View>
        </View>

        {invoice.paymentSnapshot ? (
          <View style={styles.note}>
            <Text style={styles.label}>Payment details</Text>
            {invoice.paymentSnapshot.accountName ? (
              <Text>Account: {invoice.paymentSnapshot.accountName}</Text>
            ) : null}
            {invoice.paymentSnapshot.bankName ? (
              <Text>Bank: {invoice.paymentSnapshot.bankName}</Text>
            ) : null}
            {invoice.paymentSnapshot.accountReference ? (
              <Text>Reference: {invoice.paymentSnapshot.accountReference}</Text>
            ) : null}
            {invoice.paymentSnapshot.swiftBic ? (
              <Text>SWIFT/BIC: {invoice.paymentSnapshot.swiftBic}</Text>
            ) : null}
            {invoice.paymentSnapshot.paymentInstructions ? (
              <Text>{invoice.paymentSnapshot.paymentInstructions}</Text>
            ) : null}
          </View>
        ) : null}
        {invoice.notes ? (
          <View style={styles.note}>
            <Text style={styles.label}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}
        <View style={styles.footer} fixed>
          <Text>Generated locally with WorkLedger</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

interface ReportRow {
  id: string;
  workDate: string;
  projectName: string;
  taskName: string | null;
  description: string;
  durationSeconds: number;
  amountMinor: number;
  currency: string;
}

interface ReportEvidence {
  id: string;
  caption: string;
  imageData: string | null;
  fileName: string | null;
}

function WorkReportDocument(props: {
  title: string;
  subtitle: string;
  rows: ReportRow[];
  evidence: ReportEvidence[];
}): React.JSX.Element {
  const groups = new Map<string, ReportRow[]>();
  for (const row of props.rows) {
    const group = groups.get(row.workDate) ?? [];
    group.push(row);
    groups.set(row.workDate, group);
  }
  const totalSeconds = props.rows.reduce(
    (sum, row) => sum + row.durationSeconds,
    0,
  );
  return (
    <Document title={props.title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>WORKLEDGER</Text>
        <Text style={styles.title}>WORK REPORT</Text>
        <Text style={[styles.value, { marginTop: 6 }]}>{props.title}</Text>
        <Text style={styles.muted}>{props.subtitle}</Text>

        <View style={[styles.between, styles.note]}>
          <View>
            <Text style={styles.label}>Total time</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>
              {formatDuration(totalSeconds)}
            </Text>
          </View>
          <View>
            <Text style={styles.label}>Sessions</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>
              {props.rows.length}
            </Text>
          </View>
          <View>
            <Text style={styles.label}>Days worked</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>
              {groups.size}
            </Text>
          </View>
        </View>

        {[...groups.entries()].map(([date, rows]) => (
          <View key={date} wrap={false}>
            <Text style={styles.sectionTitle}>{date}</Text>
            {rows.map((row) => (
              <View key={row.id} style={styles.session}>
                <View style={styles.between}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>
                    {row.projectName}
                    {row.taskName ? ` · ${row.taskName}` : ""}
                  </Text>
                  <Text>{formatDuration(row.durationSeconds)}</Text>
                </View>
                <Text style={{ marginTop: 3 }}>{row.description}</Text>
              </View>
            ))}
          </View>
        ))}

        {props.evidence.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Selected evidence</Text>
            {props.evidence.map((item) => (
              <View key={item.id} wrap={false} style={styles.session}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  {item.caption}
                </Text>
                {item.imageData ? (
                  <Image src={item.imageData} style={styles.evidenceImage} />
                ) : (
                  <Text style={styles.muted}>
                    {item.fileName ?? "Attachment"}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>Generated locally with WorkLedger</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("Evidence image could not be decoded."));
    reader.readAsDataURL(blob);
  });
}

async function evidenceViewModels(ids: string[]): Promise<ReportEvidence[]> {
  const records = await database.evidenceAssets.bulkGet(ids);
  const result: ReportEvidence[] = [];
  for (const record of records) {
    if (!record || record.deletedAt !== null) continue;
    let imageData: string | null = null;
    if (record.kind === "screenshot" && record.blob) {
      try {
        imageData = await readBlobAsDataUrl(record.blob);
      } catch {
        imageData = null;
      }
    }
    result.push({
      id: record.id,
      caption:
        record.caption ?? record.originalName ?? record.url ?? "Evidence",
      imageData,
      fileName: record.originalName ?? record.url,
    });
  }
  return result;
}

export const pdfService = {
  async downloadInvoice(invoiceId: string): Promise<void> {
    const invoice = await database.invoices.get(invoiceId);
    if (!invoice || invoice.status !== "issued") {
      throw new WorkLedgerError(
        "PDF_GENERATION_FAILED",
        "Only issued invoices can be downloaded.",
      );
    }
    const lines = await database.invoiceLines
      .where("invoiceId")
      .equals(invoiceId)
      .sortBy("ordinal");
    try {
      const blob = await pdf(
        <InvoiceDocument invoice={invoice} lines={lines} />,
      ).toBlob();
      download(blob, `${invoice.invoiceNumber ?? "invoice"}.pdf`);
    } catch {
      throw new WorkLedgerError(
        "PDF_GENERATION_FAILED",
        "Invoice PDF could not be generated. The invoice remains unchanged.",
      );
    }
  },

  async downloadPeriodReport(input: {
    clientId: string | null;
    projectId: string | null;
    periodStart: string;
    periodEnd: string;
    evidenceIds: string[];
  }): Promise<void> {
    const sessions = (await database.workSessions.toArray()).filter(
      (session) =>
        session.status === "completed" &&
        session.deletedAt === null &&
        session.workDate >= input.periodStart &&
        session.workDate <= input.periodEnd,
    );
    const projects = await database.projects.toArray();
    const projectMap = new Map(
      projects.map((project) => [project.id, project]),
    );
    const filtered = sessions.filter((session) => {
      const project = projectMap.get(session.projectId);
      return (
        (!input.projectId || session.projectId === input.projectId) &&
        (!input.clientId || project?.clientId === input.clientId)
      );
    });
    if (filtered.length === 0) {
      throw new WorkLedgerError(
        "PDF_GENERATION_FAILED",
        "No completed work matches this report period.",
      );
    }
    const rows: ReportRow[] = filtered.map((session) => ({
      id: session.id,
      workDate: session.workDate,
      projectName: projectMap.get(session.projectId)?.name ?? "Project",
      taskName: session.taskNameSnapshot,
      description: session.description ?? "Details pending",
      durationSeconds: session.durationSeconds,
      amountMinor: sessionAmountMinor(session),
      currency: session.currencySnapshot,
    }));
    const evidence = await evidenceViewModels(input.evidenceIds);
    try {
      const blob = await pdf(
        <WorkReportDocument
          title="Current work activity"
          subtitle={`${input.periodStart} — ${input.periodEnd}`}
          rows={rows}
          evidence={evidence}
        />,
      ).toBlob();
      download(blob, `work-report-${input.periodStart}-${input.periodEnd}.pdf`);
    } catch {
      throw new WorkLedgerError(
        "PDF_GENERATION_FAILED",
        "Work report PDF could not be generated. Your records remain unchanged.",
      );
    }
  },

  async downloadInvoiceReport(
    invoiceId: string,
    evidenceIds: string[],
  ): Promise<void> {
    const invoice = await database.invoices.get(invoiceId);
    if (!invoice || invoice.status !== "issued") {
      throw new WorkLedgerError("PDF_GENERATION_FAILED", "Invoice not found.");
    }
    const links: InvoiceSessionLink[] = await database.invoiceSessionLinks
      .where("invoiceId")
      .equals(invoiceId)
      .toArray();
    const rows: ReportRow[] = links.flatMap((link) => {
      const session = link.sessionSnapshot;
      return session
        ? [
            {
              id: link.id,
              workDate: session.workDate,
              projectName: session.projectName,
              taskName: session.taskName,
              description: session.description,
              durationSeconds: session.durationSeconds,
              amountMinor: session.amountMinor,
              currency: session.currency,
            },
          ]
        : [];
    });
    const evidence = await evidenceViewModels(evidenceIds);
    const blob = await pdf(
      <WorkReportDocument
        title={`Invoice ${invoice.invoiceNumber ?? ""} activity`}
        subtitle={`${invoice.periodStart} — ${invoice.periodEnd}`}
        rows={rows}
        evidence={evidence}
      />,
    ).toBlob();
    download(blob, `${invoice.invoiceNumber ?? "invoice"}-work-report.pdf`);
  },
};
