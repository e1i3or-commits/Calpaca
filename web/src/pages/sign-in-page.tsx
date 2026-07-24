import { useEffect, useState } from "react";
import { ArrowLeft, CalendarCheck2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ApiError, signInWithGoogle } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { signInErrorMessage } from "@/lib/sign-in-error";

// Replaces the temporary /dev/sign-in HTML page: the sign-in POST must
// originate in the browser so the OAuth state cookie is set where the
// callback will be validated.
export function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return signInErrorMessage(params.get("error"));
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("error") && !url.searchParams.has("error_description")) return;
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await signInWithGoogle("/dashboard");
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.status === 429
            ? "Too many sign-in attempts. Wait a minute and try again."
            : "Calpaca couldn't start sign-in. Try again in a moment."
          : "We couldn't reach Calpaca. Check your connection and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div data-organizer className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-lg font-semibold tracking-[-0.03em]">Calpaca</span>
        </Link>
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </Link>
      </div>
      <div className="mx-auto grid min-h-[calc(100vh-84px)] max-w-5xl place-items-center py-12">
        <Card className="w-full max-w-md rounded-2xl border-border/80 shadow-[0_24px_70px_-40px_rgba(52,64,54,.45)]">
          <CardHeader className="pb-5">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarCheck2 className="h-5 w-5" />
            </span>
            <CardTitle className="text-2xl tracking-[-0.035em]">Sign in or create an account</CardTitle>
            <CardDescription className="max-w-sm leading-6">
              Continue with Google to manage scheduling and connect your calendar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button className="h-11 rounded-xl" onClick={() => void go()} disabled={busy} aria-busy={busy}>
              {busy ? "Redirecting…" : "Continue with Google"}
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              If you are new, this creates your Calpaca account. Google is used for secure sign-in and calendar connection.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
