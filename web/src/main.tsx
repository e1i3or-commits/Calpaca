import { StrictMode } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { BookingPage } from "@/pages/booking-page";
import { CancelPage } from "@/pages/cancel-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { ReschedulePage } from "@/pages/reschedule-page";
import { RoutingFormPage } from "@/pages/routing-form-page";
import { SignInPage } from "@/pages/sign-in-page";
import { PollPage } from "@/pages/poll-page";
import { SignupSheetPage } from "@/pages/signup-sheet-page";
import { PublicBookingPage } from "@/pages/public-booking-page";
import { OneOffOfferPage } from "@/pages/one-off-offer-page";
import { MarketingPage } from "@/pages/marketing-page";
import type { RoutingAnswers } from "@/lib/api";
import { BrandMark } from "@/components/brand-mark";
import { initializeAppearance } from "@/lib/appearance";
import "./styles.css";

initializeAppearance();

// Code-based routes: four pages don't justify the file-router codegen step.
const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  ),
});

function AppEntryPage() {
  return (
    <div data-organizer className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-lg font-semibold tracking-[-0.03em]">Calpaca</span>
        </div>
        <a
          href={window.location.hostname === "calpaca.io"
            ? "https://app.calpaca.io/sign-in"
            : "/sign-in"}
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Host sign in
        </a>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 md:grid-cols-[1.05fr_.95fr] md:pb-28 md:pt-24">
        <section>
          <p className="mb-5 inline-flex rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            Thoughtful scheduling for modern teams
          </p>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl">
            Make time feel a little more human.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
            Flexible booking pages, team availability, and calm organizer tools, all in one focused workspace.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={window.location.hostname === "calpaca.io"
                ? "https://app.calpaca.io/sign-in"
                : "/sign-in"}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              Open your workspace <ArrowRight className="h-4 w-4" />
            </a>
            <span className="text-sm text-muted-foreground">Sign in securely with Google</span>
          </div>
        </section>
        <section className="relative mx-auto w-full max-w-md" aria-label="Product preview">
          <div className="absolute -inset-10 -z-10 rounded-full bg-primary/8 blur-3xl" />
          <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_24px_70px_-35px_rgba(52,64,54,.38)] sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[.12em] text-muted-foreground">Up next</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-.02em]">Strategy session</h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-7 space-y-3">
              {["Today · 2:30 PM", "Tomorrow · 10:00 AM", "Friday · 11:45 AM"].map((time, index) => (
                <div key={time} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${index === 0 ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                  <span className="text-sm font-medium">{time}</span>
                  <span className="text-xs text-muted-foreground">{index === 0 ? "Best time" : "Available"}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
              <span className="h-9 w-9 rounded-full bg-muted" />
              <div>
                <p className="text-sm font-medium">Your schedule, clearly organized.</p>
                <p className="text-xs text-muted-foreground">Availability stays in sync.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function HomePage() {
  const hostname = window.location.hostname;
  const isMarketingSite =
    hostname === "calpaca.io"
    || hostname === "www.calpaca.io"
    || hostname === "localhost"
    || hostname === "127.0.0.1";
  return isMarketingSite ? <MarketingPage /> : <AppEntryPage />;
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

// Routing forms hand off ?answers= as JSON. The router's default search
// parser already JSON.parses object-looking values, so accept both shapes;
// malformed answers just book without them.
function parseAnswers(raw: unknown): RoutingAnswers | undefined {
  if (raw && typeof raw === "object") return raw as RoutingAnswers;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") return parsed as RoutingAnswers;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const bookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/book/$slug",
  validateSearch: (s: Record<string, unknown>): { answers?: RoutingAnswers } => {
    const answers = parseAnswers(s.answers);
    return answers ? { answers } : {};
  },
  component: function BookRoute() {
    const { slug } = bookRoute.useParams();
    const { answers } = bookRoute.useSearch();
    return <BookingPage slug={slug} routingAnswers={answers} />;
  },
});

const hostedBookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/book/$workspaceSlug/$slug",
  validateSearch: (s: Record<string, unknown>): { answers?: RoutingAnswers } => {
    const answers = parseAnswers(s.answers);
    return answers ? { answers } : {};
  },
  component: function HostedBookRoute() {
    const { workspaceSlug, slug } = hostedBookRoute.useParams();
    const { answers } = hostedBookRoute.useSearch();
    return (
      <BookingPage
        workspaceSlug={workspaceSlug}
        slug={slug}
        routingAnswers={answers}
      />
    );
  },
});

const bookingPageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/booking",
  component: () => <PublicBookingPage />,
});

const hostedBookingPageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/booking/$workspaceSlug",
  component: function HostedBookingPageRoute() {
    return <PublicBookingPage workspaceSlug={hostedBookingPageRoute.useParams().workspaceSlug} />;
  },
});

const customBookingPageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/booking/p/$pageSlug",
  component: function CustomBookingPageRoute() {
    return <PublicBookingPage pageSlug={customBookingPageRoute.useParams().pageSlug} />;
  },
});

const hostedCustomBookingPageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/booking/$workspaceSlug/p/$pageSlug",
  component: function HostedCustomBookingPageRoute() {
    const { workspaceSlug, pageSlug } = hostedCustomBookingPageRoute.useParams();
    return <PublicBookingPage workspaceSlug={workspaceSlug} pageSlug={pageSlug} />;
  },
});

const routingFormRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/r/$slug",
  component: function RoutingFormRoute() {
    const { slug } = routingFormRoute.useParams();
    return <RoutingFormPage slug={slug} />;
  },
});

const hostedRoutingFormRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/r/$workspaceSlug/$slug",
  component: function HostedRoutingFormRoute() {
    const { workspaceSlug, slug } = hostedRoutingFormRoute.useParams();
    return <RoutingFormPage workspaceSlug={workspaceSlug} slug={slug} />;
  },
});

// Both invite-email links carry their token as ?token=; an empty string
// falls through to the API's 400/403 handling rather than crashing the page.
const rescheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reschedule/$bookingId",
  validateSearch: (s: Record<string, unknown>) => ({ token: String(s.token ?? "") }),
  component: function RescheduleRoute() {
    const { bookingId } = rescheduleRoute.useParams();
    const { token } = rescheduleRoute.useSearch();
    return <ReschedulePage bookingId={bookingId} token={token} />;
  },
});

const cancelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cancel/$bookingId",
  validateSearch: (s: Record<string, unknown>) => ({ token: String(s.token ?? "") }),
  component: function CancelRoute() {
    const { bookingId } = cancelRoute.useParams();
    const { token } = cancelRoute.useSearch();
    return <CancelPage bookingId={bookingId} token={token} />;
  },
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: SignInPage,
});

const pollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/poll/$publicId",
  component: function PollRoute() {
    return <PollPage publicId={pollRoute.useParams().publicId} />;
  },
});

const oneOffOfferRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/offer/$publicId",
  component: function OneOffOfferRoute() {
    return <OneOffOfferPage publicId={oneOffOfferRoute.useParams().publicId} />;
  },
});

const signupSheetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup/$publicId",
  component: function SignupSheetRoute() {
    return <SignupSheetPage publicId={signupSheetRoute.useParams().publicId} />;
  },
});

const signupCancelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup/cancel/$token",
  component: function SignupCancelRoute() {
    return <SignupSheetPage cancelToken={signupCancelRoute.useParams().token} />;
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    hostedBookRoute,
    bookRoute,
    hostedBookingPageRoute,
    bookingPageRoute,
    hostedCustomBookingPageRoute,
    customBookingPageRoute,
    hostedRoutingFormRoute,
    routingFormRoute,
    rescheduleRoute,
    cancelRoute,
    signInRoute,
    pollRoute,
    oneOffOfferRoute,
    signupSheetRoute,
    signupCancelRoute,
    dashboardRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

requestAnimationFrame(() => {
  document.getElementById("calpaca-boot")?.remove();
});
