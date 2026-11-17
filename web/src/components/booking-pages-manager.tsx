import { useCallback, useEffect, useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createBookingPage,
  deleteBookingPage,
  listBookingPages,
  updateBookingPage,
  type AdminEventType,
  type BookingPageInput,
  type BookingPageRecord,
  type PresentationOption,
} from "@/lib/api";
import { errorText } from "@/lib/error-text";
import { slugify } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ChoiceList, FormSection, choiceRowClass } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ActionableEmptyState,
  CopyFeedbackLabel,
} from "@/components/dashboard-primitives";

const DEFAULT_BOOKING_PAGE: BookingPageInput = {
  slug: "",
  title: "",
  description: null,
  theme: "default",
  logoUrl: null,
  eventTypeIds: [],
};

export function BookingPagesManager({
  eventTypes,
  bookingBase,
  themes,
}: {
  eventTypes: AdminEventType[];
  bookingBase: string;
  themes: PresentationOption[];
}) {
  const [pages, setPages] = useState<BookingPageRecord[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; form: BookingPageInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const reload = useCallback(() => {
    void listBookingPages().then(({ bookingPages }) => setPages(bookingPages))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(reload, [reload]);

  const pageUrl = (slug: string) => bookingBase.includes("/book/")
    ? `${bookingBase.replace("/book/", "/booking/")}/p/${slug}`
    : `${bookingBase}/booking/p/${slug}`;

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      if (editing.id) await updateBookingPage(editing.id, editing.form);
      else await createBookingPage(editing.form);
      setEditing(null);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section className="mt-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Custom booking pages</h3>
          <p className="text-sm text-muted-foreground">Group selected event types on a themed public page.</p>
        </div>
        {!editing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setEditing({ id: null, form: DEFAULT_BOOKING_PAGE })}
          >
            <Plus className="mr-1 h-4 w-4" /> New page
          </Button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <Sheet
        open={editing !== null}
        title={editing?.id ? "Edit booking page" : "New booking page"}
        description="Group selected event types on a themed public page."
        onClose={() => setEditing(null)}
        footer={<>
          <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          <Button type="submit" form="booking-page-form" disabled={!editing?.form.title || !editing.form.slug || !editing.form.eventTypeIds.length}>
            Save page
          </Button>
        </>}
      >
        {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
        {editing && (
        <form
          id="booking-page-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-title">Title</Label>
            <Input
              id="page-title"
              value={editing.form.title}
              onChange={(event) => {
                const title = event.target.value;
                const derived = editing.form.slug === slugify(editing.form.title);
                setEditing({ ...editing, form: {
                  ...editing.form,
                  title,
                  slug: derived ? slugify(title) : editing.form.slug,
                } });
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-slug">Slug</Label>
            <Input
              id="page-slug"
              value={editing.form.slug}
              onChange={(event) => setEditing({
                ...editing,
                form: { ...editing.form, slug: event.target.value },
              })}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="page-description">Description</Label>
            <Textarea
              id="page-description"
              value={editing.form.description ?? ""}
              onChange={(event) => setEditing({
                ...editing,
                form: { ...editing.form, description: event.target.value || null },
              })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-theme">Theme</Label>
            <select
              id="page-theme"
              className="h-9 rounded-md border border-border bg-card px-3 text-sm"
              value={editing.form.theme}
              onChange={(event) => setEditing({
                ...editing,
                form: { ...editing.form, theme: event.target.value },
              })}
            >
              {themes.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-logo">Logo URL</Label>
            <Input
              id="page-logo"
              type="url"
              value={editing.form.logoUrl ?? ""}
              onChange={(event) => setEditing({
                ...editing,
                form: { ...editing.form, logoUrl: event.target.value || null },
              })}
            />
          </div>
          <FormSection title="Events to show" description="Invitees pick one of these on the page." className="sm:col-span-2">
            <ChoiceList>
            {eventTypes.map((eventType) => (
              <label key={eventType.id} className={choiceRowClass}>
                <input
                  type="checkbox"
                  checked={editing.form.eventTypeIds.includes(eventType.id)}
                  onChange={(event) => setEditing({
                    ...editing,
                    form: {
                      ...editing.form,
                      eventTypeIds: event.target.checked
                        ? [...editing.form.eventTypeIds, eventType.id]
                        : editing.form.eventTypeIds.filter((id) => id !== eventType.id),
                    },
                  })}
                />
                {eventType.title}
              </label>
            ))}
            </ChoiceList>
          </FormSection>
        </form>
        )}
      </Sheet>
      <ul className="mt-4 flex flex-col gap-2">
        {pages.map((page) => (
          <li key={page.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
            <span className="grow">
              <span className="font-medium">{page.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {page.eventTypeIds.length} event{page.eventTypeIds.length === 1 ? "" : "s"} · {page.theme}
              </span>
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => {
              void navigator.clipboard.writeText(pageUrl(page.slug)).then(() => {
                setCopied(page.id);
                setTimeout(() => setCopied(null), 1500);
              }).catch(() => setError("Could not copy the booking page link. Try again."));
            }}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              <CopyFeedbackLabel copied={copied === page.id} idle="Link" />
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing({
              id: page.id,
              form: {
                slug: page.slug,
                title: page.title,
                description: page.description,
                theme: page.theme,
                logoUrl: page.logoUrl,
                eventTypeIds: page.eventTypeIds,
              },
            })}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => {
              void deleteBookingPage(page.id).then(reload).catch((e: unknown) => setError(errorText(e)));
            }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
        {!pages.length && (
          <li>
            <ActionableEmptyState
              title="No custom booking pages yet"
              description="Combine selected event types into one public page for a client, service, or campaign."
              action={<Button type="button" size="sm" variant="outline" onClick={() => setEditing({ id: null, form: DEFAULT_BOOKING_PAGE })}><Plus className="h-4 w-4" /> Create a booking page</Button>}
            />
          </li>
        )}
      </ul>
    </section>
  );
}
