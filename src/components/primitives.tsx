import React, { type ReactNode, useEffect, useRef } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Inbox,
  LoaderCircle,
  Package,
  RefreshCw,
  X,
} from "lucide-react";
export function Button({
  children,
  variant = "secondary",
  className = "",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button {...p} className={`button ${variant} ${className}`}>
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...p}
      title={label}
      aria-label={label}
      className={`icon-button ${p.className || ""}`}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function EmptyState({
  title = "هنوز چیزی اینجا نیست",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={30} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function LoadingCard() {
  return (
    <div
      className="loading-card"
      role="status"
      aria-label="در حال دریافت نتایج"
    >
      <div className="skeleton image" />
      <div className="skeleton line" />
      <div className="skeleton line short" />
    </div>
  );
}
export function PartialDataState({ children }: { children?: ReactNode }) {
  return (
    <p className="notice">
      <AlertCircle size={16} />
      {children || "بخشی از اطلاعات در دیتاست ثبت نشده است."}
    </p>
  );
}
export function RetryAction({ retry }: { retry: () => void }) {
  return (
    <Button onClick={retry}>
      <RefreshCw size={16} />
      تلاش دوباره
    </Button>
  );
}
export function DataUnavailable({ retry }: { retry?: () => void }) {
  return (
    <EmptyState
      title="سرویس داده در دسترس نیست"
      description="سرویس محلی داده را اجرا کنید؛ اطلاعات ساختگی جایگزین نمی‌شود."
      action={retry && <RetryAction retry={retry} />}
    />
  );
}
export function PermissionDenied({ children }: { children?: ReactNode }) {
  return (
    <PartialDataState>
      {children || "دسترسی داده نشد؛ از ورود دستی استفاده کنید."}
    </PartialDataState>
  );
}
export function OfflineFallback() {
  return (
    <PartialDataState>
      ارتباط شبکه قطع است؛ اطلاعات ذخیره‌شده همچنان قابل مشاهده است.
    </PartialDataState>
  );
}
export function NoRouteFound() {
  return (
    <PartialDataState>
      مسیریاب متصل نیست؛ فاصلهٔ مستقیم نمایش داده می‌شود و زمان رسیدن نامشخص
      است.
    </PartialDataState>
  );
}
export function UnknownUIBlock() {
  return (
    <PartialDataState>
      این بخش در نسخهٔ فعلی رابط پشتیبانی نمی‌شود.
    </PartialDataState>
  );
}
export function AgentProgress({ text }: { text: string }) {
  return (
    <div className="progress" role="status">
      <LoaderCircle size={15} className="spin" />
      {text}
    </div>
  );
}
export function ToolActivityTimeline({ items }: { items: string[] }) {
  return (
    <ol className="timeline">
      {items.map((v, i) => (
        <li key={i}>
          <Check size={14} />
          {v}
        </li>
      ))}
    </ol>
  );
}
export function ConnectionStatus({
  remote = false,
  online = true,
  connected = true,
  label,
}: {
  remote?: boolean;
  online?: boolean;
  connected?: boolean;
  label?: string;
}) {
  return (
    <Badge
      tone={
        !online || (remote && !connected)
          ? "warning"
          : remote
            ? "success"
            : "accent"
      }
    >
      <span className="status-dot" />
      {!online
        ? "آفلاین"
        : remote
          ? connected
            ? label || "سرویس دستیار"
            : "دستیار متصل نیست"
          : "جست‌وجوی محلی"}
    </Badge>
  );
}
export function ProductImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      src={src}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="image-placeholder">
      <Package size={40} />
      <span>تصویر در دسترس نیست</span>
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = old;
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`dialog ${wide ? "wide" : ""}`}
      >
        <header>
          <h2 id="dialog-title">{title}</h2>
          <IconButton label="بستن" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
export class ErrorBoundary extends React.Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <EmptyState
        title="نمایش این بخش انجام نشد"
        action={
          <Button onClick={() => window.location.reload()}>
            بارگذاری دوباره
            <ChevronLeft size={16} />
          </Button>
        }
      />
    ) : (
      this.props.children
    );
  }
}
