import { useEffect, useState } from "react";
import { ArrowRight, Clock } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicBookingPage, type PublicBookingPage as BookingPageData } from "@/lib/api";

function durationLabel(eventType: BookingPageData["eventTypes"][number]): string {
  const durations = eventType.selectableDurations.length
    ? eventType.selectableDurations
    : [eventType.durationMinutes];
  return durations.map((minutes) => minutes < 60
    ? `${minutes} min`
    : minutes % 60 === 0
      ? `${minutes / 60} hr`
      : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`).join(" · ");
}

export function PublicBookingPage({ workspaceSlug }: { workspaceSlug?: string }) {
  const [page, setPage] = useState<BookingPageData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getPublicBookingPage(workspaceSlug).then(setPage, () => setFailed(true));
  }, [workspaceSlug]);

  if (failed) {
    return <main className="mx-auto max-w-3xl px-5 py-20 text-center">This booking page is unavailable.</main>;
  }
  if (!page) {
    return <main className="mx-auto max-w-3xl px-5 py-20 text-center text-muted-foreground">Loading…</main>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center gap-2.5 px-5 py-7 sm:px-8">
        <BrandMark />
        <span className="font-semibold tracking-[-0.02em]">Calpaca</span>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-8 sm:px-8 sm:pt-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Schedule a meeting</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">{page.name}</h1>
          <p className="mt-4 text-muted-foreground">Choose the conversation that fits what you need.</p>
        </div>
        {page.eventTypes.length ? (
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {page.eventTypes.map((eventType) => {
              const href = workspaceSlug
                ? `/book/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(eventType.slug)}`
                : `/book/${encodeURIComponent(eventType.slug)}`;
              return (
                <a key={eventType.slug} href={href} className="group block">
                  <Card className="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <CardTitle className="text-lg">{eventType.title}</CardTitle>
                        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                      {eventType.description && (
                        <CardDescription className="line-clamp-3 leading-6">
                          {eventType.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" /> {durationLabel(eventType)}
                      </span>
                    </CardContent>
                  </Card>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="mt-12 text-center text-sm text-muted-foreground">No meetings are available yet.</p>
        )}
      </main>
    </div>
  );
}
