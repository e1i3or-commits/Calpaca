import { useEffect, useState } from "react";
import { CalendarDays, Check } from "lucide-react";
import {
  getMeetingPollResponse,
  getPublicMeetingPoll,
  saveMeetingPollVotes,
  type MeetingPoll,
  type PollChoice,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand-mark";

const choices: { value: PollChoice; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "if_needed", label: "If needed" },
  { value: "no", label: "No" },
];

function optionLabel(start: string, end: string, timezone: string) {
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", timeZone: timezone,
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric", minute: "2-digit", timeZone: timezone,
  });
  return `${date} · ${time.format(new Date(start))}–${time.format(new Date(end))}`;
}

export function PollPage({ publicId }: { publicId: string }) {
  const [poll, setPoll] = useState<MeetingPoll | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [votes, setVotes] = useState<Record<string, PollChoice>>({});
  const [editToken, setEditToken] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token")
      ?? localStorage.getItem(`calpaca:poll:${publicId}`)
      ?? undefined;
    setEditToken(token);
    void getPublicMeetingPoll(publicId).then((loaded) => {
      setPoll(loaded);
      setVotes(Object.fromEntries(loaded.options.map((option) => [option.id, "yes"])));
      if (token) {
        void getMeetingPollResponse(publicId, token).then((response) => {
          setName(response.name);
          setEmail(response.email);
          setVotes(Object.fromEntries(response.votes.map((vote) => [vote.optionId, vote.choice])));
        }).catch(() => localStorage.removeItem(`calpaca:poll:${publicId}`));
      }
    }).catch(() => setError("This poll could not be found."));
  }, [publicId]);

  const submit = async () => {
    if (!poll) return;
    setError(null);
    try {
      const result = await saveMeetingPollVotes({
        publicId,
        name,
        email,
        editToken,
        votes: poll.options.map((option) => ({
          optionId: option.id,
          choice: votes[option.id] ?? "no",
        })),
      });
      localStorage.setItem(`calpaca:poll:${publicId}`, result.editToken);
      history.replaceState(null, "", `${location.pathname}?token=${encodeURIComponent(result.editToken)}`);
      setEditToken(result.editToken);
      setSaved(true);
      setPoll(await getPublicMeetingPoll(publicId));
    } catch {
      setError("Could not save your response. If you already responded on another device, use that device to edit it.");
    }
  };

  return (
    <div data-organizer className="min-h-screen bg-background px-4 py-8 text-foreground">
      <header className="mx-auto mb-8 flex max-w-3xl items-center gap-2.5">
        <BrandMark /><span className="font-semibold">Calpaca</span>
      </header>
      <Card className="mx-auto max-w-3xl rounded-2xl">
        <CardHeader>
          <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </span>
          <CardTitle className="text-2xl">{poll?.title ?? "Meeting poll"}</CardTitle>
          <CardDescription>{poll?.description ?? "Choose every time that could work for you."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {poll?.status === "finalized" && (
            <p className="rounded-lg bg-primary/10 p-4 text-sm font-medium text-primary">
              This poll is finalized
              {poll.options.find((option) => option.id === poll.finalizedOptionId)
                ? ` for ${optionLabel(poll.options.find((option) => option.id === poll.finalizedOptionId)!.start, poll.options.find((option) => option.id === poll.finalizedOptionId)!.end, poll.timezone)}`
                : ""}.
            </p>
          )}
          {poll && (
            <>
              <div className="space-y-3">
                {poll.options.map((option) => (
                  <div key={option.id} className="rounded-xl border border-border p-4">
                    <p className="mb-3 text-sm font-medium">{optionLabel(option.start, option.end, poll.timezone)}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {choices.map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          disabled={poll.status !== "open"}
                          className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                            votes[option.id] === choice.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-muted-foreground"
                          }`}
                          onClick={() => setVotes((current) => ({ ...current, [option.id]: choice.value }))}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {poll.status === "open" && (
                <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                  <div><Label htmlFor="poll-name">Name</Label><Input id="poll-name" className="mt-1.5" value={name} onChange={(event) => setName(event.target.value)} /></div>
                  <div><Label htmlFor="poll-email">Email</Label><Input id="poll-email" type="email" className="mt-1.5" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
                  <Button className="sm:col-span-2" disabled={!name.trim() || !email.trim()} onClick={() => void submit()}>
                    {saved ? <><Check className="h-4 w-4" /> Response saved</> : editToken ? "Update response" : "Save response"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
