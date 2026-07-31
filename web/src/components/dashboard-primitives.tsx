import type { ReactNode } from "react";

export function InlineLoading({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
      {label}
    </p>
  );
}

export function ActionableEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

export function CopyFeedbackLabel({
  copied,
  idle,
}: {
  copied: boolean;
  idle: string;
}) {
  return (
    <>
      <span aria-hidden="true" className="grid">
        <span className={`col-start-1 row-start-1 ${copied ? "invisible" : ""}`}>{idle}</span>
        <span className={`col-start-1 row-start-1 ${copied ? "" : "invisible"}`}>Copied</span>
      </span>
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : idle}</span>
    </>
  );
}
