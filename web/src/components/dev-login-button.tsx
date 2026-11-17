import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInWithDevAccount } from "@/lib/api";
import { DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD } from "../../../src/core/dev-login";

/** Rendered only in the Vite dev build; signs in as the seeded demo host. */
export function DevLoginButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithDevAccount(DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD);
      window.location.href = "/app";
    } catch {
      setError("Dev login is off or not seeded. See docs/DEV-LOGIN.md.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-dashed border-border pt-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button variant="outline" className="h-11 rounded-xl" onClick={() => void signIn()} disabled={busy} aria-busy={busy}>
        <FlaskConical className="h-4 w-4" />
        {busy ? "Signing in…" : `Dev login as ${DEV_LOGIN_EMAIL}`}
      </Button>
    </div>
  );
}
