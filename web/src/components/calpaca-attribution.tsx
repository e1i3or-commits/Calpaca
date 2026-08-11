/** Attribution on booking pages served by plans without white labeling.
 *
 * Deliberately additive: a host on any plan can still put their own logo at the
 * top of the page, so this adds a small credit rather than taking their
 * branding away. Rendering is driven by the workspace's resolved plan, so a
 * lapsed trial restores attribution on its own with nothing to sweep. */
export function CalpacaAttribution({ whitelabel }: { whitelabel?: boolean }) {
  if (whitelabel !== false) return null;
  return (
    <p className="pb-8 pt-2 text-center text-xs text-muted-foreground">
      Powered by{" "}
      <a
        href="https://calpaca.io"
        target="_blank"
        rel="noreferrer"
        className="font-medium underline-offset-2 hover:underline"
      >
        Calpaca
      </a>
    </p>
  );
}
