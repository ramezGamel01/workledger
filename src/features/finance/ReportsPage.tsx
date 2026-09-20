import { useMemo, useState } from "react";
import { FileDown, FileText, ImageIcon, ShieldCheck } from "lucide-react";
import { useOutletContext } from "react-router-dom";

import { useUiStore } from "@/app/store";
import { Badge, Button, EmptyState, Field, PageHeader } from "@/components/ui";
import { formatDuration } from "@/domain/format";
import type { LedgerSnapshot } from "@/domain/models";
import { userMessage } from "@/services/errors";

export function ReportsPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const pushToast = useUiStore((state) => state.pushToast);
  const dates = snapshot.sessions.map((session) => session.workDate).sort();
  const [start, setStart] = useState(
    dates[0] ?? new Date().toISOString().slice(0, 10),
  );
  const [end, setEnd] = useState(
    dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
  );
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessions = useMemo(
    () =>
      snapshot.sessions.filter((session) => {
        const project = snapshot.projects.find(
          (item) => item.id === session.projectId,
        );
        return (
          session.status === "completed" &&
          session.deletedAt === null &&
          session.workDate >= start &&
          session.workDate <= end &&
          (!clientId || project?.clientId === clientId) &&
          (!projectId || session.projectId === projectId)
        );
      }),
    [clientId, end, projectId, snapshot.projects, snapshot.sessions, start],
  );
  const sessionIds = new Set(sessions.map((session) => session.id));
  const evidence = snapshot.evidence.filter(
    (item) =>
      item.deletedAt === null &&
      ((item.sessionId && sessionIds.has(item.sessionId)) ||
        (item.scope === "day" &&
          item.workDate !== null &&
          item.workDate >= start &&
          item.workDate <= end &&
          (!projectId || item.projectId === projectId))),
  );
  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      await (
        await import("@/services/pdf")
      ).pdfService.downloadPeriodReport({
        clientId: clientId || null,
        projectId: projectId || null,
        periodStart: start,
        periodEnd: end,
        evidenceIds,
      });
      pushToast("success", "Work report PDF generated locally.");
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Client documents"
        title="Reports"
        description="Build a detailed work-activity PDF separately from your invoice."
      />
      <section className="report-builder">
        <div className="panel report-builder__form">
          <header className="panel__header">
            <div>
              <h2>Report scope</h2>
              <p>Select a period and only the evidence you intend to share.</p>
            </div>
            <FileText size={21} />
          </header>
          <div className="stack-lg">
            <div className="form-grid form-grid--2">
              <Field label="From">
                <input
                  type="date"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </Field>
              <Field label="Client">
                <select
                  value={clientId}
                  onChange={(event) => {
                    setClientId(event.target.value);
                    setProjectId("");
                  }}
                >
                  <option value="">All clients</option>
                  {snapshot.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Project">
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">All projects</option>
                  {snapshot.projects
                    .filter(
                      (project) => !clientId || project.clientId === clientId,
                    )
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <div className="report-summary">
              <div>
                <span>Sessions</span>
                <strong>{sessions.length}</strong>
              </div>
              <div>
                <span>Total time</span>
                <strong>
                  {formatDuration(
                    sessions.reduce(
                      (sum, session) => sum + session.durationSeconds,
                      0,
                    ),
                  )}
                </strong>
              </div>
              <div>
                <span>Evidence available</span>
                <strong>{evidence.length}</strong>
              </div>
            </div>
            <div>
              <div className="subsection-heading">
                <div>
                  <h3>Evidence selection</h3>
                  <p>Nothing is included automatically.</p>
                </div>
                <Badge tone="blue">{evidenceIds.length} selected</Badge>
              </div>
              {evidence.length > 0 ? (
                <div className="evidence-checklist">
                  {evidence.map((item) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        checked={evidenceIds.includes(item.id)}
                        onChange={(event) =>
                          setEvidenceIds((ids) =>
                            event.target.checked
                              ? [...ids, item.id]
                              : ids.filter((id) => id !== item.id),
                          )
                        }
                      />
                      <span>
                        <ImageIcon size={16} />
                        <strong>
                          {item.caption ??
                            item.originalName ??
                            item.url ??
                            "Evidence"}
                        </strong>
                        <small>{item.kind}</small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">
                  No proof is attached to the sessions in this scope.
                </p>
              )}
            </div>
            {error ? (
              <div className="inline-alert inline-alert--error">{error}</div>
            ) : null}
            <Button
              size="lg"
              disabled={busy || sessions.length === 0}
              onClick={() => void generate()}
            >
              <FileDown size={19} />{" "}
              {busy ? "Generating PDF…" : "Generate work report"}
            </Button>
          </div>
        </div>
        <aside className="report-builder__aside">
          <ShieldCheck size={24} />
          <h2>Deliberate sharing</h2>
          <p>
            The report contains current session details. Selected screenshots
            are embedded only in the downloaded file.
          </p>
          <ul>
            <li>Time grouped by stable work date</li>
            <li>Session descriptions and totals</li>
            <li>Optional, individually selected proof</li>
            <li>No manual/tracked labels unless requested</li>
          </ul>
        </aside>
      </section>
      {sessions.length === 0 ? (
        <EmptyState
          title="No reportable work"
          description="Choose a period with completed, visible sessions."
        />
      ) : null}
    </div>
  );
}
