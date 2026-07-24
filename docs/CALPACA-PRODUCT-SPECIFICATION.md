# Calpaca Product Specification

Version: 1.0  
Date: July 23, 2026  
Status: Engineering handoff candidate  
Scope: Experience architecture and staged implementation  
Visual styling: Intentionally unspecified

## 0. Product contract

This specification translates the frozen product strategy into an application architecture.

The product thesis is:

> Calpaca is the best scheduling platform for client-service agencies because it schedules around delivery work, preserves client and project continuity, assembles the right people, and recovers automatically when plans change.

The primary object is the **Engagement**, a bounded body of work between an agency and a client.

The core interaction is not publishing a generic booking page. It is turning a conversation intent inside an engagement into an explained proposal, a confirmed meeting, a prepared meeting, an outcome, and where necessary a recovery or next step.

### 0.1 Invariants

These rules are not optional implementation details:

1. Every durable organizer object has a durable URL.
2. Every recommendation identifies the evidence and constraints used.
3. Unknown availability is never presented as available.
4. Existing meetings are never moved without the approval required by policy.
5. Engagement context survives proposal, booking, reschedule, cancellation, recovery, completion, and follow-up.
6. The full calendar is not required to create an engagement.
7. A user can complete the common path without advanced configuration.
8. Public participants do not need a Calpaca account.
9. Mobile supports monitoring, proposal approval, client response, meeting change, preparation, completion, and recovery.
10. Existing generic scheduling capabilities remain reachable during migration but do not dictate the new information architecture.

### 0.2 Roles

| Role | Scope | Core permissions |
| --- | --- | --- |
| Workspace owner | Workspace | All configuration, ownership transfer, billing, data export, destructive workspace actions |
| Workspace administrator | Workspace | People, roles, connections, policies, engagements, meetings, audit, excluding ownership and designated billing actions |
| Engagement lead | One or more engagements | Manage engagement context, team, playbooks, proposals, meetings, preparation, outcomes, and recovery |
| Contributor | Assigned engagements | Participate, set personal constraints, respond to proposals, complete preparation, record permitted outcomes |
| Coordinator | Workspace or selected engagements | Create and manage proposals and meetings without changing workspace policy |
| Client participant | Token-scoped public access | Respond to a proposal, provide preparation, reschedule or cancel when permitted |
| Integration actor | Scoped service identity | Read or mutate only explicitly granted object and action scopes |

Stage 1 may implement Owner, Administrator, Member, and token-scoped Client while preserving this capability model in route and component design.

### 0.3 Object lifecycle summary

| Object | Lifecycle |
| --- | --- |
| Engagement | Potential, Active, Paused, Completing, Completed, Archived |
| Conversation playbook | Draft, Ready, Retired |
| Proposal | Draft, Awaiting internal confirmation, Ready to send, Awaiting client, Accepted, Expired, Withdrawn |
| Meeting | Confirmed, Needs attention, Completed, Cancelled |
| Preparation item | Not started, In progress, Complete, Waived |
| Recovery case | Detected, Proposed, Awaiting approval, Executing, Resolved, Dismissed |
| Connection | Healthy, Delayed, Action required, Disconnected |

Lifecycle vocabulary appears consistently in navigation, lists, details, search, and notifications.

---

# Phase 1: Information architecture

## 1.1 Global application map

```text
Public site
├── /
├── /sign-in
├── /accept-invite/:token
├── /proposal/:token
│   ├── respond
│   ├── request-alternative
│   └── accepted
├── /schedule/:token
│   ├── choose-conversation
│   ├── choose-time
│   ├── provide-details
│   └── confirmed
├── /meeting/:token
│   ├── details
│   ├── preparation
│   ├── reschedule
│   └── cancel
├── /book/:slug                     [legacy direct booking]
├── /book/:workspace/:slug          [legacy hosted direct booking]
├── /booking                        [legacy booking catalogue]
├── /booking/:workspace             [legacy hosted catalogue]
├── /booking/p/:page                [legacy custom catalogue]
├── /booking/:workspace/p/:page     [legacy hosted custom catalogue]
├── /r/:slug                        [legacy routing]
├── /r/:workspace/:slug             [legacy hosted routing]
├── /reschedule/:bookingId          [legacy signed action]
├── /cancel/:bookingId              [legacy signed action]
├── /poll/:publicId                 [legacy tool]
├── /signup/:publicId               [legacy tool]
├── /signup/cancel/:token           [legacy signed action]
└── /offer/:publicId                [legacy tool]

Authenticated application
└── /app
    ├── /home
    ├── /engagements
    │   ├── /new
    │   └── /:engagementId
    │       ├── /overview
    │       ├── /conversations
    │       │   ├── /new
    │       │   └── /:playbookId/edit
    │       ├── /proposals
    │       │   └── /new
    │       ├── /meetings
    │       ├── /people
    │       ├── /activity
    │       └── /settings
    ├── /proposals/:proposalId
    ├── /meetings
    │   ├── /views/:viewId
    │   └── /:meetingId
    │       ├── /overview
    │       ├── /preparation
    │       ├── /complete
    │       └── /history
    ├── /recoveries/:recoveryId
    ├── /clients
    │   └── /:clientId
    ├── /insights
    │   ├── /delivery
    │   ├── /continuity
    │   ├── /meetings
    │   └── /recovery
    ├── /workspace
    │   ├── /general
    │   ├── /people
    │   ├── /roles
    │   ├── /availability
    │   ├── /calendars
    │   ├── /connections
    │   ├── /conversation-playbooks
    │   ├── /domains
    │   ├── /api
    │   ├── /audit
    │   └── /data
    ├── /account
    │   ├── /profile
    │   ├── /preferences
    │   └── /security
    ├── /search
    └── /tools                          [legacy and secondary]
        ├── /polls
        ├── /signup-sheets
        ├── /capacity-events
        ├── /booking-pages
        └── /routing
```

### Route rules

- `/app` redirects to `/app/home`.
- A route remains stable when an object's name changes.
- Human-readable slugs may supplement opaque IDs but never replace stable identity.
- Public routes use opaque, revocable capabilities. They do not reveal client or engagement IDs.
- Expired public tokens resolve to a specific terminal state with a safe next action.
- Unauthorized authenticated routes show the missing permission and a route back to the nearest accessible parent.
- Deleted or archived objects retain a tombstone route when audit or history access is permitted.

## 1.2 Global navigation

### Desktop

Persistent sidebar:

1. Home
2. Engagements
3. Meetings
4. Insights

Persistent utilities:

- Search
- Quick create
- Notifications requiring action
- Workspace switcher
- Workspace
- Account
- Help

Clients are not a primary destination. They are reachable through Engagements, search, recent items, and direct links. This protects the Engagement-centered model.

Legacy Tools appears in Workspace utilities, not daily navigation.

### Mobile

Persistent bottom navigation:

1. Home
2. Engagements
3. Meetings
4. More

More opens a full navigation sheet containing:

- Insights
- Clients
- Workspace
- Tools
- Account
- Help

Search is available in the top bar on every authenticated screen. Quick create is available from Home, Engagements, and the More sheet.

### Current location

- The selected global destination is visible.
- The page title names the current object or view.
- Contextual tabs show the active sub-location.
- Breadcrumbs appear only when the user can move to a meaningful parent, such as Engagements > Acme website relaunch > Conversations.
- Mobile uses one back label, such as “Acme website relaunch,” instead of a multi-level breadcrumb.

## 1.3 Contextual navigation

### Engagement

Tabs:

- Overview
- Conversations
- Proposals
- Meetings
- People
- Activity

Settings is an overflow action for Engagement leads and administrators.

The engagement identity and lifecycle remain visible above the tabs. The client is a linked supporting object.

### Meeting

Tabs:

- Overview
- Preparation
- History

Complete is an action, not a persistent tab, until the meeting reaches its completion window. It then opens `/complete`.

### Workspace

Sections:

- Workspace
- People and access
- Scheduling inputs
- Connections
- Publishing
- Developer and data

The section index remains visible on desktop. Mobile uses a settings index and one-level drill-in.

## 1.4 Entry points

| Intent | Entry point |
| --- | --- |
| Start daily work | Home |
| Create client work | Quick create > Engagement |
| Schedule inside known work | Engagement > Schedule conversation |
| Schedule an ad hoc conversation | Quick create > Conversation, then create a lightweight Potential engagement |
| Find a known object | Global search |
| Approve a recommendation | Home action queue or proposal deep link |
| Repair a disruption | Home action queue, meeting warning, or recovery deep link |
| Respond as client | Proposal or meeting capability link |
| Complete preparation | Meeting preparation deep link |
| Record outcome | Meeting detail or mobile Home after meeting end |
| Administer connections | Warning deep link or Workspace |
| Reach legacy capability | Tools or existing direct URL |

## 1.5 Exit points

Every focused workflow has an explicit outcome:

| Workflow | Successful exit | Safe secondary exit |
| --- | --- | --- |
| New engagement | Engagement overview | Save draft and return to Engagements |
| New playbook | Conversation list | Save draft |
| New proposal | Proposal detail | Save draft |
| Client response | Accepted summary or awaiting others | Request alternative |
| Reschedule | Updated meeting detail | Keep original time |
| Cancel | Cancelled meeting summary | Return without changing |
| Preparation | Meeting overview with updated readiness | Save partial progress |
| Completion | Meeting outcome summary and next-step proposal | Record completion only |
| Recovery | Resolved meeting or proposal | Dismiss with reason |
| Settings | Parent settings index | Discard or retain draft according to field behavior |

No workflow closes into an unexplained Home redirect.

## 1.6 Search

### Scope

Global search indexes:

- engagements
- clients
- people
- conversation playbooks
- proposals
- meetings
- recovery cases
- workspace settings and actions

Legacy tools are searchable by exact feature name.

### Result structure

Results group by object type and show:

- primary identity
- relevant parent engagement or client
- lifecycle
- date where applicable
- reason for match
- permitted quick action

Examples:

- `Acme website relaunch` | Active engagement | Account lead: Kai
- `Acme kickoff` | Meeting tomorrow 2:00 PM | Preparation incomplete
- `Reconnect Google Calendar` | Workspace action | Availability protection delayed

### Search behavior

- `/` focuses search when focus is not in a text field.
- `Cmd/Ctrl+K` opens combined search and command mode.
- Search query and filters are represented in `/app/search?q=`.
- Selecting a result navigates to its durable route.
- Back returns to the same query, scroll position, and selected result.
- Recent objects appear before typing.
- Search never exposes inaccessible client or engagement names.

## 1.7 Quick actions

Global:

- Create engagement
- Schedule conversation
- Create proposal
- Find meeting
- Invite teammate

Contextual actions rank above global actions:

- Inside engagement: Schedule conversation, Add person, Create playbook
- Inside meeting: Reschedule, Cancel, Mark outcome, Start recovery
- Inside recovery: Approve, Choose alternative, Dismiss

Quick actions are commands, not another navigation tree.

## 1.8 Back and history behavior

### Principles

