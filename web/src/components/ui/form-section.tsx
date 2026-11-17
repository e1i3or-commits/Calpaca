import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A titled group of fields or choices: title, optional hint and action, then the content. */
export function FormSection({
  title,
  description,
  action,
  disabled,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const descriptionId = useId();
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={description ? descriptionId : undefined}
      className={cn("min-w-0", className)}
    >
      {/* A legend names its fieldset only as the first child, so the visible title is separate. */}
      <legend className="sr-only">{title}</legend>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p aria-hidden className="text-sm font-semibold">{title}</p>
          {description && <p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0 *:w-full sm:*:w-auto">{action}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

/** Choices (checkboxes, radios) as rows in one bordered box; pass grid classes for columns. */
export function ChoiceList({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid rounded-lg border border-border p-1", className)}>{children}</div>;
}

export const choiceRowClass = "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted lg:min-h-10";
