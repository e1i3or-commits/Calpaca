import { Hono } from "hono";

import { privateThemeStylesheet } from "../private-themes";

/**
 * Serves the deployment's private theme tokens as a stylesheet. index.html
 * links it unconditionally; an installation with no pack gets an empty file.
 * Public by design — the booking page is public, so its tokens are too.
 */
const router = new Hono();

router.get("/themes/private.css", (c) => {
  c.header("Content-Type", "text/css; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(privateThemeStylesheet());
});

export const themeRoutes = router;
