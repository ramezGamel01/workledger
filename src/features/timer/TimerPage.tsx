import { useEffect, useMemo, useState } from "react";
import {
  CirclePause,
  CirclePlay,
  CircleStop,
  Clock3,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";

import { useUiStore } from "@/app/store";
import { SessionRow } from "@/components/SessionRow";
import { Badge, Button, EmptyState, Field, PageHeader } from "@/components/ui";
import { formatTimer, todayIn } from "@/domain/format";
import type { LedgerSnapshot } from "@/domain/models";
import { useNow } from "@/hooks/useLedger";
import { userMessage } from "@/services/errors";
import { ledgerService } from "@/services/workledger";

export function TimerPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const pushToast = useUiStore((state) => state.pushToast);
  const openDialog = useUiStore((state) => state.openDialog);
  const now = useNow();
  const active = snapshot.sessions.find((session) =>
    ["running", "paused"].includes(session.status),
  );
  const activeProjects = snapshot.projects.filter(
    (project) => project.status === "active",
  );
  const [projectId, setProjectId] = useState(activeProjects[0]?.id ?? "");
  const [taskId, setTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId && activeProjects[0]) setProjectId(activeProjects[0].id);
  }, [activeProjects, projectId]);
  const tasks = snapshot.tasks.filter(
    (task) => task.projectId === projectId && task.status === "active",
  );
  const activeProject = snapshot.projects.find(
    (project) => project.id === active?.projectId,
  );
  const openSegment = active
    ? snapshot.segments.find(
        (segment) =>
          segment.sessionId === active.id && segment.endedAt === null,
      )
    : undefined;
  const elapsed = active
    ? active.durationSeconds +
      (openSegment
        ? Math.max(
            0,
            Math.floor(
              (now - new Date(openSegment.startedAt).getTime()) / 1000,
            ),
          )
        : 0)
    : 0;
  const today = todayIn(snapshot.settings.defaultTimeZone);
  const todaySessions = useMemo(
    () =>
      snapshot.sessions.filter(
        (session) =>
          session.status === "completed" &&
          session.deletedAt === null &&
          session.workDate === today,
      ),
    [snapshot.sessions, today],
  );

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      pushToast("success", success);
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page timer-page">
      <PageHeader
        eyebrow="Live tracking"
        title="Timer"
        description="Track exact work segments. Pauses, reloads, and browser restarts never rely on ticking memory."
        actions={
          <Button
            variant="secondary"
            onClick={() => openDialog("previous-work")}
          >
            <Plus size={17} /> Add previous work
          </Button>
        }
      />

      <section
        className={`timer-console ${active ? "timer-console--active" : ""}`}
      >
        <div className="timer-console__visual">
          <div className="timer-orbit" aria-hidden="true">
            <span
              className={
                active?.status === "running" ? "timer-orbit__pulse" : ""
              }
            />
          </div>
          <div className="timer-display">
            <span>
              {active
                ? active.status === "running"
                  ? "Tracking now"
                  : "Timer paused"
                : "Ready when you are"}
            </span>
            <strong aria-live="off">{formatTimer(elapsed)}</strong>
            <small>
              {activeProject?.name ?? "Choose a project and describe your work"}
            </small>
          </div>
        </div>

        <div className="timer-console__controls">
          {active ? (
            <>
              <div className="active-work-card">
                <div>
                  <Badge tone={active.status === "running" ? "green" : "amber"}>
                    {active.status}
                  </Badge>
                  <h2>{active.description}</h2>
                  <p>
                    {active.taskNameSnapshot ?? "No task"} ·{" "}
                    {active.billable ? "Billable" : "Non-billable"}
                  </p>
                </div>
                <ShieldCheck size={24} />
              </div>
              <div className="timer-actions">
                {active.status === "running" ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => ledgerService.pauseTimer(active.id),
                        "Timer paused.",
                      )
                    }
                  >
                    <CirclePause size={21} /> Pause
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="lg"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => ledgerService.resumeTimer(active.id),
                        "Timer resumed.",
                      )
                    }
                  >
                    <RotateCcw size={20} /> Resume
                  </Button>
                )}
                <Button
                  size="lg"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => ledgerService.stopTimer(active.id),
                      "Timer stopped and work saved.",
                    )
                  }
                >
                  <CircleStop size={21} /> Stop & save
                </Button>
              </div>
            </>
          ) : activeProjects.length > 0 ? (
            <form
              className="timer-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    ledgerService.startTimer({
                      projectId,
                      taskId: taskId || null,
                      description,
                      billable,
                    }),
                  "Timer started. Your first segment is safely stored.",
                );
              }}
            >
              <div className="form-grid form-grid--2">
                <Field label="Project">
                  <select
                    value={projectId}
                    onChange={(event) => {
                      setProjectId(event.target.value);
                      setTaskId("");
                    }}
                  >
                    {activeProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Task" hint="Optional">
                  <select
                    value={taskId}
                    onChange={(event) => setTaskId(event.target.value)}
                  >
                    <option value="">No task</option>
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="What are you working on?">
                <textarea
                  rows={3}
                  maxLength={2000}
                  required
                  value={description}
                  placeholder="A clear description becomes part of the permanent work record."
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <div className="timer-form__footer">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={billable}
                    onChange={(event) => setBillable(event.target.checked)}
                  />
                  <span>Billable time</span>
                </label>
                <Button
                  size="lg"
                  type="submit"
                  disabled={busy || !description.trim()}
                >
                  <CirclePlay size={22} /> {busy ? "Starting…" : "Start timer"}
                </Button>
              </div>
            </form>
          ) : (
            <EmptyState
              title="Create a project before tracking"
              description="A project supplies the timezone, currency, and hourly-rate snapshot for every session."
              action={
                <Link
                  className="button button--primary button--md"
                  to="/projects"
                >
                  Create project
                </Link>
              }
            />
          )}
          {error ? (
            <div className="inline-alert inline-alert--error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <header className="panel__header">
          <div>
            <h2>Today's completed work</h2>
            <p>
              {today} · {todaySessions.length} saved sessions
            </p>
          </div>
          <Clock3 size={20} />
        </header>
        {todaySessions.length > 0 ? (
          <div className="session-list">
            {todaySessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                snapshot={snapshot}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No completed sessions today"
            description="Stopped timers appear here immediately. An active timer remains visible across every route."
          />
        )}
      </section>
    </div>
  );
}
