import { useMemo, useState } from "react";
import { Archive, Filter, History, Plus, RotateCcw } from "lucide-react";
import { useOutletContext } from "react-router-dom";

import { useUiStore } from "@/app/store";
import { SessionRow } from "@/components/SessionRow";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import {
  formatDuration,
  formatMoney,
  sessionAmountMinor,
} from "@/domain/format";
import type { LedgerSnapshot } from "@/domain/models";
import { userMessage } from "@/services/errors";
import { ledgerService } from "@/services/workledger";

export function WorkLogPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const openDialog = useUiStore((state) => state.openDialog);
  const pushToast = useUiStore((state) => state.pushToast);
  const [projectId, setProjectId] = useState("");
  const [source, setSource] = useState("");
  const [billable, setBillable] = useState("");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtered = useMemo(
    () =>
      snapshot.sessions.filter((session) => {
        const matchesDeleted = showDeleted
          ? session.deletedAt !== null
          : session.deletedAt === null;
        return (
          session.status === "completed" &&
          matchesDeleted &&
          (!projectId || session.projectId === projectId) &&
          (!source || session.source === source) &&
          (!billable || String(session.billable) === billable) &&
          (!search ||
            (session.description ?? "")
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase()))
        );
      }),
    [billable, projectId, search, showDeleted, snapshot.sessions, source],
  );
  const groups = new Map<string, typeof filtered>();
  for (const session of filtered) {
    const group = groups.get(session.workDate) ?? [];
    group.push(session);
    groups.set(session.workDate, group);
  }

  const changeDeleted = async (sessionId: string, deleted: boolean) => {
    const reason = window.prompt(
      deleted
        ? "Why are you deleting this work session?"
        : "Why are you restoring this work session?",
    );
    if (!reason) return;
    setError(null);
    try {
      await ledgerService.setSessionDeleted(sessionId, deleted, reason);
      pushToast(
        "success",
        deleted ? "Session moved to deleted work." : "Session restored.",
      );
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Canonical records"
        title="Work Log"
        description="Every completed session, grouped by its stable local work date."
        actions={
          <Button onClick={() => openDialog("previous-work")}>
            <Plus size={17} /> Add previous work
          </Button>
        }
      />

      <section className="filter-bar" aria-label="Work log filters">
        <span className="filter-bar__icon">
          <Filter size={17} />
        </span>
        <label>
          <span className="sr-only">Search descriptions</span>
          <input
            type="search"
            placeholder="Search descriptions…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
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
          <span className="sr-only">Source</span>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">All sources</option>
            <option value="tracked">Tracked</option>
            <option value="manual_range">Manual range</option>
            <option value="manual_duration">Manual duration</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Billable status</span>
          <select
            value={billable}
            onChange={(event) => setBillable(event.target.value)}
          >
            <option value="">All billing</option>
            <option value="true">Billable</option>
            <option value="false">Non-billable</option>
          </select>
        </label>
        <label className="inline-check filter-bar__deleted">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(event) => setShowDeleted(event.target.checked)}
          />
          <span>Deleted work</span>
        </label>
      </section>

      {error ? (
        <div className="inline-alert inline-alert--error">{error}</div>
      ) : null}

      {filtered.length > 0 ? (
        <div className="work-groups">
          {[...groups.entries()].map(([date, sessions]) => {
            const seconds = sessions.reduce(
              (sum, session) => sum + session.durationSeconds,
              0,
            );
            const currencyTotals = new Map<string, number>();
            for (const session of sessions) {
              currencyTotals.set(
                session.currencySnapshot,
                (currencyTotals.get(session.currencySnapshot) ?? 0) +
                  sessionAmountMinor(session),
              );
            }
            return (
              <section className="work-group panel" key={date}>
                <header className="work-group__header">
                  <div>
                    <h2>
                      {new Intl.DateTimeFormat(snapshot.settings.locale, {
                        dateStyle: "full",
                        timeZone: "UTC",
                      }).format(new Date(`${date}T12:00:00Z`))}
                    </h2>
                    <p>
                      {sessions.length}{" "}
                      {sessions.length === 1 ? "session" : "sessions"}
                    </p>
                  </div>
                  <div className="work-group__totals">
                    <strong>{formatDuration(seconds)}</strong>
                    {[...currencyTotals.entries()].map(([currency, amount]) => (
                      <span key={currency}>
                        {formatMoney(
                          amount,
                          currency,
                          snapshot.settings.locale,
                        )}
                      </span>
                    ))}
                  </div>
                </header>
                <div className="session-list">
                  {sessions.map((session) => {
                    const history = snapshot.auditEvents.filter(
                      (event) =>
                        event.entityType === "WorkSession" &&
                        event.entityId === session.id,
                    );
                    return (
                      <div className="session-wrap" key={session.id}>
                        <SessionRow session={session} snapshot={snapshot} />
                        <div className="session-wrap__footer">
                          <details>
                            <summary>
                              <History size={14} /> {history.length} history
                              events
                            </summary>
                            <ol className="audit-list">
                              {history.map((event) => (
                                <li key={event.id}>
                                  <span>
                                    {event.action.replaceAll("_", " ")}
                                  </span>
                                  <time>
                                    {new Date(event.createdAt).toLocaleString(
                                      snapshot.settings.locale,
                                    )}
                                  </time>
                                  {event.reason ? <p>{event.reason}</p> : null}
                                </li>
                              ))}
                            </ol>
                          </details>
                          {session.deletedAt ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void changeDeleted(session.id, false)
                              }
                            >
                              <RotateCcw size={14} /> Restore
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void changeDeleted(session.id, true)
                              }
                            >
                              <Archive size={14} /> Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={showDeleted ? "No deleted work" : "No matching sessions"}
          description={
            showDeleted
              ? "Deleted work stays recoverable here until it is restored."
              : "Change the filters, add previous work, or stop a running timer."
          }
          action={
            !showDeleted ? (
              <Button onClick={() => openDialog("previous-work")}>
                <Plus size={16} /> Add work
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
