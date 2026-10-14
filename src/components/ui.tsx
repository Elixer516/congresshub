import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "text-text hover:bg-surface-2",
};

export function Button({
  variant = "primary",
  className,
  busy,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      )}
    >
      {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}

export const inputClass =
  "block w-full min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text placeholder:text-muted/70 aria-[invalid=true]:border-danger";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required ? <span className="text-danger"> *</span> : <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(inputClass, className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(inputClass, "pr-8", className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(inputClass, "min-h-24 py-2", className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-border bg-surface p-4 sm:p-6", className)}>{children}</div>;
}

type Tone = "info" | "ok" | "warn" | "danger";
const tones: Record<Tone, string> = {
  info: "bg-primary-soft text-text border-primary/30",
  ok: "bg-ok-soft text-text border-ok/40",
  warn: "bg-warn-soft text-text border-warn/40",
  danger: "bg-danger-soft text-text border-danger/40",
};

export function Alert({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg border px-3 py-2.5 text-sm", tones[tone], className)}>
      {children}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  pending: "bg-primary-soft text-primary",
  incomplete: "bg-warn-soft text-warn",
  approved: "bg-ok-soft text-ok",
  rejected: "bg-danger-soft text-danger",
  active: "bg-ok-soft text-ok",
  inactive: "bg-surface-2 text-muted",
  suspended: "bg-danger-soft text-danger",
  scheduled: "bg-primary-soft text-primary",
  open: "bg-ok-soft text-ok",
  closed: "bg-surface-2 text-muted",
};

export function Badge({ status, children }: { status: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTones[status] ?? "bg-surface-2 text-muted")}>
      {children}
    </span>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
