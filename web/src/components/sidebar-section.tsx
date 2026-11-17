import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A collapsible sidebar group. In the icon-only rail every group stays open,
 * since there is no header to click.
 */
export function SidebarSection({
  label,
  open,
  collapsed,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();

  if (collapsed) {
    return (
      <div>
        <p className="sr-only">{label}</p>
        <div className="space-y-1">{children}</div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-lg px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        {label}
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div id={panelId} hidden={!open} className="space-y-1 pb-2 pt-1">
        {children}
      </div>
    </div>
  );
}
