import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  attachConversationPlaybook,
  createConversationPlaybook,
  createEngagement,
  findSimilarClients,
  getConversationPlaybook,
  getEngagement,
  listEngagementConversations,
  listConversationSchedulingOptions,
  listEngagements,
  listWorkspacePlaybooks,
  updateConversationPlaybook,
  updateEngagementStatus,
  type ConversationPlaybook,
  type ConversationPlaybookInput,
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

function ConversationList({
  engagement,
}: {
  engagement: EngagementDetail;
}) {
  const [items, setItems] = useState<ConversationPlaybook[] | null>(null);
  const [templates, setTemplates] = useState<ConversationPlaybook[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => listEngagementConversations(engagement.id)
    .then((response) => setItems(response.conversations))
    .catch(() => setError("Conversations could not be loaded."));
  useEffect(() => {
    void load();
  }, [engagement.id]);
  function openTemplates() {
    setShowTemplates(true);
    listWorkspacePlaybooks(engagement.id)
      .then((response) => setTemplates(response.templates))
      .catch(() => setError("Workspace playbooks are unavailable."));
  }
  async function attach(id: string) {
    try {
      await attachConversationPlaybook(engagement.id, id);
      setShowTemplates(false);
      await load();
    } catch {
      setError("That playbook could not be added. It may already belong to other client work.");
    }
  }
  return (
    <div className="py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-medium">Conversation playbooks</h3><p className="mt-1 text-sm text-muted-foreground">Purpose, people, preparation, and outcomes for this client work.</p></div>
        {engagement.canManage && <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-lg border border-input px-4 text-sm" onClick={openTemplates}>Add workspace playbook</button><button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" onClick={() => go(`/app/engagements/${engagement.id}/conversations/new`)}>New conversation</button></div>}
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {!items && !error && <p role="status" className="text-sm text-muted-foreground">Loading conversations…</p>}
      {items?.length === 0 && <div className="border-t border-border py-8"><p className="font-medium">No conversations yet</p><p className="mt-1 text-sm text-muted-foreground">Create a client-specific playbook or add a reusable workspace playbook.</p></div>}
      {items && items.length > 0 && <div className="divide-y divide-border border-y border-border">{items.map((item) => <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong className="font-medium">{item.title}</strong><span className="text-sm text-muted-foreground">{label(item.status)}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.purpose || "Purpose not defined"} · {item.durationMinutes} min · {item.participantRoles.filter((role) => role.required).map((role) => label(role.role)).join(" + ") || "Participants not defined"}</p>{!item.readiness.ready && <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">Needs {item.readiness.issues.map(label).join(", ")}</p>}</div><div className="flex gap-2"><a className="inline-flex min-h-11 items-center px-3 text-sm text-primary" href={`/book/${encodeURIComponent(item.slug)}`}>Schedule</a>{engagement.canManage && <button className="min-h-11 px-3 text-sm" onClick={() => go(`/app/engagements/${engagement.id}/conversations/${item.id}/edit`)}>Edit</button>}</div></div>)}</div>}
      {showTemplates && <div role="dialog" aria-modal="true" aria-labelledby="workspace-playbooks-title" className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4"><div className="max-h-[90vh] w-full overflow-y-auto bg-background p-5 sm:max-w-xl sm:rounded-xl"><div className="flex items-center justify-between"><h3 id="workspace-playbooks-title" className="text-lg font-semibold">Workspace playbooks</h3><button className="min-h-11 px-3" onClick={() => setShowTemplates(false)}>Close</button></div>{templates.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No unassigned workspace playbooks are available.</p> : <ul className="mt-4 divide-y divide-border">{templates.map((template) => <li key={template.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{template.title}</p><p className="text-sm text-muted-foreground">{template.durationMinutes} min · {label(template.status)}</p></div><button className="min-h-11 rounded-lg border border-input px-4 text-sm" onClick={() => void attach(template.id)}>Add</button></li>)}</ul>}</div></div>}
    </div>
  );
}

const emptyPlaybook: ConversationPlaybookInput = {
  title: "",
  purpose: "",
  clientExplanation: "",
  durationMinutes: 30,
  selectableDurations: [],
  participantRoles: [{ role: "account_lead", required: true }],
  preparationItems: [],
  outcomeDefinition: "",
  status: "draft",
};

function PlaybookEditor({
  engagement,
  playbookId,
  users,
}: {
  engagement: EngagementDetail;
  playbookId: "new" | string;
  users: DirectoryUser[];
}) {
  const [form, setForm] = useState<ConversationPlaybookInput>(emptyPlaybook);
  const [hostUserId, setHostUserId] = useState(engagement.accountLeadUserId);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<{
    id: string;
    userId: string;
    name: string;
    timezone: string;
  }[]>([]);
  const [section, setSection] = useState("purpose");
  const [loading, setLoading] = useState(playbookId !== "new");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listConversationSchedulingOptions(engagement.id).then((response) => {
      setSchedules(response.schedules);
      const leadSchedule = response.schedules.find((item) => item.userId === engagement.accountLeadUserId);
      if (leadSchedule) setScheduleId(leadSchedule.id);
    }).catch(() => undefined);
    if (playbookId !== "new") {
      getConversationPlaybook(engagement.id, playbookId)
        .then((response) => {
          const item = response.playbook;
          setForm({
            title: item.title,
            purpose: item.purpose,
            clientExplanation: item.clientExplanation,
            durationMinutes: item.durationMinutes,
            selectableDurations: item.selectableDurations,
            participantRoles: item.participantRoles,
            preparationItems: item.preparationItems,
            outcomeDefinition: item.outcomeDefinition,
            status: item.status,
          });
          setHostUserId(item.hosts[0]?.userId ?? engagement.accountLeadUserId);
          setScheduleId(item.scheduleId);
        })
        .catch(() => setError("This conversation playbook is unavailable."))
        .finally(() => setLoading(false));
    }
  }, [engagement.accountLeadUserId, engagement.id, playbookId]);
  const roleText = form.participantRoles.map((role) => `${role.required ? "*" : ""}${label(role.role)}`).join("\n");
  const preparationText = form.preparationItems.map((item) => `${item.required ? "*" : ""}${item.label}`).join("\n");
  function lines(value: string, kind: "roles" | "preparation") {
    return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => kind === "roles"
      ? { role: line.replace(/^\*/, "").toLowerCase().replace(/\s+/g, "_"), required: line.startsWith("*") }
      : { label: line.replace(/^\*/, ""), required: line.startsWith("*") });
  }
  async function save(status: "draft" | "ready") {
    setSaving(true);
    setSaved(false);
    setError(null);
    const input = { ...form, status };
    try {
      const response = playbookId === "new"
        ? await createConversationPlaybook(engagement.id, { ...input, hostUserId, scheduleId })
        : await updateConversationPlaybook(engagement.id, playbookId, input);
      setForm({ ...input, status: response.playbook.status });
      setSaved(true);
      if (playbookId === "new") {
        go(`/app/engagements/${engagement.id}/conversations/${response.playbook.id}/edit`);
      }
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === "playbook_not_ready"
        ? "This playbook still needs its purpose, required participants, outcome, host, and availability schedule before it can be marked ready."
        : "The playbook could not be saved. Your entries remain on this page.");
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading conversation playbook…</p>;
  const sections = ["purpose", "participants", "preparation", "outcome", "scheduling", "publish"];
  return <div className="py-6"><div className="mb-5 flex items-center justify-between"><button className="min-h-11 text-sm text-muted-foreground" onClick={() => go(`/app/engagements/${engagement.id}/conversations`)}>Back to conversations</button><span role="status" className="text-sm text-muted-foreground">{saved ? "Saved" : label(form.status)}</span></div><div className="grid gap-8 md:grid-cols-[11rem_1fr]"><nav aria-label="Playbook sections" className="flex gap-1 overflow-x-auto md:block">{sections.map((item) => <button key={item} className={`min-h-11 whitespace-nowrap px-3 text-left text-sm md:block md:w-full ${section === item ? "font-medium text-primary" : "text-muted-foreground"}`} onClick={() => setSection(item)}>{label(item)}</button>)}</nav><div className="max-w-2xl">{error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}{section === "purpose" && <div className="grid gap-4"><h3 className="text-xl font-semibold">Why does this conversation exist?</h3><label className="grid gap-1 text-sm">Name<input className="min-h-11 rounded-lg border border-input bg-background px-3" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="grid gap-1 text-sm">Internal purpose<textarea className="min-h-24 rounded-lg border border-input bg-background p-3" value={form.purpose ?? ""} onChange={(event) => setForm({ ...form, purpose: event.target.value })} /></label><label className="grid gap-1 text-sm">Client explanation<textarea className="min-h-24 rounded-lg border border-input bg-background p-3" value={form.clientExplanation ?? ""} onChange={(event) => setForm({ ...form, clientExplanation: event.target.value })} /></label></div>}{section === "participants" && <div><h3 className="text-xl font-semibold">Who needs to participate?</h3><p className="mt-1 text-sm text-muted-foreground">One role per line. Start required roles with an asterisk.</p><textarea aria-label="Participant roles" className="mt-4 min-h-40 w-full rounded-lg border border-input bg-background p-3" value={roleText} onChange={(event) => setForm({ ...form, participantRoles: lines(event.target.value, "roles") as ConversationPlaybookInput["participantRoles"] })} /></div>}{section === "preparation" && <div><h3 className="text-xl font-semibold">What should happen before the meeting?</h3><p className="mt-1 text-sm text-muted-foreground">One preparation item per line. Start required items with an asterisk.</p><textarea aria-label="Preparation items" className="mt-4 min-h-40 w-full rounded-lg border border-input bg-background p-3" value={preparationText} onChange={(event) => setForm({ ...form, preparationItems: lines(event.target.value, "preparation") as ConversationPlaybookInput["preparationItems"] })} /></div>}{section === "outcome" && <div><h3 className="text-xl font-semibold">What must be true when it ends?</h3><label className="mt-4 grid gap-1 text-sm">Intended outcome<textarea className="min-h-32 rounded-lg border border-input bg-background p-3" value={form.outcomeDefinition ?? ""} onChange={(event) => setForm({ ...form, outcomeDefinition: event.target.value })} /></label></div>}{section === "scheduling" && <div className="grid gap-4"><h3 className="text-xl font-semibold">Scheduling inputs</h3><label className="grid gap-1 text-sm">Recommended duration<input type="number" min={5} max={720} step={5} className="min-h-11 rounded-lg border border-input bg-background px-3" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label>{playbookId === "new" ? <><label className="grid gap-1 text-sm">Host<select className="min-h-11 rounded-lg border border-input bg-background px-3" value={hostUserId} onChange={(event) => { setHostUserId(event.target.value); setScheduleId(null); }}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label className="grid gap-1 text-sm">Availability schedule<select className="min-h-11 rounded-lg border border-input bg-background px-3" value={scheduleId ?? ""} onChange={(event) => setScheduleId(event.target.value || null)}><option value="">Choose later</option>{schedules.filter((item) => item.userId === hostUserId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></> : <a className="inline-flex min-h-11 items-center text-sm text-primary" href={`/app/workspace/conversation-playbooks/${encodeURIComponent(playbookId)}/edit`}>Open advanced scheduling settings</a>}</div>}{section === "publish" && <div><h3 className="text-xl font-semibold">Publish conversation</h3><p className="mt-2 text-sm text-muted-foreground">Ready playbooks require a purpose, at least one required participant role, an intended outcome, a host, and an availability schedule.</p><dl className="mt-5 grid grid-cols-[9rem_1fr] gap-y-2 text-sm"><dt className="text-muted-foreground">Purpose</dt><dd>{form.purpose?.trim() ? "Defined" : "Missing"}</dd><dt className="text-muted-foreground">Participants</dt><dd>{form.participantRoles.some((role) => role.required) ? "Defined" : "Missing"}</dd><dt className="text-muted-foreground">Outcome</dt><dd>{form.outcomeDefinition?.trim() ? "Defined" : "Missing"}</dd><dt className="text-muted-foreground">Schedule</dt><dd>{scheduleId ? "Selected" : "Missing"}</dd></dl></div>}<div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-border pt-4"><button disabled={saving || !form.title.trim()} className="min-h-11 rounded-lg border border-input px-4 text-sm disabled:opacity-50" onClick={() => void save("draft")}>Save draft</button><button disabled={saving || !form.title.trim()} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={() => void save("ready")}>{saving ? "Saving…" : "Mark ready"}</button></div></div></div></div>;
}

function DetailView({
  id,
  section = "overview",
  playbookId,
  users,
}: {
  id: string;
  section?: "overview" | "conversations";
  playbookId?: "new" | string;
  users: DirectoryUser[];
}) {
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
        <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" onClick={() => go(`/app/engagements/${item.id}/conversations/new`)}>Create first conversation</button>
      </div>
      <nav aria-label="Engagement" className="flex gap-5 overflow-x-auto border-b border-border">
        <button className={`min-h-11 whitespace-nowrap text-sm ${section === "overview" ? "font-medium text-primary" : "text-muted-foreground"}`} onClick={() => go(`/app/engagements/${item.id}`)}>Overview</button>
        <button className={`min-h-11 whitespace-nowrap text-sm ${section === "conversations" ? "font-medium text-primary" : "text-muted-foreground"}`} onClick={() => go(`/app/engagements/${item.id}/conversations`)}>Conversations</button>
      </nav>
      {section === "conversations" && (playbookId ? <PlaybookEditor engagement={item} playbookId={playbookId} users={users} /> : <ConversationList engagement={item} />)}
      {section === "overview" && <>
      <div className="grid gap-8 py-6 md:grid-cols-2">
        <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next</h3><p className="mt-2 font-medium">{item.eventTypes.length ? "Schedule a client conversation" : "Create the first conversation playbook"}</p><p className="mt-1 text-sm text-muted-foreground">Keep scheduling attached to this client context.</p></div>
        <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Engagement health</h3><dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-2 text-sm"><dt className="text-muted-foreground">Team</dt><dd>{item.people.length} assigned</dd><dt className="text-muted-foreground">Conversations</dt><dd>{item.eventTypes.length}</dd><dt className="text-muted-foreground">Meetings</dt><dd>{item.meetings.length}</dd></dl></div>
      </div>
      <div className="border-t border-border py-6"><h3 className="font-medium">People</h3><ul className="mt-3 divide-y divide-border">{item.people.map((person) => <li key={person.userId} className="flex justify-between py-3 text-sm"><span>{person.name} <span className="text-muted-foreground">{person.email}</span></span><span>{label(person.role)}</span></li>)}</ul></div>
      {item.canManage && item.status !== "archived" && <div className="border-t border-border py-5"><button className="min-h-11 text-sm text-muted-foreground hover:text-foreground" onClick={() => void updateEngagementStatus(item.id, "archived").then(load)}>Archive engagement</button></div>}
      </>}
    </section>
  );
}

export function EngagementsTab({
  users,
  mode = "list",
  section,
  playbookId,
}: {
  users: DirectoryUser[];
  mode?: Mode;
  section?: "overview" | "conversations";
  playbookId?: "new" | string;
}) {
  if (mode === "new") return <NewView users={users} />;
  if (mode !== "list") return <DetailView id={mode} section={section} playbookId={playbookId} users={users} />;
  return <ListView />;
}
