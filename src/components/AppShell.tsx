import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChevronRight,
  Clock3,
  FileCheck2,
  Gauge,
  Menu,
  PanelLeftClose,
  Plus,
  ReceiptText,
  Settings2,
  ShieldCheck,
  TimerReset,
  WalletCards,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useUiStore } from "@/app/store";
import { GlobalDialogs } from "@/features/dialogs/GlobalDialogs";
import { Button, LoadingScreen, ToastRegion } from "@/components/ui";
import { formatTimer } from "@/domain/format";
import type { LedgerSnapshot } from "@/domain/models";
import { useLedger, useNow } from "@/hooks/useLedger";
import { useWebMcp } from "@/hooks/useWebMcp";

const navGroups = [
  {
    label: "Workspace",
    links: [
      { to: "/", label: "Dashboard", icon: Gauge },
      { to: "/timer", label: "Timer", icon: Clock3 },
      { to: "/work-log", label: "Work Log", icon: CalendarClock },
      { to: "/timesheet", label: "Timesheet", icon: FileCheck2 },
      { to: "/proof", label: "Proof of Work", icon: ShieldCheck },
    ],
  },
  {
    label: "Organization",
    links: [
      { to: "/clients", label: "Clients", icon: Building2 },
      { to: "/projects", label: "Projects", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Finance",
    links: [
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/earnings", label: "Earnings", icon: WalletCards },
      { to: "/invoices", label: "Invoices", icon: ReceiptText },
    ],
  },
];

function activeElapsed(snapshot: LedgerSnapshot, now: number): number {
  const active = snapshot.sessions.find((session) =>
    ["running", "paused"].includes(session.status),
  );
  if (!active) return 0;
  const open = snapshot.segments.find(
    (segment) => segment.sessionId === active.id && segment.endedAt === null,
  );
  return (
    active.durationSeconds +
    (open
      ? Math.max(
          0,
          Math.floor((now - new Date(open.startedAt).getTime()) / 1000),
        )
      : 0)
  );
}

function Sidebar({
  snapshot,
}: {
  snapshot: LedgerSnapshot;
}): React.JSX.Element {
  const open = useUiStore((state) => state.sidebarOpen);
  const setOpen = useUiStore((state) => state.setSidebarOpen);
  const location = useLocation();
  return (
    <>
      {open ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <div className="brand-mark">WL</div>
          <div>
            <strong>WorkLedger</strong>
            <span>Local work records</span>
          </div>
          <button
            type="button"
            className="sidebar__mobile-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar__nav" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.links.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === "/"}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? "nav-link--active" : ""}`
                    }
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{link.label}</span>
                    <ChevronRight size={15} className="nav-link__arrow" />
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar__footer">
          <NavLink
            to="/settings"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `nav-link ${isActive ? "nav-link--active" : ""}`
            }
          >
            <Settings2 size={18} strokeWidth={1.8} />
            <span>Settings</span>
            <ChevronRight size={15} className="nav-link__arrow" />
          </NavLink>
          <div className="local-status">
            <span className="local-status__dot" />
            <div>
              <strong>Saved on this device</strong>
              <span>
                {snapshot.profile
                  ? snapshot.profile.displayName
                  : "Setup required"}
              </span>
            </div>
          </div>
        </div>
        <span className="sr-only" aria-live="polite">
          Current route: {location.pathname}
        </span>
      </aside>
    </>
  );
}

function ActiveTimerStrip({
  snapshot,
}: {
  snapshot: LedgerSnapshot;
}): React.JSX.Element | null {
  const now = useNow();
  const active = snapshot.sessions.find((session) =>
    ["running", "paused"].includes(session.status),
  );
  if (!active) return null;
  const project = snapshot.projects.find(
    (item) => item.id === active.projectId,
  );
  return (
    <NavLink to="/timer" className="active-timer-strip">
      <span
        className={`pulse-dot ${active.status === "paused" ? "pulse-dot--paused" : ""}`}
      />
      <span className="active-timer-strip__label">
        <strong>{active.status === "running" ? "Tracking" : "Paused"}</strong>
        <span>{project?.name ?? "Project"}</span>
      </span>
      <span className="active-timer-strip__time">
        {formatTimer(activeElapsed(snapshot, now))}
      </span>
      <ChevronRight size={18} />
    </NavLink>
  );
}

export function AppShell(): React.JSX.Element {
  const { snapshot, loading, error } = useLedger();
  useWebMcp();
  const setOpen = useUiStore((state) => state.setSidebarOpen);
  const openDialog = useUiStore((state) => state.openDialog);
  if (loading) return <LoadingScreen />;
  if (error || !snapshot) {
    return (
      <main className="fatal-state">
        <PanelLeftClose size={28} />
        <h1>Your local ledger could not be opened</h1>
        <p>{error ?? "Reload the page before making changes."}</p>
        <Button onClick={() => window.location.reload()}>
          Reload WorkLedger
        </Button>
      </main>
    );
  }
  return (
    <div className="app-shell">
      <Sidebar snapshot={snapshot} />
      <div className="app-frame">
        <header className="mobile-header">
          <button
            type="button"
            className="icon-button"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="mobile-header__brand">
            <div className="brand-mark brand-mark--small">WL</div>
            <strong>WorkLedger</strong>
          </div>
          <button
            type="button"
            className="icon-button icon-button--accent"
            aria-label="Add previous work"
            onClick={() => openDialog("previous-work")}
          >
            <Plus size={21} />
          </button>
        </header>
        <div className="desktop-commandbar">
          <div className="privacy-pill">
            <ShieldCheck size={16} />
            <span>Private · local-first</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openDialog("previous-work")}
          >
            <Plus size={16} />
            Add previous work
          </Button>
        </div>
        <ActiveTimerStrip snapshot={snapshot} />
        <main className="main-content">
          <Outlet context={snapshot} />
        </main>
      </div>
      <GlobalDialogs snapshot={snapshot} />
      <ToastRegion />
      <NavLink to="/timer" className="mobile-timer-fab" aria-label="Open timer">
        <TimerReset size={22} />
      </NavLink>
    </div>
  );
}
