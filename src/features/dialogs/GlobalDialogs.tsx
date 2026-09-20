import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileUp, Link2, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useUiStore } from "@/app/store";
import { Button, Field, Modal } from "@/components/ui";
import { moneyToMinor, todayIn } from "@/domain/format";
import type { LedgerSnapshot } from "@/domain/models";
import { userMessage } from "@/services/errors";
import { ledgerService } from "@/services/workledger";

const manualSchema = z.object({
  projectId: z.string().min(1, "Choose a project."),
  taskId: z.string(),
  workDate: z.string().min(1, "Choose a date."),
  startTime: z.string(),
  endTime: z.string(),
  breakMinutes: z.number().min(0).max(1439),
  hours: z.number().min(0).max(24),
  minutes: z.number().min(0).max(59),
  description: z.string(),
  rateOverride: z.string(),
  billable: z.boolean(),
});

type ManualForm = z.infer<typeof manualSchema>;

function PreviousWorkDialog({
  snapshot,
}: {
  snapshot: LedgerSnapshot;
}): React.JSX.Element {
  const close = useUiStore((state) => state.closeDialog);
  const pushToast = useUiStore((state) => state.pushToast);
  const [mode, setMode] = useState<"duration" | "range" | "quick">("duration");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const activeProjects = snapshot.projects.filter(
    (project) => project.status === "active",
  );
  const defaultProject = activeProjects[0];
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ManualForm>({
    resolver: zodResolver(manualSchema),
    defaultValues: {
      projectId: defaultProject?.id ?? "",
      taskId: "",
      workDate: defaultProject
        ? todayIn(defaultProject.timeZone)
        : new Date().toISOString().slice(0, 10),
      startTime: "09:00",
      endTime: "17:00",
      breakMinutes: 0,
      hours: 1,
      minutes: 0,
      description: "",
      rateOverride: "",
      billable: true,
    },
  });
  const projectId = watch("projectId");
  const project = snapshot.projects.find((item) => item.id === projectId);
  const tasks = snapshot.tasks.filter(
    (task) => task.projectId === projectId && task.status === "active",
  );
  const [quickRows, setQuickRows] = useState([
    {
      id: crypto.randomUUID(),
      workDate: defaultProject
        ? todayIn(defaultProject.timeZone)
        : new Date().toISOString().slice(0, 10),
      hours: 1,
      minutes: 0,
    },
  ]);

  const submit = handleSubmit(async (values) => {
    if (!project) return;
    setSubmitting(true);
    setFormError(null);
    try {
      if (mode === "quick") {
        await ledgerService.addQuickSessions(
          values.projectId,
          quickRows.map((row) => ({
            workDate: row.workDate,
            hours: Number(row.hours),
            minutes: Number(row.minutes),
          })),
        );
        pushToast(
          "success",
          `${quickRows.length} quick ${quickRows.length === 1 ? "entry" : "entries"} saved. Add details before invoicing.`,
        );
      } else {
        await ledgerService.addManualSession({
          projectId: values.projectId,
          taskId: values.taskId || null,
          workDate: values.workDate,
          mode,
          startTime: values.startTime,
          endTime: values.endTime,
          breakMinutes: Number(values.breakMinutes),
          hours: Number(values.hours),
          minutes: Number(values.minutes),
          description: values.description,
          billable: values.billable,
          hourlyRateMinorOverride: values.rateOverride
            ? moneyToMinor(values.rateOverride, project.currency)
            : null,
          incomplete: false,
        });
        pushToast("success", "Previous work added to your ledger.");
      }
      close();
    } catch (error) {
      setFormError(userMessage(error));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Modal
      open
      wide
      title="Add previous work"
      description="Record completed work without starting a timer. Time and earnings update everywhere immediately."
      onClose={close}
    >
      {activeProjects.length === 0 ? (
        <div className="inline-alert inline-alert--warning">
          Create an active client and project before adding work.
        </div>
      ) : (
        <form onSubmit={submit} className="stack-lg">
          <div className="segmented" aria-label="Entry method">
            {(
              [
                ["duration", "Duration only"],
                ["range", "Time range"],
                ["quick", "Quick dates"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={mode === value ? "segmented__active" : ""}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="form-grid form-grid--2">
            <Field label="Project" error={errors.projectId?.message}>
              <select {...register("projectId")}>
                {activeProjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            {mode !== "quick" ? (
              <Field label="Task" hint="Optional reusable label">
                <select {...register("taskId")}>
                  <option value="">No task</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="field-note">
                <strong>Details can wait</strong>
                <span>
                  Quick rows count toward totals but stay out of invoices.
                </span>
              </div>
            )}
          </div>

          {mode === "quick" ? (
            <div className="quick-rows">
              {quickRows.map((row, index) => (
                <div className="quick-row" key={row.id}>
                  <span className="quick-row__number">{index + 1}</span>
                  <Field label="Date">
                    <input
                      type="date"
                      value={row.workDate}
                      onChange={(event) =>
                        setQuickRows((items) =>
                          items.map((item) =>
                            item.id === row.id
                              ? { ...item, workDate: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Hours">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      value={row.hours}
                      onChange={(event) =>
                        setQuickRows((items) =>
                          items.map((item) =>
                            item.id === row.id
                              ? { ...item, hours: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Minutes">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={row.minutes}
                      onChange={(event) =>
                        setQuickRows((items) =>
                          items.map((item) =>
                            item.id === row.id
                              ? { ...item, minutes: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="icon-button quick-row__remove"
                    aria-label={`Remove row ${index + 1}`}
                    disabled={quickRows.length === 1}
                    onClick={() =>
                      setQuickRows((items) =>
                        items.filter((item) => item.id !== row.id),
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setQuickRows((rows) => [
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      workDate: rows[rows.length - 1]?.workDate ?? "",
                      hours: 1,
                      minutes: 0,
                    },
                  ])
                }
              >
                <Plus size={16} /> Add another date
              </Button>
            </div>
          ) : (
            <>
              <div
                className={`form-grid ${mode === "range" ? "form-grid--4" : "form-grid--3"}`}
              >
                <Field label="Work date" error={errors.workDate?.message}>
                  <input type="date" {...register("workDate")} />
                </Field>
                {mode === "range" ? (
                  <>
                    <Field label="Start time">
                      <input type="time" {...register("startTime")} />
                    </Field>
                    <Field label="End time">
                      <input type="time" {...register("endTime")} />
                    </Field>
                    <Field label="Break (minutes)">
                      <input
                        type="number"
                        min="0"
                        {...register("breakMinutes", { valueAsNumber: true })}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Hours">
                      <input
                        type="number"
                        min="0"
                        max="24"
                        {...register("hours", { valueAsNumber: true })}
                      />
                    </Field>
                    <Field label="Minutes">
                      <input
                        type="number"
                        min="0"
                        max="59"
                        {...register("minutes", { valueAsNumber: true })}
                      />
                    </Field>
                  </>
                )}
              </div>
              <Field label="Description" error={errors.description?.message}>
                <textarea
                  rows={3}
                  maxLength={2000}
                  placeholder="What did you complete?"
                  {...register("description")}
                />
              </Field>
              <div className="form-grid form-grid--2">
                <Field
                  label={`Historical rate${project ? ` (${project.currency}/hour)` : ""}`}
                  hint={
                    project
                      ? "Leave blank to use the project's current rate."
                      : "Select a project first."
                  }
                >
                  <input
                    inputMode="decimal"
                    placeholder="Use project rate"
                    {...register("rateOverride")}
                  />
                </Field>
                <label className="check-card">
                  <input type="checkbox" {...register("billable")} />
                  <span>
                    <strong>Billable work</strong>
                    <small>
                      Include this time in earnings and invoice eligibility.
                    </small>
                  </span>
                </label>
              </div>
            </>
          )}

          {formError ? (
            <div className="inline-alert inline-alert--error" role="alert">
              {formError}
            </div>
          ) : null}
          <div className="modal__actions">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : mode === "quick"
                  ? "Save quick entries"
                  : "Add work"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function EditSessionDialog({
  snapshot,
}: {
  snapshot: LedgerSnapshot;
}): React.JSX.Element {
  const close = useUiStore((state) => state.closeDialog);
  const sessionId = useUiStore((state) => state.dialogEntityId);
  const pushToast = useUiStore((state) => state.pushToast);
  const session = snapshot.sessions.find((item) => item.id === sessionId);
  const [description, setDescription] = useState(session?.description ?? "");
  const [taskId, setTaskId] = useState(session?.taskId ?? "");
  const [billable, setBillable] = useState(session?.billable ?? true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const tasks = snapshot.tasks.filter(
    (task) => task.projectId === session?.projectId && task.status === "active",
  );
  if (!session) {
    return (
      <Modal open title="Session unavailable" onClose={close}>
        <p>This work session no longer exists.</p>
      </Modal>
    );
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await ledgerService.updateSessionDetails({
        sessionId: session.id,
        description,
        taskId: taskId || null,
        billable,
        reason,
      });
      pushToast("success", "Work session details updated.");
      close();
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal
      open
      title={
        session.detailStatus === "incomplete"
          ? "Complete work details"
          : "Edit work details"
      }
      description={`${session.workDate} · ${session.source.replaceAll("_", " ")}`}
      onClose={close}
    >
      <form onSubmit={submit} className="stack-lg">
        <Field label="Description">
          <textarea
            rows={4}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field label="Task">
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
        <label className="check-card">
          <input
            type="checkbox"
            checked={billable}
            onChange={(event) => setBillable(event.target.checked)}
          />
          <span>
            <strong>Billable work</strong>
            <small>Financial changes are recorded in history.</small>
          </span>
        </label>
        <Field
          label="Reason for material change"
          hint="Required when task or billable state changes."
        >
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why are you making this correction?"
          />
        </Field>
        {error ? (
          <div className="inline-alert inline-alert--error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="modal__actions">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save details"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EvidenceDialog({
  snapshot,
}: {
  snapshot: LedgerSnapshot;
}): React.JSX.Element {
  const close = useUiStore((state) => state.closeDialog);
  const entityId = useUiStore((state) => state.dialogEntityId);
  const pushToast = useUiStore((state) => state.pushToast);
  const targetSession = snapshot.sessions.find((item) => item.id === entityId);
  const activeProjects = snapshot.projects.filter(
    (project) => project.status === "active",
  );
  const [kind, setKind] = useState<"file" | "link">("file");
  const [projectId, setProjectId] = useState(
    targetSession?.projectId ?? activeProjects[0]?.id ?? "",
  );
  const [scope, setScope] = useState<"session" | "day">(
    targetSession ? "session" : "session",
  );
  const [sessionId, setSessionId] = useState(targetSession?.id ?? "");
  const project = snapshot.projects.find((item) => item.id === projectId);
  const [workDate, setWorkDate] = useState(
    targetSession?.workDate ??
      (project
        ? todayIn(project.timeZone)
        : new Date().toISOString().slice(0, 10)),
  );
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sessions = useMemo(
    () =>
      snapshot.sessions.filter(
        (session) =>
          session.projectId === projectId && session.deletedAt === null,
      ),
    [projectId, snapshot.sessions],
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (kind === "file") {
        if (!file) throw new Error("Choose a file to attach.");
        await ledgerService.addEvidenceFile({
          projectId,
          scope,
          sessionId: scope === "session" ? sessionId : null,
          workDate: scope === "day" ? workDate : null,
          file,
          caption,
        });
      } else {
        await ledgerService.addEvidenceLink({
          projectId,
          scope,
          sessionId: scope === "session" ? sessionId : null,
          workDate: scope === "day" ? workDate : null,
          url,
          caption,
        });
      }
      pushToast("success", "Evidence saved locally.");
      close();
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal
      open
      title="Add proof of work"
      description="Files stay inside this browser. A failed attachment never removes saved time."
      onClose={close}
    >
      <form onSubmit={submit} className="stack-lg">
        <div className="segmented">
          <button
            type="button"
            className={kind === "file" ? "segmented__active" : ""}
            onClick={() => setKind("file")}
          >
            <FileUp size={16} /> File or screenshot
          </button>
          <button
            type="button"
            className={kind === "link" ? "segmented__active" : ""}
            onClick={() => setKind("link")}
          >
            <Link2 size={16} /> Link
          </button>
        </div>
        <div className="form-grid form-grid--2">
          <Field label="Project">
            <select
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setSessionId("");
              }}
            >
              {activeProjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Attach to">
            <select
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as "session" | "day")
              }
            >
              <option value="session">A work session</option>
              <option value="day">The project day</option>
            </select>
          </Field>
        </div>
        {scope === "session" ? (
          <Field label="Work session">
            <select
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
            >
              <option value="">Choose a session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.workDate} ·{" "}
                  {session.description ?? "Details pending"}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Work date">
            <input
              type="date"
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
            />
          </Field>
        )}
        {kind === "file" ? (
          <Field
            label="File"
            hint="Images up to 15 MiB; other safe files up to 25 MiB."
          >
            <input
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
        ) : (
          <Field label="Link">
            <input
              type="url"
              value={url}
              placeholder="https://…"
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
        )}
        <Field label="Caption" hint="Optional context for this proof.">
          <input
            maxLength={500}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </Field>
        {error ? (
          <div className="inline-alert inline-alert--error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="modal__actions">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !projectId}>
            {submitting ? "Saving locally…" : "Save evidence"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function GlobalDialogs({
  snapshot,
}: {
  snapshot: LedgerSnapshot;
}): React.JSX.Element {
  const dialog = useUiStore((state) => state.dialog);
  return (
    <>
      {dialog === "previous-work" ? (
        <PreviousWorkDialog snapshot={snapshot} />
      ) : null}
      {dialog === "edit-session" ? (
        <EditSessionDialog snapshot={snapshot} />
      ) : null}
      {dialog === "add-evidence" ? (
        <EvidenceDialog snapshot={snapshot} />
      ) : null}
    </>
  );
}
