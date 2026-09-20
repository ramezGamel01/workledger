import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { useOutletContext } from "react-router-dom";

import { Badge, EmptyState, PageHeader } from "@/components/ui";
import {
  formatDuration,
  formatMoney,
  sessionAmountMinor,
} from "@/domain/format";
import type { LedgerSnapshot } from "@/domain/models";

export function TimesheetPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const dates = snapshot.sessions
    .filter((session) => session.status === "completed")
    .map((session) => session.workDate)
    .sort();
  const [start, setStart] = useState(dates[0] ?? "");
  const [end, setEnd] = useState(dates[dates.length - 1] ?? "");
  const [projectId, setProjectId] = useState("");
  const rows = useMemo(
    () =>
      snapshot.sessions.filter(
        (session) =>
          session.status === "completed" &&
          session.deletedAt === null &&
          (!start || session.workDate >= start) &&
          (!end || session.workDate <= end) &&
          (!projectId || session.projectId === projectId),
      ),
    [end, projectId, snapshot.sessions, start],
  );
  const totalSeconds = rows.reduce(
    (sum, session) => sum + session.durationSeconds,
    0,
  );
  const totals = new Map<string, number>();
  for (const session of rows) {
    totals.set(
      session.currencySnapshot,
      (totals.get(session.currencySnapshot) ?? 0) + sessionAmountMinor(session),
    );
  }
  return (
    <div className="page">
      <PageHeader
        eyebrow="Review"
        title="Timesheet"
        description="A dense, filterable view of the same canonical work sessions."
      />
      <section className="filter-bar" aria-label="Timesheet filters">
        <span className="filter-bar__icon">
          <Filter size={17} />
        </span>
        <label className="filter-field">
          <span>From</span>
          <input
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label className="filter-field">
          <span>To</span>
          <input
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
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
      </section>
      <section className="timesheet-summary">
        <div>
          <span>Total time</span>
          <strong>{formatDuration(totalSeconds)}</strong>
        </div>
        <div>
          <span>Sessions</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Billable earnings</span>
          <strong>
            {[...totals.entries()]
              .map(([currency, value]) =>
                formatMoney(value, currency, snapshot.settings.locale),
              )
              .join(" · ") ||
              formatMoney(
                0,
                snapshot.settings.defaultCurrency,
                snapshot.settings.locale,
              )}
          </strong>
        </div>
      </section>
      {rows.length > 0 ? (
        <section className="table-card">
          <div className="table-scroll">
            <table className="data-table timesheet-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client / project</th>
                  <th>Description</th>
                  <th>Source</th>
                  <th>Duration</th>
                  <th>Earnings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((session) => {
                  const project = snapshot.projects.find(
                    (item) => item.id === session.projectId,
                  );
                  const client = snapshot.clients.find(
                    (item) => item.id === project?.clientId,
                  );
                  return (
                    <tr key={session.id}>
                      <td data-label="Date">
                        <strong>{session.workDate}</strong>
                      </td>
                      <td data-label="Project">
                        <strong>{project?.name ?? "Unknown"}</strong>
                        <small>{client?.displayName}</small>
                      </td>
                      <td data-label="Description">
                        {session.description ?? (
                          <Badge tone="amber">Details required</Badge>
                        )}
                      </td>
                      <td data-label="Source">
                        <Badge
                          tone={session.source === "tracked" ? "green" : "blue"}
                        >
                          {session.source.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td data-label="Duration" className="numeric">
                        {formatDuration(session.durationSeconds)}
                      </td>
                      <td data-label="Earnings" className="numeric">
                        {session.billable
                          ? formatMoney(
                              sessionAmountMinor(session),
                              session.currencySnapshot,
                              snapshot.settings.locale,
                            )
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Filtered total</td>
                  <td className="numeric">{formatDuration(totalSeconds)}</td>
                  <td className="numeric">
                    {[...totals.entries()]
                      .map(([currency, value]) =>
                        formatMoney(value, currency, snapshot.settings.locale),
                      )
                      .join(" · ")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState
          title="No time in this period"
          description="Adjust the date or project filters to see recorded work."
        />
      )}
    </div>
  );
}
