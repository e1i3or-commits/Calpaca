import { useState } from "react";
import { signInWithGoogle } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Replaces the temporary /dev/sign-in HTML page: the sign-in POST must
// originate in the browser so the OAuth state cookie is set where the
// callback will be validated.
export function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await signInWithGoogle("/dashboard");
    } catch {
      setError("Could not start sign-in. Is the API running?");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-24">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Hosts sign in with Google to connect their calendar.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => void go()} disabled={busy}>
            {busy ? "Redirecting…" : "Sign in with Google"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
