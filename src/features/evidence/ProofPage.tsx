import { useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";

import { useUiStore } from "@/app/store";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { fileSize } from "@/domain/format";
import type { EvidenceAsset, LedgerSnapshot } from "@/domain/models";
import { userMessage } from "@/services/errors";
import { ledgerService } from "@/services/workledger";

function EvidenceImage({ asset }: { asset: EvidenceAsset }): React.JSX.Element {
  const url = useMemo(
    () => (asset.blob ? URL.createObjectURL(asset.blob) : null),
    [asset.blob],
  );
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url ? (
    <img
      src={url}
      alt={asset.caption ?? asset.originalName ?? "Work evidence"}
    />
  ) : (
    <div className="evidence-placeholder">
      <ImageIcon size={26} />
    </div>
  );
}

function downloadEvidence(asset: EvidenceAsset): void {
  if (!asset.blob) return;
  const url = URL.createObjectURL(asset.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = asset.originalName ?? `evidence-${asset.id}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProofPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const openDialog = useUiStore((state) => state.openDialog);
  const pushToast = useUiStore((state) => state.pushToast);
  const [projectId, setProjectId] = useState("");
  const [kind, setKind] = useState("");
  const [error, setError] = useState<string | null>(null);
  const visible = useMemo(
    () =>
      snapshot.evidence.filter(
        (asset) =>
          asset.deletedAt === null &&
          (!projectId || asset.projectId === projectId) &&
          (!kind || asset.kind === kind),
      ),
    [kind, projectId, snapshot.evidence],
  );
  const remove = async (id: string) => {
    if (
      !window.confirm(
        "Remove this evidence from normal views? The audit record is retained.",
      )
    ) {
      return;
    }
    setError(null);
    try {
      await ledgerService.deleteEvidence(id);
      pushToast("success", "Evidence removed from active proof.");
    } catch (caught) {
      setError(userMessage(caught));
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Private evidence"
        title="Proof of Work"
        description="Screenshots, files, and links stay beside the work they support and sync privately across your devices."
        actions={
          <Button onClick={() => openDialog("add-evidence")}>
            <Plus size={17} /> Add proof
          </Button>
        }
      />
      <section className="privacy-banner">
        <ShieldCheck size={21} />
        <div>
          <strong>Evidence is stored in your private WorkLedger cloud.</strong>
          <span>
            Access follows your private Site account. Evidence only enters a
            client-facing report when you explicitly select it.
          </span>
        </div>
      </section>
      <section className="filter-bar" aria-label="Evidence filters">
        <label>
          <span className="sr-only">Project</span>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">All projects</option>
            {snapshot.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Evidence type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="">All evidence types</option>
            <option value="screenshot">Screenshots</option>
            <option value="file">Files</option>
            <option value="link">Links</option>
          </select>
        </label>
        <span className="filter-bar__count">{visible.length} items</span>
      </section>
      {error ? (
        <div className="inline-alert inline-alert--error">{error}</div>
      ) : null}
      {visible.length > 0 ? (
        <section className="evidence-grid">
          {visible.map((asset) => {
            const project = snapshot.projects.find(
              (item) => item.id === asset.projectId,
            );
            const session = snapshot.sessions.find(
              (item) => item.id === asset.sessionId,
            );
            return (
              <article className="evidence-card" key={asset.id}>
                <div className="evidence-card__preview">
                  {asset.kind === "screenshot" ? (
                    <EvidenceImage asset={asset} />
                  ) : asset.kind === "link" ? (
                    <div className="evidence-placeholder evidence-placeholder--link">
                      <Link2 size={28} />
                    </div>
                  ) : (
                    <div className="evidence-placeholder">
                      <FileText size={28} />
                    </div>
                  )}
                  <Badge
                    tone={asset.kind === "screenshot" ? "blue" : "neutral"}
                  >
                    {asset.kind}
                  </Badge>
                </div>
                <div className="evidence-card__body">
                  <h2>
                    {asset.caption ??
                      asset.originalName ??
                      asset.url ??
                      "Evidence"}
                  </h2>
                  <p>
                    {project?.name ?? "Unknown project"} ·{" "}
                    {asset.scope === "session"
                      ? (session?.workDate ?? "Session")
                      : asset.workDate}
                  </p>
                  <div className="evidence-card__meta">
                    <span>{fileSize(asset.sizeBytes)}</span>
                    {asset.sha256 ? (
                      <span title={asset.sha256}>Checksum saved</span>
                    ) : null}
                  </div>
                </div>
                <div className="evidence-card__actions">
                  {asset.kind === "link" && asset.url ? (
                    <a
                      className="button button--ghost button--sm"
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={15} /> Open
                    </a>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadEvidence(asset)}
                    >
                      <Download size={15} /> Download
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(asset.id)}
                    aria-label="Delete evidence"
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          title="No proof matches these filters"
          description="Attach a screenshot, safe file, or link to a work session or project day."
          action={
            <Button onClick={() => openDialog("add-evidence")}>
              <Plus size={16} /> Add your first proof
            </Button>
          }
        />
      )}
    </div>
  );
}
