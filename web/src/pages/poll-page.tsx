import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarDays, Check, Minus, X } from "lucide-react";
import {
  assessMeetingPollCalendar,
  disconnectInviteeCalendar,
  getInviteeCalendarStatus,
  getMeetingPollResponse,
  getPublicMeetingPoll,
  saveMeetingPollVotes,
  startInviteeCalendarConnection,
  type MeetingPoll,
  type PollChoice,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand-mark";

const choices: {
  value: PollChoice;
  label: string;
  icon: typeof Check;
}[] = [
  { value: "yes", label: "Available", icon: Check },
  { value: "if_needed", label: "If needed", icon: Minus },
  { value: "no", label: "Unavailable", icon: X },
];

function dateLabel(start: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", timeZone: timezone,
  }).format(new Date(start));
}

function shortDateLabel(start: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", timeZone: timezone,
  }).format(new Date(start));
}

function timeLabel(start: string, end: string, timezone: string) {
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric", minute: "2-digit", timeZone: timezone,
  });
  return `${time.format(new Date(start))}–${time.format(new Date(end))}`;
}

function optionLabel(start: string, end: string, timezone: string) {
  return `${dateLabel(start, timezone)} · ${timeLabel(start, end, timezone)}`;
}

function dayKey(start: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone,
  }).format(new Date(start));
}

function choiceMark(choice: PollChoice | undefined) {
  if (choice === "yes") return "✓";
  if (choice === "if_needed") return "~";
  if (choice === "no") return "×";
  return "–";
}

function selectedChoiceClass(choice: PollChoice) {
  if (choice === "yes") return "border-emerald-600 bg-emerald-600 text-white";
  if (choice === "if_needed") return "border-amber-500 bg-amber-400 text-amber-950";
  return "border-red-600 bg-red-600 text-white";
}

function resultChoiceClass(choice: PollChoice | undefined) {
  if (choice === "yes") return "bg-emerald-500/15 text-emerald-700";
  if (choice === "if_needed") return "bg-amber-400/20 text-amber-700";
  if (choice === "no") return "bg-red-500/15 text-red-700";
  return "text-muted-foreground";
}

