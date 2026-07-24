import { useEffect, useState } from "react";
import {
  ApiError,
  createProposal,
  getAvailability,
  getProposal,
  getWorkspace,
  listEngagementConversations,
  listEngagementProposals,
  transitionProposal,
  type ConversationPlaybook,
  type EngagementDetail,
  type Proposal,
  type ProposalOption,
} from "@/lib/api";

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase());
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ProposalList({ engagement }: { engagement: EngagementDetail }) {
  const [items, setItems] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listEngagementProposals(engagement.id)
      .then((response) => setItems(response.proposals))
      .catch(() => setError("Proposals could not be loaded."));
  }, [engagement.id]);
  return (
    <section className="py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Proposals</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Reviewed scheduling options sent to this client.
          </p>
        </div>
        {engagement.canManage && (
          <button
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            onClick={() => go(`/app/engagements/${engagement.id}/proposals/new`)}
          >
            New proposal
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
      {!items && !error && <p role="status" className="mt-5 text-sm text-muted-foreground">Loading proposals…</p>}
      {items?.length === 0 && (
        <div className="mt-6 border-t border-border py-8">
          <p className="font-medium">No proposals yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a proposal when the client should choose among reviewed options.
          </p>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {items.map((proposal) => (
            <li key={proposal.id}>
              <button
                className="grid min-h-16 w-full gap-1 py-3 text-left sm:grid-cols-[1fr_auto]"
                onClick={() => go(`/app/proposals/${proposal.id}`)}
              >
                <span>
                  <strong className="block text-sm font-medium">{proposal.title}</strong>
                  <span className="text-sm text-muted-foreground">
                    {proposal.recipientName} · {proposal.options.length} options
                  </span>
                </span>
                <span className="text-sm">{label(proposal.status)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NewProposal({ engagement }: { engagement: EngagementDetail }) {
  const [conversations, setConversations] = useState<ConversationPlaybook[]>([]);
  const [eventTypeId, setEventTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [options, setOptions] = useState<ProposalOption[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceSlug, setWorkspaceSlug] = useState<string | undefined>();
  const selected = conversations.find((conversation) => conversation.id === eventTypeId);

  useEffect(() => {
    void getWorkspace().then((response) => setWorkspaceSlug(response.workspace.slug));
    listEngagementConversations(engagement.id)
      .then((response) => {
        const ready = response.conversations.filter((conversation) => conversation.status === "ready");
        setConversations(ready);
        if (ready[0]) {
          setEventTypeId(ready[0].id);
          setTitle(`${engagement.clientName} ${ready[0].title}`);
        }
      })
      .catch(() => setError("Ready conversations could not be loaded."));
  }, [engagement.clientName, engagement.id]);

  async function findTimes() {
    if (!selected) return;
    setLoadingTimes(true);
    setError(null);
    const start = new Date();
    const end = new Date(start.getTime() + 14 * 86_400_000);
    try {
      const response = await getAvailability({
        eventTypeSlug: selected.slug,
        start: start.toISOString(),
        end: end.toISOString(),
        inviteeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        workspaceSlug,
        durationMinutes: selected.durationMinutes,
      });
      const hostUserIds = selected.hosts
        .filter((host) => host.role !== "optional")
        .map((host) => host.userId);
      setOptions(response.curated.slice(0, 3).map((slot) => ({
        id: crypto.randomUUID(),
        start: slot.start.utc,
        end: slot.end.utc,
        hostUserIds,
        recommendation: slot.recommendation ?? {
          confidence: "unknown",
          reasons: [{
            kind: "warning",
            label: "Calendar verification unavailable",
            detail: "Current calendar evidence was unavailable when this option was created.",
          }, {
            kind: "positive",
            label: "Fits the booking rules",
            detail: "This option satisfies the conversation's scheduling rules.",
          }],
        },
      })));
      if (response.curated.length < 2) {
        setError("At least two viable times are required. Adjust availability before creating this proposal.");
      }
    } catch {
      setError("Recommended times could not be loaded.");
    } finally {
      setLoadingTimes(false);
    }
  }

  async function save() {
    if (!selected || options.length < 2) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createProposal(engagement.id, {
        eventTypeId: selected.id,
        title,
        message: message.trim() || null,
        recipientName,
        recipientEmail,
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        options,
      });
      await transitionProposal(created.proposal.id, "ready");
      go(`/app/proposals/${created.proposal.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError
        ? `Proposal could not be created (${reason.code}).`
        : "Proposal could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="py-6">
      <button
        className="mb-4 min-h-11 text-sm text-muted-foreground"
        onClick={() => go(`/app/engagements/${engagement.id}/proposals`)}
      >
        Back to proposals
      </button>
      <div className="max-w-2xl">
        <h3 className="text-xl font-semibold">Create a proposal</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the client purpose and recommended times before sharing anything.
        </p>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-6 grid gap-4">
          <label className="grid gap-1 text-sm">
            Conversation
            <select
              className="min-h-11 rounded-lg border border-input bg-background px-3"
              value={eventTypeId}
              onChange={(event) => {
                setEventTypeId(event.target.value);
                const next = conversations.find((item) => item.id === event.target.value);
                if (next) setTitle(`${engagement.clientName} ${next.title}`);
                setOptions([]);
              }}
            >
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
              ))}
            </select>
          </label>
          {selected && (
            <div className="border-y border-border py-4 text-sm">
              <p className="font-medium">{selected.clientExplanation || selected.purpose}</p>
              <p className="mt-1 text-muted-foreground">
                {selected.hosts.map((host) => host.name).join(", ")} · {selected.durationMinutes} minutes
              </p>
            </div>
          )}
          <label className="grid gap-1 text-sm">
            Proposal title
            <input className="min-h-11 rounded-lg border border-input bg-background px-3" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Recipient name
              <input className="min-h-11 rounded-lg border border-input bg-background px-3" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              Recipient email
              <input type="email" className="min-h-11 rounded-lg border border-input bg-background px-3" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            Client note
            <textarea className="min-h-24 rounded-lg border border-input bg-background p-3" value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium">Recommended options</h4>
                <p className="text-sm text-muted-foreground">Based on current availability and conversation rules.</p>
              </div>
              <button
                type="button"
                disabled={!selected || !workspaceSlug || loadingTimes}
                className="min-h-11 rounded-lg border border-input px-4 text-sm disabled:opacity-50"
                onClick={() => void findTimes()}
              >
                {loadingTimes ? "Checking…" : "Find times"}
              </button>
            </div>
            <ol className="mt-3 divide-y divide-border border-y border-border">
              {options.map((option) => (
                <li key={option.id} className="py-3 text-sm">
                  <strong>{dateTime(option.start)}</strong>
                  <span className="ml-2 text-muted-foreground">
                    {label(option.recommendation.confidence)}
                  </span>
                  <p className="mt-1 text-muted-foreground">
                    {option.recommendation.reasons[0]?.label}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <button
            disabled={saving || !title.trim() || !recipientName.trim() || !recipientEmail.trim() || options.length < 2}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Review proposal"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function ProposalDetail({ proposalId }: { proposalId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getProposal>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => getProposal(proposalId).then(setData).catch(() => setError("This proposal is unavailable."));
  useEffect(() => {
    void load();
  }, [proposalId]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status" className="text-sm text-muted-foreground">Loading proposal…</p>;
  const { proposal, engagement, conversation } = data;
  async function act(action: "approve" | "send" | "withdraw") {
    setBusy(true);
    setError(null);
    try {
      await transitionProposal(proposal.id, action);
      await load();
    } catch {
      setError("The proposal changed before this action completed. Reload and review it.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <button
        className="mb-4 min-h-11 text-sm text-muted-foreground"
        onClick={() => go(`/app/engagements/${engagement.id}/proposals`)}
      >
        {engagement.name} / Proposals
      </button>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-sm text-muted-foreground">Proposal</p>
          <h2 className="text-2xl font-semibold">{proposal.title}</h2>
          <p className="mt-1 text-sm">{label(proposal.status)}</p>
        </div>
        {proposal.status === "ready" && (
          <button
            disabled={busy}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            onClick={() => void act("send")}
          >
            {busy ? "Sending…" : "Send proposal"}
          </button>
        )}
        {proposal.status === "awaiting_internal_confirmation" && (
          <button
            disabled={busy}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            onClick={() => void act("approve")}
          >
            {busy ? "Approving…" : "Approve participant plan"}
          </button>
        )}
      </header>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      <div className="grid gap-8 py-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client will see</h3>
          <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-3 text-sm">
            <dt className="text-muted-foreground">Purpose</dt><dd>{conversation?.purpose || proposal.message || "Not provided"}</dd>
            <dt className="text-muted-foreground">Options</dt><dd>{proposal.options.length} proposed times</dd>
            <dt className="text-muted-foreground">Recipient</dt><dd>{proposal.recipientName} · {proposal.recipientEmail}</dd>
            <dt className="text-muted-foreground">Preparation</dt><dd>{conversation?.preparationItems.map((item) => item.label).join(", ") || "None"}</dd>
          </dl>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal state</h3>
          <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
            <dt className="text-muted-foreground">Confidence</dt><dd>{proposal.options.every((option) => option.recommendation.confidence === "confirmed") ? "All options confirmed" : "Review evidence states"}</dd>
            <dt className="text-muted-foreground">Expires</dt><dd>{dateTime(proposal.expiresAt)}</dd>
            <dt className="text-muted-foreground">Client response</dt><dd>{proposal.alternativeRequest || "No response yet"}</dd>
          </dl>
        </div>
      </div>
      <div className="border-t border-border py-6">
        <h3 className="font-medium">Proposed times</h3>
        <ol className="mt-3 divide-y divide-border">
          {proposal.options.map((option, index) => (
            <li key={option.id} className="py-3 text-sm">
              <strong>{index === 0 ? "Recommended: " : ""}{dateTime(option.start)}</strong>
              <p className="mt-1 text-muted-foreground">{option.recommendation.reasons.map((reason) => reason.label).join(" · ")}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="border-t border-border py-6">
        <h3 className="font-medium">Activity</h3>
        <ol className="mt-3 divide-y divide-border">
          {data.activity.map((event) => (
            <li key={event.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
              <span>{label(event.kind)}</span>
              <time className="text-muted-foreground" dateTime={event.createdAt}>
                {dateTime(event.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      </div>
      {proposal.status === "awaiting_client" && (
        <div className="flex flex-wrap gap-3 border-t border-border py-5">
          <button
            className="min-h-11 rounded-lg border border-input px-4 text-sm"
            onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/proposal/${proposal.publicId}`)}
          >
            Copy client link
          </button>
          <button disabled={busy} className="min-h-11 px-3 text-sm text-destructive disabled:opacity-50" onClick={() => void act("withdraw")}>
            Withdraw proposal
          </button>
        </div>
      )}
    </section>
  );
}
