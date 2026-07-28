import { useEffect, useState } from "react";
import { ArrowRight, Clock } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { AlpacaLoader } from "@/components/alpaca-loader";
import { getPublicBookingPage, type PublicBookingPage as BookingPageData } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { hostLocalTime, timezoneCityLabel } from "@/lib/time";

type EventTypeSummary = BookingPageData["eventTypes"][number];
type Host = NonNullable<BookingPageData["hosts"]>[number];

function durationLabel(eventType: EventTypeSummary): string {
  const durations = eventType.selectableDurations.length
    ? eventType.selectableDurations
    : [eventType.durationMinutes];
  return durations.map((minutes) => minutes < 60
    ? `${minutes} min`
    : minutes % 60 === 0
      ? `${minutes / 60} hr`
      : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`).join(" · ");
}

/** "Google Meet or phone" — how the meeting happens, which an invitee weighs
 * alongside its length. Absent on fixtures predating the field. */
function formatsLabel(eventType: EventTypeSummary): string | null {
  const formats = eventType.meetingFormats;
  if (!formats?.length) return null;
  return formats
    .map((format) => format === "google_meet" ? "Google Meet" : "phone")
    .join(" or ");
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "").join("");
}

/** Who the invitee is meeting. A single host gets a real portrait: this page is
 * often the first time a client sees a face, and the small stacked avatars used
 * on the event page read as participant chips rather than an introduction. */
function IdentityRail({ page, hosts }: { page: BookingPageData; hosts: readonly Host[] }) {
  const solo = hosts.length === 1 ? hosts[0] : undefined;
  // Several hosts usually means several zones, and one clock would be a lie.
  const sharedZone = new Set(hosts.map((host) => host.timezone)).size === 1
    ? hosts[0]?.timezone
    : undefined;
  const subtitle = solo
    ? solo.title
    : hosts.length > 1
      ? hosts.map((host) => host.name).join(", ")
      : null;

  return (
    <div className="min-w-0 lg:sticky lg:top-12 lg:self-start">
      <div className="flex items-center gap-4 lg:block">
        {solo
          ? solo.image
            ? (
                <img
                  src={solo.image}
                  alt={solo.name}
                  className="h-20 w-20 shrink-0 rounded-2xl border border-border object-cover lg:mb-6 lg:h-auto lg:w-full lg:aspect-square"
                />
              )
            : (
                <div
                  aria-hidden
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-xl font-medium text-muted-foreground lg:mb-6 lg:h-auto lg:w-full lg:aspect-square lg:text-5xl"
                >
                  {initials(solo.name)}
                </div>
              )
          : hosts.length > 1 && (
              <div className="flex shrink-0 -space-x-3 lg:mb-6">
                {hosts.slice(0, 4).map((host, index) => host.image ? (
                  <img
                    key={`${host.name}-${index}`}
                    src={host.image}
                    alt={host.name}
                    className="h-14 w-14 rounded-full border-2 border-background object-cover lg:h-16 lg:w-16"
                  />
                ) : (
                  <div
                    key={`${host.name}-${index}`}
                    aria-hidden
                    className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-background bg-muted text-sm font-medium text-muted-foreground lg:h-16 lg:w-16"
                  >
                    {initials(host.name)}
                  </div>
                ))}
              </div>
            )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.035em] lg:text-[2rem] lg:leading-[1.15]">
            {page.name}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-muted-foreground lg:text-base">{subtitle}</p>
          )}
        </div>
      </div>

      {page.description && (
        <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground lg:mt-6">
          {page.description}
        </p>
      )}

      {sharedZone && (
        <p className="mt-6 text-xs text-muted-foreground">
          {solo
            ? `It is ${hostLocalTime(sharedZone)} where I am, in ${timezoneCityLabel(sharedZone)}.`
            : `It is ${hostLocalTime(sharedZone)} for the team, in ${timezoneCityLabel(sharedZone)}.`}
        </p>
      )}
    </div>
  );
}

export function PublicBookingPage({
  workspaceSlug,
  pageSlug,
}: {
  workspaceSlug?: string;
  pageSlug?: string;
}) {
  const [page, setPage] = useState<BookingPageData | null>(null);
  const [failed, setFailed] = useState(false);
  // Re-render so the host's local time does not go stale on a page left open.
  const [, setTick] = useState(0);

  useEffect(() => {
    getPublicBookingPage(workspaceSlug, pageSlug).then(setPage, () => setFailed(true));
  }, [workspaceSlug, pageSlug]);
  useTheme(page?.theme);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (failed) {
    return <main className="mx-auto max-w-3xl px-5 py-20 text-center">This booking page is unavailable.</main>;
  }
  if (!page) {
    return <AlpacaLoader label="Finding the right meetings" fullPage />;
  }

  const hosts = page.hosts ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center gap-2.5 px-5 py-7 sm:px-8">
        {page.logoUrl
          ? <img src={page.logoUrl} alt="" className="max-h-9 max-w-44 object-contain" />
          : <><BrandMark /><span className="font-semibold tracking-[-0.02em]">Calpaca</span></>}
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-4 sm:px-8 sm:pt-8">
        {/* min-w-0 on both children: grid items default to min-width:auto and
            would refuse to shrink below min-content, pushing the page wider
            than a phone viewport. */}
        <div className="grid gap-10 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-16">
          <IdentityRail page={page} hosts={hosts} />

          <section className="min-w-0">
            <h2 className="text-sm font-medium text-primary">Schedule a meeting</h2>
            {page.eventTypes.length ? (
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {page.eventTypes.map((eventType) => {
                  const href = workspaceSlug
                    ? `/book/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(eventType.slug)}`
                    : `/book/${encodeURIComponent(eventType.slug)}`;
                  const formats = formatsLabel(eventType);
                  return (
                    <li key={eventType.slug}>
                      <a
                        href={href}
                        className="group flex min-h-11 items-start gap-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium transition-colors group-hover:text-primary">
                            {eventType.title}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {durationLabel(eventType)}
                            </span>
                            {formats && (
                              <>
                                <span aria-hidden>·</span>
                                <span>{formats}</span>
                              </>
                            )}
                          </span>
                          {eventType.description && (
                            <span className="mt-2 line-clamp-2 block max-w-prose text-sm leading-6 text-muted-foreground">
                              {eventType.description}
                            </span>
                          )}
                        </span>
                        <ArrowRight
                          className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
                          aria-hidden
                        />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-border p-6">
                <p className="font-medium">No meetings are available yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The organizer has not published any booking options. Ask them for a direct booking link.
                </p>
                <a href="/" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
                  Return to Calpaca
                </a>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
