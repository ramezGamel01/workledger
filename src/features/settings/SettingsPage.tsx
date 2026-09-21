import { useEffect, useState } from "react";
import {
  ArchiveRestore,
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  LockKeyhole,
  Save,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";

import { useUiStore } from "@/app/store";
import { Badge, Button, Field, PageHeader } from "@/components/ui";
import { SUPPORTED_CURRENCIES } from "@/domain/currencies";
import type { LedgerSnapshot } from "@/domain/models";
import { useCloudStatus } from "@/hooks/useLedger";
import { backupService, type BackupPreview } from "@/services/backup";
import {
  resolveCloudConflictWithCloud,
  resolveCloudConflictWithLocal,
} from "@/services/cloud";
import { userMessage } from "@/services/errors";
import { ledgerService } from "@/services/workledger";

interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean;
}

function humanBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SettingsPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const cloudStatus = useCloudStatus();
  const pushToast = useUiStore((state) => state.pushToast);
  const profile = snapshot.profile;
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [legalName, setLegalName] = useState(profile?.legalName ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [addressLine1, setAddressLine1] = useState(
    profile?.address?.line1 ?? "",
  );
  const [city, setCity] = useState(profile?.address?.city ?? "");
  const [countryCode, setCountryCode] = useState(
    profile?.address?.countryCode ?? "",
  );
  const [accountName, setAccountName] = useState(
    profile?.paymentDetails?.accountName ?? "",
  );
  const [bankName, setBankName] = useState(
    profile?.paymentDetails?.bankName ?? "",
  );
  const [accountReference, setAccountReference] = useState(
    profile?.paymentDetails?.accountReference ?? "",
  );
  const [swiftBic, setSwiftBic] = useState(
    profile?.paymentDetails?.swiftBic ?? "",
  );
  const [paymentInstructions, setPaymentInstructions] = useState(
    profile?.paymentDetails?.paymentInstructions ?? "",
  );
  const [locale, setLocale] = useState(snapshot.settings.locale);
  const [timeZone, setTimeZone] = useState(snapshot.settings.defaultTimeZone);
  const [currency, setCurrency] = useState(snapshot.settings.defaultCurrency);
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1 | 6>(
    snapshot.settings.weekStartsOn,
  );
  const [invoicePrefix, setInvoicePrefix] = useState(
    snapshot.settings.invoicePrefix,
  );
  const [terms, setTerms] = useState(
    snapshot.settings.defaultPaymentTermsDays?.toString() ?? "",
  );
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [replaceText, setReplaceText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStorage = async () => {
    const estimate = await navigator.storage?.estimate?.();
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    setStorage({
      usage: estimate?.usage ?? 0,
      quota: estimate?.quota ?? 0,
      persisted,
    });
  };
  useEffect(() => {
    void refreshStorage();
  }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("profile");
    setError(null);
    try {
      await ledgerService.saveProfile({
        displayName,
        legalName,
        email,
        phone,
        addressLine1,
        addressLine2: "",
        city,
        region: "",
        postalCode: "",
        countryCode,
        taxIdentifier: "",
        accountName,
        bankName,
        accountReference,
        swiftBic,
        paymentInstructions,
      });
      pushToast("success", "Freelancer profile saved.");
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("settings");
    setError(null);
    try {
      await ledgerService.saveSettings({
        locale,
        defaultTimeZone: timeZone,
        defaultCurrency: currency,
        weekStartsOn,
        hourCycle: snapshot.settings.hourCycle,
        invoicePrefix,
        defaultPaymentTermsDays: terms ? Number(terms) : null,
      });
      pushToast("success", "Application and invoice defaults saved.");
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const inspect = async (file: File) => {
    setRestoreFile(file);
    setPreview(null);
    setReplaceText("");
    setBusy("inspect");
    setError(null);
    try {
      setPreview(await backupService.inspectBackup(file));
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!restoreFile) return;
    setBusy("restore");
    setError(null);
    try {
      await backupService.restoreBackup(restoreFile);
      setPreview(null);
      setRestoreFile(null);
      setReplaceText("");
      pushToast("success", "Backup restored as a complete replacement.");
      await refreshStorage();
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const usagePercent = storage?.quota
    ? Math.min(100, Math.round((storage.usage / storage.quota) * 100))
    : 0;
  const resolveConflict = async (choice: "local" | "cloud") => {
    const confirmed = window.confirm(
      choice === "local"
        ? "Replace the private cloud ledger with this device copy? Export a backup first if you need the cloud copy."
        : "Replace this device copy with the private cloud ledger? Export a backup first if you need this device copy.",
    );
    if (!confirmed) return;
    setBusy(`resolve-${choice}`);
    setError(null);
    try {
      if (choice === "local") await resolveCloudConflictWithLocal();
      else await resolveCloudConflictWithCloud();
      pushToast(
        "success",
        choice === "local"
          ? "Private cloud replaced with this device copy."
          : "This device now matches the private cloud.",
      );
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Identity & continuity"
        title="Settings"
        description="Profile, billing defaults, private cloud continuity, local cache, and complete backup recovery."
      />
      {error ? (
        <div className="inline-alert inline-alert--error">{error}</div>
      ) : null}
      {cloudStatus.state === "conflict" ? (
        <section className="panel settings-card settings-card--wide cloud-conflict-card">
          <header className="panel__header">
            <div>
              <h2>Choose the ledger to keep</h2>
              <p>{cloudStatus.message}</p>
            </div>
            <Database size={21} />
          </header>
          <div className="inline-alert inline-alert--warning">
            Export the copy you may need before choosing. This is a complete
            replacement, not a merge.
          </div>
          <div className="form-actions">
            <Button
              variant="danger"
              disabled={busy?.startsWith("resolve-")}
              onClick={() => void resolveConflict("local")}
            >
              <HardDrive size={16} /> Keep this device copy
            </Button>
            <Button
              variant="secondary"
              disabled={busy?.startsWith("resolve-")}
              onClick={() => void resolveConflict("cloud")}
            >
              <Database size={16} /> Use private cloud copy
            </Button>
          </div>
        </section>
      ) : null}
      <section className="settings-grid">
        <form
          className="panel settings-card settings-card--wide"
          onSubmit={saveProfile}
        >
          <header className="panel__header">
            <div>
              <h2>Freelancer profile</h2>
              <p>
                Identity and payment details copied into future issued invoices.
              </p>
            </div>
            <UserRound size={21} />
          </header>
          <div className="form-grid form-grid--2">
            <Field label="Display name">
              <input
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
            <Field label="Legal name" hint="Optional">
              <input
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Phone" hint="Optional">
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
          </div>
          <div className="subsection-heading">
            <div>
              <h3>Billing address</h3>
              <p>Leave all fields blank if you do not need one.</p>
            </div>
          </div>
          <div className="form-grid form-grid--3">
            <Field label="Address line">
              <input
                value={addressLine1}
                onChange={(event) => setAddressLine1(event.target.value)}
              />
            </Field>
            <Field label="City">
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </Field>
            <Field label="Country code">
              <input
                maxLength={2}
                value={countryCode}
                onChange={(event) =>
                  setCountryCode(event.target.value.toUpperCase())
                }
                placeholder="EG"
              />
            </Field>
          </div>
          <div className="subsection-heading">
            <div>
              <h3>Payment details</h3>
              <p>
                Frozen into issued invoice snapshots; never sent automatically.
              </p>
            </div>
          </div>
          <div className="form-grid form-grid--2">
            <Field label="Account name">
              <input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
              />
            </Field>
            <Field label="Bank name">
              <input
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
              />
            </Field>
            <Field label="Account reference / IBAN">
              <input
                value={accountReference}
                onChange={(event) => setAccountReference(event.target.value)}
              />
            </Field>
            <Field label="SWIFT / BIC">
              <input
                value={swiftBic}
                onChange={(event) => setSwiftBic(event.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Payment instructions"
            hint="Optional note shown on invoices"
          >
            <textarea
              rows={2}
              maxLength={2000}
              value={paymentInstructions}
              onChange={(event) => setPaymentInstructions(event.target.value)}
            />
          </Field>
          <div className="form-actions">
            <Button type="submit" disabled={busy === "profile"}>
              <Save size={16} />{" "}
              {busy === "profile" ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </form>

        <form className="panel settings-card" onSubmit={saveSettings}>
          <header className="panel__header">
            <div>
              <h2>Application defaults</h2>
              <p>Formatting and defaults do not rewrite historical records.</p>
            </div>
            <Database size={21} />
          </header>
          <div className="stack-md">
            <Field label="Locale">
              <input
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                placeholder="en-US"
              />
            </Field>
            <Field label="Default timezone">
              <input
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                placeholder="Africa/Cairo"
              />
            </Field>
            <Field label="Default currency">
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {SUPPORTED_CURRENCIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Week starts on">
              <select
                value={weekStartsOn}
                onChange={(event) =>
                  setWeekStartsOn(Number(event.target.value) as 0 | 1 | 6)
                }
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
                <option value={6}>Saturday</option>
              </select>
            </Field>
            <Field label="Invoice prefix">
              <input
                maxLength={12}
                value={invoicePrefix}
                onChange={(event) =>
                  setInvoicePrefix(event.target.value.toUpperCase())
                }
              />
            </Field>
            <Field label="Default payment terms (days)">
              <input
                type="number"
                min="0"
                max="365"
                value={terms}
                onChange={(event) => setTerms(event.target.value)}
              />
            </Field>
          </div>
          <div className="form-actions">
            <Button type="submit" disabled={busy === "settings"}>
              <Save size={16} />{" "}
              {busy === "settings" ? "Saving…" : "Save defaults"}
            </Button>
          </div>
        </form>

        <section className="panel settings-card">
          <header className="panel__header">
            <div>
              <h2>Local cache</h2>
              <p>
                WorkLedger syncs to your private cloud and keeps this browser
                ready for fast, resilient access.
              </p>
            </div>
            <HardDrive size={21} />
          </header>
          {storage ? (
            <div className="storage-meter">
              <div className="storage-meter__labels">
                <span>{humanBytes(storage.usage)} used</span>
                <span>
                  {storage.quota
                    ? `${humanBytes(storage.quota)} available`
                    : "Quota unavailable"}
                </span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${usagePercent}%` }} />
              </div>
              <div className="storage-status">
                {storage.persisted ? (
                  <>
                    <CheckCircle2 size={16} /> Persistent storage granted
                  </>
                ) : (
                  <>
                    <LockKeyhole size={16} /> Standard browser storage
                  </>
                )}
              </div>
            </div>
          ) : (
            <p>Storage estimate is unavailable.</p>
          )}
          {!storage?.persisted && navigator.storage?.persist ? (
            <Button
              variant="secondary"
              onClick={() =>
                void navigator.storage.persist().then(() => refreshStorage())
              }
            >
              <ShieldCheck size={16} /> Request persistent storage
            </Button>
          ) : null}
        </section>

        <section className="panel settings-card settings-card--wide backup-card">
          <header className="panel__header">
            <div>
              <h2>Backup & restore</h2>
              <p>
                Portable ZIP with records, evidence files, versions, and SHA-256
                checksums.
              </p>
            </div>
            <ArchiveRestore size={21} />
          </header>
          <div className="backup-columns">
            <div>
              <span className="settings-kicker">Export</span>
              <h3>Protect everything now</h3>
              <p>
                Download a consistent portable snapshot as an extra recovery
                copy outside WorkLedger.
              </p>
              <Button
                disabled={busy === "export"}
                onClick={() => {
                  setBusy("export");
                  backupService
                    .exportBackup()
                    .then(() => {
                      pushToast("success", "Backup ZIP downloaded.");
                      void refreshStorage();
                    })
                    .catch((caught) => setError(userMessage(caught)))
                    .finally(() => setBusy(null));
                }}
              >
                <Download size={17} />{" "}
                {busy === "export"
                  ? "Building backup…"
                  : "Export complete backup"}
              </Button>
            </div>
            <div>
              <span className="settings-kicker">Replace restore</span>
              <h3>Inspect before replacing</h3>
              <p>
                Validation happens before any local record is changed. Merge is
                intentionally unavailable.
              </p>
              <label className="file-drop">
                <Upload size={19} />
                <span>
                  {busy === "inspect"
                    ? "Validating…"
                    : (restoreFile?.name ?? "Choose WorkLedger ZIP")}
                </span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void inspect(file);
                  }}
                />
              </label>
            </div>
          </div>
          {preview ? (
            <div className="restore-preview">
              <div className="restore-preview__head">
                <div>
                  <Badge tone="green">Validated</Badge>
                  <h3>
                    Backup from{" "}
                    {new Date(preview.createdAt).toLocaleString(
                      snapshot.settings.locale,
                    )}
                  </h3>
                </div>
                <span>
                  Format v{preview.formatVersion} · Database v
                  {preview.databaseSchemaVersion}
                </span>
              </div>
              <div className="report-summary">
                <div>
                  <span>Clients</span>
                  <strong>{preview.clients}</strong>
                </div>
                <div>
                  <span>Projects</span>
                  <strong>{preview.projects}</strong>
                </div>
                <div>
                  <span>Sessions</span>
                  <strong>{preview.sessions}</strong>
                </div>
                <div>
                  <span>Evidence</span>
                  <strong>
                    {preview.evidence} · {humanBytes(preview.evidenceBytes)}
                  </strong>
                </div>
                <div>
                  <span>Invoices</span>
                  <strong>{preview.invoices}</strong>
                </div>
              </div>
              <div className="inline-alert inline-alert--warning">
                This replaces all current local data. It does not merge records.
              </div>
              <Field label='Type "REPLACE" to confirm'>
                <input
                  value={replaceText}
                  onChange={(event) => setReplaceText(event.target.value)}
                />
              </Field>
              <Button
                variant="danger"
                disabled={replaceText !== "REPLACE" || busy === "restore"}
                onClick={() => void restore()}
              >
                <ArchiveRestore size={16} />{" "}
                {busy === "restore"
                  ? "Replacing…"
                  : "Replace with validated backup"}
              </Button>
            </div>
          ) : null}
        </section>

        <section className="panel settings-card settings-card--wide">
          <header className="panel__header">
            <div>
              <h2>Recent audit history</h2>
              <p>Append-only events for material business changes.</p>
            </div>
            <Badge tone="neutral">Read only</Badge>
          </header>
          <ol className="settings-audit-list">
            {snapshot.auditEvents.slice(0, 12).map((event) => (
              <li key={event.id}>
                <span className="audit-dot" />
                <div>
                  <strong>
                    {event.entityType} · {event.action.replaceAll("_", " ")}
                  </strong>
                  <p>{event.reason ?? event.changedFields.join(", ")}</p>
                </div>
                <time>
                  {new Date(event.createdAt).toLocaleString(
                    snapshot.settings.locale,
                  )}
                </time>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </div>
  );
}
