import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { AlertCircle, CheckCircle2, Inbox, Info, X } from "lucide-react";

import { useUiStore } from "@/app/store";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}): React.JSX.Element {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
  children: ReactNode;
}): React.JSX.Element {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : null}
      {!error && hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}): React.JSX.Element {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        <Inbox size={22} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}): React.JSX.Element | null {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.classList.add("modal-open");
    window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.classList.remove("modal-open");
      previous?.focus();
    };
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? "modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: ReactNode;
}): React.JSX.Element {
  return (
    <article className="metric-card">
      <div className="metric-card__top">
        <span>{label}</span>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function ToastRegion(): React.JSX.Element {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon =
          toast.tone === "success"
            ? CheckCircle2
            : toast.tone === "error"
              ? AlertCircle
              : Info;
        return (
          <div
            key={toast.id}
            className={`toast toast--${toast.tone}`}
            role="status"
          >
            <Icon size={18} />
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function LoadingScreen(): React.JSX.Element {
  return (
    <main className="loading-screen" aria-busy="true">
      <div className="brand-mark">WL</div>
      <p>Opening your local ledger…</p>
    </main>
  );
}
