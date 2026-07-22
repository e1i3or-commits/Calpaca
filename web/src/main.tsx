import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { BookingPage } from "@/pages/booking-page";
import { CancelPage } from "@/pages/cancel-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { ReschedulePage } from "@/pages/reschedule-page";
import { RoutingFormPage } from "@/pages/routing-form-page";
import { SignInPage } from "@/pages/sign-in-page";
import type { RoutingAnswers } from "@/lib/api";
import "./styles.css";

// Code-based routes: four pages don't justify the file-router codegen step.
const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">TourScale Scheduling</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invitees book through links like /book/&lt;event-type&gt;.
        </p>
      </div>
      <Link
        to="/sign-in"
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
      >
        Host sign in
      </Link>
    </div>
  ),
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

const routingFormRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/r/$slug",
  component: function RoutingFormRoute() {
    const { slug } = routingFormRoute.useParams();
    return <RoutingFormPage slug={slug} />;
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

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    bookRoute,
    routingFormRoute,
    rescheduleRoute,
    cancelRoute,
    signInRoute,
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
