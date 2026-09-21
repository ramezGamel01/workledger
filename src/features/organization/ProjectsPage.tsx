import { useState } from "react";
import {
  Archive,
  BriefcaseBusiness,
  CheckCircle2,
  ListTodo,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";

import { useUiStore } from "@/app/store";
import { Badge, Button, EmptyState, Field, PageHeader } from "@/components/ui";
import { SUPPORTED_CURRENCIES } from "@/domain/currencies";
import { formatMoney, minorToMoney, moneyToMinor } from "@/domain/format";
import type { LedgerSnapshot } from "@/domain/models";
import { userMessage } from "@/services/errors";
import { ledgerService } from "@/services/workledger";

export function ProjectsPage(): React.JSX.Element {
  const snapshot = useOutletContext<LedgerSnapshot>();
  const pushToast = useUiStore((state) => state.pushToast);
  const activeClients = snapshot.clients.filter(
    (client) => client.status === "active",
  );
  const [showForm, setShowForm] = useState(
    snapshot.projects.length === 0 && activeClients.length > 0,
  );
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [clientId, setClientId] = useState(activeClients[0]?.id ?? "");
  const selectedClient = snapshot.clients.find(
    (client) => client.id === clientId,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("15.00");
  const [currency, setCurrency] = useState(
    selectedClient?.defaultCurrency ?? snapshot.settings.defaultCurrency,
  );
  const [timeZone, setTimeZone] = useState(snapshot.settings.defaultTimeZone);
  const [taskProjectId, setTaskProjectId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetProjectForm = () => {
    setEditingProjectId(null);
    setName("");
    setDescription("");
    setRate("15.00");
    setClientId(activeClients[0]?.id ?? "");
    setCurrency(
      activeClients[0]?.defaultCurrency ?? snapshot.settings.defaultCurrency,
    );
    setTimeZone(snapshot.settings.defaultTimeZone);
    setShowForm(false);
  };

  const beginCreateProject = () => {
    resetProjectForm();
    setShowForm(true);
  };

  const beginEditProject = (projectId: string) => {
    const project = snapshot.projects.find((item) => item.id === projectId);
    if (!project) return;
    setEditingProjectId(project.id);
    setClientId(project.clientId);
    setName(project.name);
    setDescription(project.description ?? "");
    setRate(minorToMoney(project.hourlyRateMinor, project.currency));
    setCurrency(project.currency);
    setTimeZone(project.timeZone);
    setError(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const existing = editingProjectId
        ? snapshot.projects.find((project) => project.id === editingProjectId)
        : null;
      const input = {
        clientId,
        name,
        description,
        hourlyRateMinor: moneyToMinor(rate, currency),
        currency,
        timeZone,
        colorToken: existing?.colorToken ?? "blue",
        startDate: existing?.startDate ?? "",
        endDate: existing?.endDate ?? "",
      };
      if (editingProjectId) {
        await ledgerService.updateProject(editingProjectId, input);
      } else {
        await ledgerService.createProject(input);
      }
      const updated = Boolean(editingProjectId);
      resetProjectForm();
      pushToast(
        "success",
        updated
          ? "Project updated; historical work remains unchanged."
          : "Project created with its billing snapshot rules.",
      );
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const input = {
        projectId: taskProjectId,
        name: taskName,
        description: "",
      };
      if (editingTaskId) {
        await ledgerService.updateTask(editingTaskId, input);
      } else {
        await ledgerService.createTask(input);
      }
      const updated = Boolean(editingTaskId);
      setTaskName("");
      setTaskProjectId("");
      setEditingTaskId(null);
      pushToast("success", updated ? "Task updated." : "Task added.");
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  const editTask = (taskId: string) => {
    const task = snapshot.tasks.find((item) => item.id === taskId);
    if (!task) return;
    setTaskProjectId(task.projectId);
    setEditingTaskId(task.id);
    setTaskName(task.name);
    setError(null);
  };

  const changeTaskArchived = async (taskId: string, archived: boolean) => {
    setError(null);
    try {
      await ledgerService.setTaskArchived(taskId, archived);
      pushToast("success", archived ? "Task archived." : "Task restored.");
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  const deleteTask = async (taskId: string) => {
    const task = snapshot.tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (snapshot.sessions.some((session) => session.taskId === taskId)) {
      setError(
        "This task is used by work sessions. Archive it instead to preserve your history.",
      );
      return;
    }
    if (
      !window.confirm(
        `Permanently delete “${task.name}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await ledgerService.deleteTask(taskId);
      if (editingTaskId === taskId) {
        setTaskName("");
        setTaskProjectId("");
        setEditingTaskId(null);
      }
      pushToast("success", "Task permanently deleted.");
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  const archiveProject = async (id: string, archived: boolean) => {
    setError(null);
    try {
      await ledgerService.setProjectArchived(id, archived);
      pushToast(
        "success",
        archived ? "Project archived." : "Project restored.",
      );
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  const deleteProject = async (projectId: string) => {
    const project = snapshot.projects.find((item) => item.id === projectId);
    if (!project) return;
    const hasHistory =
      snapshot.sessions.some((session) => session.projectId === projectId) ||
      snapshot.evidence.some((asset) => asset.projectId === projectId) ||
      snapshot.invoiceLines.some((line) => line.projectId === projectId);
    if (hasHistory) {
      setError(
        "This project has work, evidence, or invoice history. Archive it instead to preserve those records.",
      );
      return;
    }
    const taskCount = snapshot.tasks.filter(
      (task) => task.projectId === projectId,
    ).length;
    const taskNote =
      taskCount === 0
        ? ""
        : ` and ${taskCount} unused task${taskCount === 1 ? "" : "s"}`;
    if (
      !window.confirm(
        `Permanently delete “${project.name}”${taskNote}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await ledgerService.deleteProject(projectId);
      if (editingProjectId === projectId) resetProjectForm();
      if (taskProjectId === projectId) {
        setTaskName("");
        setTaskProjectId("");
        setEditingTaskId(null);
      }
      pushToast("success", "Project permanently deleted.");
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Organization"
        title="Projects & tasks"
        description="Each project freezes its rate, currency, and timezone into every new work session."
        actions={
          <Button
            disabled={activeClients.length === 0}
            onClick={showForm ? resetProjectForm : beginCreateProject}
          >
            <Plus size={17} /> New project
          </Button>
        }
      />
      {activeClients.length === 0 ? (
        <section className="inline-alert inline-alert--warning">
          <span>Create an active client before creating a project.</span>
          <Link to="/clients">Go to clients</Link>
        </section>
      ) : null}
      {showForm ? (
        <section className="panel form-panel">
          <header className="panel__header">
            <div>
              <h2>{editingProjectId ? "Edit project" : "Create project"}</h2>
              <p>The rate and timezone become historical snapshots on work.</p>
            </div>
          </header>
          <form onSubmit={submit} className="stack-lg">
            <div className="form-grid form-grid--2">
              <Field label="Client">
                <select
                  value={clientId}
                  onChange={(event) => {
                    setClientId(event.target.value);
                    const client = snapshot.clients.find(
                      (item) => item.id === event.target.value,
                    );
                    if (client) setCurrency(client.defaultCurrency);
                  }}
                >
                  {activeClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Project name">
                <input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Website redesign"
                />
              </Field>
              <Field label="Hourly rate">
                <input
                  required
                  inputMode="decimal"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                />
              </Field>
              <Field label="Currency">
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
              <Field
                label="Project timezone"
                hint="IANA timezone, used to keep work dates stable."
              >
                <input
                  required
                  value={timeZone}
                  onChange={(event) => setTimeZone(event.target.value)}
                  placeholder="Africa/Cairo"
                />
              </Field>
              <Field label="Description" hint="Optional">
                <input
                  maxLength={120}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
            </div>
            {error ? (
              <div className="inline-alert inline-alert--error">{error}</div>
            ) : null}
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={resetProjectForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : editingProjectId
                    ? "Save changes"
                    : "Create project"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}
      {!showForm && error ? (
        <div className="inline-alert inline-alert--error">{error}</div>
      ) : null}
      {snapshot.projects.length > 0 ? (
        <section className="project-cards">
          {snapshot.projects.map((project) => {
            const client = snapshot.clients.find(
              (item) => item.id === project.clientId,
            );
            const tasks = snapshot.tasks.filter(
              (task) => task.projectId === project.id,
            );
            const sessions = snapshot.sessions.filter(
              (session) =>
                session.projectId === project.id && session.deletedAt === null,
            );
            return (
              <article className="project-card" key={project.id}>
                <header className="project-card__header">
                  <div className="entity-card__icon">
                    <BriefcaseBusiness size={22} />
                  </div>
                  <div>
                    <span>{client?.displayName ?? "Unknown client"}</span>
                    <h2>{project.name}</h2>
                  </div>
                  <Badge
                    tone={project.status === "active" ? "green" : "neutral"}
                  >
                    {project.status}
                  </Badge>
                </header>
                <div className="project-card__facts">
                  <div>
                    <span>Hourly rate</span>
                    <strong>
                      {formatMoney(
                        project.hourlyRateMinor,
                        project.currency,
                        snapshot.settings.locale,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Timezone</span>
                    <strong>{project.timeZone}</strong>
                  </div>
                  <div>
                    <span>Work sessions</span>
                    <strong>{sessions.length}</strong>
                  </div>
                </div>
                <div className="task-list">
                  <div className="task-list__title">
                    <span>
                      <ListTodo size={16} /> Tasks
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        taskProjectId === project.id && !editingTaskId
                          ? setTaskProjectId("")
                          : (setTaskProjectId(project.id),
                            setEditingTaskId(null),
                            setTaskName(""))
                      }
                    >
                      <Plus size={15} /> Add
                    </button>
                  </div>
                  {tasks.length > 0 ? (
                    tasks.map((task) => (
                      <div className="task-row" key={task.id}>
                        <span>
                          <CheckCircle2 size={15} /> {task.name}
                        </span>
                        <div className="task-row__actions">
                          <Badge
                            tone={task.status === "active" ? "blue" : "neutral"}
                          >
                            {task.status}
                          </Badge>
                          {task.status === "active" ? (
                            <>
                              <button
                                type="button"
                                className="icon-button icon-button--small"
                                aria-label={`Edit ${task.name}`}
                                onClick={() => editTask(task.id)}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-button icon-button--small"
                                aria-label={`Archive ${task.name}`}
                                onClick={() =>
                                  void changeTaskArchived(task.id, true)
                                }
                              >
                                <Archive size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="icon-button icon-button--small"
                              aria-label={`Restore ${task.name}`}
                              onClick={() =>
                                void changeTaskArchived(task.id, false)
                              }
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="icon-button icon-button--small icon-button--danger"
                            aria-label={`Delete ${task.name} permanently`}
                            title="Permanently delete unused task"
                            onClick={() => void deleteTask(task.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="task-list__empty">No reusable tasks yet.</p>
                  )}
                  {taskProjectId === project.id ? (
                    <form className="inline-form" onSubmit={createTask}>
                      <input
                        autoFocus
                        required
                        maxLength={120}
                        value={taskName}
                        onChange={(event) => setTaskName(event.target.value)}
                        placeholder="Task name"
                      />
                      <Button size="sm" type="submit">
                        {editingTaskId ? "Save task" : "Add task"}
                      </Button>
                    </form>
                  ) : null}
                </div>
                <footer className="project-card__footer">
                  {project.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => beginEditProject(project.id)}
                    >
                      <Pencil size={15} /> Edit project
                    </Button>
                  ) : null}
                  {project.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void archiveProject(project.id, true)}
                    >
                      <Archive size={15} /> Archive project
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void archiveProject(project.id, false)}
                    >
                      <RotateCcw size={15} /> Restore project
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void deleteProject(project.id)}
                  >
                    <Trash2 size={15} /> Delete project
                  </Button>
                </footer>
              </article>
            );
          })}
        </section>
      ) : !showForm ? (
        <EmptyState
          title="No projects yet"
          description="Projects connect a client to a rate, currency, timezone, and future work."
          action={
            activeClients.length > 0 ? (
              <Button onClick={beginCreateProject}>
                <Plus size={16} /> Create project
              </Button>
            ) : (
              <Link className="button button--primary button--md" to="/clients">
                Create client first
              </Link>
            )
          }
        />
      ) : null}
    </div>
  );
}
