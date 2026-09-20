import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowUpRight, Coins, Filter, WalletCards } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge, EmptyState, MetricCard, PageHeader } from "@/components/ui";
import {
  formatDuration,
  formatMoney,
  sessionAmountMinor,
} from "@/domain/format";
import type { LedgerSnapshot } from "@/domain/models";

export function EarningsPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const dates = snapshot.sessions.map((session) => session.workDate).sort();
  const [start, setStart] = useState(dates[0] ?? "");
  const [end, setEnd] = useState(dates[dates.length - 1] ?? "");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const filtered = useMemo(
    () =>
      snapshot.sessions.filter((session) => {
        const project = snapshot.projects.find(
          (item) => item.id === session.projectId,
        );
        return (
          session.status === "completed" &&
          session.deletedAt === null &&
          (!start || session.workDate >= start) &&
          (!end || session.workDate <= end) &&
          (!clientId || project?.clientId === clientId) &&
          (!projectId || session.projectId === projectId)
        );
      }),
    [clientId, end, projectId, snapshot.projects, snapshot.sessions, start],
  );
  const currencies = new Map<string, number>();
  for (const session of filtered) {
    currencies.set(
      session.currencySnapshot,
      (currencies.get(session.currencySnapshot) ?? 0) +
        sessionAmountMinor(session),
    );
  }
  const primary = [...currencies.entries()][0] ?? [
    snapshot.settings.defaultCurrency,
    0,
  ];
  const billableSeconds = filtered
    .filter((session) => session.billable)
    .reduce((sum, session) => sum + session.durationSeconds, 0);
  const nonBillableSeconds = filtered
    .filter((session) => !session.billable)
    .reduce((sum, session) => sum + session.durationSeconds, 0);
  const trendMap = new Map<string, number>();
  for (const session of filtered) {
    trendMap.set(
      session.workDate,
      (trendMap.get(session.workDate) ?? 0) + sessionAmountMinor(session),
    );
  }
  const trend = [...trendMap.entries()].map(([date, amount]) => ({
    date,
    label: format(parseISO(date), "MMM d"),
    amount: amount / 100,
  }));
  const projects = snapshot.projects
    .map((project) => {
      const sessions = filtered.filter(
        (session) => session.projectId === project.id,
      );
      return {
        project,
        sessions,
        seconds: sessions.reduce(
          (sum, session) => sum + session.durationSeconds,
          0,
        ),
        amount: sessions.reduce(
          (sum, session) => sum + sessionAmountMinor(session),
          0,
        ),
      };
    })
    .filter((item) => item.sessions.length > 0)
    .sort((a, b) => b.amount - a.amount);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Reconciliation"
        title="Earnings"
        description="Every amount is the sum of per-session integer calculations—never rounded display hours."
      />
      <section className="filter-bar" aria-label="Earnings filters">
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
          <span className="sr-only">Client</span>
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
        </label>
        <label>
          <span className="sr-only">Project</span>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">All projects</option>
            {snapshot.projects
              .filter((project) => !clientId || project.clientId === clientId)
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
          </select>
        </label>
      </section>
      <section className="metrics-grid metrics-grid--3">
        <MetricCard
          label="Billable earnings"
          value={formatMoney(primary[1], primary[0], snapshot.settings.locale)}
          detail={
            currencies.size > 1
              ? `${currencies.size} separate currency totals`
              : `${filtered.filter((session) => session.billable).length} billable sessions`
          }
          icon={<Coins size={19} />}
        />
        <MetricCard
          label="Billable time"
          value={formatDuration(billableSeconds)}
          detail="Included in earning totals"
          icon={<WalletCards size={19} />}
        />
        <MetricCard
          label="Non-billable time"
          value={formatDuration(nonBillableSeconds)}
          detail="Recorded, excluded from money"
          icon={<ArrowUpRight size={19} />}
        />
      </section>
      {filtered.length > 0 ? (
        <>
          <section className="panel chart-panel">
            <header className="panel__header">
              <div>
                <h2>Earnings trend</h2>
                <p>Canonical session amounts by work date</p>
              </div>
              {currencies.size > 1 ? (
                <Badge tone="amber">Showing {primary[0]} trend</Badge>
              ) : null}
            </header>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={trend}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="#e5eaf2"
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#718096", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#718096", fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatMoney(
                        Math.round(Number(value) * 100),
                        primary[0],
                        snapshot.settings.locale,
                      ),
                      "Earnings",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#3b66dc"
                    strokeWidth={2.5}
                    fill="#e6edff"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="table-card">
            <header className="panel__header">
              <div>
                <h2>Project reconciliation</h2>
                <p>Drill down to the source sessions behind each total</p>
              </div>
            </header>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Sessions</th>
                    <th>Worked</th>
                    <th>Billable</th>
                    <th>Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((item) => (
                    <tr key={item.project.id}>
                      <td>
                        <strong>{item.project.name}</strong>
                        <small>
                          {
                            snapshot.clients.find(
                              (client) => client.id === item.project.clientId,
                            )?.displayName
                          }
                        </small>
                      </td>
                      <td>{item.sessions.length}</td>
                      <td>{formatDuration(item.seconds)}</td>
                      <td>
                        {formatDuration(
                          item.sessions
                            .filter((session) => session.billable)
                            .reduce(
                              (sum, session) => sum + session.durationSeconds,
                              0,
                            ),
                        )}
                      </td>
                      <td className="numeric">
                        <strong>
                          {formatMoney(
                            item.amount,
                            item.project.currency,
                            snapshot.settings.locale,
                          )}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          title="No earnings in this view"
          description="Change the period or organization filters to reconcile recorded work."
        />
      )}
    </div>
  );
}
