import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  SearchCheck,
  Trash2,
} from "lucide-react";
import {
  ApiError,
  createEventType,
  createEventTypeFolder,
  deleteEventType,
  deleteEventTypeFolder,
  getWorkspace,
  listEventTypeFolders,
  listEventTypes,
  listPresentationOptions,
  listSchedules,
  listTeams,
  setEventTypeFolder,
  updateEventType,
  updateEventTypeFolder,
  type AdminEventType,
  type DirectoryUser,
  type EventTypeFolder,
  type EventTypeInput,
  type PresentationOption,
  type Schedule,
  type Team,
} from "@/lib/api";
import { themeOptions } from "@/lib/theme";
import { errorText } from "@/lib/error-text";
import { slugify } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PeoplePicker } from "@/components/people-picker";
import {
  ActionableEmptyState,
  CopyFeedbackLabel,
  InlineLoading,
} from "@/components/dashboard-primitives";
import { BookingPagesManager } from "@/components/booking-pages-manager";

// ---- event types ----

const DEFAULT_EVENT_TYPE: EventTypeInput = {
  slug: "",
  title: "",
  description: null,
  durationMinutes: 30,
  selectableDurations: [30],
  capacity: 1,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 240,
  rollingWindowDays: 14,
  mode: "solo",
  scheduleId: null,
  teamId: null,
  folderId: null,
  theme: "default",
  layout: "focus",
  logoUrl: null,
  meetingFormats: ["google_meet"],
  locations: [{ id: "google-meet", type: "google_meet", label: "Google Meet" }],
  bookingQuestions: [],
  emailVerificationRequired: false,
  guestsEnabled: false,
  hosts: [],
};

// The duration field pollutes `selectableDurations` while it is being typed
// (every keystroke is a Number(), so "45" passes through 4). Normalize at the
// API boundary instead: keep only in-range choices and always include the
// default, which the server requires.
function normalizeDurations(form: EventTypeInput): EventTypeInput {
  const choices = [...(form.selectableDurations ?? []), form.durationMinutes]
    .filter((minutes) => Number.isInteger(minutes) && minutes >= 5 && minutes <= 480);
  return { ...form, selectableDurations: [...new Set(choices)].sort((a, b) => a - b) };
}