- Browser Back is authoritative.
- Closing a quick preview returns focus and scroll position to its source.
- Full-page object navigation creates history.
- Switching contextual tabs creates history.
- Opening and closing disclosure inside a page does not create history.
- Filters and saved views use URL parameters.
- Unsaved editor changes block destructive navigation with Save draft, Discard, and Stay.
- Completed workflows replace transient form steps when returning would repeat a mutation.

### List to detail

- Desktop may open a quick preview without changing route only for hover or explicit Preview.
- Clicking the object name opens its durable route.
- If a side preview changes the URL, Back closes it and restores the list.
- Mobile always opens a full page.

### Public history

- Client proposal steps use a stable proposal route with internal step state in the URL only when refresh must preserve it.
- After acceptance, Back cannot submit again.
- Reschedule and cancel completion replace the mutation route with a terminal state.

## 1.9 Keyboard shortcuts

Shortcuts are discoverable through `?` and command search.

| Shortcut | Action | Constraint |
| --- | --- | --- |
| `Cmd/Ctrl+K` | Open search and commands | Global |
| `/` | Focus search | Not inside editable text |
| `C`, then `E` | Create engagement | Authenticated, no text focus |
| `C`, then `P` | Create proposal | Requires engagement selection if outside context |
| `G`, then `H` | Go Home | Global |
| `G`, then `E` | Go Engagements | Global |
| `G`, then `M` | Go Meetings | Global |
| `G`, then `I` | Go Insights | Permission dependent |
| `E` | Edit current object | Detail page, permission dependent |
| `S` | Schedule conversation | Engagement detail |
| `R` | Open recovery | Meeting needing attention |
| `Cmd/Ctrl+Enter` | Submit or approve primary action | Only when form is valid; button remains visible |
| `Esc` | Close transient layer | Never discards unsaved work without confirmation |
| `?` | Shortcut reference | Global |

Shortcuts supplement visible interactions. No critical action is keyboard-only.

## 1.10 Notification and action queue model

Home and the notification utility share one action source.

Action categories:

- Approval required
- Connection or availability risk
- Preparation risk
- Client response
- Meeting change
- Outcome due

Each action contains:

- affected engagement
- affected meeting or proposal
- why it needs attention
- deadline
- primary action
- safe dismissal or snooze where permitted

Notifications that require no decision do not occupy Home.

---

# Phase 2: User flows

## 2.1 Create Engagement

**Goal:** establish the minimum client-work context required for intelligent scheduling.

**User intent:** “I need Calpaca to understand this body of work.”

### Flow

1. Entry: Quick create > Engagement or Engagements > New.
2. Screen: New engagement, Basics.
3. User provides client name, engagement name, type, account lead, optional end date.
4. System checks for likely duplicate client and engagement.
5. Decision:
   - Use existing client
   - Create new client
   - Continue despite similar engagement
6. Screen: Team and roles.
7. User confirms account lead and adds known delivery roles.
8. System marks availability confidence per person.
9. Screen: Delivery context.
10. User accepts proposed protection or defers it to workspace defaults.
11. Screen: Review.
12. User creates as Potential or Active.
13. Exit: Engagement overview with recommended next action, Create first conversation.

### System responses

- Autosave draft after minimum identity exists.
- Show inheritance from workspace policy.
- Never require project integration.
- Never imply invited people are available until connected or confirmed.

### Edge cases

- No client yet: create a Potential engagement with a person or company placeholder.
- Confidential client: visibility defaults to assigned people and admins.
- Same client, multiple projects: keep separate engagements.
- One-off conversation: create lightweight Potential engagement through Quick conversation.

### Failure recovery

- Client lookup failure does not block manual entry.
- Invitation failure preserves the engagement and marks invite unsent.
- Calendar data unavailable uses explicit Unknown availability.
- Draft can be resumed from Engagements.

## 2.2 Publish Scheduling

**Goal:** let the correct client participants request or choose a useful conversation inside an engagement.

**User intent:** “Give this client a controlled way to schedule relevant work.”

### Flow

1. Entry: Engagement > Conversations.
2. User selects an existing playbook or creates one.
3. Screen: Playbook minimum setup.
4. User confirms purpose, duration, role requirements, preparation, and outcome.
5. System evaluates publishability.
6. Decision:
   - Private engagement scheduling link
   - Direct proposal
   - Internal-only scheduling
7. For private link, system previews:
   - visible conversations
   - eligible participants
   - effective policy
   - client timezone
8. User publishes.
9. System creates revocable opaque capability.
10. Exit: Share panel with Copy, Preview, Revoke, and activity.

### Edge cases

- No viable slots: block publication only when the link would be empty; explain remedies.
- Required person unknown: permit request-only mode, not instant confirmation.
- Engagement paused: prevent new publication and preserve existing links as paused.
- Multiple client contacts: restrict link or allow approved domain according to explicit choice.

### Failure recovery

- Connection delay switches instant confirmation to request mode with explanation.
- Publication failure preserves draft.
- Revoked link shows a configured client contact path.

## 2.3 Accept Booking

**Goal:** turn a client scheduling choice into a trustworthy confirmed meeting.

**User intent:** “Choose a time without understanding the agency's internal scheduling logic.”

### Flow

1. Entry: Public proposal or scheduling capability.
2. Screen: Engagement and conversation context.
3. System shows purpose, participants by role, preparation, timezone, and three recommendations.
4. Client selects a recommendation or View all times.
5. System places short hold and rechecks availability.
6. Client provides required details and preparation inputs due at booking.
7. Decision:
   - Confirm instantly if all required participants are verified
   - Submit request if approval or participant confirmation is required
8. System confirms or creates Awaiting internal confirmation proposal.
9. Exit: clear state with next action and communication expectation.

### Edge cases

- Slot lost during confirmation: keep client context and show next two choices.
- Client timezone changes: rerender all times and explain changed date where relevant.
- Required host declines: initiate recovery without asking client to restart.
- Duplicate booking attempt: show existing meeting and safe actions.

### Failure recovery

- Calendar write failure leaves booking confirmed only if authoritative hold and lifecycle commit succeeded; communicate calendar delivery state.
- Verification failure retains form input.
- Email delivery failure surfaces alternative confirmation access.

## 2.4 Reschedule

**Goal:** change time while preserving the engagement, participants, preparation, and client confidence.

**User intent:** “Move this meeting with the least disruption.”

### Flow

1. Entry: Meeting detail or public meeting token.
2. Screen: Current meeting identity.
3. User selects Reschedule.
4. System asks what changed:
   - Time no longer works
   - Participant unavailable
   - Preparation not ready
   - Other
5. System chooses recovery inputs:
   - Same participants, new time
   - Qualified substitute, same time
   - Adjust participant requirement
6. Screen: Ranked alternatives with tradeoffs.
7. User or permitted client chooses.
8. System holds replacement while original remains confirmed.
9. Required approvals or participant confirmations occur.
10. System atomically commits replacement and releases original.
11. Exit: Updated meeting with change summary.

### Edge cases

- Replacement never confirmed: original remains.
- Meeting already started: normal reschedule unavailable; create follow-up.
- Client requests time outside policy: agency receives exception proposal.
- Preparation due dates move with the meeting, unless explicitly fixed.

### Failure recovery

- Patch failure retains original meeting.
- Partial communication failure creates action item and retry.
- Concurrent cancellation ends the reschedule and shows cancellation state.

## 2.5 Cancel

**Goal:** end a meeting deliberately without losing why it existed or whether a replacement is needed.

**User intent:** “This meeting should not happen.”

### Flow

1. Entry: Meeting detail or public token.
2. Screen: Meeting identity and consequence.
3. User selects cancellation reason.
4. System asks:
   - Cancel only
   - Reschedule
   - Substitute participant if absence caused cancellation
5. If cancel only, system asks whether conversation remains required.
6. User confirms.
7. System cancels event, updates lifecycle, sends communication, retains audit.
8. Exit:
   - Cancelled, no replacement
   - Recovery proposal started
   - Follow-up required

### Edge cases

- Optional participant cancels: do not cancel meeting.
- Required client participant cancels: offer client-safe reschedule.
- Cancellation inside policy-restricted window: show agency approval if applicable.
- Already cancelled: show terminal state, never error.

### Failure recovery

- Calendar provider failure records cancellation authoritatively and queues provider retry.
- Communication failure shows action required.
- User can copy a direct status link if email fails.

## 2.6 Client Follow-up

**Goal:** continue an engagement after a meeting without rebuilding scheduling context.

**User intent:** “We need the client to take or schedule the next action.”

### Flow

1. Entry: Meeting completion.
2. User records outcome category and next action.
3. Decision:
   - No meeting needed
   - Same conversation again
   - Different playbook
   - New one-off conversation
4. System carries engagement, relevant participants, explicit client preferences, and timing context.
5. User reviews participant and purpose changes.
6. System creates draft proposal or future action.
7. Exit: Outcome summary with proposal status.

### Edge cases

- No client attended: propose rebook rather than follow-up.
- Different engagement: user explicitly moves context.
- Completed engagement: ask whether to reopen or create a new engagement.

### Failure recovery

- Proposal creation failure does not lose outcome.
- Missing client contact creates internal action.

## 2.7 Recurring Engagement

**Goal:** maintain a cadence without creating brittle infinite recurrence.

**User intent:** “This client relationship needs a regular conversation.”

### Flow

1. Entry: After second similar meeting or Engagement > Conversation.
2. System suggests a cadence based on repeated explicit meetings.
3. User confirms:
   - playbook
   - frequency
   - participant continuity
   - date horizon
   - review date
4. System creates rolling proposals or provisional holds according to policy.
5. Each occurrence rechecks participants, calendar, preparation, and engagement state.
6. Exit: Engagement timeline with upcoming cadence and next review.

### Edge cases

- Engagement pauses: future proposals pause.
- Participant changes: role requirement rematches rather than silently retaining a name.
- DST change: participant-local intended window remains explicit.
- Project completion date approaches: stop at review horizon.

### Failure recovery

- No viable next occurrence creates an action, not a silent skip.
- Individual occurrence can recover without rewriting the series.

## 2.8 Internal Coordination

**Goal:** coordinate agency participants before involving the client.

**User intent:** “Find a viable team and times, then decide what to send.”

### Flow

1. Entry: Engagement > Schedule conversation.
2. User chooses playbook and required roles.
3. System proposes participant assemblies and times.
4. User requests internal confirmation from unknown or tentative participants.
5. Participants respond from authenticated Home or signed response.
6. System reranks viable combinations.
7. Coordinator approves client-facing proposal.
8. Exit: Proposal Ready to send.

### Edge cases

- No one satisfies a required role: show staffing gap.
- Several equivalent people: continuity and delivery protection rank them.
- External specialist: invite as engagement participant with limited scope.

### Failure recovery

- Non-response reaches deadline and invokes configured fallback.
- Decline includes optional constraint for a new recommendation.

## 2.9 Recover From Conflict

**Goal:** resolve a disruption with the smallest safe change.

**User intent:** “Keep the client commitment if possible.”

### Flow

