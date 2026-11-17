import { useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalBehavior } from "@/lib/use-modal-behavior";

const WIDTHS = {
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

/** The standard add/edit surface: a panel from the right, full screen on phones. */
export function Sheet({
  open,
  title,
  description,
  onClose,
  footer,
  size = "md",
  children,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalBehavior({ open, containerRef: panelRef, initialFocusRef: closeRef, onClose });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" tabIndex={-1} aria-label="Close" className="absolute inset-0 bg-foreground/25 dark:bg-black/60" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn("relative flex h-full w-full flex-col border-l border-border bg-background shadow-2xl", WIDTHS[size])}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
