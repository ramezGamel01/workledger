import { Clock3, ImageIcon, Pencil, ShieldPlus } from "lucide-react";

import { useUiStore } from "@/app/store";
import { Badge, Button } from "@/components/ui";
import {
  formatDuration,
  formatMoney,
  sessionAmountMinor,
} from "@/domain/format";
import type { LedgerSnapshot, WorkSession } from "@/domain/models";

export function SessionRow({
  session,
  snapshot,
  compact = false,
}: {
  session: WorkSession;
  snapshot: LedgerSnapshot;
  compact?: boolean;
}): React.JSX.Element {
  const openDialog = useUiStore((state) => state.openDialog);
  const project = snapshot.projects.find(
    (item) => item.id === session.projectId,
  );
  const client = snapshot.clients.find((item) => item.id === project?.clientId);
  const evidenceCount = snapshot.evidence.filter(
    (item) => item.sessionId === session.id && item.deletedAt === null,
  ).length;
  const amount = sessionAmountMinor(session);
  const sourceLabel =
    session.source === "tracked"
      ? "Tracked"
      : session.source === "manual_range"
        ? "Manual range"
        : "Manual duration";
  const range =
    session.startedAt && session.endedAt
      ? `${new Intl.DateTimeFormat(snapshot.settings.locale, {
          hour: "numeric",
          minute: "2-digit",
          timeZone: session.timeZone,
        }).format(new Date(session.startedAt))}–${new Intl.DateTimeFormat(
          snapshot.settings.locale,
          {
            hour: "numeric",
            minute: "2-digit",
            timeZone: session.timeZone,
          },
        ).format(new Date(session.endedAt))}`
      : "Duration only";
  return (
    <article className={`session-row ${compact ? "session-row--compact" : ""}`}>
      <div className="session-row__mark" aria-hidden="true" />
      <div className="session-row__main">
        <div className="session-row__topline">
          <strong>{session.description ?? "Details required"}</strong>
          <div className="session-row__badges">
            {session.detailStatus === "incomplete" ? (
              <Badge tone="amber">Incomplete</Badge>
            ) : null}
            <Badge tone={session.source === "tracked" ? "green" : "blue"}>
              {sourceLabel}
            </Badge>
          </div>
        </div>
        <div className="session-row__meta">
          <span>{project?.name ?? "Unknown project"}</span>
          {client ? <span>{client.displayName}</span> : null}
          {session.taskNameSnapshot ? (
            <span>{session.taskNameSnapshot}</span>
          ) : null}
          <span>{range}</span>
          {evidenceCount > 0 ? (
            <span>
              <ImageIcon size={14} /> {evidenceCount} proof
            </span>
          ) : null}
        </div>
      </div>
      <div className="session-row__numbers">
        <strong>{formatDuration(session.durationSeconds)}</strong>
        <span>
          {session.billable
            ? formatMoney(
                amount,
                session.currencySnapshot,
                snapshot.settings.locale,
              )
            : "Non-billable"}
        </span>
      </div>
      {!compact ? (
        <div className="session-row__actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDialog("add-evidence", session.id)}
            aria-label="Add evidence"
          >
            <ShieldPlus size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDialog("edit-session", session.id)}
            aria-label="Edit session"
          >
            <Pencil size={16} />
          </Button>
        </div>
      ) : (
        <Clock3 size={17} className="session-row__clock" />
      )}
    </article>
  );
}
