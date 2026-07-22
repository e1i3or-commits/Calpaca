import { StrictMode } from "react";
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
import { SignInPage } from "@/pages/sign-in-page";
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
    <div className="mx-auto max-w-2xl px-4 py-24 text-center text-sm text-muted-foreground">
      Nothing here — booking links look like /book/&lt;event-type&gt;.
    </div>
  ),
});

const bookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/book/$slug",
  component: function BookRoute() {
    const { slug } = bookRoute.useParams();
    return <BookingPage slug={slug} />;
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
