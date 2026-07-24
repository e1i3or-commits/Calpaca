import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createEngagement,
  findSimilarClients,
  getEngagement,
  listEngagements,
  updateEngagementStatus,
  type DirectoryUser,
  type EngagementDetail,
  type EngagementStatus,
  type EngagementSummary,
} from "@/lib/api";

type Mode = "list" | "new" | string;
const DRAFT_KEY = "calpaca:engagement-draft";

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase());
}

function ListView() {
  const [items, setItems] = useState<EngagementSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EngagementStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setItems(null);
    listEngagements({ search: search || undefined, status: status || undefined })
      .then((response) => setItems(response.engagements))
      .catch(() => setError("Engagements could not be loaded. Try again."));
  }, [search, status]);
  const counts = useMemo(() => ({
    active: items?.filter((item) => item.status === "active").length ?? 0,
    potential: items?.filter((item) => item.status === "potential").length ?? 0,
    completed: items?.filter((item) => item.status === "completed").length ?? 0,
  }), [items]);

  return (
    <section aria-label="Engagements">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{counts.active}</strong> Active</span>
          <span><strong className="text-foreground">{counts.potential}</strong> Potential</span>
          <span><strong className="text-foreground">{counts.completed}</strong> Completed</span>
        </div>
        <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" onClick={() => go("/app/engagements/new")}>
          New engagement
        </button>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label>
          <span className="sr-only">Search engagements</span>
          <input className="min-h-11 w-full rounded-lg border border-input bg-background px-3" placeholder="Search client work" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select className="min-h-11 w-full rounded-lg border border-input bg-background px-3" value={status} onChange={(event) => setStatus(event.target.value as EngagementStatus | "")}>
            <option value="">Current statuses</option>
            {["draft", "potential", "active", "paused", "completed", "archived"].map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!items && !error && <p role="status" className="text-sm text-muted-foreground">Loading engagements…</p>}
      {items?.length === 0 && (
        <div className="border-t border-border py-10">
          <h2 className="font-medium">{search || status ? "No matching engagements" : "No client work yet"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{search || status ? "Clear the filters or try another search." : "Create an engagement to keep client context, people, and scheduling together."}</p>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="overflow-hidden border-y border-border">
          <div className="hidden grid-cols-[2fr_1.2fr_1fr_8rem] gap-4 border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
            <span>Engagement</span><span>Client</span><span>Lead</span><span>Status</span>
          </div>
          {items.map((item) => (
            <button key={item.id} className="grid min-h-16 w-full gap-1 border-b border-border px-3 py-3 text-left last:border-0 hover:bg-muted/50 md:grid-cols-[2fr_1.2fr_1fr_8rem] md:items-center md:gap-4" onClick={() => go(`/app/engagements/${item.id}`)}>
              <strong className="font-medium">{item.name}</strong>
              <span className="text-sm text-muted-foreground">{item.clientName}</span>
              <span className="text-sm text-muted-foreground">{item.accountLeadName}</span>
              <span className="text-sm">{label(item.status)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

type Draft = {
  clientName: string;
  name: string;
  type: EngagementSummary["type"];
  accountLeadUserId: string;
  expectedEndDate: string;
  restricted: boolean;
  people: string[];
};

function NewView({ users }: { users: DirectoryUser[] }) {
  const initial = useMemo<Draft>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Draft> | null;
      return {
        clientName: stored?.clientName ?? "",
        name: stored?.name ?? "",
        type: stored?.type ?? "project",
        accountLeadUserId: stored?.accountLeadUserId ?? users[0]?.id ?? "",
        expectedEndDate: stored?.expectedEndDate ?? "",
        restricted: stored?.restricted ?? false,
        people: stored?.people ?? [],
      };
    } catch {
      return { clientName: "", name: "", type: "project", accountLeadUserId: users[0]?.id ?? "", expectedEndDate: "", restricted: false, people: [] };
    }
  }, [users]);
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [similar, setSimilar] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);
  useEffect(() => {
    if (draft.clientName.trim().length < 2) return setSimilar([]);
    const timer = window.setTimeout(() => {
      findSimilarClients(draft.clientName).then((response) => setSimilar(response.clients)).catch(() => setSimilar([]));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft.clientName]);
  const validBasics = draft.clientName.trim() && draft.name.trim() && draft.accountLeadUserId;
  async function submit(status: "draft" | "potential" | "active") {
    setSaving(true);
    setError(null);
    try {
      const response = await createEngagement({
        clientName: draft.clientName,
        name: draft.name,
        type: draft.type,
        status,
        visibility: draft.restricted ? "restricted" : "workspace",
        accountLeadUserId: draft.accountLeadUserId,
        expectedEndDate: draft.expectedEndDate || null,
        people: draft.people.map((userId) => ({ userId, role: "contributor" })),
      });
      localStorage.removeItem(DRAFT_KEY);
      go(`/app/engagements/${response.engagement.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === "invalid_engagement_person"
        ? "One of the selected people is no longer an active workspace member."
        : "The engagement could not be saved. Your draft is still available.");
    } finally {
      setSaving(false);
    }
  }
  const steps = ["Basics", "Team", "Delivery", "Review"];
  return (
    <section>
      <button className="mb-5 min-h-11 text-sm text-muted-foreground hover:text-foreground" onClick={() => go("/app/engagements")}>Back to engagements</button>
      <div className="grid gap-8 md:grid-cols-[11rem_1fr]">
        <ol className="flex gap-2 overflow-x-auto md:block md:space-y-1" aria-label="Engagement setup steps">
          {steps.map((name, index) => <li key={name}><button className={`min-h-11 whitespace-nowrap px-3 text-left text-sm ${step === index ? "font-medium text-primary" : "text-muted-foreground"}`} onClick={() => setStep(index)}>{index + 1}. {name}</button></li>)}
        </ol>
        <div className="max-w-2xl">
          {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
          {step === 0 && (
            <div className="grid gap-4">
              <h2 className="text-xl font-semibold">What client work needs scheduling?</h2>
              <label className="grid gap-1 text-sm">Client<input className="min-h-11 rounded-lg border border-input bg-background px-3" value={draft.clientName} onChange={(event) => setDraft({ ...draft, clientName: event.target.value })} /></label>
              {similar.length > 0 && <div className="border-l-2 border-primary px-3 text-sm"><p>Similar client found: {similar.map((client) => client.name).join(", ")}</p><p className="text-muted-foreground">The existing client record will be reused when the name matches.</p></div>}
              <label className="grid gap-1 text-sm">Engagement name<input className="min-h-11 rounded-lg border border-input bg-background px-3" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className="grid gap-1 text-sm">Type<select className="min-h-11 rounded-lg border border-input bg-background px-3" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Draft["type"] })}>{["project", "retainer", "discovery", "internal", "other"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
              <label className="grid gap-1 text-sm">Account lead<select className="min-h-11 rounded-lg border border-input bg-background px-3" value={draft.accountLeadUserId} onChange={(event) => setDraft({ ...draft, accountLeadUserId: event.target.value })}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm">Expected end <span className="text-muted-foreground">(optional)</span><input type="date" className="min-h-11 rounded-lg border border-input bg-background px-3" value={draft.expectedEndDate} onChange={(event) => setDraft({ ...draft, expectedEndDate: event.target.value })} /></label>
            </div>
          )}
          {step === 1 && <div><h2 className="text-xl font-semibold">Who is involved?</h2><p className="mt-1 text-sm text-muted-foreground">The account lead can manage the engagement. Add contributors who need the client context.</p><div className="mt-4 grid gap-2">{users.filter((user) => user.id !== draft.accountLeadUserId).map((user) => <label key={user.id} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft.people.includes(user.id)} onChange={(event) => setDraft({ ...draft, people: event.target.checked ? [...draft.people, user.id] : draft.people.filter((id) => id !== user.id) })} />{user.name} <span className="text-sm text-muted-foreground">{user.email}</span></label>)}</div></div>}
          {step === 2 && <div><h2 className="text-xl font-semibold">Delivery context</h2><p className="mt-1 text-sm text-muted-foreground">Scheduling protections continue to use workspace availability and connected calendars. Conversation playbooks can be added after creation.</p><label className="mt-5 flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft.restricted} onChange={(event) => setDraft({ ...draft, restricted: event.target.checked })} /><span><strong className="block text-sm">Restrict visibility</strong><span className="text-sm text-muted-foreground">Only workspace administrators and assigned people can discover this engagement.</span></span></label></div>}
          {step === 3 && <div><h2 className="text-xl font-semibold">Review</h2><dl className="mt-4 grid grid-cols-[9rem_1fr] gap-y-2 text-sm"><dt className="text-muted-foreground">Client</dt><dd>{draft.clientName || "Not set"}</dd><dt className="text-muted-foreground">Engagement</dt><dd>{draft.name || "Not set"}</dd><dt className="text-muted-foreground">Type</dt><dd>{label(draft.type)}</dd><dt className="text-muted-foreground">People</dt><dd>{draft.people.length + 1}</dd><dt className="text-muted-foreground">Visibility</dt><dd>{draft.restricted ? "Restricted" : "Workspace"}</dd></dl></div>}
          <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-border pt-4">
            {step > 0 && <button className="min-h-11 px-4 text-sm" onClick={() => setStep(step - 1)}>Back</button>}
            {step < 3 && <button disabled={step === 0 && !validBasics} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={() => setStep(step + 1)}>Continue</button>}
            {step === 3 && <><button disabled={saving || !validBasics} className="min-h-11 rounded-lg border border-input px-4 text-sm disabled:opacity-50" onClick={() => void submit("potential")}>Create as potential</button><button disabled={saving || !validBasics} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={() => void submit("active")}>{saving ? "Creating…" : "Create active engagement"}</button></>}
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailView({ id }: { id: string }) {
  const [item, setItem] = useState<EngagementDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => getEngagement(id).then((response) => setItem(response.engagement)).catch(() => setError("This engagement is unavailable or you do not have access."));
  useEffect(() => {
    void load();
  }, [id]);
  if (error) return <div><p role="alert">{error}</p><button className="mt-4 min-h-11 text-primary" onClick={() => go("/app/engagements")}>Return to engagements</button></div>;
  if (!item) return <p role="status" className="text-sm text-muted-foreground">Loading engagement…</p>;
  return (
    <section>
      <button className="mb-4 min-h-11 text-sm text-muted-foreground hover:text-foreground" onClick={() => go("/app/engagements")}>Engagements /</button>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div><div className="flex items-center gap-3"><h2 className="text-2xl font-semibold">{item.name}</h2><span className="text-sm">{label(item.status)}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.clientName} · Account lead {item.accountLeadName}</p></div>
        <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" onClick={() => go("/app/workspace/conversation-playbooks/new")}>Create first conversation</button>
      </div>
      <div className="grid gap-8 py-6 md:grid-cols-2">
        <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next</h3><p className="mt-2 font-medium">{item.eventTypes.length ? "Schedule a client conversation" : "Create the first conversation playbook"}</p><p className="mt-1 text-sm text-muted-foreground">Keep scheduling attached to this client context.</p></div>
        <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Engagement health</h3><dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-2 text-sm"><dt className="text-muted-foreground">Team</dt><dd>{item.people.length} assigned</dd><dt className="text-muted-foreground">Conversations</dt><dd>{item.eventTypes.length}</dd><dt className="text-muted-foreground">Meetings</dt><dd>{item.meetings.length}</dd></dl></div>
      </div>
      <div className="border-t border-border py-6"><h3 className="font-medium">People</h3><ul className="mt-3 divide-y divide-border">{item.people.map((person) => <li key={person.userId} className="flex justify-between py-3 text-sm"><span>{person.name} <span className="text-muted-foreground">{person.email}</span></span><span>{label(person.role)}</span></li>)}</ul></div>
      {item.canManage && item.status !== "archived" && <div className="border-t border-border py-5"><button className="min-h-11 text-sm text-muted-foreground hover:text-foreground" onClick={() => void updateEngagementStatus(item.id, "archived").then(load)}>Archive engagement</button></div>}
    </section>
  );
}

export function EngagementsTab({ users, mode = "list" }: { users: DirectoryUser[]; mode?: Mode }) {
  if (mode === "new") return <NewView users={users} />;
  if (mode !== "list") return <DetailView id={mode} />;
  return <ListView />;
}
