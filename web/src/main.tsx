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
import { DashboardPage } from "@/pages/dashboard-page";
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
  routeTree: rootRoute.addChildren([indexRoute, bookRoute, signInRoute, dashboardRoute]),
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
