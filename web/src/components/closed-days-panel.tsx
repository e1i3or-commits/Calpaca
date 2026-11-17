import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineLoading } from "@/components/dashboard-primitives";
import { addClosedRange, deleteClosedRange, getClosedDays, setObservedUsHolidays, type ClosedDaysConfig } from "@/lib/api";
import { errorText } from "@/lib/error-text";

function rangeLabel(startDate: string, endDate: string): string {
  const format = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return startDate === endDate ? format(startDate) : `${format(startDate)} to ${format(endDate)}`;
}

/**
 * Days the whole workspace is closed: the US holidays it observes and its own
 * dates. Nobody can be booked on them, in their own timezone, and Tyger reads
 * the same list for its meetings.
 */
export function ClosedDaysPanel() {
  const [config, setConfig] = useState<ClosedDaysConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: "", startDate: "", endDate: "" });

  const reload = useCallback(() => {
    getClosedDays().then(setConfig).catch((e: unknown) => setError(errorText(e)));
  }, []);
  useEffect(() => reload(), [reload]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string, on: boolean) => {
    if (!config) return;
    const observed = config.usHolidays.filter((h) => (h.key === key ? on : h.observed)).map((h) => h.key);
    void run(() => setObservedUsHolidays(observed));
  };

  const add = () => {
    const range = { name: draft.name.trim(), startDate: draft.startDate, endDate: draft.endDate || draft.startDate };
    void run(async () => {
      await addClosedRange(range);
      setDraft({ name: "", startDate: "", endDate: "" });
    });
  };

  const manage = config?.canManage ?? false;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1.5">
        <CardTitle className="text-xl">Closed days</CardTitle>
        <CardDescription>
          Nobody in the workspace can be booked on these days. They apply on top of each person's own schedule.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!config ? (
          <InlineLoading label="Loading closed days…" />
        ) : (
          <>
            <fieldset disabled={!manage || busy} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">US holidays</legend>
              <p className="text-xs text-muted-foreground">A holiday on a Saturday is observed on Friday, and one on a Sunday on Monday.</p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {config.usHolidays.map((holiday) => (
                  <label key={holiday.key} className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-muted">
                    <input type="checkbox" className="h-4 w-4" checked={holiday.observed} onChange={(e) => toggle(holiday.key, e.target.checked)} />
                    {holiday.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <p className="text-sm font-medium">Company dates</p>
              {config.ranges.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No company dates yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {config.ranges.map((range) => (
                    <li key={range.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <span className="flex-1">
                        <span className="font-medium">{range.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{rangeLabel(range.startDate, range.endDate)}</span>
                      </span>
                      {manage && (
                        <Button variant="ghost" size="sm" aria-label={`Remove ${range.name}`} disabled={busy} onClick={() => void run(() => deleteClosedRange(range.id))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {manage && (
                <form
                  className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    add();
                  }}
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="closed-name">Name</Label>
                    <Input id="closed-name" required maxLength={120} placeholder="TourScale Conference" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="closed-from">From</Label>
                    <Input
                      id="closed-from"
                      type="date"
                      required
                      value={draft.startDate}
                      onChange={(e) => setDraft({ ...draft, startDate: e.target.value, endDate: draft.endDate && draft.endDate < e.target.value ? e.target.value : draft.endDate })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="closed-to">Through</Label>
                    <Input id="closed-to" type="date" min={draft.startDate} value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
                  </div>
                  <Button type="submit" size="sm" disabled={busy}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add
                  </Button>
                </form>
              )}
              {!manage && <p className="text-xs text-muted-foreground">Only a workspace owner or admin can change closed days.</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