1. Trigger: time off, calendar conflict, participant decline, connection failure, or policy violation.
2. System creates Recovery case and identifies affected meetings and proposals.
3. Screen: Recovery summary.
4. System offers ranked remedies:
   - Same time, substitute
   - Same people, new time
   - Adjust optional participant
   - Cancel
5. Each remedy shows client impact, continuity impact, delivery impact, and confidence.
6. User approves, edits, or dismisses.
7. System rechecks and executes the approved change.
8. System communicates and records history.
9. Exit: Resolved recovery linked to meeting.

### Edge cases

- Several meetings affected: user handles one-by-one in Stage 1; batch approval requires identical policy and remains later scope.
- Connection health uncertain: do not claim substitute availability.
- Client already declined proposed alternative: rerank without restarting.

### Failure recovery

- Execution is idempotent.
- Partial provider failure remains in Executing with explicit retry.
- Dismissal requires reason when risk remains.

## 2.10 Meeting Preparation

**Goal:** make required context ready before the conversation.

**User intent:** “Ensure this meeting can achieve its purpose.”

### Flow

1. Entry: meeting link, reminder, or Meeting > Preparation.
2. Screen groups items by responsible party.
3. User completes, links, or waives permitted items.
4. System recalculates readiness:
   - Ready
   - At risk
   - Blocked
5. Missing items trigger the responsible party, not every participant.
6. At threshold, system proposes proceed, reschedule, or adjust scope.
7. Exit: Meeting overview with readiness.

### Edge cases

- Link inaccessible: owner replaces it.
- Client refuses item: agency decides waive or recover.
- Preparation becomes irrelevant after participant substitution: remap ownership.

### Failure recovery

- Partial entries autosave.
- Reminder delivery failures appear to the responsible coordinator.

## 2.11 Meeting Completion

**Goal:** record the minimum useful outcome and advance the engagement.

**User intent:** “Close the loop without writing a report.”

### Flow

1. Entry: end-time action on Home or Meeting > Complete.
2. User confirms attendance.
3. User chooses outcome:
   - Intended outcome reached
   - Follow-up required
   - Reschedule required
   - No longer needed
4. Optional short note or external system link.
5. User assigns next action if needed.
6. System updates engagement and offers follow-up scheduling.
7. Exit: Meeting detail with outcome.

### Edge cases

- Multiple hosts disagree: Engagement lead or designated recorder resolves one operational outcome.
- Meeting ended early: normal completion.
- No-show: specialized default flow.

### Failure recovery

- Outcome autosaves.
- External project update failure does not block Calpaca completion and creates retry.

## 2.12 Follow-up Scheduling

**Goal:** schedule the next necessary conversation using inherited context.

**User intent:** “Move directly from outcome to the next commitment.”

### Flow

1. Entry: Meeting completion or Engagement overview.
2. System proposes relevant playbook, participants, and timing based on recorded outcome.
3. User confirms changes.
4. System ranks times using current policy and calendars.
5. User sends proposal or schedules directly under permission.
6. Exit: New proposal linked to prior meeting and engagement.

### Edge cases

- New client participant: add to client before sending.
- New purpose implies new engagement: explicit move or creation.
- No current availability: create follow-up action with constraint instead of empty link.

### Failure recovery

- Prior outcome remains recorded even if scheduling is abandoned.
- Draft follow-up is visible on engagement timeline.

---

# Phase 3: Low-fidelity wireframes

The wireframes define layout and information priority only. Brackets indicate controls. Parentheses indicate status. Lines indicate structural grouping, not visual borders.

## 3.1 Authenticated application shell

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Workspace ▾     [Search /]                       [Create] [Actions 3] [User] │
├──────────────┬──────────────────────────────────────────────────────────────┤
│ Home         │ Breadcrumb or mobile back                                  │
│ Engagements  │ Page identity                     Contextual actions         │
│ Meetings     │ Contextual navigation                                      │
│ Insights     ├──────────────────────────────────────────────────────────────┤
│              │                                                              │
│ Workspace    │ Primary working surface                                     │
│ Tools        │                                                              │
│              │                                                              │
│ Help         │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

**Why**

- Workspace scope is first because all objects and permissions depend on it.
- Search and create remain globally available.
- Four daily destinations prevent feature-driven navigation.
- Contextual navigation sits above the working surface so object identity is never confused with global location.

**Mobile**

```text
┌──────────────────────────────┐
│ Back/Workspace  [Search] [⋯] │
│ Page identity                │
│ Context status and action    │
├──────────────────────────────┤
│ Working surface              │
│                              │
├──────────────────────────────┤
│ Home Engagements Meetings More│
└──────────────────────────────┘
```

The bottom bar contains only daily destinations. Workspace and secondary tools live under More.

## 3.2 Home

```text
┌────────────────────────────────────────────────────────────────────┐
│ Home                                      [Schedule conversation]  │
│ Thursday, July 23                                                │
├────────────────────────────────────────────────────────────────────┤
│ NEEDS YOUR DECISION (3)                                           │
│ [Acme kickoff] Priya unavailable                                  │
│ Same-time substitute available                  [Review recovery]  │
│ ----------------------------------------------------------------- │
│ [Northstar review] Client brief missing             [View prep]    │
├────────────────────────────────────────────────────────────────────┤
│ TODAY                                                             │
│ 10:00  Acme kickoff       Ready          [Open]                    │
│ 14:30  Northstar review   At risk        [Open]                    │
├────────────────────────────────────────────────────────────────────┤
│ WORKING AS EXPECTED                                                │
│ Calendar healthy · 11 delivery hours protected · No silent risks   │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Decisions precede schedule because Home is an exception queue.
- Today follows because it supports immediate operation.
- Healthy system information is compressed and last.
- No generic metrics compete with action.

## 3.3 Engagements list

```text
┌────────────────────────────────────────────────────────────────────┐
│ Engagements                                     [New engagement]   │
│ [Search] [Status ▾] [Lead ▾] [Client ▾] [Save view]                │
├────────────────────────────────────────────────────────────────────┤
│ Active 12 | Potential 3 | Completing 2                             │
├────────────────────────────────────────────────────────────────────┤
│ ENGAGEMENT                 CLIENT      LEAD    NEXT ACTION   STATUS │
│ Acme website relaunch      Acme        Kai     Kickoff Tue   Active │
│ Northstar retainer         Northstar   Priya   Brief due     Active │
│ Beacon discovery           Beacon      Kai     Send options  Potential│
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Dense rows support comparison.
- Next action is more useful than decorative metadata.
- Status summary acts as a view shortcut, not a metric dashboard.
- Creation is available but does not insert a form into the list.

**Mobile**

Each row becomes:

```text
Acme website relaunch                    Active
Acme · Kai
Next: Kickoff Tuesday
```

Filters open a full-height sheet. No horizontal table.

## 3.4 New Engagement

```text
┌────────────────────────────────────────────────────────────────────┐
│ Cancel                     New engagement               Saved draft│
├───────────────────┬────────────────────────────────────────────────┤
│ 1 Basics          │ What client work needs scheduling?             │
│ 2 Team            │ Client [____________________]                   │
│ 3 Delivery        │ Engagement [________________]                   │
│ 4 Review          │ Type [Project ▾]                               │
│                   │ Account lead [Kai ▾]                           │
│                   │ Expected end [Optional]                         │
│                   │                                                │
│                   │ Similar: Acme brand refresh [Use existing]      │
├───────────────────┴────────────────────────────────────────────────┤
│                                    [Save draft] [Continue: Team]    │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- A visible four-step map establishes scope without presenting every field.
- The working question is plain language.
- Duplicate detection stays near identity.
- Sticky actions prevent long-form uncertainty.

## 3.5 Engagement overview

```text
┌────────────────────────────────────────────────────────────────────┐
│ Engagements / Acme website relaunch                    (Active)    │
│ Acme · Account lead Kai                    [Schedule conversation] │
│ Overview Conversations Proposals Meetings People Activity          │
├──────────────────────────────────────┬─────────────────────────────┤
│ NEXT                                 │ ENGAGEMENT HEALTH           │
│ Kickoff proposal awaiting client     │ Team ready: 3 of 3          │
│ [Open proposal]                      │ Calendar confidence: High   │
│                                      │ Delivery policy: Active     │
├──────────────────────────────────────┴─────────────────────────────┤
│ TIMELINE                                                           │
│ Today     Proposal sent                                             │
│ Jul 22    Client brief received                                     │
│ Jul 21    Engagement created                                        │
├────────────────────────────────────────────────────────────────────┤
│ CONTEXT                                                             │
│ Client contacts · Delivery roles · Project reference · Milestone    │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Next action leads because an engagement is operational.
- Health summarizes whether Calpaca can decide reliably.
- Timeline gives continuity without requiring Activity first.
- Context is supporting material, not the entire page.

## 3.6 Engagement Conversations

```text
┌────────────────────────────────────────────────────────────────────┐
│ Acme website relaunch / Conversations             [New conversation]│
├────────────────────────────────────────────────────────────────────┤
│ READY                                                              │
│ Kickoff            45 min   Account lead + Delivery lead  [Schedule]│
│ Weekly check-in    30 min   Account lead                  [Schedule]│
├────────────────────────────────────────────────────────────────────┤
│ DRAFTS                                                             │
│ Approval review    Missing outcome definition             [Resume] │
├────────────────────────────────────────────────────────────────────┤
│ [Add from workspace playbooks]                                     │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Conversations are summarized by purpose, duration, and role requirements.
- Schedule is the row's clear operational action.
- Drafts are separated so incomplete configuration is visible.

## 3.7 Conversation Playbook editor

```text
┌────────────────────────────────────────────────────────────────────┐
│ Back to Conversations     Kickoff                     Draft · Saved │
├───────────────────┬────────────────────────────────────────────────┤
│ Purpose           │ Purpose                                         │
│ Participants      │ [Align scope, roles, and first milestone____]   │
│ Preparation       │ Recommended duration [45 min ▾]                  │
│ Outcome           │ Allowed [30] [45 selected] [60]                  │
│ Scheduling        │ Client explanation [________________________]   │
│ Publish           │                                                  │
├───────────────────┴────────────────────────────────────────────────┤
│ [Preview effective conversation]                 [Save] [Mark ready]│
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Sections reflect conversation decisions, not the database schema.
- The persistent section list supports direct access after initial setup.
- Saved state remains visible.
- Preview evaluates inherited policy and role eligibility before readiness.

## 3.8 Schedule Conversation

