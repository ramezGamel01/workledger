import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import {
  CheckCircle2,
  FileDown,
  FileText,
  LockKeyhole,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";

import { useUiStore } from "@/app/store";
import { Badge, Button, EmptyState, Field, PageHeader } from "@/components/ui";
import {
  formatDuration,
  formatMoney,
  sessionAmountMinor,
  todayIn,
} from "@/domain/format";
import { eligibleForInvoice } from "@/domain/invoice";
import type { LedgerSnapshot } from "@/domain/models";
import { userMessage } from "@/services/errors";
import { ledgerService } from "@/services/workledger";

export function InvoicesPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const pushToast = useUiStore((state) => state.pushToast);
  const activeClients = snapshot.clients.filter(
    (client) => client.status === "active",
  );
  const [showBuilder, setShowBuilder] = useState(false);
  const [clientId, setClientId] = useState(activeClients[0]?.id ?? "");
  const selectedClient = snapshot.clients.find(
    (client) => client.id === clientId,
  );
  const [currency, setCurrency] = useState(
    selectedClient?.defaultCurrency ?? snapshot.settings.defaultCurrency,
  );
  const dates = snapshot.sessions.map((session) => session.workDate).sort();
  const [start, setStart] = useState(
    dates[0] ?? todayIn(snapshot.settings.defaultTimeZone),
  );
  const [end, setEnd] = useState(
    dates[dates.length - 1] ?? todayIn(snapshot.settings.defaultTimeZone),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allocated = useMemo(
    () => new Set(snapshot.invoiceLinks.map((link) => link.sessionId)),
    [snapshot.invoiceLinks],
  );
  const projectClientMap = useMemo(
    () =>
      new Map(
        snapshot.projects.map((project) => [project.id, project.clientId]),
      ),
    [snapshot.projects],
  );
  const eligible = useMemo(
    () =>
      snapshot.sessions.filter((session) =>
        eligibleForInvoice(
          session,
          projectClientMap.get(session.projectId) ?? null,
          { clientId, currency, start, end },
          allocated,
        ),
      ),
    [
      allocated,
      clientId,
      currency,
      end,
      projectClientMap,
      snapshot.sessions,
      start,
    ],
  );
  const eligibleIds = new Set(eligible.map((session) => session.id));
  const cleanSelected = selected.filter((id) => eligibleIds.has(id));
  const selectedSessions = eligible.filter((session) =>
    cleanSelected.includes(session.id),
  );
  const selectedSeconds = selectedSessions.reduce(
    (sum, session) => sum + session.durationSeconds,
    0,
  );
  const selectedAmount = selectedSessions.reduce(
    (sum, session) => sum + sessionAmountMinor(session),
    0,
  );
  const drafts = snapshot.invoices.filter(
    (invoice) => invoice.status === "draft",
  );
  const issued = snapshot.invoices.filter(
    (invoice) => invoice.status === "issued",
  );

  const createDraft = async () => {
    setBusy("create");
    setError(null);
    try {
      await ledgerService.createInvoiceDraft({
        clientId,
        currency,
        periodStart: start,
        periodEnd: end,
        sessionIds: cleanSelected,
        notes,
      });
      setShowBuilder(false);
      setSelected([]);
      setNotes("");
      pushToast(
        "success",
        "Invoice draft created. Sessions are reserved from other drafts.",
      );
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const issue = async (invoiceId: string) => {
    const issueDate = todayIn(snapshot.settings.defaultTimeZone);
    const dueDate = snapshot.settings.defaultPaymentTermsDays
      ? format(
          addDays(
            parseISO(issueDate),
            snapshot.settings.defaultPaymentTermsDays,
          ),
          "yyyy-MM-dd",
        )
      : null;
    setBusy(invoiceId);
    setError(null);
    try {
      const invoice = await ledgerService.issueInvoice(
        invoiceId,
        issueDate,
        dueDate,
      );
      pushToast("success", `${invoice.invoiceNumber} issued and frozen.`);
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const runDocument = async (key: string, operation: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await operation();
      pushToast("success", "PDF generated locally.");
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Select eligible work, issue an immutable snapshot, and regenerate its PDF at any time."
        actions={
          <Button
            disabled={!snapshot.profile || activeClients.length === 0}
            onClick={() => setShowBuilder((value) => !value)}
          >
            <Plus size={17} /> New invoice
          </Button>
        }
      />
      {!snapshot.profile ? (
        <section className="inline-alert inline-alert--warning">
          <span>
            Complete your freelancer profile before issuing an invoice.
          </span>
          <Link to="/settings">Open settings</Link>
        </section>
      ) : null}
      {error ? (
        <div className="inline-alert inline-alert--error">{error}</div>
      ) : null}

      {showBuilder ? (
        <section className="invoice-builder panel">
          <header className="panel__header">
            <div>
              <h2>Build invoice draft</h2>
              <p>Only complete, billable, uninvoiced sessions appear.</p>
            </div>
            <ReceiptText size={22} />
          </header>
          <div className="form-grid form-grid--4">
            <Field label="Client">
              <select
                value={clientId}
                onChange={(event) => {
                  const next = event.target.value;
                  setClientId(next);
                  const client = snapshot.clients.find(
                    (item) => item.id === next,
                  );
                  if (client) setCurrency(client.defaultCurrency);
                  setSelected([]);
                }}
              >
                {activeClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <select
                value={currency}
                onChange={(event) => {
                  setCurrency(event.target.value);
                  setSelected([]);
                }}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="EGP">EGP</option>
                <option value="SAR">SAR</option>
                <option value="AED">AED</option>
              </select>
            </Field>
            <Field label="Period start">
              <input
                type="date"
                value={start}
                onChange={(event) => {
                  setStart(event.target.value);
                  setSelected([]);
                }}
              />
            </Field>
            <Field label="Period end">
              <input
                type="date"
                value={end}
                onChange={(event) => {
                  setEnd(event.target.value);
                  setSelected([]);
                }}
              />
            </Field>
          </div>
          <div className="invoice-selection">
            <div className="subsection-heading">
              <div>
                <h3>Eligible sessions</h3>
                <p>{eligible.length} work records available</p>
              </div>
              {eligible.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      cleanSelected.length === eligible.length
                        ? []
                        : eligible.map((session) => session.id),
                    )
                  }
                >
                  {cleanSelected.length === eligible.length
                    ? "Clear all"
                    : "Select all"}
                </button>
              ) : null}
            </div>
            {eligible.length > 0 ? (
              <div className="invoice-session-list">
                {eligible.map((session) => {
                  const project = snapshot.projects.find(
                    (item) => item.id === session.projectId,
                  );
                  return (
                    <label key={session.id}>
                      <input
                        type="checkbox"
                        checked={cleanSelected.includes(session.id)}
                        onChange={(event) =>
                          setSelected((ids) =>
                            event.target.checked
                              ? [...ids, session.id]
                              : ids.filter((id) => id !== session.id),
                          )
                        }
                      />
                      <span className="invoice-session-list__date">
                        {session.workDate}
                      </span>
                      <span>
                        <strong>{project?.name}</strong>
                        <small>{session.description}</small>
                      </span>
                      <span>{formatDuration(session.durationSeconds)}</span>
                      <strong>
                        {formatMoney(
                          sessionAmountMinor(session),
                          session.currencySnapshot,
                          snapshot.settings.locale,
                        )}
                      </strong>
                    </label>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No eligible sessions"
                description="Incomplete, non-billable, deleted, out-of-period, or already allocated sessions are excluded."
              />
            )}
          </div>
          <div className="invoice-builder__footer">
            <Field label="Invoice notes" hint="Optional, frozen when issued.">
              <textarea
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            <div className="draft-total">
              <span>
                {cleanSelected.length} selected ·{" "}
                {formatDuration(selectedSeconds)}
              </span>
              <strong>
                {formatMoney(
                  selectedAmount,
                  currency,
                  snapshot.settings.locale,
                )}
              </strong>
              <Button
                disabled={cleanSelected.length === 0 || busy === "create"}
                onClick={() => void createDraft()}
              >
                {busy === "create" ? "Creating…" : "Create draft"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="invoice-columns">
        <div>
          <div className="section-heading">
            <div>
              <h2>Drafts</h2>
              <p>Editable selections without final numbers</p>
            </div>
            <Badge tone="amber">{drafts.length}</Badge>
          </div>
          {drafts.length > 0 ? (
            drafts.map((invoice) => {
              const client = snapshot.clients.find(
                (item) => item.id === invoice.clientId,
              );
              const links = snapshot.invoiceLinks.filter(
                (link) => link.invoiceId === invoice.id,
              );
              return (
                <article
                  className="invoice-card invoice-card--draft"
                  key={invoice.id}
                >
                  <header>
                    <div>
                      <Badge tone="amber">Draft</Badge>
                      <h3>{client?.displayName ?? "Client invoice"}</h3>
                      <p>
                        {invoice.periodStart} — {invoice.periodEnd}
                      </p>
                    </div>
                    <ReceiptText size={23} />
                  </header>
                  <div className="invoice-card__numbers">
                    <span>
                      {links.length} sessions ·{" "}
                      {formatDuration(invoice.totalSeconds)}
                    </span>
                    <strong>
                      {formatMoney(
                        invoice.totalMinor,
                        invoice.currency,
                        snapshot.settings.locale,
                      )}
                    </strong>
                  </div>
                  <footer>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === invoice.id}
                      onClick={() =>
                        void ledgerService
                          .deleteDraft(invoice.id)
                          .catch((caught) => setError(userMessage(caught)))
                      }
                    >
                      <Trash2 size={15} /> Delete
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy === invoice.id}
                      onClick={() => void issue(invoice.id)}
                    >
                      <LockKeyhole size={15} />{" "}
                      {busy === invoice.id ? "Issuing…" : "Issue invoice"}
                    </Button>
                  </footer>
                </article>
              );
            })
          ) : (
            <EmptyState
              title="No invoice drafts"
              description="Create a draft by selecting eligible work sessions above."
            />
          )}
        </div>
        <div>
          <div className="section-heading">
            <div>
              <h2>Issued</h2>
              <p>Permanent billing snapshots</p>
            </div>
            <Badge tone="green">{issued.length}</Badge>
          </div>
          {issued.length > 0 ? (
            issued.map((invoice) => (
              <article
                className="invoice-card invoice-card--issued"
                key={invoice.id}
              >
                <header>
                  <div>
                    <Badge tone="green">
                      <CheckCircle2 size={12} /> Issued
                    </Badge>
                    <h3>{invoice.invoiceNumber}</h3>
                    <p>
                      {invoice.clientSnapshot?.displayName} · issued{" "}
                      {invoice.issueDate}
                    </p>
                  </div>
                  <LockKeyhole size={22} />
                </header>
                <div className="invoice-card__numbers">
                  <span>{formatDuration(invoice.totalSeconds)}</span>
                  <strong>
                    {formatMoney(
                      invoice.totalMinor,
                      invoice.currency,
                      snapshot.settings.locale,
                    )}
                  </strong>
                </div>
                <footer>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy === `pdf-${invoice.id}`}
                    onClick={() =>
                      void runDocument(`pdf-${invoice.id}`, async () =>
                        (
                          await import("@/services/pdf")
                        ).pdfService.downloadInvoice(invoice.id),
                      )
                    }
                  >
                    <FileDown size={15} /> Invoice PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === `report-${invoice.id}`}
                    onClick={() =>
                      void runDocument(`report-${invoice.id}`, async () =>
                        (
                          await import("@/services/pdf")
                        ).pdfService.downloadInvoiceReport(invoice.id, []),
                      )
                    }
                  >
                    <FileText size={15} /> Work report
                  </Button>
                </footer>
              </article>
            ))
          ) : (
            <EmptyState
              title="No issued invoices"
              description="Issue a reviewed draft to create its immutable number and snapshot."
            />
          )}
        </div>
      </section>
    </div>
  );
}
