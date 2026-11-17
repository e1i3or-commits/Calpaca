import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { ChoiceList, FormSection, choiceRowClass } from "@/components/ui/form-section";
import { InlineLoading } from "@/components/dashboard-primitives";
import { addClosedRange, deleteClosedRange, getClosedDays, setObservedUsHolidays, type ClosedDaysConfig } from "@/lib/api";
import { errorText } from "@/lib/error-text";

const EMPTY_DRAFT = { name: "", startDate: "", endDate: "" };

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
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);

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

  const closeSheet = () => {
    setAdding(false);
    setDraft(EMPTY_DRAFT);
  };

  const add = () => {
    const range = { name: draft.name.trim(), startDate: draft.startDate, endDate: draft.endDate || draft.startDate };
    void run(async () => {
      await addClosedRange(range);
      closeSheet();
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
      <CardContent className="flex flex-col gap-8">
        {error && !adding && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!config ? (
          <InlineLoading label="Loading closed days…" />
        ) : (
          <>
            <FormSection
              title="US holidays"
              description="A holiday on a Saturday is observed on Friday, and one on a Sunday on Monday."
              disabled={!manage || busy}
            >
              <ChoiceList className="sm:grid-cols-2">
                {config.usHolidays.map((holiday) => (
                  <label key={holiday.key} className={choiceRowClass}>
                    <input type="checkbox" checked={holiday.observed} onChange={(e) => toggle(holiday.key, e.target.checked)} />
                    {holiday.name}
                  </label>
                ))}
              </ChoiceList>
            </FormSection>

            <FormSection
              title="Company dates"
              description={manage ? "Your own closures, such as a conference or an office move." : "Only a workspace owner or admin can change closed days."}
              action={manage && (
                <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add dates
                </Button>
              )}
            >
              {config.ranges.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No company dates yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {config.ranges.map((range) => (
                    <li key={range.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
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
            </FormSection>

            <Sheet
              open={adding}
              title="Add company dates"
              description="Nobody in the workspace can be booked from the first day through the last."
              onClose={closeSheet}
              footer={<>
                <Button variant="outline" onClick={closeSheet}>Cancel</Button>
                <Button type="submit" form="closed-range-form" disabled={busy || !draft.name.trim() || !draft.startDate}>
                  Add dates
                </Button>
              </>}
            >
              {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
              <form
                id="closed-range-form"
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  add();
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="closed-name">Name</Label>
                  <Input id="closed-name" required maxLength={120} placeholder="TourScale Conference" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    <p className="text-xs text-muted-foreground">Leave empty for a single day.</p>
                  </div>
                </div>
              </form>
            </Sheet>
          </>
        )}
      </CardContent>
    </Card>
  );
}