```text
┌────────────────────────────────────────────────────────────────────┐
│ Acme / Schedule conversation                            Draft saved │
├───────────────────┬────────────────────────────────────────────────┤
│ 1 Intent          │ What needs to happen?                           │
│ 2 Team            │ [Kickoff ▾]                                     │
│ 3 Constraints     │ When? [Next week________________]                │
│ 4 Recommendation  │ Client timezone [America/Chicago ▾]             │
│ 5 Review          │ Preference [Afternoons___________]               │
│                   │ Urgency [Normal ▾]                               │
│                   │                                                 │
│                   │ Interpreted constraints                          │
│                   │ • Account lead required                          │
│                   │ • One delivery lead required                     │
│                   │ • Protect 90-minute work blocks                  │
├───────────────────┴────────────────────────────────────────────────┤
│                                     [Save draft] [Find good options]│
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Natural language is converted into visible constraints before recommendation.
- The user approves the system's interpretation.
- Team and timing remain separate decisions when clarification is required.

## 3.9 Recommendation review

```text
┌────────────────────────────────────────────────────────────────────┐
│ Acme kickoff / Recommended options                   [Edit constraints]│
├────────────────────────────────────────────────────────────────────┤
│ RECOMMENDED                                                         │
│ Tuesday 2:00 PM · Kai + Priya                    Confidence: Confirmed│
│ Keeps project team together · Client afternoon · Preserves 2h block │
│                                                    [Select]          │
├────────────────────────────────────────────────────────────────────┤
│ Wednesday 1:00 PM · Kai + Priya                                      │
│ Earliest · Breaks 2.5h delivery block                [Select]       │
├────────────────────────────────────────────────────────────────────┤
│ Thursday 3:30 PM · Kai + Jordan                     Needs confirmation│
│ Best client time · Substitute has project context    [Request confirm]│
├────────────────────────────────────────────────────────────────────┤
│ [View all viable times]              [Compare participant options] │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- The recommendation is first, alternatives follow.
- Reasons are more prominent than a numeric score.
- Confidence describes evidence state, not AI certainty.
- All-times remains an escape hatch.

## 3.10 Proposal review and detail

```text
┌────────────────────────────────────────────────────────────────────┐
│ Proposal / Acme kickoff                    (Ready to send) [Send]   │
├────────────────────────────────────┬───────────────────────────────┤
│ CLIENT WILL SEE                    │ INTERNAL STATE                │
│ Purpose                            │ Required team confirmed       │
│ Three proposed times               │ Calendar checked 2 min ago    │
│ Participants and roles             │ Delivery cost reviewed        │
│ Preparation                        │ Expires Jul 30                 │
│ [Preview client view]              │                               │
├────────────────────────────────────┴───────────────────────────────┤
│ RECIPIENTS [Add]                                                   │
│ Maya <maya@acme.com>                                               │
├────────────────────────────────────────────────────────────────────┤
│ ACTIVITY                                                           │
│ Draft created · Internal confirmation · Delivery events            │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Client-facing and internal truth are separated.
- Send is visible only when Ready.
- Activity supports trust without dominating the decision.

## 3.11 Public proposal

```text
┌──────────────────────────────────────────────┐
│ Agency identity                             │
│ Acme website relaunch                       │
│ Kickoff                                     │
│ Align scope, responsibilities, first milestone│
├──────────────────────────────────────────────┤
│ RECOMMENDED                                 │
│ Tuesday, 2:00 PM in your timezone           │
│ Kai, Account lead · Priya, Delivery lead    │
│ [This works]                                │
├──────────────────────────────────────────────┤
│ Wednesday, 1:00 PM              [Choose]    │
│ Thursday, 3:30 PM               [Choose]    │
│ [View all times] [Request another time]     │
├──────────────────────────────────────────────┤
│ Preparation: Client brief before the meeting│
│ What happens next                           │
└──────────────────────────────────────────────┘
```

**Why**

- The client sees purpose before time.
- Internal delivery-protection reasoning is not exposed.
- Participants and preparation support confidence.
- One recommended action reduces slot scanning.

## 3.12 Meetings list

```text
┌────────────────────────────────────────────────────────────────────┐
│ Meetings                                                          │
│ Today | Upcoming | Needs attention | Past | Cancelled              │
│ [Search] [Engagement ▾] [Participant ▾] [Outcome ▾] [Save view]   │
├────────────────────────────────────────────────────────────────────┤
│ 10:00 Acme kickoff       Acme website relaunch   Ready      [Open] │
│ 14:30 Northstar review   Northstar retainer      At risk    [Open] │
│ Fri   Beacon discovery   Beacon discovery        Confirmed  [Open] │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Time, purpose, engagement, and readiness support operational scanning.
- Needs attention is a first-class view.
- Meeting source is secondary and available in detail.

## 3.13 Meeting detail

```text
┌────────────────────────────────────────────────────────────────────┐
│ Acme kickoff                                      (Confirmed) [⋯]  │
│ Tue 2:00 PM · America/Chicago · Google Meet                       │
│ Acme website relaunch                                               │
│ Overview Preparation History                                      │
├────────────────────────────────────┬───────────────────────────────┤
│ PARTICIPANTS                       │ READINESS                     │
│ Kai · Account lead                 │ Ready                         │
│ Priya · Delivery lead              │ Client brief complete         │
│ Maya · Client                      │ Team prepared                 │
├────────────────────────────────────┴───────────────────────────────┤
│ PURPOSE AND EXPECTED OUTCOME                                      │
│ Align scope and agree first milestone                             │
├────────────────────────────────────────────────────────────────────┤
│ [Reschedule] [Cancel]                         [Complete meeting]    │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Identity, time, engagement, and state are inseparable.
- Participants are shown by role.
- Readiness is visible before lower-value metadata.
- Consequential actions are present but separated from completion.

## 3.14 Preparation

```text
┌────────────────────────────────────────────────────────────────────┐
│ Acme kickoff / Preparation                              (At risk)  │
├────────────────────────────────────────────────────────────────────┤
│ CLIENT                                                             │
│ [✓] Client brief · Maya                                            │
├────────────────────────────────────────────────────────────────────┤
│ AGENCY                                                             │
│ [ ] Confirm project owner · Kai · Due tomorrow      [Mark complete]│
│ [~] Draft first milestone · Priya · In progress      [Open link]   │
├────────────────────────────────────────────────────────────────────┤
│ Missing preparation may block the intended outcome.                │
│ [Proceed anyway] [Review recovery]                                 │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Responsibility groups make reminders and action ownership clear.
- The consequence of missing work appears once, not as repeated warnings.
- This remains preparation, not a general task board.

## 3.15 Meeting completion

```text
┌────────────────────────────────────────────────────────────────────┐
│ Complete Acme kickoff                                              │
├────────────────────────────────────────────────────────────────────┤
│ Who attended? [Kai ✓] [Priya ✓] [Maya ✓]                          │
│ Outcome                                                            │
│ (•) Intended outcome reached                                       │
│ ( ) Follow-up required                                             │
│ ( ) Reschedule required                                            │
│ ( ) No longer needed                                               │
│ Optional reference or short note [____________________________]     │
├────────────────────────────────────────────────────────────────────┤
│                                      [Save only] [Save and next step]│
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Completion captures only operational signals.
- Follow-up is offered after outcome, not mixed into attendance.
- Notes remain optional and intentionally small.

## 3.16 Recovery case

```text
┌────────────────────────────────────────────────────────────────────┐
│ Recovery / Acme kickoff                         (Approval required) │
│ Priya is unavailable Tuesday                                    │
├────────────────────────────────────────────────────────────────────┤
│ RECOMMENDED: Keep time, substitute Jordan                         │
│ Client impact: No time change                                     │
│ Continuity: Jordan is assigned to project, has not met Maya        │
│ Delivery impact: Low                                               │
│ Confidence: Jordan calendar confirmed 3 min ago                    │
│ [Approve recovery]                                                 │
├────────────────────────────────────────────────────────────────────┤
│ ALTERNATIVE: Keep people, move to Thursday 3:30 PM                 │
│ Client impact: New confirmation required                           │
│ Delivery impact: Preserves protected work                          │
│ [Choose alternative]                                               │
├────────────────────────────────────────────────────────────────────┤
│ [Edit constraints] [Cancel meeting] [Dismiss with reason]          │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Trigger and affected meeting are immediate.
- Remedies are compared by consequences, not abstract score.
- Approval is attached to one explicit plan.
- Dismissal cannot conceal unresolved risk without a reason.

## 3.17 Client detail

```text
┌────────────────────────────────────────────────────────────────────┐
│ Acme                                                             │
│ Relationship lead: Kai · America/Chicago                          │
├────────────────────────────────────────────────────────────────────┤
│ ACTIVE ENGAGEMENTS                                                 │
│ Website relaunch · Active · Next kickoff Tue                       │
├────────────────────────────────────────────────────────────────────┤
│ CONTACTS                                                           │
│ Maya · Project owner · Last met Jul 12                             │
├────────────────────────────────────────────────────────────────────┤
│ SCHEDULING CONTEXT                                                 │
│ Prefers afternoons (explicit) · Continuity lead Kai                │
├────────────────────────────────────────────────────────────────────┤
│ RECENT MEETINGS                                                    │
│ Jul 12 Discovery · Jun 28 Review                                   │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Engagements lead because the client is supporting context.
- Only explicit scheduling preferences appear.
- No pipeline, deal value, enrichment, or marketing activity.

## 3.18 Insights

```text
┌────────────────────────────────────────────────────────────────────┐
│ Insights                         Last 30 days [Compare prior period]│
│ Delivery | Continuity | Meetings | Recovery                        │
├────────────────────────────────────────────────────────────────────┤
│ FINDING                                                            │
│ 18 hours of delivery blocks were protected                         │
│ 6 proposed times would have fragmented 90+ minute blocks            │
│ [View affected decisions]                                          │
├────────────────────────────────────────────────────────────────────┤
│ NEEDS REVIEW                                                       │
│ Acme continuity fell: 4 meetings, 4 different agency participants  │
│ [Review Acme relationship]                                         │
├────────────────────────────────────────────────────────────────────┤
│ TREND AND DEFINITIONS                                               │
│ Structured detail with sample size and export                      │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Findings and action lead.
- Measures include definitions and underlying records.
- No customizable metric-card canvas.

## 3.19 Workspace Calendars and Connections

```text
┌────────────────────────────────────────────────────────────────────┐
│ Workspace / Calendars                                              │
├────────────────────────────────────────────────────────────────────┤
│ Google · kai@agency.com                              Healthy        │
│ Reads: Free/busy on Work, Personal                                 │
│ Writes: Client Meetings                                            │
│ Last checked: 2 minutes ago                                        │
│ Protects: 8 engagements, 14 playbooks              [Manage]        │
├────────────────────────────────────────────────────────────────────┤
│ CONNECTION TEST                                                    │
│ Read ✓  Create ✓  Update ✓  Delete ✓               [Test again]   │
├────────────────────────────────────────────────────────────────────┤
│ [Connect another account]                                          │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Purpose, permission, freshness, and affected objects are visible.
- Health is not a binary badge without evidence.
- Technical detail remains available under Manage.

## 3.20 Workspace People

```text
┌────────────────────────────────────────────────────────────────────┐
│ Workspace / People                               [Invite person]   │
│ [Search] [Access ▾] [Readiness ▾]                                   │
├────────────────────────────────────────────────────────────────────┤
│ NAME     ACCESS       ENGAGEMENTS   CALENDAR      ACTION            │
│ Kai      Owner        8             Healthy       [Open]            │
│ Priya    Contributor  3             Healthy       [Open]            │
│ Jordan   Invited      1             Not connected [Resend]          │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Access and scheduling readiness are separate.
- Engagement count provides context without exposing client names in the list.
- Invitation actions are explicit.