export function PollPage({ publicId }: { publicId: string }) {
  const [poll, setPoll] = useState<MeetingPoll | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [votes, setVotes] = useState<Record<string, PollChoice>>({});
  const [editToken, setEditToken] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarExpiresAt, setCalendarExpiresAt] = useState<string | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token")
      ?? localStorage.getItem(`calpaca:poll:${publicId}`)
      ?? undefined;
    setEditToken(token);
    void getPublicMeetingPoll(publicId, token).then((loaded) => {
      setPoll(loaded);
      if (token) {
        void getMeetingPollResponse(publicId, token).then((response) => {
          setName(response.name);
          setEmail(response.email);
          setVotes(Object.fromEntries(response.votes.map((vote) => [vote.optionId, vote.choice])));
          setSaved(true);
        }).catch(() => localStorage.removeItem(`calpaca:poll:${publicId}`));
      }
    }).catch(() => setError("This poll could not be found."));

    const refresh = window.setInterval(() => {
      const currentToken = localStorage.getItem(`calpaca:poll:${publicId}`) ?? undefined;
      void getPublicMeetingPoll(publicId, currentToken).then(setPoll, () => {});
    }, 10_000);
    return () => window.clearInterval(refresh);
  }, [publicId]);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const returnedToken = fragment.get("calendarSession");
    const returnedError = fragment.get("calendarError");
    if (returnedToken) sessionStorage.setItem(`calpaca:poll-calendar:${publicId}`, returnedToken);
    if (returnedError) setError("Could not connect that calendar. Try again.");
    if (returnedToken || returnedError) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
    const capability = returnedToken
      ?? sessionStorage.getItem(`calpaca:poll-calendar:${publicId}`);
    if (!capability) return;
    void getInviteeCalendarStatus(capability).then(async (status) => {
      if (!status.connected) {
        sessionStorage.removeItem(`calpaca:poll-calendar:${publicId}`);
        return;
      }
      setCalendarToken(capability);
      setCalendarExpiresAt(status.expiresAt ?? null);
      const result = await assessMeetingPollCalendar(publicId, capability);
      setVotes(Object.fromEntries(result.assessment.map((item) => [item.optionId, item.choice])));
    }).catch(() => {});
  }, [publicId]);

  const sortedOptions = useMemo(
    () => [...(poll?.options ?? [])].sort((a, b) => a.start.localeCompare(b.start)),
    [poll?.options],
  );
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, typeof sortedOptions>();
    for (const option of sortedOptions) {
      const key = dayKey(option.start, poll?.timezone ?? "UTC");
      groups.set(key, [...(groups.get(key) ?? []), option]);
    }
    return [...groups.values()];
  }, [poll?.timezone, sortedOptions]);
  const answered = poll?.options.filter((option) => votes[option.id]).length ?? 0;
  const allAnswered = Boolean(poll && answered === poll.options.length);

  const submit = async () => {
    if (!poll || !allAnswered) return;
    setError(null);
    try {
      const result = await saveMeetingPollVotes({
        publicId,
        name,
        email,
        editToken,
        votes: poll.options.map((option) => ({
          optionId: option.id,
          choice: votes[option.id]!,
        })),
      });
      localStorage.setItem(`calpaca:poll:${publicId}`, result.editToken);
      history.replaceState(null, "", `${location.pathname}?token=${encodeURIComponent(result.editToken)}`);
      setEditToken(result.editToken);
      setSaved(true);
      setPoll(await getPublicMeetingPoll(publicId, result.editToken));
    } catch {
      setError("Could not save your response. If you already responded on another device, use that device to edit it.");
    }
  };

  const connectCalendar = async () => {
    setCalendarBusy(true);
    setError(null);
    try {
      const result = await startInviteeCalendarConnection(
        `${location.pathname}${location.search}`,
        undefined,
        publicId,
      );
      location.assign(result.authorizationUrl);
    } catch {
      setError("Could not start the Google Calendar connection.");
      setCalendarBusy(false);
    }
  };

  return (
    <div data-organizer className="min-h-screen bg-background px-4 py-8 text-foreground">
      <header className="mx-auto mb-8 flex max-w-4xl items-center gap-2.5">
        <BrandMark /><span className="font-semibold">Calpaca</span>
      </header>
      <Card className="mx-auto max-w-4xl rounded-2xl">
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
          {poll && poll.status === "closed" && (
            <p className="rounded-lg bg-muted p-4 text-sm font-medium">
              Voting is closed
              {poll.deadline && new Date(poll.deadline).getTime() <= Date.now()
                ? ` — the deadline was ${new Date(poll.deadline).toLocaleString()}.`
                : poll.participantLimitReached
                  ? " — this poll has reached its participant limit."
                  : "."}
            </p>
          )}
          {poll && (
            <>
              {poll.votingOpen && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <CalendarCheck className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        {calendarToken ? "Availability filled from Google Calendar" : "Check these times against Google Calendar"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Only free/busy information is read. You can change every answer.
                      </p>
                    </div>
                  </div>
                  {calendarToken ? (
                    <Button type="button" variant="ghost" size="sm" disabled={calendarBusy} onClick={async () => {
                      setCalendarBusy(true);
                      await disconnectInviteeCalendar(calendarToken).catch(() => {});
                      sessionStorage.removeItem(`calpaca:poll-calendar:${publicId}`);
                      setCalendarToken(null);
                      setCalendarExpiresAt(null);
                      setCalendarBusy(false);
                    }}>Disconnect</Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled={calendarBusy} onClick={() => void connectCalendar()}>
                      Connect Google Calendar
                    </Button>
                  )}
                  {calendarExpiresAt && (
                    <p className="w-full text-xs text-muted-foreground">
                      Temporary access expires {new Date(calendarExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-5">
                {groupedOptions.map((group) => (
                  <section key={dayKey(group[0]!.start, poll.timezone)}>
                    <h2 className="mb-2 text-sm font-semibold">{dateLabel(group[0]!.start, poll.timezone)}</h2>
                    <div className="overflow-hidden rounded-xl border border-border">
                      {group.map((option) => (
                        <div key={option.id} className="grid gap-3 border-b border-border p-3 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:items-center">
                          <p className="text-sm font-medium">{timeLabel(option.start, option.end, poll.timezone)}</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {choices.map((choice) => {
                              const Icon = choice.icon;
                              return (
                                <button
                                  key={choice.value}
                                  type="button"
                                  disabled={!poll.votingOpen || (saved && !poll.allowResponseEditing)}
                                  className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium ${
                                    votes[option.id] === choice.value
                                      ? selectedChoiceClass(choice.value)
                                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                                  }`}
                                  onClick={() => {
                                    setSaved(false);
                                    setVotes((current) => ({ ...current, [option.id]: choice.value }));
                                  }}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">{choice.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              {poll.votingOpen && !(saved && !poll.allowResponseEditing) && (
                <div className="sticky bottom-3 grid gap-4 rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur sm:grid-cols-2">
                  <div><Label htmlFor="poll-name">Name</Label><Input id="poll-name" className="mt-1.5" value={name} onChange={(event) => setName(event.target.value)} /></div>
                  <div><Label htmlFor="poll-email">Email</Label><Input id="poll-email" type="email" className="mt-1.5" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    {answered} of {poll.options.length} answered
                  </div>
                  <Button disabled={!name.trim() || !email.trim() || !allAnswered} onClick={() => void submit()}>
                    {saved ? <><Check className="h-4 w-4" /> Response saved</> : editToken ? "Update response" : "Save response"}
                  </Button>
                </div>
              )}
              {poll.votingOpen && saved && !poll.allowResponseEditing && (
                <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Your response is saved. The organizer has disabled response editing for this poll.
                </p>
              )}

              <section className="border-t border-border pt-6">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Live results</h2>
                    <p className="text-xs text-muted-foreground">Updates automatically as people respond.</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{poll.participantCount} response{poll.participantCount === 1 ? "" : "s"}</span>
                </div>
                {poll.resultsRevealed && poll.participantCount > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[38rem] text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="sticky left-0 bg-muted/40 p-3 text-left font-medium">Participant</th>
                          {sortedOptions.map((option) => (
                            <th key={option.id} className={`min-w-24 p-3 text-center text-xs ${poll.resultsRevealed && option.rank === 1 ? "text-primary" : ""}`}>
                              <span className="block">{shortDateLabel(option.start, poll.timezone)}</span>
                              <span className="block font-normal">{timeLabel(option.start, option.end, poll.timezone).split("–")[0]}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(poll.responses ?? []).map((response, responseIndex) => (
                          <tr key={`${response.name}-${responseIndex}`} className="border-t border-border">
                            <td className="sticky left-0 bg-background p-3 font-medium">{response.name}</td>
                            {sortedOptions.map((option) => {
                              const choice = response.votes.find((vote) => vote.optionId === option.id)?.choice;
                              return (
                                <td key={option.id} className={`p-3 text-center text-base font-semibold ${resultChoiceClass(choice)}`}>
                                  <span className="sr-only">{choices.find((item) => item.value === choice)?.label ?? "No response"}: </span>
                                  {choiceMark(choice)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr className="border-t border-border bg-emerald-500/10 font-medium text-emerald-700">
                          <td className="sticky left-0 bg-emerald-500/10 p-3">Available</td>
                          {sortedOptions.map((option) => (
                            <td key={option.id} className={`p-3 text-center ${poll.resultsRevealed && option.rank === 1 ? "text-primary" : ""}`}>
                              {option.yes}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-t border-border bg-amber-400/10 font-medium text-amber-700">
                          <td className="sticky left-0 bg-amber-400/10 p-3">If needed</td>
                          {sortedOptions.map((option) => (
                            <td key={option.id} className="p-3 text-center">
                              {option.ifNeeded}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-t border-border bg-red-500/10 font-medium text-red-700">
                          <td className="sticky left-0 bg-red-500/10 p-3">Unavailable</td>
                          {sortedOptions.map((option) => (
                            <td key={option.id} className="p-3 text-center">
                              {option.no}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {poll.participantCount === 0
                      ? "Results will appear here as people respond."
                      : poll.resultsVisibility === "after_response"
                        ? "Submit your response to see the results."
                        : "The organizer has hidden results for now."}
                  </p>
                )}
              </section>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