function eventTypeToInput(eventType: AdminEventType): EventTypeInput {
  return {
    slug: eventType.slug,
    title: eventType.title,
    description: eventType.description ?? null,
    durationMinutes: eventType.durationMinutes,
    selectableDurations: eventType.selectableDurations?.length
      ? eventType.selectableDurations
      : [eventType.durationMinutes],
    capacity: eventType.capacity,
    bufferBeforeMin: eventType.bufferBeforeMin,
    bufferAfterMin: eventType.bufferAfterMin,
    minimumNoticeMin: eventType.minimumNoticeMin,
    rollingWindowDays: eventType.rollingWindowDays,
    mode: eventType.mode,
    scheduleId: eventType.scheduleId,
    teamId: eventType.teamId,
    folderId: eventType.folderId,
    theme: eventType.theme,
    layout: eventType.layout ?? "focus",
    logoUrl: eventType.logoUrl ?? null,
    meetingFormats: eventType.meetingFormats ?? ["google_meet"],
    locations: eventType.locations?.length
      ? eventType.locations
      : (eventType.meetingFormats ?? ["google_meet"]).map((format) => format === "phone"
        ? {
            id: "phone",
            type: "phone" as const,
            label: "Phone call",
            phoneDirection: "organizer_calls_invitee" as const,
          }
        : { id: "google-meet", type: "google_meet" as const, label: "Google Meet" }),
    bookingQuestions: eventType.bookingQuestions ?? [],
    emailVerificationRequired: eventType.emailVerificationRequired ?? false,
    guestsEnabled: eventType.guestsEnabled ?? false,
    hosts: eventType.hosts.map(({ userId, role, weight }) => ({ userId, role, weight })),
  };
}
export function EventTypesTab({
  users,
  initialEditor,
  onEdit,
  onCloseEditor,
}: {
  users: DirectoryUser[];
  initialEditor?: "new" | string;
  onEdit: (eventTypeId: "new" | string) => void;
  onCloseEditor: () => void;
}) {
  const [eventTypes, setEventTypes] = useState<AdminEventType[] | null>(null);
  const [folders, setFolders] = useState<EventTypeFolder[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("calpaca:et-folders-collapsed");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [availableThemes, setAvailableThemes] = useState<PresentationOption[]>([...themeOptions]);
  const [availableLayouts, setAvailableLayouts] = useState<PresentationOption[]>([
    { value: "focus", label: "Focus" },
    { value: "split", label: "Split" },
    { value: "compact", label: "Compact" },
  ]);
  const [editing, setEditing] = useState<{ id: string | null; form: EventTypeInput } | null>(
    initialEditor === "new" ? { id: null, form: DEFAULT_EVENT_TYPE } : null,
  );
  const loadedEditorRef = useRef<string | null>(initialEditor === "new" ? "new" : null);
  const [editorNotFound, setEditorNotFound] = useState(false);
  const [embed, setEmbed] = useState<{ slug: string; mode: "inline" | "popup" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<Array<{
    path: Array<string | number>;
    message: string;
  }>>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [bookingBase, setBookingBase] = useState(window.location.origin);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const reload = useCallback(() => {
    listEventTypes()
      .then((r) => setEventTypes(r.eventTypes))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  const reloadFolders = useCallback(() => {
    listEventTypeFolders()
      .then((r) => setFolders(r.folders))
      .catch(() => undefined);
  }, []);

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      localStorage.setItem("calpaca:et-folders-collapsed", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createEventTypeFolder(name);
      setNewFolderName("");
      setCreatingFolder(false);
      reloadFolders();
    } catch (e) {
      setError(errorText(e));
    }
  }, [newFolderName, reloadFolders]);

  const renameFolder = useCallback(async (folderId: string, name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    try {
      await updateEventTypeFolder(folderId, { name: trimmed });
      reloadFolders();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }, [reloadFolders]);

  const moveFolder = useCallback(async (folderId: string, direction: -1 | 1) => {
    const index = folders.findIndex((f) => f.id === folderId);
    const swapWith = folders[index + direction];
    const current = folders[index];
    if (!swapWith || !current) return;
    try {
      await updateEventTypeFolder(current.id, { position: swapWith.position });
      await updateEventTypeFolder(swapWith.id, { position: current.position });
    } catch (e) {
      setError(errorText(e));
    } finally {
      // Duplicate positions are tolerated by the schema (no unique constraint),
      // so a partial failure just needs a resync, never a rollback.
      reloadFolders();
    }
  }, [folders, reloadFolders]);

  const deleteFolder = useCallback(async (folder: EventTypeFolder) => {
    const count = eventTypes?.filter((et) => et.folderId === folder.id).length ?? 0;
    if (count > 0) {
      const message = `Delete "${folder.name}"? Its ${count} event ${
        count === 1 ? "type" : "types"
      } will move to Ungrouped, not be deleted.`;
      if (!window.confirm(message)) return;
    }
    try {
      await deleteEventTypeFolder(folder.id);
      reloadFolders();
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }, [eventTypes, reloadFolders, reload]);

  const moveEventType = useCallback(async (eventTypeId: string, folderId: string | null) => {
    try {
      await setEventTypeFolder(eventTypeId, folderId);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }, [reload]);

  useEffect(() => {
    reload();
    reloadFolders();
    listSchedules().then((r) => setSchedules(r.schedules)).catch(() => undefined);
    listTeams().then((r) => setTeams(r.teams)).catch(() => undefined);
    listPresentationOptions().then((options) => {
      setAvailableThemes(options.themes);
      setAvailableLayouts(options.layouts);
    }).catch(() => undefined);
    getWorkspace().then(({ workspace, domains, deploymentMode }) => {
      const customDomain = domains.find((domain) => domain.status === "verified" && domain.isPrimary)
        ?? domains.find((domain) => domain.status === "verified");
      if (customDomain) {
        setBookingBase(`https://${customDomain.hostname}`);
      } else if (deploymentMode === "hosted") {
        setBookingBase(`https://calpaca.io/book/${workspace.slug}`);
      } else {
        setBookingBase(window.location.origin);
      }
    }).catch(() => undefined);
  }, [reload, reloadFolders]);

  useEffect(() => {
    if (!initialEditor) {
      loadedEditorRef.current = null;
      setEditorNotFound(false);
      setEditing(null);
      return;
    }
    if (loadedEditorRef.current === initialEditor) return;
    if (initialEditor === "new") {
      loadedEditorRef.current = initialEditor;
      setEditorNotFound(false);
      setEditing({ id: null, form: DEFAULT_EVENT_TYPE });
      return;
    }
    if (!eventTypes) return;
    const eventType = eventTypes.find((candidate) => candidate.id === initialEditor);
    loadedEditorRef.current = initialEditor;
    if (!eventType) {
      setEditing(null);
      setEditorNotFound(true);
      return;
    }
    setEditorNotFound(false);
    setEditing({ id: eventType.id, form: eventTypeToInput(eventType) });
  }, [eventTypes, initialEditor]);

  const save = async () => {
    if (!editing) return;
    setError(null);
    setValidationIssues([]);
    try {
      const form = normalizeDurations(editing.form);
      if (editing.id) await updateEventType(editing.id, form);
      else await createEventType(form);
      reload();
      onCloseEditor();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.code === "invalid_body" && e.issues) {
        setValidationIssues(e.issues.map((issue) => ({
          path: issue.path ?? (issue.field ? [issue.field] : []),
          message: issue.message ?? issue.reason ?? "This value is invalid.",
        })));
      }
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteEventType(id);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const copyLink = (slug: string) => {
    const url = bookingBase.includes("/book/")
      ? `${bookingBase}/${slug}`
      : `${bookingBase}/book/${slug}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => setError("Could not copy the booking link. Try again."));
  };

  const copyBookingPage = () => {
    const url = bookingBase.includes("/book/")
      ? bookingBase.replace("/book/", "/booking/")
      : `${bookingBase}/booking`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied("booking-page");
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => setError("Could not copy the booking page link. Try again."));
  };

  const embedSnippet = (slug: string, mode: "inline" | "popup") => {
    const bookingUrl = bookingBase.includes("/book/")
      ? `${bookingBase}/${slug}`
      : `${bookingBase}/book/${slug}`;
    const loader = `<script async src="${window.location.origin}/embed.js"></script>`;
    return mode === "inline"
      ? `<div data-calpaca-inline="${bookingUrl}"></div>\n${loader}`
      : `<button type="button" data-calpaca-popup="${bookingUrl}">Book a meeting</button>\n${loader}`;
  };

  const copyEmbed = (slug: string, mode: "inline" | "popup") => {
    void navigator.clipboard.writeText(embedSnippet(slug, mode)).then(() => {
      setCopied(`embed-${slug}-${mode}`);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => setError("Could not copy the embed code. Try again."));
  };

  const renderRow = useCallback((et: AdminEventType) => {
    const embedMode = embed?.slug === et.slug ? embed.mode : "inline";
    return (
      <EventTypeRow
        key={et.id}
        eventType={et}
        copied={copied}
        onCopyLink={() => copyLink(et.slug)}
        onToggleEmbed={() =>
          setEmbed(embed?.slug === et.slug ? null : { slug: et.slug, mode: "inline" })}
        onEdit={() => onEdit(et.id)}
        onRemove={() => void remove(et.id)}
        embedOpen={embed?.slug === et.slug}
        embedMode={embedMode}
        onEmbedModeChange={(mode) => setEmbed({ slug: et.slug, mode })}
        embedSnippetText={embedSnippet(et.slug, embedMode)}
        onCopyEmbed={() => copyEmbed(et.slug, embedMode)}
        folders={folders}
        onMove={(folderId) => void moveEventType(et.id, folderId)}
        onNewFolder={() => setCreatingFolder(true)}
      />
    );
  }, [copied, embed, onEdit, bookingBase, folders, moveEventType]);

  // An event type's folderId can point at a folder that no longer exists in
  // `folders` — e.g. for one render tick after deleteFolder's unawaited
  // reloadFolders() resolves before its reload(), or indefinitely for a
  // second user in the workspace until their own eventTypes refetch lands.
  // Treat that as Ungrouped rather than letting the event type vanish.
  const knownFolderIds = new Set(folders.map((f) => f.id));
  const isUngrouped = (et: AdminEventType) => !et.folderId || !knownFolderIds.has(et.folderId);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-xl">Event types</CardTitle>
          <CardDescription>What invitees can book, and with whom.</CardDescription>
        </div>
        {!initialEditor && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={copyBookingPage}>
              <Copy className="mr-1 h-4 w-4" />
              <CopyFeedbackLabel copied={copied === "booking-page"} idle="Booking page" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreatingFolder(true)}>
              <FolderPlus className="mr-1 h-4 w-4" /> New folder
            </Button>
            <Button size="sm" onClick={() => onEdit("new")}>
              <Plus className="mr-1 h-4 w-4" /> New
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {validationIssues.length > 0 && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/8 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">Please fix the following:</p>
            <ul className="mt-2 space-y-1.5 text-sm text-destructive">
              {validationIssues.map((issue, index) => {
                const field = String(issue.path[0] ?? "form");
                const label = field
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (character) => character.toUpperCase());
                const fieldIds: Record<string, string> = {
                  title: "et-title",
                  description: "et-description",
                  slug: "et-slug",
                  durationMinutes: "et-duration",
                  capacity: "et-capacity",
                  mode: "et-mode",
                  bufferBeforeMin: "et-buffer-before",
                  bufferAfterMin: "et-buffer-after",
                  minimumNoticeMin: "et-notice",
                  rollingWindowDays: "et-window",
                  scheduleId: "et-schedule",
                  theme: "et-theme",
                  logoUrl: "et-logo",
                  teamId: "et-team",
                };
                return (
                  <li key={`${issue.path.join(".")}-${index}`}>
                    <button
                      type="button"
                      className="text-left underline decoration-destructive/35 underline-offset-2"
                      onClick={() => document.getElementById(fieldIds[field] ?? "")?.focus()}
                    >
                      <span className="font-medium">{label}</span>: {issue.message}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {creatingFolder && !initialEditor && (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              aria-label="New folder name"
              placeholder="Folder name"
              className="h-8 max-w-xs"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createFolder();
                } else if (e.key === "Escape") {
                  setCreatingFolder(false);
                  setNewFolderName("");
                }
              }}
            />
            <Button size="sm" onClick={() => void createFolder()}>Save</Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}
        {editorNotFound ? (
          <ActionableEmptyState
            title="Event type not found"
            description="It may have been deleted, or the link may be incorrect."
            action={<Button size="sm" onClick={onCloseEditor}>Return to event types</Button>}
          />
        ) : initialEditor && !editing ? (
          <InlineLoading label="Loading event type…" />
        ) : editing ? (
          <EventTypeForm
            eventTypeId={editing.id}
            form={editing.form}
            validationIssues={validationIssues}
            users={users}
            schedules={schedules}
            teams={teams}
            folders={folders}
            themes={availableThemes}
            layouts={availableLayouts}
            onChange={(form) => {
              setValidationIssues([]);
              setEditing({ ...editing, form });
            }}
            onCancel={onCloseEditor}
            onSave={() => void save()}
          />
        ) : !eventTypes ? (
          <InlineLoading label="Loading event types…" />
        ) : eventTypes.length === 0 ? (
          <ActionableEmptyState
            title="No event types yet"
            description="Create a bookable meeting with its own duration, hosts, availability, and location."
            action={<Button size="sm" onClick={() => onEdit("new")}><Plus className="h-4 w-4" /> Create an event type</Button>}
          />
        ) : folders.length === 0 ? (
          <ul className="flex flex-col gap-2">
            {eventTypes.map(renderRow)}
          </ul>
        ) : (
          <div className="flex flex-col gap-4">
            {folders.map((folder, index) => (
              <FolderSection
                key={folder.id}
                folder={folder}
                eventTypes={eventTypes.filter((et) => et.folderId === folder.id)}
                collapsed={collapsed.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
                renderRow={renderRow}
                isFirst={index === 0}
                isLast={index === folders.length - 1}
                onRename={(name) => renameFolder(folder.id, name)}
                onMoveUp={() => moveFolder(folder.id, -1)}
                onMoveDown={() => moveFolder(folder.id, 1)}
                onDelete={() => deleteFolder(folder)}
              />
            ))}
            {eventTypes.some(isUngrouped) && (
              <FolderSection
                folder={null}
                eventTypes={eventTypes.filter(isUngrouped)}
                collapsed={collapsed.has("ungrouped")}
                onToggle={() => toggleFolder("ungrouped")}
                renderRow={renderRow}
              />
            )}
          </div>
        )}
        {eventTypes && !editing && !initialEditor && (
          <BookingPagesManager
            eventTypes={eventTypes}
            bookingBase={bookingBase}
            themes={availableThemes}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EventTypeRow({
  eventType: et,
  copied,
  onCopyLink,
  onToggleEmbed,
  onEdit,
  onRemove,
  embedOpen,
  embedMode,
  onEmbedModeChange,
  embedSnippetText,
  onCopyEmbed,
  folders,
  onMove,
  onNewFolder,
}: {
  eventType: AdminEventType;
  copied: string | null;
  onCopyLink: () => void;
  onToggleEmbed: () => void;
  onEdit: () => void;
  onRemove: () => void;
  embedOpen: boolean;
  embedMode: "inline" | "popup";
  onEmbedModeChange: (mode: "inline" | "popup") => void;
  embedSnippetText: string;
  onCopyEmbed: () => void;
  folders: EventTypeFolder[];
  onMove: (folderId: string | null) => void;
  onNewFolder: () => void;
}) {
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);
  const moveMenuTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <li
      className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
    >
      <span className="min-w-0 grow basis-full sm:basis-0">
        <span className="font-medium">{et.title}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          /{et.slug} · {(et.selectableDurations?.length ?? 0) > 1
            ? `${et.selectableDurations!.join("/")} min`
            : `${et.durationMinutes} min`} · {et.mode.replace("_", " ")}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onCopyLink}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          <CopyFeedbackLabel copied={copied === et.slug} idle="Link" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleEmbed}
        >
          <Code2 className="mr-1 h-3.5 w-3.5" />
          Embed
        </Button>
        <div
          ref={moveMenuRef}
          className="relative"
          onBlur={(event) => {
            if (!moveMenuRef.current?.contains(event.relatedTarget as Node | null)) {
              setMoveMenuOpen(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && moveMenuOpen) {
              event.stopPropagation();
              setMoveMenuOpen(false);
              moveMenuTriggerRef.current?.focus();
            }
          }}
        >
          <button
            ref={moveMenuTriggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={moveMenuOpen}
            aria-label={`Move ${et.title} to a folder`}
            className="inline-flex h-11 items-center gap-1 rounded-md px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-8"
            onClick={() => setMoveMenuOpen((open) => !open)}
          >
            <FolderInput className="mr-1 h-3.5 w-3.5" />
            Move to
          </button>
          {moveMenuOpen && (
            <div
              role="menu"
              aria-label={`Move ${et.title} to a folder`}
              className="absolute right-0 top-full z-10 mt-1 flex w-48 flex-col gap-0.5 rounded-md border border-border bg-card p-1 shadow-md"
            >
              {folders.length === 0 ? (
                <Button
                  type="button"
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setMoveMenuOpen(false);
                    onNewFolder();
                  }}
                >
                  New folder…
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    role="menuitem"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setMoveMenuOpen(false);
                      onMove(null);
                    }}
                  >
                    <span className="mr-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      {et.folderId === null && <Check className="h-3.5 w-3.5" />}
                    </span>
                    Ungrouped
                  </Button>
                  {folders.map((folder) => (
                    <Button
                      key={folder.id}
                      type="button"
                      role="menuitem"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => {
                        setMoveMenuOpen(false);
                        onMove(folder.id);
                      }}
                    >
                      <span className="mr-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                        {et.folderId === folder.id && <Check className="h-3.5 w-3.5" />}
                      </span>
                      {folder.name}
                    </Button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Edit ${et.title}`}
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${et.title}`}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </span>
      {embedOpen && (
        <div className="basis-full rounded-lg border border-border bg-muted/35 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Add to your website</p>
              <p className="text-xs text-muted-foreground">
                The booking frame resizes automatically.
              </p>
            </div>
            <div className="flex rounded-md border border-border bg-card p-0.5">
              {(["inline", "popup"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                    embedMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                  onClick={() => onEmbedModeChange(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <pre className="overflow-x-auto rounded-md bg-foreground p-3 text-xs leading-5 text-background">
            <code>{embedSnippetText}</code>
          </pre>
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={onCopyEmbed}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              <CopyFeedbackLabel copied={copied === `embed-${et.slug}-${embedMode}`} idle="Copy code" />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function FolderSection({
  folder,
  eventTypes,
  collapsed,
  onToggle,
  renderRow,
  isFirst,
  isLast,
  onRename,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  folder: EventTypeFolder | null;
  eventTypes: AdminEventType[];
  collapsed: boolean;
  onToggle: () => void;
  renderRow: (et: AdminEventType) => ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
  onRename?: (name: string) => Promise<boolean>;
  onMoveUp?: () => Promise<void>;
  onMoveDown?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const listId = `et-folder-list-${folder?.id ?? "ungrouped"}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const handleRenameSave = async () => {
    if (!onRename) return;
    // onRename resolves false both on a guarded no-op (empty/whitespace name)
    // and on a server rejection (e.g. folder_name_taken, already surfaced via
    // the parent's error state) — either way the input must stay open rather
    // than silently closing as though the rename had applied.
    const success = await onRename(renameValue);
    if (success) setRenaming(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {renaming ? (
          <span className="flex items-center gap-1.5">
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              aria-label="Folder name"
              className="h-7 w-40 text-sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRenameSave();
                } else if (e.key === "Escape") {
                  setRenaming(false);
                }
              }}
            />
            <Button size="sm" variant="outline" onClick={() => void handleRenameSave()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <button
            type="button"
            className="flex items-center gap-2 text-left text-sm font-medium"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onClick={onToggle}
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
              aria-hidden="true"
            />
            <span>{folder?.name ?? "Ungrouped"}</span>
            <span className="text-xs font-normal text-muted-foreground">({eventTypes.length})</span>
          </button>
        )}
        {folder !== null && !renaming && (
          <div
            ref={menuRef}
            className="relative ml-auto"
            onBlur={(event) => {
              if (!menuRef.current?.contains(event.relatedTarget as Node | null)) {
                setMenuOpen(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && menuOpen) {
                event.stopPropagation();
                setMenuOpen(false);
                menuTriggerRef.current?.focus();
              }
            }}
          >
            <button
              ref={menuTriggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Folder actions for ${folder.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label={`${folder.name} folder actions`}
                className="absolute right-0 top-full z-10 mt-1 flex w-40 flex-col gap-0.5 rounded-md border border-border bg-card p-1 shadow-md"
              >
                <Button
                  type="button"
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setMenuOpen(false);
                    setRenameValue(folder.name);
                    setRenaming(true);
                  }}
                >
                  Rename
                </Button>
                <Button
                  type="button"
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  disabled={isFirst}
                  onClick={() => {
                    setMenuOpen(false);
                    void onMoveUp?.();
                  }}
                >
                  Move up
                </Button>
                <Button
                  type="button"
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  disabled={isLast}
                  onClick={() => {
                    setMenuOpen(false);
                    void onMoveDown?.();
                  }}
                >
                  Move down
                </Button>
                <Button
                  type="button"
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={() => {
                    setMenuOpen(false);
                    void onDelete?.();
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <ul
        id={listId}
        className={collapsed ? undefined : "flex flex-col gap-2"}
        hidden={collapsed}
      >
        {eventTypes.map(renderRow)}
      </ul>
    </div>
  );
}

type EventTypeSection = "hosts" | "availability" | "location" | "invitee" | "appearance" | "sharing";

const EVENT_TYPE_SECTION_FOR_FIELD: Partial<Record<keyof EventTypeInput, EventTypeSection>> = {
  hosts: "hosts",
  bufferBeforeMin: "availability",
  bufferAfterMin: "availability",
  minimumNoticeMin: "availability",
  rollingWindowDays: "availability",
  scheduleId: "availability",
  locations: "location",
  meetingFormats: "location",
  bookingQuestions: "invitee",
  emailVerificationRequired: "invitee",
  guestsEnabled: "invitee",
  theme: "appearance",
  layout: "appearance",
  logoUrl: "sharing",
  teamId: "sharing",
};

function EventTypeDisclosure({
  section,
  title,
  description,
  open,
  onToggle,
  children,
}: {
  section: EventTypeSection;
  title: string;
  description: string;
  open: boolean;
  onToggle: (section: EventTypeSection, open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="rounded-lg border border-border sm:col-span-2"
      open={open}
      onToggle={(event) => onToggle(section, event.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span>
          <span className="block text-sm font-medium">{title}</span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

function EventTypeForm({
  eventTypeId,
  form,
  validationIssues,
  users,
  schedules,
  teams,
  folders,
  themes,
  layouts,
  onChange,
  onCancel,
  onSave,
}: {
  eventTypeId: string | null;
  form: EventTypeInput;
  validationIssues: Array<{ path: Array<string | number>; message: string }>;
  users: DirectoryUser[];
  schedules: Schedule[];
  teams: Team[];
  folders: EventTypeFolder[];
  themes: PresentationOption[];
  layouts: PresentationOption[];
  onChange: (form: EventTypeInput) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [openSections, setOpenSections] = useState<Set<EventTypeSection>>(
    () => new Set(["hosts"]),
  );
  const set = <K extends keyof EventTypeInput>(key: K, value: EventTypeInput[K]) =>
    onChange({ ...form, [key]: value });
  const fieldError = (field: keyof EventTypeInput) =>
    validationIssues.find((issue) => issue.path[0] === field)?.message;
  const invalidProps = (field: keyof EventTypeInput) => {
    const message = fieldError(field);
    return message
      ? { "aria-invalid": true as const, "aria-describedby": `et-${field}-error` }
      : {};
  };
  const FieldError = ({ field }: { field: keyof EventTypeInput }) => {
    const message = fieldError(field);
    return message
      ? <p id={`et-${field}-error`} className="text-xs text-destructive">{message}</p>
      : null;
  };
  const invalidSections = new Set(
    validationIssues
      .map((issue) => EVENT_TYPE_SECTION_FOR_FIELD[issue.path[0] as keyof EventTypeInput])
      .filter((section): section is EventTypeSection => section !== undefined),
  );
  const toggleSection = (section: EventTypeSection, open: boolean) => {
    if (!open && invalidSections.has(section)) {
      setOpenSections((current) => new Set(current));
      return;
    }
    setOpenSections((current) => {
      const next = new Set(current);
      if (open) next.add(section);
      else next.delete(section);
      return next;
    });
  };

  useEffect(() => {
    const invalidSections = validationIssues
      .map((issue) => EVENT_TYPE_SECTION_FOR_FIELD[issue.path[0] as keyof EventTypeInput])
      .filter((section): section is EventTypeSection => section !== undefined);
    if (invalidSections.length === 0) return;
    setOpenSections((current) => new Set([...current, ...invalidSections]));
  }, [validationIssues]);

  const requiredHosts = form.hosts.filter((h) => h.role !== "optional").map((h) => h.userId);
  const optionalHosts = form.hosts.filter((h) => h.role === "optional").map((h) => h.userId);

  const setHosts = (required: string[], optional: string[]) => {
    const role = form.mode === "group" ? ("required" as const) : ("member" as const);
    set("hosts", [
      ...required.map((userId) => ({ userId, role, weight: 100 })),
      ...optional.map((userId) => ({ userId, role: "optional" as const, weight: 100 })),
    ]);
  };

  const canSave =
    form.title.trim() !== "" &&
    form.slug.trim() !== "" &&
    form.hosts.length >= 1 &&
    (form.mode !== "solo" || form.hosts.length === 1);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div>
        <h3 className="text-sm font-medium">Basics</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">What people book and how long it takes.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-title">Title</Label>
          <Input
            id="et-title"
            {...invalidProps("title")}
            value={form.title}
            onChange={(e) => {
              const title = e.target.value;
              const slugWasDerived = form.slug === slugify(form.title);
              onChange({ ...form, title, slug: slugWasDerived ? slugify(title) : form.slug });
            }}
          />
          <FieldError field="title" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="et-description">Meeting description</Label>
          <Textarea
            id="et-description"
            {...invalidProps("description")}
            maxLength={2000}
            value={form.description ?? ""}
            placeholder="Tell invitees what to expect and how to prepare."
            onChange={(e) => set("description", e.target.value || null)}
          />
          <FieldError field="description" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-slug">Slug</Label>
          <Input
            id="et-slug"
            {...invalidProps("slug")}
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="intro-call"
          />
          <FieldError field="slug" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-duration">Duration (min)</Label>
          <Input
            id="et-duration"
            {...invalidProps("durationMinutes")}
            type="number"
            min={5}
            max={480}
            value={form.durationMinutes}
            onChange={(e) => set("durationMinutes", Number(e.target.value))}
          />
          <FieldError field="durationMinutes" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Invitee duration choices</Label>
          <div className="flex flex-wrap gap-2">
            {[15, 30, 45, 60, 90, 120].map((minutes) => {
              const isDefault = minutes === form.durationMinutes;
              const selected = isDefault
                || (form.selectableDurations ?? []).includes(minutes);
              return (
                <Button
                  key={minutes}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  disabled={isDefault}
                  onClick={() => {
                    const current = form.selectableDurations ?? [form.durationMinutes];
                    set("selectableDurations", selected
                      ? current.filter((duration) => duration !== minutes)
                      : [...current, minutes].sort((a, b) => a - b));
                  }}
                >
                  {minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}
                  {isDefault ? " · default" : ""}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            The default duration is always available. Add choices invitees can select before viewing times.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-capacity">Seats per time</Label>
          <Input
            id="et-capacity"
            {...invalidProps("capacity")}
            type="number"
            min={1}
            max={500}
            value={form.capacity}
            onChange={(e) => {
              const capacity = Number(e.target.value);
              onChange({
                ...form,
                capacity,
                ...(capacity > 1 ? { mode: "solo" as const } : {}),
              });
            }}
          />
          <FieldError field="capacity" />
          <p className="text-xs text-muted-foreground">
            Use more than one for a shared session. Capacity sessions use solo mode.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-mode">Mode</Label>
          <select
            id="et-mode"
            {...invalidProps("mode")}
            className={`flex h-9 w-full rounded-md border bg-card px-3 py-1 text-sm shadow-sm ${fieldError("mode") ? "border-destructive" : "border-border"}`}
            value={form.mode}
            onChange={(e) => {
              const mode = e.target.value as EventTypeInput["mode"];
              onChange({
                ...form,
                mode,
                ...(mode !== "solo" ? { capacity: 1 } : {}),
              });
            }}
          >
            <option value="solo">Solo</option>
            <option value="round_robin">Round robin</option>
            <option value="group">Group (all hosts)</option>
          </select>
          <FieldError field="mode" />
        </div>
        <EventTypeDisclosure
          section="availability"
          title="Availability"
          description="Schedules, booking limits, notice, and buffers."
          open={openSections.has("availability")}
          onToggle={toggleSection}
        >
          <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-buffer-before">Buffer before (min)</Label>
          <Input
            id="et-buffer-before"
            {...invalidProps("bufferBeforeMin")}
            type="number"
            min={0}
            max={240}
            value={form.bufferBeforeMin}
            onChange={(e) => set("bufferBeforeMin", Number(e.target.value))}
          />
          <FieldError field="bufferBeforeMin" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-buffer-after">Buffer after (min)</Label>
          <Input
            id="et-buffer-after"
            {...invalidProps("bufferAfterMin")}
            type="number"
            min={0}
            max={240}
            value={form.bufferAfterMin}
            onChange={(e) => set("bufferAfterMin", Number(e.target.value))}
          />
          <FieldError field="bufferAfterMin" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-notice">Minimum notice (min)</Label>
          <Input
            id="et-notice"
            {...invalidProps("minimumNoticeMin")}
            type="number"
            min={0}
            max={10080}
            value={form.minimumNoticeMin}
            onChange={(e) => set("minimumNoticeMin", Number(e.target.value))}
          />
          <FieldError field="minimumNoticeMin" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-window">Booking window (days)</Label>
          <Input
            id="et-window"
            {...invalidProps("rollingWindowDays")}
            type="number"
            min={1}
            max={90}
            value={form.rollingWindowDays}
            onChange={(e) => set("rollingWindowDays", Number(e.target.value))}
          />
          <FieldError field="rollingWindowDays" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-schedule">Schedule</Label>
          <select
            id="et-schedule"
            {...invalidProps("scheduleId")}
            className={`flex h-9 w-full rounded-md border bg-card px-3 py-1 text-sm shadow-sm ${fieldError("scheduleId") ? "border-destructive" : "border-border"}`}
            value={form.scheduleId ?? ""}
            onChange={(e) => set("scheduleId", e.target.value === "" ? null : e.target.value)}
          >
            <option value="">Host default</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <FieldError field="scheduleId" />
        </div>
        {eventTypeId && (
          <div className="sm:col-span-2">
            <a
              href={`/app/workspace/availability?view=troubleshooter&eventTypeId=${encodeURIComponent(eventTypeId)}&durationMinutes=${form.durationMinutes}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8"
            >
              <SearchCheck className="h-4 w-4" />
              Inspect a time for this event type
            </a>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Opens the availability troubleshooter in a new tab, so this draft stays here.
            </p>
          </div>
        )}
          </div>
        </EventTypeDisclosure>
        <EventTypeDisclosure
          section="appearance"
          title="Appearance"
          description="Theme and booking-page layout."
          open={openSections.has("appearance")}
          onToggle={toggleSection}
        >
          <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-theme">Theme</Label>
          <select
            id="et-theme"
            {...invalidProps("theme")}
            className={`flex h-9 w-full rounded-md border bg-card px-3 py-1 text-sm shadow-sm ${fieldError("theme") ? "border-destructive" : "border-border"}`}
            value={form.theme}
            onChange={(e) => set("theme", e.target.value)}
          >
            {themes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <FieldError field="theme" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Booking layout</Label>
          <div className="grid grid-cols-3 gap-2">
            {layouts.map((layout) => {
              const active = (form.layout ?? "focus") === layout.value;
              return (
                <button
                  key={layout.value}
                  type="button"
                  className={`rounded-lg border p-3 text-left transition ${
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"
                  }`}
                  onClick={() => set("layout", layout.value as EventTypeInput["layout"])}
                >
                  <span className={`mb-2 block h-8 rounded border ${layout.value === "split" ? "bg-[linear-gradient(90deg,var(--muted)_38%,var(--card)_38%)]" : layout.value === "compact" ? "mx-auto w-2/3 bg-muted" : "bg-card"}`} />
                  <span className="block text-xs font-medium">{layout.label}</span>
                </button>
              );
            })}
          </div>
        </div>
          </div>
        </EventTypeDisclosure>
        <EventTypeDisclosure
          section="location"
          title="Location"
          description="Where the meeting happens and what invitees need to know."
          open={openSections.has("location")}
          onToggle={toggleSection}
        >
        <div className="flex flex-col gap-3">
          <div>
            <Label>Locations</Label>
            <p className="text-xs text-muted-foreground">Invitees choose one. Team hosts may override the details.</p>
          </div>
          {(form.locations ?? []).map((location, index) => {
            const setLocation = (patch: Partial<typeof location>) => set(
              "locations",
              (form.locations ?? []).map((item, itemIndex) =>
                itemIndex === index ? { ...item, ...patch } : item),
            );
            const detailKey = location.type === "in_person"
              ? "address"
              : location.type === "custom_url" ? "url" : location.type === "phone" ? "phoneNumber" : null;
            return (
              <div key={location.id} className="space-y-3 rounded-xl border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                  <Input value={location.label} placeholder="Location label" onChange={(event) => setLocation({ label: event.target.value })} />
                  <select className="h-9 rounded-md border border-border bg-card px-3 text-sm" value={location.type} onChange={(event) => {
                    const type = event.target.value as typeof location.type;
                    setLocation({
                      type,
                      ...(type === "phone" ? { phoneDirection: "organizer_calls_invitee" } : {}),
                    });
                  }}>
                    <option value="google_meet">Google Meet</option>
                    <option value="phone">Phone</option>
                    <option value="in_person">In person</option>
                    <option value="custom_url">Custom URL</option>
                  </select>
                  <Button type="button" variant="ghost" size="sm" disabled={(form.locations?.length ?? 0) === 1} onClick={() => set(
                    "locations",
                    (form.locations ?? []).filter((_, itemIndex) => itemIndex !== index),
                  )}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {detailKey && (
                  <Input
                    type={detailKey === "url" ? "url" : "text"}
                    placeholder={detailKey === "address" ? "Address" : detailKey === "url" ? "https://…" : "Organizer phone number (if invitee calls)"}
                    value={location[detailKey] ?? ""}
                    onChange={(event) => setLocation({ [detailKey]: event.target.value || undefined })}
                  />
                )}
                {location.type === "phone" && (
                  <select className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm" value={location.phoneDirection ?? "organizer_calls_invitee"} onChange={(event) => setLocation({
                    phoneDirection: event.target.value as NonNullable<typeof location.phoneDirection>,
                  })}>
                    <option value="organizer_calls_invitee">Organizer calls invitee</option>
                    <option value="invitee_calls_organizer">Invitee calls organizer</option>
                  </select>
                )}
                <Textarea value={location.instructions ?? ""} placeholder="Instructions (optional)" onChange={(event) => setLocation({ instructions: event.target.value || undefined })} />
                {form.hosts.length > 1 && detailKey && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground">Per-host override</p>
                    {form.hosts.map((host) => {
                      const person = users.find((user) => user.id === host.userId);
                      const override = location.hostOverrides?.[host.userId] ?? {};
                      return (
                        <div key={host.userId} className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
                          <span className="truncate text-xs">{person?.name ?? host.userId}</span>
                          <Input
                            placeholder={`Use default ${detailKey.replace(/([A-Z])/g, " $1").toLowerCase()}`}
                            value={override[detailKey] ?? ""}
                            onChange={(event) => setLocation({
                              hostOverrides: {
                                ...(location.hostOverrides ?? {}),
                                [host.userId]: { ...override, [detailKey]: event.target.value || undefined },
                              },
                            })}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <Button type="button" variant="outline" className="self-start" onClick={() => {
            const next = (form.locations?.length ?? 0) + 1;
            set("locations", [
              ...(form.locations ?? []),
              { id: `location-${next}`, type: "in_person", label: "In person", address: "" },
            ]);
          }}><Plus className="h-4 w-4" /> Add location</Button>
        </div>
        </EventTypeDisclosure>
        <EventTypeDisclosure
          section="invitee"
          title="Invitee form"
          description="Verification and questions collected before confirmation."
          open={openSections.has("invitee")}
          onToggle={toggleSection}
        >
        <div className="flex flex-col gap-4">
          <label className="flex items-start gap-3 rounded-xl border border-border p-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={form.emailVerificationRequired ?? false}
              onChange={(event) => set("emailVerificationRequired", event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Verify invitee email before booking</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Send a six-digit code before confirmation. Verified browsers are trusted for 30 days.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-border p-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={form.guestsEnabled ?? false}
              onChange={(event) => set("guestsEnabled", event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Let invitees add guests</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Guests are invited to the calendar event and copied on every email. Up to ten per booking.
              </span>
            </span>
          </label>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Booking questions</Label>
            <p className="text-xs text-muted-foreground">Collect structured information with each booking. Hidden fields accept URL-prefilled or API values.</p>
          </div>
          {(form.bookingQuestions ?? []).map((question, index) => {
            const setQuestion = (patch: Partial<typeof question>) => set(
              "bookingQuestions",
              (form.bookingQuestions ?? []).map((item, itemIndex) =>
                itemIndex === index ? { ...item, ...patch } : item,
              ),
            );
            const usesOptions = question.type === "select" || question.type === "multiselect";
            return (
              <div key={question.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_150px_auto]">
                <Input value={question.label} placeholder="Question label" onChange={(event) => setQuestion({
                  label: event.target.value,
                  id: question.id.startsWith("question-") ? `question-${index + 1}` : question.id,
                })} />
                <select className="h-9 rounded-md border border-border bg-card px-3 text-sm" value={question.type} onChange={(event) => setQuestion({
                  type: event.target.value as typeof question.type,
                  ...(event.target.value === "select" || event.target.value === "multiselect"
                    ? { options: question.options?.length ? question.options : ["Option 1"] }
                    : { options: undefined }),
                })}>
                  <option value="text">Short text</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Select</option>
                  <option value="multiselect">Multiselect</option>
                  <option value="phone">Phone</option>
                  <option value="checkbox">Checkbox</option>
                </select>
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${question.label || "question"}`} onClick={() => set(
                  "bookingQuestions",
                  (form.bookingQuestions ?? []).filter((_, itemIndex) => itemIndex !== index),
                )}><Trash2 className="h-4 w-4" /></Button>
                <Input value={question.id} placeholder="field-id" onChange={(event) => setQuestion({ id: slugify(event.target.value) })} />
                <div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-2">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={question.required} onChange={(event) => setQuestion({ required: event.target.checked })} /> Required</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={question.hidden} onChange={(event) => setQuestion({ hidden: event.target.checked })} /> Hidden</label>
                </div>
                {usesOptions && (
                  <Input className="sm:col-span-3" value={(question.options ?? []).join(", ")} placeholder="Option 1, Option 2" onChange={(event) => setQuestion({
                    options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean),
                  })} />
                )}
              </div>
            );
          })}
          <Button type="button" variant="outline" className="self-start" onClick={() => {
            const next = (form.bookingQuestions?.length ?? 0) + 1;
            set("bookingQuestions", [
              ...(form.bookingQuestions ?? []),
              { id: `question-${next}`, label: "", type: "text", required: false, hidden: false },
            ]);
          }}><Plus className="h-4 w-4" /> Add question</Button>
        </div>
        </div>
        </EventTypeDisclosure>
        <EventTypeDisclosure
          section="sharing"
          title="Sharing"
          description="Workspace ownership and public-page branding."
          open={openSections.has("sharing")}
          onToggle={toggleSection}
        >
          <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="et-logo">Whitelabel logo URL</Label>
          <Input
            id="et-logo"
            {...invalidProps("logoUrl")}
            type="url"
            value={form.logoUrl ?? ""}
            placeholder="https://example.com/logo.svg"
            onChange={(e) => set("logoUrl", e.target.value || null)}
          />
          <FieldError field="logoUrl" />
          <p className="text-xs text-muted-foreground">Optional. Displayed on the public booking page and booking emails.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-team">Team</Label>
          <select
            id="et-team"
            {...invalidProps("teamId")}
            className={`flex h-9 w-full rounded-md border bg-card px-3 py-1 text-sm shadow-sm ${fieldError("teamId") ? "border-destructive" : "border-border"}`}
            value={form.teamId ?? ""}
            onChange={(e) => set("teamId", e.target.value === "" ? null : e.target.value)}
          >
            <option value="">Personal</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <FieldError field="teamId" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="et-folder">Folder</Label>
          <select
            id="et-folder"
            className="block h-9 rounded-md border border-border bg-card px-3 text-sm"
            value={form.folderId ?? ""}
            onChange={(event) => onChange({ ...form, folderId: event.target.value || null })}
          >
            <option value="">Ungrouped</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Organizes your dashboard list. Invitees never see folders.
          </p>
        </div>
          </div>
        </EventTypeDisclosure>
      </div>

      <EventTypeDisclosure
        section="hosts"
        title="Hosts"
        description="People who can be assigned or must attend."
        open={openSections.has("hosts")}
        onToggle={toggleSection}
      >
      <div className="flex flex-col gap-1.5">
        <Label>{form.mode === "group" ? "Required hosts" : "Hosts"}</Label>
        <PeoplePicker
          users={users}
          selected={requiredHosts}
          max={form.mode === "solo" ? 1 : undefined}
          onChange={(ids) => setHosts(ids, optionalHosts)}
        />
      </div>
      {form.mode === "group" && (
        <div className="flex flex-col gap-1.5">
          <Label>Optional attendees</Label>
          <PeoplePicker
            users={users}
            selected={optionalHosts}
            onChange={(ids) => setHosts(requiredHosts, ids)}
          />
        </div>
      )}
      </EventTypeDisclosure>

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSave}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