## 3.21 Search and command layer

```text
┌────────────────────────────────────────────────────────────────────┐
│ Search people, engagements, meetings, or actions                   │
│ [acme___________________________________________________________]   │
├────────────────────────────────────────────────────────────────────┤
│ RECENT / RESULTS                                                   │
│ Engagement  Acme website relaunch · Active                         │
│ Meeting     Acme kickoff · Tomorrow · Preparation at risk          │
│ Client      Acme · 1 active engagement                             │
├────────────────────────────────────────────────────────────────────┤
│ ACTIONS                                                            │
│ Schedule conversation for Acme                                     │
│ Create engagement                                                   │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Objects and actions are distinct.
- Result context helps avoid opening the wrong Acme item.
- It accelerates known-item work without replacing navigation.

## 3.22 Legacy Tools index

```text
┌────────────────────────────────────────────────────────────────────┐
│ Tools                                                             │
│ Secondary scheduling modes maintained for existing workflows       │
├────────────────────────────────────────────────────────────────────┤
│ Meeting polls        Coordinate general availability     [Open]    │
│ Sign-up sheets       Enroll in fixed sessions            [Open]    │
│ Capacity events      Shared sessions                     [Open]    │
│ Booking pages        Generic public catalogues           [Open]    │
│ Routing forms        Generic qualification routing       [Open]    │
└────────────────────────────────────────────────────────────────────┘
```

**Why**

- Existing value is preserved.
- Clear secondary status prevents these tools from defining the new model.
- No deprecation claim is made until usage data supports it.

## 3.23 Public terminal and error states

All public routes use this hierarchy:

```text
Identity
Specific state
Affected engagement or meeting, when safe
What happened
What remains unchanged
Primary recovery
Contact or return path
```

Unique states:

- Proposal expired
- Proposal withdrawn
- Meeting already accepted
- Slot no longer available
- Meeting cancelled
- Reschedule awaiting confirmation
- Link invalid or revoked
- Connection-related delay
- Unauthorized participant

These are screens, not generic error banners. Each names the recoverable next action.

## 3.24 Complete screen-to-wireframe coverage

This table is normative. A screen that reuses a wireframe inherits its hierarchy and behavior while substituting the named object. “Unique addition” states the only permitted structural difference.

### Public and authentication screens

| Screen | Wireframe basis | Unique addition | Why this layout applies |
| --- | --- | --- | --- |
| Marketing `/` | Outside authenticated product specification | Product proof and hosted/self-hosted entry | Marketing is not an operational screen; it must lead into the five-minute test. |
| Sign in | Public single-decision form using 3.11 hierarchy | Permission-purpose explanation and Sample path | Trust and one decision matter more than decorative content. |
| Accept invitation | Public single-decision form | Workspace, role, engagement scope, requested connection | The invitee must understand access and obligation before accepting. |
| Proposal response | 3.11 Public proposal | Response identity and optional details | Purpose and recommended decision remain primary. |
| Proposal alternative request | 3.11 plus compact form | Constraint input and what remains confirmed | The client changes constraints without rebuilding context. |
| Proposal accepted | 3.23 Public terminal state | Confirmed meeting identity and preparation | Completion names what happened and what comes next. |
| Engagement scheduling index | 3.11 without times | Authored conversation choices | The client chooses purpose before time. |
| Engagement choose time | 3.11 | Selected conversation remains fixed above options | Context prevents choosing time without knowing why. |
| Engagement provide details | 3.11 plus form | Selected time summary remains fixed | The client never loses the commitment being completed. |
| Engagement confirmed | 3.23 | Meeting identity and preparation | Terminal state remains useful. |
| Public meeting details | 3.13 simplified | Client-visible participants, preparation, change actions | Trusted meeting identity anchors every change. |
| Public preparation | 3.14 client subset | Only client-owned items | Agency tasks and private context remain hidden. |
| Public reschedule | 3.13 then 3.9 | Current meeting, reason, ranked replacements | Existing commitment remains visible while comparing change. |
| Public cancel | 3.13 plus confirmation | Meeting identity, reason, reschedule alternative | Consequence is specific, not generic. |
| Legacy direct booking `/book/*` | Existing booking flow under 3.22 governance | Existing themes and host selection remain | Existing links must not break while engagement scheduling is introduced. |
| Legacy booking catalogues `/booking/*` | Existing catalogue under 3.22 governance | Existing selected event types remain | Tenant publication remains supported during migration. |
| Legacy routing `/r/*` | Existing routing flow under 3.22 governance | Existing rules remain | Current acquisition workflows remain stable. |
| Legacy reschedule and cancel | Existing signed-action flow | May link to engagement-aware replacement when assigned | Old email links must remain valid. |
| Poll | Legacy current screen under 3.22 governance | No new engagement structure until migrated | Existing public functionality is preserved. |
| Sign-up sheet | Legacy current screen under 3.22 governance | No new engagement structure until migrated | Existing public functionality is preserved. |
| Sign-up cancellation | Legacy current terminal flow | Existing signed token remains | Existing confirmations and cancellation links must remain valid. |
| One-off offer | Legacy current screen under 3.22 governance | May link to engagement when assigned | Existing functionality remains stable during migration. |
| Any expired, revoked, invalid, or unavailable public route | 3.23 | State-specific recovery | Public errors must not become dead ends. |

### Home, search, and global layers

| Screen | Wireframe basis | Unique addition | Why this layout applies |
| --- | --- | --- | --- |
| Home | 3.2 | User-permitted action queue and today | Daily operation is decisions first, schedule second. |
| Global search | 3.21 | Query filters on full `/app/search` route | Full search preserves linkability and history. |
| Search command layer | 3.21 transient variant | Recent actions and current-context commands | Speed layer does not replace durable results. |
| Notification action list | 3.2 Needs your decision section | Category and deadline filters | It is the expanded source behind Home actions. |
| Shortcut reference | Simple searchable reference layer | Shortcut, action, scope | Reference supports discoverability without adding navigation. |
| Mobile More | 3.1 mobile navigation layer | Grouped secondary destinations | It keeps daily navigation limited to four choices. |

### Engagement and client screens

| Screen | Wireframe basis | Unique addition | Why this layout applies |
| --- | --- | --- | --- |
| Engagements list | 3.3 | Saved views | Comparison and next action require density. |
| New engagement | 3.4 | Basics, Team, Delivery, Review steps | Dependent decisions justify progressive workflow. |
| Engagement overview | 3.5 | Next action, health, timeline, context | The engagement is an operational object, not a profile. |
| Engagement conversations | 3.6 | Ready and Draft groupings | Readiness determines whether a conversation can be scheduled. |
| New conversation | 3.7 initial linear mode | Template choice before Purpose | Templates accelerate setup without changing editor architecture. |
| Edit conversation | 3.7 direct-section mode | Persistent saved state | Returning users need direct access to any decision. |
| Engagement proposals list | 3.3 object-list variant | Recipient, expiry, response state | Proposals must be compared by decision status. |
| New proposal | 3.8 then 3.9 then 3.10 | Intent, recommendation, review | The system must show interpretation before external action. |
| Engagement meetings | 3.12 filtered to engagement | No engagement column | Parent context is already known. |
| Engagement people | 3.20 compact variant | Agency and Client groups, role assignment | People appear only through their relationship to the work. |
| Engagement activity | 3.5 Timeline expanded | Filters by proposal, meeting, recovery | Activity explains lifecycle, not raw audit payload. |
| Engagement settings | 3.7 section editor | Lifecycle, visibility, continuity, policy, retention | Infrequent configuration is separate from daily overview. |
| Clients list | 3.3 | Active engagement count and relationship lead | Client is searchable support context, not global primary work. |
| Client detail | 3.17 | Engagements, contacts, explicit preferences, history | It remains intentionally smaller than a CRM account. |

### Proposal, meeting, and recovery screens

| Screen | Wireframe basis | Unique addition | Why this layout applies |
| --- | --- | --- | --- |
| Proposal detail | 3.10 | Lifecycle-specific primary action | Client and internal truth must remain distinct. |
| Meetings list | 3.12 | Saved operational views | Repeated meeting operations need search and comparison. |
| Saved meeting view | 3.12 | View name, unsaved filter marker | Durable views reduce repeated filtering. |
| Meeting overview | 3.13 | Lifecycle-specific action | Identity and readiness precede metadata. |
| Meeting preparation | 3.14 | Responsible-party groupings | Ownership determines action and reminders. |
| Meeting completion | 3.15 | Attendance, outcome, next step | Minimal structured closure avoids becoming a report. |
| Meeting history | 3.5 Timeline expanded | Change, delivery, approval filters | Human-readable history supports trust. |
| Recovery detail | 3.16 | Trigger-specific options | Consequence comparison supports safe approval. |

### Insights screens

| Screen | Wireframe basis | Unique addition | Why this layout applies |
| --- | --- | --- | --- |
| Insights overview | 3.18 | One leading finding per report | Findings direct users into the right analysis. |
| Delivery insight | 3.18 | Protected blocks, fragmentation, affected decisions | Measures support delivery-policy changes. |
| Continuity insight | 3.18 | Relationship-holder retention and exceptions | The report measures the thesis, not employee rank. |
| Meetings insight | 3.18 | Completion, preparation, no-show, next-step rates | Outcomes replace booking volume as the center. |
| Recovery insight | 3.18 | Disruption, remedy, time-to-resolution | Recovery effectiveness becomes observable. |

### Workspace and account screens

All settings screens use a common low-fidelity structure:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Workspace / Section                                                │
├───────────────────┬────────────────────────────────────────────────┤
│ Settings groups   │ Section purpose and effective state            │
│ Current section   │                                                │
│                   │ Primary settings or object list                 │
│                   │                                                │
│                   │ Consequence / affected objects                  │
├───────────────────┴────────────────────────────────────────────────┤
│                                         [Discard] [Save changes]    │
└────────────────────────────────────────────────────────────────────┘
```

Why: workspace settings require clear scope, effective behavior, affected objects, and explicit save state. On mobile the left index becomes the preceding settings-index screen.

| Screen | Unique working surface | Why it exists and why positioned here |
| --- | --- | --- |
| Workspace settings index | Health and links to each settings domain | Mobile and occasional administrators need an index instead of a hidden horizontal tab strip. |
| General | Workspace identity, timezone defaults, lifecycle defaults | Identity precedes dependent policy and shows scope. |
| People | 3.20 people list | Access and scheduling readiness must be managed together but distinguished. |
| Roles | Capability matrix by role | Capabilities are compared in rows; role names alone are insufficient. |
| Availability | Effective weekly policy and named reusable policies | Scheduling inputs belong together and show affected engagements. |
| Calendars | 3.19 | Provider identity, purpose, health, and affected objects lead. |
| Connections | 3.19 provider-list variant | Project, CRM context, conferencing, and messaging share health semantics. |
| Workspace playbooks | 3.6 list plus 3.7 editor | Reusable defaults follow the same conversation model as engagements. |
| Domains | Domain, verification, public routes, affected links | Ownership and publishing consequence lead before DNS mechanics. |
| API | Token and service-identity list, scopes, last used | Developer access is an operational connection, not profile content. |
| Audit | Filterable human-readable timeline | Administration requires actor, action, object, result, and time. |
| Data | Retention, export, delete workflows | Irreversible actions are isolated and name affected data. |
| Account profile | Focused personal form | Personal identity is separate from workspace brand. |
| Account preferences | Timezone, personal protections, notification choices | Personal scheduling inputs show where workspace policy overrides them. |
| Account security | Sessions and authentication methods | Security is distinct from scheduling configuration. |

### Legacy screens

| Screen | Wireframe basis | Why |
| --- | --- | --- |
| Tools index | 3.22 | Secondary capabilities remain discoverable without shaping primary navigation. |
| Poll list, create, detail | Existing implementation inside routed AppShell | Preserve behavior; correct route and accessibility debt incrementally. |
| Sign-up-sheet list, create, detail | Existing implementation inside routed AppShell | Preserve behavior while measuring continued use. |
| Capacity-event management | Existing Scheduling implementation inside Tools | Maintenance only under frozen strategy. |
| Generic booking pages | Existing implementation inside Tools | Existing tenant catalogues remain supported. |
| Generic routing forms | Existing implementation inside Tools | Agency playbooks replace primary routing, but generic routes remain accessible. |

---

# Phase 4: Component specification

## 4.1 Application and navigation

| Component | Purpose and variants | States | Accessibility | Responsive behavior | Content rules | Never display |
| --- | --- | --- | --- | --- | --- | --- |
| AppShell | Global authenticated frame; desktop sidebar, mobile bottom navigation | Default, offline warning, workspace switching | Landmarks, skip link, current page, logical focus order | Persistent sidebar desktop; top and bottom bars mobile | One workspace identity, four daily destinations | Object-specific forms or alerts |
| GlobalNavItem | Navigate work domains | Default, hover, focus, current, unavailable by permission | Link semantics, `aria-current` | Icon plus text desktop; text remains visible in mobile bar | Short stable nouns | Status counts unrelated to destination |
| ContextNav | Navigate within an object | Default, current, overflow | Tab list only when content behaves as tabs; otherwise links | Horizontal only when all items fit; menu fallback mobile | Object-specific sections | Global destinations |
| Breadcrumb | Return through meaningful parents | Default, collapsed | Ordered navigation label | One labelled back link mobile | Human-readable object names | Full route history |
| MobileMoreSheet | Full secondary navigation | Open, closing | Dialog behavior, focus trap, Escape, focus return | Mobile only | Group by work, workspace, account | Daily actions duplicated without reason |
| SearchCommand | Find objects and invoke actions | Closed, recent, querying, results, empty, error | Combobox pattern, announced result count, keyboard navigation | Full-screen mobile; centered layer desktop | Distinguish object and action results | Inaccessible objects or destructive action without confirmation |

## 4.2 Object identity and state

| Component | Purpose and variants | States | Accessibility | Responsive behavior | Content rules | Never display |
| --- | --- | --- | --- | --- | --- | --- |
| ObjectHeader | Identify object and primary action | Engagement, meeting, proposal, client, recovery | Semantic `h1`; status text; actions labelled | Actions collapse to menu except one primary | Name, parent context, lifecycle, one primary action | More than one competing primary action |
| LifecycleStatus | Shared state communication | Neutral, active, attention, complete, archived | Text always present; icon optional; no color-only meaning | Same text mobile; may shorten supporting detail | Use canonical lifecycle vocabulary | Invented marketing labels |
| ConfidenceState | Describe evidence completeness | Confirmed, partial, unknown, stale | Text and explanation available | Compact label expands on tap | Say what is known and why | Percentage confidence without calibrated meaning |
| HealthSummary | Explain whether system can make trustworthy decisions | Healthy, delayed, action required | Status plus cause and remedy | Summary first mobile | Freshness, affected objects, next action | Generic “Connected” without evidence |
| EffectivePolicySummary | Show inherited and overridden behavior | Compact, expanded, comparison | Structured list | Disclosure mobile | Rule, source, consequence | Raw configuration payload |

## 4.3 Lists and collections

| Component | Purpose and variants | States | Accessibility | Responsive behavior | Content rules | Never display |
| --- | --- | --- | --- | --- | --- | --- |
| ObjectList | Find and compare durable objects | Table, compact list | Loading, empty, filtered empty, error, selecting | Semantic table only desktop; structured list mobile | Identity, parent, next action, state | Decorative card per row |
| FilterBar | Refine collection | Inline, sheet | Default, active, invalid filter | Inline desktop; full sheet mobile | Only filters that change operational decisions | Advanced query syntax by default |
| SavedViewControl | Preserve recurring list setup | Personal, shared later | Unsaved changes, saved, renamed | Menu mobile | Name describes result set | Hidden implicit save |
| BulkActionBar | Act on selected objects | Contextual | Hidden, selection count, executing, partial failure | Bottom action sheet mobile | Only actions valid for every selected item | Destructive action without named consequence |
| EmptyState | Explain why collection is empty and next action | New workspace, filtered, permission-limited | Static | Same hierarchy, reduced illustration | One reason, one primary action | Generic encouragement or decorative graphic |

## 4.4 Actions and feedback

| Component | Purpose and variants | States | Accessibility | Responsive behavior | Content rules | Never display |
| --- | --- | --- | --- | --- | --- | --- |
| ActionButton | Execute user action | Primary, secondary, tertiary, destructive | Default, focus, pressed, loading, success, disabled | Minimum 44px target mobile | Verb plus object when ambiguous | Unexplained icon for consequential action |
| ActionMenu | Secondary or infrequent actions | Object, collection | Open, item focus, unavailable with reason | Sheet mobile | Group ordinary and destructive separately | Primary screen action |
| SaveBar | Persistent editor state and actions | Clean, dirty, saving, saved, failed | Live status without repeated interruption | Fixed safe-area bar mobile; sticky desktop | Save, draft, discard according to lifecycle | Silent autosave claim when failed |
| InlineAlert | Local problem or consequence | Info, warning, error, success | Alert only for urgent dynamic errors | Full width mobile | Cause, effect, recovery | “Something went wrong” |
| PageState | Full page loading, error, terminal | Loading, unavailable, permission, deleted | Focus heading on navigation; live loading sparingly | Same structure | Specific object and recovery | Generic centered card with no exit |
| UndoNotice | Recover reversible action | Timed, persistent until navigation for high impact | Announced once, button focusable | Bottom safe-area mobile | State what changed and expiry | Undo for actions that cannot truly restore |
| ConfirmationDialog | Confirm irreversible or externally consequential action | Standard, typed-name for workspace destruction | Full dialog semantics | Full-width lower sheet mobile when appropriate | Object, consequence, affected people, recovery | Generic “Are you sure?” |

## 4.5 Forms and progressive workflows

| Component | Purpose and variants | States | Accessibility | Responsive behavior | Content rules | Never display |
| --- | --- | --- | --- | --- | --- | --- |
| WorkflowStepper | Show finite creation or decision sequence | Initial linear, later direct-section | Current, complete, issue | Vertical rail desktop; compact current/total mobile | User decisions, not backend entities | More than seven steps |
| Field | Collect one value | Text, textarea, select, combobox, date, time | Default, focus, help, invalid, disabled, read-only | Full width mobile; grouped only when relationship clear | Persistent label, optionality, help, error | Placeholder as label |
| FieldGroup | Collect one conceptual decision | Fieldset, repeated items | Default, invalid summary | Stack mobile | Legend states the decision | Unrelated fields grouped for layout |
| RoleRequirementEditor | Define required or optional participation | Single role, pool, fixed person | Empty, matched, unmatched, partial | Sentence-like stack mobile | Why required, eligibility, fallback | Raw routing clauses |
| PolicyComparison | Compare operational consequences | Two or three options | Calculating, ready, incomplete data | Stacked cards mobile, columns desktop | Same measures across options | Unsupported precision |
| DraftResume | Resume incomplete object | Inline row, Home action | Available, stale schema, owner changed | Same | Last edited, missing decision | Secret draft inaccessible to collaborators when shared work requires it |

## 4.6 Recommendation and intelligence

| Component | Purpose and variants | States | Accessibility | Responsive behavior | Content rules | Never display |
| --- | --- | --- | --- | --- | --- | --- |
| RecommendationSet | Present ranked viable options | Time, participant assembly, recovery | Calculating, ready, partial data, no viable result | One option per block mobile | One recommended option, alternatives, escape hatch | Slot wall as initial state |
| RecommendationReason | Explain a signal and consequence | Positive, tradeoff, warning | Static, detail disclosure | Summary plus tap detail mobile | Plain evidence and effect | “AI chose this” |
| ConstraintSummary | Show interpreted request and policy | User input, inherited, inferred with confirmation | Complete, needs confirmation, conflict | Editable list mobile | Source and edit path | Hidden inference |
| EvidenceFreshness | State when input was verified | Calendar, project, relationship | Current, delayed, stale, unknown | Compact | Time and provider where useful | False real-time language |
| ApprovalPanel | Ask a person to authorize one plan | Proposal, recovery, policy exception | Ready, changed since review, executing, complete | Sticky primary action mobile | Exact change, consequences, affected people | Approval for an ambiguous bundle |
| AutomationExplanation | Explain what will happen automatically | Reminder, confirmation, recovery policy | Enabled, paused, blocked | Timeline mobile | Trigger, condition, action, approver, stop path | Generic workflow diagram |

## 4.7 Engagement and relationship

| Component | Purpose and variants | States | Accessibility | Responsive behavior | Content rules | Never display |
| --- | --- | --- | --- | --- | --- | --- |
| EngagementSummary | Show work identity and operational next step | List, header, compact link | Lifecycle variations | Compact mobile | Client, lead, next action, state | Revenue pipeline data |
| EngagementHealth | Show decision readiness | Team, connection, policy, preparation | Healthy, partial, blocked | Summary first | What Calpaca can and cannot decide | Vanity completion percentage |
| PersonRoleRow | Show person in engagement context | Agency, client, external | Confirmed, invited, unknown availability, unavailable | Stack detail mobile | Name, role, relationship, confidence | Sensitive calendar details |
| ClientContext | Show approved scheduling relationship facts | Compact, full | Empty, partial | Compact disclosure mobile | Explicit timezone, preferences, continuity | Inferred sensitive traits |
| Timeline | Explain meaningful lifecycle events | Engagement, meeting, proposal, recovery | Loading, grouped dates | Single column | Actor, action, result, time | Raw internal event payload |

## 4.8 Meeting operations

| Component | Purpose and variants | States | Accessibility | Responsive behavior | Content rules | Never display |
| --- | --- | --- | --- | --- | --- | --- |
| MeetingIdentity | Reusable trusted meeting context | Public, organizer, email-compatible | Confirmed, changed, cancelled, completed | Compact mobile | Purpose, engagement, date, timezone, participants | Identifier without human context |
| ReadinessSummary | Show preparation risk | Ready, at risk, blocked | Text and counts | Compact then detail | Missing item and owner | Color-only status |
| PreparationItem | Track meeting-specific readiness | Client, agency, shared | Not started, in progress, complete, waived | Full row mobile | Requirement, owner, due, action | General project tasks |
| OutcomeCapture | Record minimal operational result | Standard, no-show | Draft, saved, integration pending | One question per section mobile | Attendance, category, next action | Meeting transcript |
| ChangeSummary | Explain before and after | Reschedule, participant change, cancellation | Proposed, executed | Stacked mobile | What changed, unchanged, notified | Raw calendar patch |
| RecoveryOption | Compare repair plans | Substitute, move time, reduce optional, cancel | Recommended, alternative, unavailable | Stacked | Client, continuity, delivery, confidence | Unexplained score |

## 4.9 Public experience

| Component | Purpose and variants | States | Accessibility | Responsive behavior | Content rules | Never display |
| --- | --- | --- | --- | --- | --- | --- |
| PublicIdentity | Establish trusted agency and engagement context | Agency brand, custom domain | Logo failure fallback | Compact | Agency name in text, optional logo | Empty identity when logo fails |
| TimeOption | Choose one candidate | Recommended, alternative, all-times | Available, selected, held, lost | 44px minimum, full width mobile | Local date, time, timezone | Internal delivery reasoning |
| ParticipantSummary | Explain who will attend | Named, role pending | Confirmed, subject to confirmation | Stack mobile | Name where confirmed, role otherwise | Internal eligibility pool |
| PublicPreparation | Explain what client must provide | Booking-time, later | Complete, missing | Simple list | Requirement, reason, due | Agency-only preparation |
| PublicTerminalState | Close or recover public workflow | Confirmed, expired, cancelled, awaiting | Specific | Single-column | What happened, what remains, next action | Dead end |

---

# Phase 5: Behavioral design system

## 5.1 Page structure

Every authenticated page uses:

1. Location
2. Object or view identity
3. Lifecycle or health state
4. Primary action
5. Contextual navigation where needed
6. Primary working surface
7. Supporting history or metadata

Do not begin pages with generic greetings, marketing statements, or metric tiles.

Public pages use:

1. Trusted identity
2. Engagement and conversation purpose
3. Required decision
4. Relevant time, participant, preparation, and confidence
5. What happens next
6. Recovery or contact path

## 5.2 Action priority

- One visible primary action per screen region.
- The page primary action advances the current object lifecycle.
- Secondary actions modify how the primary outcome is reached.
- Tertiary actions reveal detail or navigate.
- Destructive actions are separated spatially and linguistically.
- Disabled actions state why when the missing requirement is not obvious.
- Submission may remain enabled to expose validation unless executing it would be unsafe.

## 5.3 Information grouping

Group by user decision:

- Who must attend?
- When can it happen?
- What must be ready?
- What changes for the client?

Do not group by database table or API object.

Use hierarchy, headings, whitespace, and dividers before adding a container. A bordered card represents an independently actionable or movable object, not every section.

## 5.4 Progressive disclosure

Three levels:

1. **Required now:** information needed for the current decision.
2. **Useful context:** visible summary with direct expansion.
3. **Advanced policy:** available through a named section or settings route.

Rules:

- Never hide a consequence under disclosure.
- Never hide an invalid requirement.
- Advanced settings inherit safe defaults and show effective values at the point of use.
- Returning editors may jump directly to sections after the object reaches a valid draft.
- Public users never see organizer policy mechanics.

## 5.5 Forms

- Persistent labels.
- Optional fields marked optional; do not mark every required field with an asterisk.
- Validate on blur for local format and on submit for cross-field rules.
- Keep user input after every failure.
- Show field error beside the field and summarize only when several errors exist.
- Focus the first invalid field after submit.
- Autosave drafts when the object has identity.
- Show dirty, saving, saved, and failed state.
- Date and time always show timezone context.
- Repeated participant and policy editors use sentence-like language.
- Mobile keyboard type matches input.
- Avoid two-column form layout unless the fields form one paired thought.

## 5.6 Recommendations

A recommendation must include:

- the recommended action
- two to four reasons
- meaningful tradeoff
- evidence freshness
- confidence state
- alternatives
- edit-constraints path

Rules:

- No star, sparkle, magic-wand, or generic AI label.
- No numeric score shown to ordinary users.
- Reasons must describe evidence and consequence.
- Unknown data lowers confidence and is named.
- The user can inspect which policy or relationship produced a reason.
- An option that violates a hard constraint is not recommended.
- Soft constraints may be traded off visibly.

## 5.7 Confidence

Confidence refers to evidence completeness, not model certainty.

Canonical states:

- **Confirmed:** all required calendars or people verified the option.
- **Needs confirmation:** one or more required inputs are not verified.
- **Unknown:** Calpaca lacks required evidence.
- **Stale:** evidence is older than the allowed freshness window.

Do not use:

- 92% confident
- likely available
- smart choice
- best without reason

## 5.8 Approvals

An approval is attached to one explicit plan.

Show:

- object affected
- before and after
- reason
- client impact
- team impact
- automatic actions after approval
- who else must approve
- how to stop or recover

If evidence changes after the approval screen loads, invalidate the approval and show what changed.

## 5.9 Automation

Every automation is written:

> When [observable trigger], if [explicit condition], Calpaca will [bounded action]. [Person or policy] can stop it by [control].

Example:

> When a required participant marks time off, if a project-qualified substitute is confirmed available, Calpaca will draft a same-time recovery. The Engagement lead must approve it before anyone is notified.

Automation history records:

- trigger
- evidence
- policy version
- proposed action
- approver or autonomous permission
- result

## 5.10 AI and natural language

Natural language is an input method, not an authority.

The system must display:

- engagement identified
- playbook selected
- people or roles interpreted
- time constraints
- urgency
- policy applied
- unresolved ambiguity

The user confirms ambiguous or consequential interpretation before search or action.

AI may:

- translate intent into constraints
- summarize structured tradeoffs
- propose a recovery
- answer why availability failed

AI may not:

- invent relationships or skills
- move confirmed meetings outside policy
- send external communication without permission
- infer sensitive traits
- conceal deterministic availability rules

## 5.11 Loading and latency

- Show immediate structural state.
- Availability and recommendation calculation shows which inputs are being checked only if latency exceeds one second.
- Long operations may continue in background with a durable action item.
- Do not use an animated brand loader for small organizer updates.
- Public hold and confirmation state must prevent duplicate action and explain progress.
- Partial data may render when its confidence is explicit.

## 5.12 Empty, error, and terminal states

Every state answers:

1. What is empty or failed?
2. Why, if known?
3. What remains safe?
4. What can the user do now?

Terminal public states always provide a relevant return, contact, or new-proposal path.

## 5.13 Mobile behavior

- No required horizontal scrolling.
- One primary action may be sticky above the safe area.
- Sticky action must move above the keyboard.
- Bottom navigation and sticky workflow action cannot overlap.
- Complex comparison becomes vertically stacked options with identical fields.
- Filters use a sheet and preserve applied state.
- Object detail is full page, not a side drawer.
- Tables become structured lists.
- Target size is at least 44 by 44 CSS pixels.
- Long workflows show current step and total, with a review before external action.

## 5.14 Accessibility

- WCAG 2.2 AA is a release requirement for every migrated workflow.
- Native elements before custom patterns.
- One `h1` per page.
- Landmarks and skip links in the shell.
- Focus moves to the new screen heading after route navigation.
- Focus returns after transient layers.
- Errors use linked descriptions and appropriate live announcements.
- Recommendation rank, confidence, readiness, and lifecycle have textual equivalents.
- Reduced motion preserves state comprehension.
- Time and date text is unambiguous to screen readers.
- Public token pages never reveal extra data in accessible-only text.

## 5.15 Content

- Use Engagement, Conversation, Proposal, Meeting, Preparation, Outcome, and Recovery consistently.
- Use “conversation” for the intended interaction and “meeting” after confirmation.
- Name the client and engagement where permission allows.
- Explain consequences before action.
- Prefer concrete verbs: Send proposal, Confirm time, Approve substitution.
- Avoid generic language: Continue, Submit, Done, Something went wrong.
- Avoid anthropomorphism: “Calpaca found” is acceptable; “I think” is not.
- Never expose raw reason codes, internal IDs, routing clauses, or provider payloads.

---

# Phase 6: Implementation plan

The implementation must preserve the existing product while moving one complete workflow at a time. New routes initially coexist with `/dashboard`.

## Milestone 0: Route and measurement foundation

**Objective**

Create durable organizer locations without changing core scheduling behavior.

**Ships**

- `/app` shell behind feature flag
- route-backed Home, Engagements placeholder, Meetings wrapper, Workspace wrapper
- search command infrastructure with current objects
- navigation history behavior
- baseline task analytics and error instrumentation

**User improvement**

Refresh, Back, deep links, and support URLs work.

**Dependencies**

- existing authentication
- permission resolver

**Risk**

Two shells may diverge.

**Mitigation**

Reuse existing data calls and mount current dashboard sections inside route wrappers temporarily.

**Rollback**

Disable new-shell flag and redirect `/app` to `/dashboard`.

**Acceptance**

- active location survives refresh
- accessible navigation works at 320px and desktop
- no existing route is removed

## Milestone 1: Engagement read model

**Objective**

Introduce Engagement without changing booking behavior.

**Ships**

- engagement schema and lifecycle
- manual Client and Engagement creation
- Engagements list and overview
- people and role assignment
- links from existing bookings and event types to an engagement where assigned
- Potential engagement path for quick ad hoc scheduling

**User improvement**

Client work becomes a durable context.

**Dependencies**

- tenancy and user directory

**Risk**

Users may not understand or adopt Engagement.

**Mitigation**

Keep assignment optional for legacy objects, instrument use, provide plain-language creation.

**Rollback**

Hide engagement navigation while retaining additive data.

**Acceptance**

- engagement draft survives navigation
- duplicate client warning works
- permissions prevent unauthorized discovery

## Milestone 2: Conversation playbooks over event types

**Objective**

Reframe meeting configuration without replacing the scheduling engine.

**Ships**

- engagement conversation list
- minimum playbook editor
- purpose, roles, preparation definition, outcome definition
- adapter from playbook to existing event-type availability
- workspace playbook templates
- effective-policy preview

**User improvement**

Users configure why, who, and outcome before advanced scheduling settings.

**Dependencies**

- Engagement
- existing event-type engine

**Risk**

Dual event type and playbook editing conflicts.

**Mitigation**

Declare one source of truth per object and show legacy mapping read-only where needed.

**Rollback**

Return mapped objects to legacy editor; preserve playbook metadata.

**Acceptance**

- one playbook produces identical core availability to its mapped event type
- unsupported legacy settings remain effective and visible

## Milestone 3: Explainable recommendation

**Objective**

Make the thesis visible using existing scored availability.

**Ships**

- delivery-block protection policy
- interpreted constraint summary
- recommendation reasons
- evidence freshness and confidence state
- three ranked options plus all-times escape
- organizer recommendation review
- onboarding calendar interpretation

**User improvement**

Open times become explained operational choices.

**Dependencies**

- scoring provenance from core engine
- calendar health

**Risk**

Reasons may be post-hoc or misleading.

**Mitigation**

Generate reasons only from deterministic scoring signals and record provenance.

**Rollback**

Fall back to current best-times and all-times display.

**Acceptance**

- every reason maps to recorded input
- unknown calendars never show confirmed
- hard-constraint violations never rank

## Milestone 4: Proposals

**Objective**

Separate scheduling intent from confirmed booking.

**Ships**

- proposal lifecycle
- internal confirmation
- public opaque proposal
- client response and request alternative
- participant confidence
- delivery state
- acceptance into existing hold and booking lifecycle

**User improvement**

Agencies can assemble and approve a plan before exposing it to a client.

**Dependencies**

- playbooks
- recommendation
- existing holds and bookings

**Risk**

Additional lifecycle may make simple booking slower.

**Mitigation**

Allow instant-confirmation policy when all evidence and permissions permit.

**Rollback**

Disable proposal creation; existing proposal links remain readable and completable.

**Acceptance**

- acceptance is idempotent
- lost slot preserves other options
- public response works without account

## Milestone 5: Preparation, completion, and next step

**Objective**

Extend scheduling through meeting outcome.

**Ships**

- meeting preparation instances
- readiness summary
- responsible-party reminders using current delivery system
- minimal outcome capture
- next-step proposal from outcome
- engagement timeline

**User improvement**

Meetings arrive prepared and no longer end as isolated calendar events.

**Dependencies**

- playbooks
- meetings
- proposal creation

**Risk**

Outcome and preparation create administrative burden.

**Mitigation**

Limit required fields, allow waiver, measure completion, and do not build general tasks.

**Rollback**

Hide preparation and completion prompts; data remains attached.

**Acceptance**

- meeting can complete in under 20 seconds
- follow-up preserves context
- reminders target only responsible parties

## Milestone 6: Recovery

**Objective**

Turn one disruption class into an explainable recovery.

**Initial trigger**

Required host time off or explicit unavailability.

**Ships**

- Recovery case
- same-time qualified substitute option
- same-people new-time option
- consequence comparison
- human approval
- idempotent execution
- communication and audit history

**User improvement**

A common disruption is resolved without manual calendar comparison.

**Dependencies**

- Engagement roles
- recommendations
- meeting lifecycle
- time off

**Risk**

Incorrect substitution harms client trust.

**Mitigation**

Stage 1 requires approval and restricts candidates to explicitly assigned engagement roles.

**Rollback**

Disable execution while retaining recovery recommendations as read-only guidance.

**Acceptance**

- original meeting remains safe until execution
- changed evidence invalidates approval
- partial provider failure is recoverable

## Milestone 7: Relationship continuity and connections

**Objective**

Deepen recommendations with approved external context.

**Ships**

- Client detail and explicit preferences
- prior-participant continuity
- project reference connector
- member and role import with review
- Microsoft Calendar
- Zoom and Microsoft Teams
- connection health and affected-object display

**User improvement**

Calpaca retains known relationships and fits real agency toolchains.

**Dependencies**

- provider abstraction
- privacy and retention controls

**Risk**

External data quality and permission complexity.

**Mitigation**

All imported mappings require confirmation; stale data lowers confidence.

**Rollback**

Disconnect provider while retaining manually confirmed context and provenance.

**Acceptance**

- source and freshness visible
- removing connection explains effect
- continuity uses only approved meeting history and mappings

## Milestone 8: Insights, policy-controlled agents, and legacy consolidation

**Objective**

Make accumulated scheduling decisions operationally useful.

**Ships**

- delivery, continuity, meeting, and recovery insights
- natural-language constraint parsing with review
- policy-controlled proposal creation through API and MCP
- action audit
- legacy Tools index and migration paths based on usage

**User improvement**

Operations can improve policy and safely delegate repeated scheduling intent.

**Dependencies**

- sufficient decision provenance and outcome data
- audit log
- capability permissions

**Risk**

Insights overclaim causality; agents exceed trust.

**Mitigation**

Show definitions and evidence, restrict action scopes, require review for external action.

**Rollback**

Disable agent mutations and retain read-only explanations; keep legacy routes.

**Acceptance**

- every insight links to underlying records
- every agent action shows interpreted constraints and audit
- no legacy capability is removed without migration and usage evidence

---

# Phase 7: Design review

## 7.1 Review method

The specification was challenged against:

- the frozen agency thesis
- the five-minute proof
- the existing Calpaca architecture
- cold-start conditions
- public participant trust
- legacy product continuity
- desktop and mobile operation
- permission and privacy boundaries
- incremental implementation

## 7.2 Weak area: Engagement could become compulsory CRM administration

**Risk**

Users may need one quick meeting and resent creating client and project records.

**Revision**

Quick conversation creates a lightweight Potential engagement from client identity and purpose. It requires no project integration, end date, or full team. The user can enrich it later.

**Remaining constraint**

Every conversation still belongs to an engagement, even when the engagement begins lightweight. This preserves the primary object without forcing heavy setup.

## 7.3 Weak area: Calendar interpretation may overreach permission or evidence

**Risk**

Free and busy access cannot support claims about clients, fragmentation causes, or recurring patterns that require titles and attendees.

**Revision**

The onboarding explicitly separates free/busy access from optional meeting-context access. Every insight names its evidence and confidence. Without titles or attendees, Calpaca may identify uninterrupted blocks and meeting density, but not client behavior.

## 7.4 Weak area: Recommendation reasons could be persuasive fiction

**Risk**

Natural-language explanations could rationalize a score after the fact.

**Revision**

Reasons are generated only from recorded deterministic scoring provenance. The first implementation contains no model-generated causal claims. Language generation may paraphrase approved facts but cannot add reasons.

## 7.5 Weak area: Role-based assembly depends on unready teammates

**Risk**

New agencies will invite people who have not connected calendars, producing no confirmed recommendation.

**Revision**

Unknown people can participate in tentative proposals and internal confirmation. They cannot produce instant-confirmation availability. The UI distinguishes unknown, tentative, and confirmed throughout.

## 7.6 Weak area: Proposals add friction to simple scheduling

**Risk**

Every booking could become a multi-stage approval workflow.

**Revision**

Proposal is the durable decision object, but policy may accept it instantly when required participants, calendars, and client action are verified. The user sees simple booking behavior without losing provenance.

## 7.7 Weak area: Preparation risks becoming task management

**Risk**

Teams may add arbitrary work, reminders, owners, files, and discussions.

**Revision**

Preparation supports only a requirement, responsible party, due state, link or confirmation, and impact if missing. General tasks link to the project system.

## 7.8 Weak area: Outcome capture may be ignored

**Risk**

Hosts will not complete another form after every meeting.

**Revision**

Completion asks attendance and one outcome choice. A next action appears only when relevant. The under-20-second acceptance criterion is explicit.

## 7.9 Weak area: Recovery scope could become unsafe and enormous

**Risk**

Calendar changes, absences, client requests, policy changes, and connection failures produce different recovery semantics.

**Revision**

The first recovery milestone supports one trigger: required-host explicit unavailability. It offers only assigned-role substitution or rescheduling. Additional triggers use the same object only after separate validation.

## 7.10 Weak area: Clients may not understand Engagement

**Risk**

“Engagement” is agency language and may feel contractual or internal to a client.

**Revision**

Organizer UI uses Engagement. Public pages show the authored engagement name and conversation purpose, not the type label “Engagement.”

## 7.11 Weak area: Insights require data Calpaca does not yet capture

**Risk**

Delivery protection and continuity claims could be misleading without provenance and baseline.

**Revision**

Insights ship after recommendation provenance, engagement assignment, outcomes, and recovery exist. Each measure includes definition, sample, comparison, and records. No causal conversion claims.

## 7.12 Weak area: Existing users could lose high-value generic tools

**Risk**

Polls, sign-up sheets, booking pages, routing, and capacity sessions already work.

**Revision**

They remain under Tools and existing direct routes. Migration is additive. No deletion occurs without usage evidence and a specific replacement.

## 7.13 Weak area: Clients and Engagements could duplicate identity

**Risk**

Users may create duplicate Acme clients or several indistinguishable engagements.

**Revision**

Creation searches existing clients, shows active engagements, and warns on similarity. Client identity may use verified domain as a hint but never merges automatically.

## 7.14 Weak area: Privacy may be weakened by relationship history

**Risk**

Meeting attendees, client notes, and project roles expose sensitive information.

**Revision**

Engagement visibility is permissioned. Search respects access. Relationship facts retain provenance. Sensitive inference is prohibited. Data retention, export, and deletion are explicit Workspace concerns.

## 7.15 Weak area: Mobile could still inherit desktop complexity

**Risk**

The same routes and components could simply stack.

**Revision**

Mobile has defined primary jobs, four navigation destinations, full-page details, sheets for filters, vertical comparisons, one-question workflow sections, and explicit safe-area behavior. Each migrated milestone requires 320px and 390px validation.

## 7.16 Weak area: The specification could invite a massive rewrite

**Risk**

New shell, objects, routes, lifecycle, and public proposals touch most of the product.

**Revision**

Eight additive milestones wrap current APIs before replacing behavior. Every milestone has a flag or read-only fallback. Engagement begins as additive metadata. Playbooks initially adapt to event types. Recommendations reuse current scoring. Proposals terminate in existing hold and booking lifecycle.

## 7.17 Objective contradictions

No contradiction requires changing the thesis.

Three tensions require product discipline:

1. **Engagement-centered versus ad hoc speed:** resolved with lightweight Potential engagements.
2. **Intelligence versus privacy:** resolved with permission-tiered evidence and explicit confidence.
3. **Recovery automation versus trust:** resolved with bounded triggers, policy, approval, and audit.

## 7.18 Engineering handoff checklist

Before implementation begins, engineering, product, and design must ratify:

- route map and legacy coexistence
- object lifecycle transitions
- capability matrix
- Engagement, Proposal, Preparation, Outcome, and Recovery data ownership
- scoring provenance contract
- confidence-state rules
- public token scope and expiry
- autosave and draft ownership
- provider failure semantics
- event and audit requirements
- analytics events and success metrics
- 320px, 390px, keyboard, and screen-reader acceptance scripts

Open product decisions that engineering must not infer:

1. Default retention period for client and engagement history.
2. Whether a client can share a private scheduling capability with another contact.
3. Exact approval defaults for same-time substitution.
4. Which project system is the first Stage 2 connector.
5. Which conversation playbooks ship as the initial five templates.

These decisions do not change the architecture. They affect policy and initial content.

## 7.19 Final specification test

The specification is valid only if a senior engineering team can answer:

- where every object lives
- how users enter and leave every workflow
- what survives refresh and Back
- what happens when evidence is missing
- what requires approval
- how public users recover
- what changes on mobile
- which component contract governs the interaction
- how each milestone ships without replacing the whole application

This document provides those answers.
