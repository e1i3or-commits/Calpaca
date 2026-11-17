import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens a list's filter sheet; shows how many filters are on. */
export function FilterButton({ activeCount, onClick }: { activeCount: number; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 shrink-0 gap-2 px-3 lg:h-11"
      aria-label={activeCount ? `Filters, ${activeCount} on` : "Filters"}
      onClick={onClick}
    >
      <SlidersHorizontal className="h-4 w-4" />
      <span className="hidden sm:inline">Filters</span>
      {activeCount > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {activeCount}
        </span>
      )}
    </Button>
  );
}
