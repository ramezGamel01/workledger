import { useState } from "react";
import {
  Archive,
  Building2,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";

import { useUiStore } from "@/app/store";
import { Badge, Button, EmptyState, Field, PageHeader } from "@/components/ui";
import type { LedgerSnapshot } from "@/domain/models";
import { userMessage } from "@/services/errors";
import { ledgerService } from "@/services/workledger";

export function ClientsPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const pushToast = useUiStore((state) => state.pushToast);
  const [showForm, setShowForm] = useState(snapshot.clients.length === 0);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState(snapshot.settings.defaultCurrency);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingClientId(null);
    setDisplayName("");
    setCompanyName("");
    setEmail("");
    setCurrency(snapshot.settings.defaultCurrency);
    setNotes("");
    setShowForm(false);
  };

  const beginCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const beginEdit = (clientId: string) => {
    const client = snapshot.clients.find((item) => item.id === clientId);
    if (!client) return;
    setEditingClientId(client.id);
    setDisplayName(client.displayName);
    setCompanyName(client.companyName ?? client.legalName ?? "");
    setEmail(client.email ?? "");
    setCurrency(client.defaultCurrency);
    setNotes(client.invoiceNotes ?? "");
    setError(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const existing = editingClientId
        ? snapshot.clients.find((client) => client.id === editingClientId)
        : null;
      const input = {
        displayName,
        legalName: existing?.legalName ?? "",
        companyName,
        email,
        phone: existing?.phone ?? "",
        defaultCurrency: currency,
        invoiceNotes: notes,
      };
      if (editingClientId) {
        await ledgerService.updateClient(editingClientId, input);
      } else {
        await ledgerService.createClient(input);
      }
      const updated = Boolean(editingClientId);
      resetForm();
      pushToast("success", updated ? "Client updated." : "Client created.");
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const archive = async (id: string, archived: boolean) => {
    setError(null);
    try {
      await ledgerService.setClientArchived(id, archived);
      pushToast("success", archived ? "Client archived." : "Client restored.");
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Organization"
        title="Clients"
        description="Manage billing parties without changing snapshots already frozen in issued invoices."
        actions={
          <Button onClick={showForm ? resetForm : beginCreate}>
            <Plus size={17} /> New client
          </Button>
        }
      />
      {showForm ? (
        <section className="panel form-panel">
          <header className="panel__header">
            <div>
              <h2>{editingClientId ? "Edit client" : "Create client"}</h2>
              <p>
                {editingClientId
                  ? "Changes apply to future work and drafts; issued invoices stay frozen."
                  : "Only the display name and currency are required now."}
              </p>
            </div>
          </header>
          <form className="stack-lg" onSubmit={submit}>
            <div className="form-grid form-grid--2">
              <Field label="Client display name">
                <input
                  required
                  maxLength={120}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Northstar Studio"
                />
              </Field>
              <Field label="Company / legal name" hint="Optional">
                <input
                  maxLength={120}
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
              </Field>
              <Field label="Billing email" hint="Optional">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field label="Default currency">
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="EGP">EGP — Egyptian Pound</option>
                  <option value="SAR">SAR — Saudi Riyal</option>
                  <option value="AED">AED — UAE Dirham</option>
                </select>
              </Field>
            </div>
            <Field label="Default invoice note" hint="Optional">
              <textarea
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            {error ? (
              <div className="inline-alert inline-alert--error">{error}</div>
            ) : null}
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : editingClientId
                    ? "Save changes"
                    : "Create client"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}
      {!showForm && error ? (
        <div className="inline-alert inline-alert--error">{error}</div>
      ) : null}
      {snapshot.clients.length > 0 ? (
        <section className="entity-grid">
          {snapshot.clients.map((client) => {
            const projects = snapshot.projects.filter(
              (project) => project.clientId === client.id,
            );
            const sessions = snapshot.sessions.filter((session) =>
              projects.some((project) => project.id === session.projectId),
            );
            return (
              <article className="entity-card" key={client.id}>
                <div className="entity-card__icon">
                  <Building2 size={22} />
                </div>
                <div className="entity-card__body">
                  <div className="entity-card__title">
                    <h2>{client.displayName}</h2>
                    <Badge
                      tone={client.status === "active" ? "green" : "neutral"}
                    >
                      {client.status}
                    </Badge>
                  </div>
                  <p>{client.companyName ?? "Independent client"}</p>
                  {client.email ? (
                    <span className="entity-card__contact">
                      <Mail size={14} /> {client.email}
                    </span>
                  ) : null}
                  <div className="entity-card__stats">
                    <span>
                      <strong>{projects.length}</strong> projects
                    </span>
                    <span>
                      <strong>{sessions.length}</strong> sessions
                    </span>
                    <span>
                      <strong>{client.defaultCurrency}</strong> currency
                    </span>
                  </div>
                </div>
                <div className="entity-card__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => beginEdit(client.id)}
                  >
                    <Pencil size={15} /> Edit
                  </Button>
                  {client.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void archive(client.id, true)}
                    >
                      <Archive size={15} /> Archive
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void archive(client.id, false)}
                    >
                      <RotateCcw size={15} /> Restore
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ) : !showForm ? (
        <EmptyState
          title="No clients yet"
          description="Create the billing party that receives your work and invoices."
          action={
            <Button onClick={beginCreate}>
              <Plus size={16} /> Create client
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
