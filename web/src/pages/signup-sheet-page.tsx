import { useEffect, useState } from "react";
import { CalendarCheck, Check, Users } from "lucide-react";
import {
  cancelSignupRegistration,
  getSignupSheet,
  registerForSignupSheet,
  type SignupSheet,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function sessionLabel(start: string, end: string, timezone: string): string {
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(start));
  const endTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(end));
  return `${date}–${endTime}`;
}

export function SignupSheetPage({
  publicId,
  cancelToken,
}: {
  publicId?: string;
  cancelToken?: string;
}) {
  const [sheet, setSheet] = useState<SignupSheet | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!publicId) return;
    getSignupSheet(publicId).then(setSheet, () => setError("This sign-up sheet could not be found."));
  }, [publicId]);

  if (cancelToken) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader><CardTitle>Cancel registration</CardTitle><CardDescription>This releases all sessions registered with this confirmation.</CardDescription></CardHeader>
          <CardContent>
            {complete ? <p>Your registration has been cancelled.</p> : (
              <Button disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                  await cancelSignupRegistration(cancelToken);
                  setComplete(true);
                } catch {
                  setError("The registration could not be cancelled.");
                } finally {
                  setBusy(false);
                }
              }}>Cancel registration</Button>
            )}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CalendarCheck className="mb-2 h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">{sheet?.title ?? "Sign-up sheet"}</CardTitle>
          <CardDescription>{sheet?.description ?? "Choose the sessions you want to attend."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {sheet?.status === "closed" && !complete && (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              Enrollment is currently closed.
            </p>
          )}
          {complete ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
              <p className="flex items-center gap-2 font-medium"><Check className="h-5 w-5" /> You're registered</p>
              <p className="mt-1 text-sm text-muted-foreground">A confirmation email is on its way.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {sheet?.sessions.map((session) => {
                  const full = session.seatsRemaining === 0;
                  const checked = selected.includes(session.id);
                  return (
                    <label key={session.id} className={`block rounded-xl border p-4 ${checked ? "border-primary bg-primary/5" : "border-border"} ${full ? "opacity-55" : "cursor-pointer"}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" className="mt-1" disabled={full || sheet.status !== "open"} checked={checked} onChange={() => setSelected((current) => checked ? current.filter((id) => id !== session.id) : [...current, session.id])} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{session.title}</p>
                          <p className="text-sm text-muted-foreground">{sessionLabel(session.start, session.end, sheet.timezone)}</p>
                          {session.description && <p className="mt-1 text-sm">{session.description}</p>}
                        </div>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {full
                            ? "Full"
                            : sheet.rosterVisibility === "hidden" ? "Available" : `${session.seatsRemaining} left`}
                        </span>
                      </div>
                      {sheet.rosterVisibility === "names" && session.registrations && session.registrations.length > 0 && (
                        <p className="mt-2 pl-6 text-xs text-muted-foreground">
                          Attending: {session.registrations.map((registration) => registration.name).join(", ")}
                        </p>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="signup-name">Name</Label><Input id="signup-name" className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /></div>
                <div><Label htmlFor="signup-email">Email</Label><Input id="signup-email" type="email" className="mt-1" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
              </div>
              {sheet?.questions.map((question) => (
                <div key={question.id}>
                  <Label htmlFor={`signup-${question.id}`}>{question.label}{question.required ? " *" : ""}</Label>
                  <Input id={`signup-${question.id}`} className="mt-1" value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
                </div>
              ))}
              <Button disabled={busy || sheet?.status !== "open" || selected.length === 0 || !name.trim() || !email.trim()} onClick={async () => {
                if (!sheet) return;
                setBusy(true);
                setError(null);
                try {
                  await registerForSignupSheet(sheet.publicId, { sessionIds: selected, name, email, answers });
                  setComplete(true);
                } catch {
                  setError("Registration failed. A selected session may have filled up.");
                } finally {
                  setBusy(false);
                }
              }}>{busy ? "Registering…" : "Register"}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
