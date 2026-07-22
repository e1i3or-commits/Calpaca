import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { DirectoryUser } from "@/lib/api";
import { Input } from "@/components/ui/input";

// Multi-select over the /api/me/users directory: chips for the selection,
// a search box that filters the remaining candidates.
export function PeoplePicker({
  users,
  selected,
  onChange,
  max,
  hideSelected = false,
}: {
  users: DirectoryUser[];
  selected: string[];
  onChange: (userIds: string[]) => void;
  max?: number;
  /** For callers that render the selection themselves (e.g. a member list). */
  hideSelected?: boolean;
}) {
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        !selected.includes(u.id) &&
        (q === "" || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  }, [users, selected, query]);

  const atCapacity = max !== undefined && selected.length >= max;

  return (
    <div className="flex flex-col gap-2">
      {!hideSelected && selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const user = byId.get(id);
            return (
              <li
                key={id}
                className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs"
              >
                {user?.name ?? id}
                <button
                  type="button"
                  aria-label={`Remove ${user?.name ?? id}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onChange(selected.filter((s) => s !== id))}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Input
        placeholder={atCapacity ? "Selection full" : "Search people…"}
        value={query}
        disabled={atCapacity}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!atCapacity && query.trim() !== "" && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
          {candidates.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">No matches.</li>
          )}
          {candidates.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange([...selected, u.id]);
                  setQuery("");
                }}
              >
                <span>{u.name}</span>
                <span className="text-xs text-muted-foreground">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
