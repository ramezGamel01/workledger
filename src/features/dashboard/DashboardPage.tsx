import { format, parseISO, startOfWeek, subDays } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Coins,
  HardDriveDownload,
  Plus,
  TimerReset,
} from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useUiStore } from "@/app/store";
import { SessionRow } from "@/components/SessionRow";
import { Button, EmptyState, MetricCard, PageHeader } from "@/components/ui";
import {
  formatDuration,
  formatMoney,
  sessionAmountMinor,
  todayIn,
} from "@/domain/format";
import type { LedgerSnapshot } from "@/domain/models";

export function DashboardPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const openDialog = useUiStore((state) => state.openDialog);
  const today = todayIn(snapshot.settings.defaultTimeZone);
  const todayDate = parseISO(today);
  const weekStart = format(
    startOfWeek(todayDate, { weekStartsOn: snapshot.settings.weekStartsOn }),
    "yyyy-MM-dd",
  );
  const monthStart = `${today.slice(0, 7)}-01`;
  const visible = snapshot.sessions.filter(
    (session) => session.status === "completed" && session.deletedAt === null,
  );
  const todaySessions = visible.filter((session) => session.workDate === today);
  const weekSessions = visible.filter(
    (session) => session.workDate >= weekStart,
  );
  const monthSessions = visible.filter(
    (session) => session.workDate >= monthStart,
  );
  const earnings = new Map<string, number>();
  for (const session of monthSessions) {
    earnings.set(
      session.currencySnapshot,
      (earnings.get(session.currencySnapshot) ?? 0) +
        sessionAmountMinor(session),
    );
  }
  const firstEarning = [...earnings.entries()][0];
  const setupSteps = [
    {
      done: snapshot.profile !== null,
      label: "Freelancer profile",
      to: "/settings",
    },
    {
      done: snapshot.clients.length > 0,
      label: "First client",
      to: "/clients",
    },
    {
      done: snapshot.projects.length > 0,
      label: "Billable project",
      to: "/projects",
    },
  ];
  const setupComplete = setupSteps.every((step) => step.done);
  const hasExportedBackup = snapshot.auditEvents.some(
    (event) => event.entityType === "Backup" && event.action === "exported",
  );
  const chartData = Array.from({ length: 7 }, (_, index) => {
    const date = format(subDays(todayDate, 6 - index), "yyyy-MM-dd");
    const seconds = visible
      .filter((session) => session.workDate === date)
      .reduce((sum, session) => sum + session.durationSeconds, 0);
    return {
      date,
      day: format(parseISO(date), "EEE"),
      hours: Number((seconds / 3600).toFixed(2)),
    };
  });
  const recent = visible.slice(0, 5);

  return (
    <div className="page">
      <PageHeader
        eyebrow={format(todayDate, "EEEE, MMMM d")}
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}${snapshot.profile ? `, ${snapshot.profile.displayName.split(" ")[0]}` : ""}.`}
        description="Your time, proof, and earnings—reconciled from one ledger."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => openDialog("previous-work")}
            >
              <Plus size={17} /> Add previous work
            </Button>
            <Link className="button button--primary button--md" to="/timer">
              <TimerReset size={17} /> Open timer
            </Link>
          </>
        }
      />

      {!setupComplete ? (
        <section className="setup-banner">
          <div className="setup-banner__copy">
            <span className="setup-banner__eyebrow">First-run setup</span>
            <h2>Build your billing foundation</h2>
            <p>
              Complete these three steps, then you can track or import work.
            </p>
          </div>
          <div className="setup-steps">
            {setupSteps.map((step, index) => (
              <Link
                key={step.label}
                to={step.to}
                className={`setup-step ${step.done ? "setup-step--done" : ""}`}
              >
                <span>{step.done ? <Check size={15} /> : index + 1}</span>
                <strong>{step.label}</strong>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {setupComplete && visible.length > 0 && !hasExportedBackup ? (
        <section className="inline-alert inline-alert--warning dashboard-backup-nudge">
          <HardDriveDownload size={20} />
          <div>
            <strong>Protect your first work records</strong>
            <span>
              This ledger lives in this browser. Export a complete ZIP before
              clearing site data or changing devices.
            </span>
          </div>
          <Link className="button button--secondary button--sm" to="/settings">
            Open backup
          </Link>
        </section>
      ) : null}

      <section className="metrics-grid" aria-label="Work summary">
        <MetricCard
          label="Today"
          value={formatDuration(
            todaySessions.reduce(
              (sum, session) => sum + session.durationSeconds,
              0,
            ),
          )}
          detail={`${todaySessions.length} ${todaySessions.length === 1 ? "session" : "sessions"}`}
          icon={<Clock3 size={19} />}
        />
        <MetricCard
          label="This week"
          value={formatDuration(
            weekSessions.reduce(
              (sum, session) => sum + session.durationSeconds,
              0,
            ),
          )}
          detail={`Since ${format(parseISO(weekStart), "MMM d")}`}
          icon={<CalendarDays size={19} />}
        />
        <MetricCard
          label="This month"
          value={formatDuration(
            monthSessions.reduce(
              (sum, session) => sum + session.durationSeconds,
              0,
            ),
          )}
          detail={`${new Set(monthSessions.map((session) => session.workDate)).size} days worked`}
          icon={<CalendarDays size={19} />}
        />
        <MetricCard
          label="Estimated earnings"
          value={
            firstEarning
              ? formatMoney(
                  firstEarning[1],
                  firstEarning[0],
                  snapshot.settings.locale,
                )
              : formatMoney(
                  0,
                  snapshot.settings.defaultCurrency,
                  snapshot.settings.locale,
                )
          }
          detail={
            earnings.size > 1
              ? `${earnings.size} currencies kept separate`
              : "Billable this month"
          }
          icon={<Coins size={19} />}
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <header className="panel__header">
            <div>
              <h2>Weekly activity</h2>
              <p>Hours recorded across the last seven days</p>
            </div>
            <Link to="/timesheet">
              View timesheet <ArrowRight size={15} />
            </Link>
          </header>
          <div className="chart-wrap" aria-label="Weekly hours bar chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 8, left: -22, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="#e5eaf2"
                  strokeDasharray="4 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
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
                  cursor={{ fill: "#f1f5fb" }}
                  contentStyle={{
                    border: "1px solid #dce3ee",
                    borderRadius: 10,
                    boxShadow: "0 12px 30px rgba(16,25,42,.1)",
                  }}
                  formatter={(value) => [`${String(value)}h`, "Hours"]}
                />
                <Bar
                  dataKey="hours"
                  fill="#3b66dc"
                  radius={[5, 5, 2, 2]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Weekly hours summary</caption>
            <tbody>
              {chartData.map((day) => (
                <tr key={day.date}>
                  <th>{day.date}</th>
                  <td>{day.hours} hours</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="panel project-panel">
          <header className="panel__header">
            <div>
              <h2>Project focus</h2>
              <p>This month's recorded time</p>
            </div>
          </header>
          <div className="project-breakdown">
            {snapshot.projects
              .map((project) => ({
                project,
                seconds: monthSessions
                  .filter((session) => session.projectId === project.id)
                  .reduce((sum, session) => sum + session.durationSeconds, 0),
              }))
              .filter((item) => item.seconds > 0)
              .sort((a, b) => b.seconds - a.seconds)
              .slice(0, 5)
              .map((item) => {
                const total = monthSessions.reduce(
                  (sum, session) => sum + session.durationSeconds,
                  0,
                );
                const percent =
                  total > 0 ? Math.round((item.seconds / total) * 100) : 0;
                return (
                  <div className="project-breakdown__row" key={item.project.id}>
                    <div>
                      <span className="project-dot" />
                      <strong>{item.project.name}</strong>
                      <small>{formatDuration(item.seconds)}</small>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <span>{percent}%</span>
                  </div>
                );
              })}
            {monthSessions.length === 0 ? (
              <EmptyState
                title="No project activity yet"
                description="Add previous work or start the timer to build this view."
              />
            ) : null}
          </div>
        </article>
      </section>

      <section className="panel recent-panel">
        <header className="panel__header">
          <div>
            <h2>Recent work</h2>
            <p>Your latest completed sessions</p>
          </div>
          <Link to="/work-log">
            Open work log <ArrowRight size={15} />
          </Link>
        </header>
        {recent.length > 0 ? (
          <div className="session-list">
            {recent.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                snapshot={snapshot}
                compact
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Your ledger is ready"
            description="Start a timer for new work or bring in completed work from earlier dates."
            action={
              <Button onClick={() => openDialog("previous-work")}>
                <Plus size={16} /> Add your first work session
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
