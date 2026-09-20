import { Component, Suspense, lazy, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/AppShell";

const DashboardPage = lazy(async () => ({
  default: (await import("@/features/dashboard/DashboardPage")).DashboardPage,
}));
const ProofPage = lazy(async () => ({
  default: (await import("@/features/evidence/ProofPage")).ProofPage,
}));
const EarningsPage = lazy(async () => ({
  default: (await import("@/features/finance/EarningsPage")).EarningsPage,
}));
const ReportsPage = lazy(async () => ({
  default: (await import("@/features/finance/ReportsPage")).ReportsPage,
}));
const InvoicesPage = lazy(async () => ({
  default: (await import("@/features/invoices/InvoicesPage")).InvoicesPage,
}));
const ClientsPage = lazy(async () => ({
  default: (await import("@/features/organization/ClientsPage")).ClientsPage,
}));
const ProjectsPage = lazy(async () => ({
  default: (await import("@/features/organization/ProjectsPage")).ProjectsPage,
}));
const TimesheetPage = lazy(async () => ({
  default: (await import("@/features/sessions/TimesheetPage")).TimesheetPage,
}));
const WorkLogPage = lazy(async () => ({
  default: (await import("@/features/sessions/WorkLogPage")).WorkLogPage,
}));
const SettingsPage = lazy(async () => ({
  default: (await import("@/features/settings/SettingsPage")).SettingsPage,
}));
const TimerPage = lazy(async () => ({
  default: (await import("@/features/timer/TimerPage")).TimerPage,
}));

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    // No remote logging: local work records stay private.
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="fatal-state">
          <div className="brand-mark">WL</div>
          <h1>WorkLedger needs a fresh page load</h1>
          <p>Your local records were not changed by this display error.</p>
          <button
            className="button button--primary button--md"
            onClick={() => window.location.reload()}
          >
            Reload safely
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export function App(): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <HashRouter>
        <Suspense
          fallback={
            <main className="loading-screen" aria-busy="true">
              <div className="brand-mark">WL</div>
              <p>Opening your workspace…</p>
            </main>
          }
        >
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="timer" element={<TimerPage />} />
              <Route path="work-log" element={<WorkLogPage />} />
              <Route path="timesheet" element={<TimesheetPage />} />
              <Route path="proof" element={<ProofPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="earnings" element={<EarningsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </AppErrorBoundary>
  );
}
