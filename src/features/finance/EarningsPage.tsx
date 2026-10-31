import { useMemo, useState } from "react";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  parseISO,
  subDays,
} from "date-fns";
import { ArrowUpRight, Coins, Filter, WalletCards } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import {
  Bar,
  BarChart,
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
  // Daily totals in the main currency, oldest first, with a bar for every
  // day in the period (including days with no work)
  const trendCurrency = primary[0];
  const dailyMinor = new Map<string, number>();
  for (const session of filtered) {
    if (session.currencySnapshot !== trendCurrency) continue;
    dailyMinor.set(
      session.workDate,
      (dailyMinor.get(session.workDate) ?? 0) + sessionAmountMinor(session),
    );
  }
  const workedDays = [...dailyMinor.keys()].sort();
  const firstDay = start || workedDays[0];
  const lastDay = end || workedDays[workedDays.length - 1];
  const hasPeriod = Boolean(firstDay && lastDay && firstDay <= lastDay);
  const trend =
    hasPeriod && firstDay && lastDay
      ? eachDayOfInterval({
          start: parseISO(firstDay),
          end: parseISO(lastDay),
        }).map((day) => {
          const date = format(day, "yyyy-MM-dd");
          return {
            date,
            label: format(day, "MMM d"),
            amount: (dailyMinor.get(date) ?? 0) / 100,
          };
        })
      : [];
  const compactMoney = new Intl.NumberFormat(snapshot.settings.locale, {
    style: "currency",
    currency: trendCurrency,
    notation: "compact",
    maximumFractionDigits: 1,
  });

  // The same number of days just before this period, for comparison
  let comparison: string | null = null;
  if (hasPeriod && firstDay && lastDay) {
    const length =
      differenceInCalendarDays(parseISO(lastDay), parseISO(firstDay)) + 1;
    const previousEnd = format(subDays(parseISO(firstDay), 1), "yyyy-MM-dd");
    const previousStart = format(
      subDays(parseISO(firstDay), length),
      "yyyy-MM-dd",
    );
    const previousMinor = snapshot.sessions
      .filter((session) => {
        const project = snapshot.projects.find(
          (item) => item.id === session.projectId,
        );
        return (
          session.status === "completed" &&
          session.deletedAt === null &&
          session.currencySnapshot === trendCurrency &&
          session.workDate >= previousStart &&
          session.workDate <= previousEnd &&
          (!clientId || project?.clientId === clientId) &&
          (!projectId || session.projectId === projectId)
        );
      })
      .reduce((sum, session) => sum + sessionAmountMinor(session), 0);
    if (previousMinor > 0) {
      const change = Math.round(
        ((primary[1] - previousMinor) / previousMinor) * 100,
      );
      comparison = `${change >= 0 ? "+" : ""}${change}% vs the previous ${length} days`;
    }
  }
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
        eyebrow="Money"
        title="Earnings"
        description="What your billable work earned, day by day and project by project."
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
              : (comparison ??
                `${filtered.filter((session) => session.billable).length} billable sessions`)
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
          detail="Recorded but not billed"
          icon={<ArrowUpRight size={19} />}
        />
      </section>
      {filtered.length > 0 ? (
        <>
          <section className="panel chart-panel">
            <header className="panel__header">
              <div>
                <h2>Earned per day</h2>
                <p>Billable work, oldest to newest</p>
              </div>
              {currencies.size > 1 ? (
                <Badge tone="amber">Showing {primary[0]} trend</Badge>
              ) : null}
            </header>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={trend}
                  margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12 }}
                    minTickGap={16}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11 }}
                    width={58}
                    tickFormatter={(value) =>
                      compactMoney.format(Number(value))
                    }
                  />
                  <Tooltip
                    labelFormatter={(_, payload) => {
                      const date = (
                        payload?.[0]?.payload as { date?: string } | undefined
                      )?.date;
                      return date ? format(parseISO(date), "EEEE, MMM d") : "";
                    }}
                    formatter={(value) => [
                      formatMoney(
                        Math.round(Number(value) * 100),
                        trendCurrency,
                        snapshot.settings.locale,
                      ),
                      "Earned",
                    ]}
                  />
                  <Bar
                    dataKey="amount"
                    className="chart-bar"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="table-card">
            <header className="panel__header">
              <div>
                <h2>By project</h2>
                <p>Time and earnings for each project in this period</p>
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
          description="Try a different date range, client or project."
        />
      )}
    </div>
  );
}
