# Calpaca Product Experience

Date: July 23, 2026  
Status: Experience definition, not interface specification

## Experience thesis

Calpaca should make scheduling feel like part of delivering client work, not a separate administrative system.

The user should not begin by creating a booking page. They should begin with an **Engagement**: the work an agency is doing with a client, the people involved, the time that work needs protected, and the conversations required to move it forward.

The first proof of value is not:

> Here is your scheduling link.

It is:

> Here are three times that work for the client, keep the right team together, and protect the work you are trying to deliver.

---

## Phase 1: The five-minute test

### The standard

Within five minutes, a new agency owner must experience all four of Calpaca's claims:

1. Calpaca understands client work.
2. Calpaca protects delivery time.
3. Calpaca assembles people by role and relationship.
4. Calpaca explains its recommendation.

If onboarding ends with a generic booking page, the experience has failed.

### Preconditions

The fastest credible path assumes:

- the owner has a Google account
- their calendar contains at least several recent and upcoming events
- they can name one client engagement
- they can name at least one teammate, even if the teammate has not joined

If any precondition is absent, Calpaca uses a guided sample engagement, then makes clear which conclusions are illustrative rather than derived from real data.

### Minute 0: The promise

#### Screen: Sign in or create an account

**Shown**

- Calpaca identity
- one sentence: “Schedule client work without sacrificing the time needed to deliver it.”
- Google sign-in
- a short permission explanation:
  - read free and busy time
  - read meeting titles and attendees only with separate consent
  - create and update meetings
  - never move an existing meeting without approval
- “See a sample first” as a secondary path

**Decision**

- Connect a real calendar
- Explore a sample without granting access

**Interaction**

The owner chooses Google and sees the requested permission before leaving Calpaca.

**What they learn**

Calpaca distinguishes availability access from relationship context. It does not bury permissions in a generic OAuth explanation.

**Why they continue**

The promise concerns protecting delivery time, not making another link.

**Calendly test**

Sign-in itself is not different. The separation of permission purposes and the commitment not to move existing work establish the trust required for later intelligence.

### Minute 1: Calpaca reads the shape of work

#### Screen: Calendar interpretation

**Shown**

A one-week calendar summary, not a configuration form:

- meeting hours
- longest uninterrupted work blocks
- days with heavy fragmentation
- common external meeting windows
- time-zone burden where attendee data is available
- calendar freshness

Example:

> Next week contains 14 meeting hours and 11 uninterrupted delivery hours. Tuesday and Thursday afternoons are your most fragmented periods.

Calpaca proposes three initial policies:

- Protect uninterrupted blocks of 90 minutes or longer.
- Prefer client meetings next to existing meetings.
- Keep Friday afternoon free unless the request is urgent.

Every proposal includes:

- evidence used
- confidence
- editable assumption
- “Do not use this signal” control

**Decision**

- Accept the three policies
- Adjust one
- Continue with no protection

**Interaction**

The owner confirms or edits a proposed protected window directly on the weekly summary.

**What they learn**

Open time is not all equal. Calpaca treats the calendar as delivery capacity.

**Why they continue**

They receive useful information before building anything.

**Calendly test**

If this screen only asks for working hours, it has failed. The difference is interpretation, recommendation, and explicit protection.

### Minute 2: Create the first engagement

#### Screen: Name the work

**Shown**

Prompt:

> What client work needs scheduling?

Fields:

- Client: “Acme”
- Engagement: “Website relaunch”
- Type: Project, Retainer, Prospect, Internal
- Account lead: defaults to the owner
- Expected end date: optional

Optional actions:

- Connect a project system
- Add details later

The form does not ask for a meeting duration, slug, theme, buffer, layout, or booking window.

**Decision**

- Create the engagement manually
- Import it from a connected project system

**Interaction**

The owner types “Acme” and “Website relaunch,” keeps themselves as account lead, and continues.

**What they learn**

Scheduling lives inside client work. Calpaca will remember this context.

**Why they continue**

The object matches how agencies already think.

**Calendly test**

Replacing “event type” with “engagement” while still building a booking link would be cosmetic. The next screen must use the engagement to assemble people and protect time.

### Minute 3: Define a real conversation

#### Screen: What needs to happen?

**Shown**

Prompt:

> What conversation should move this engagement forward?

Suggested playbooks:

- Kickoff
- Client check-in
- Working session
- Review and approval
- Escalation
- Discovery

The owner chooses “Kickoff.”

Calpaca proposes:

- Purpose: Align scope, responsibilities, and first milestones
- Duration: 45 minutes
- Required roles:
  - Account lead
  - Delivery lead
- Optional roles:
  - Specialist
- Preparation:
  - Client brief
  - Project owner confirmed
- Outcome:
  - First milestone and owners agreed

**Decision**

- Accept the playbook
- Change duration
- change required or optional roles
- start from a blank conversation

**Interaction**

The owner adds a teammate by email as Delivery lead. The teammate does not need to accept before the owner sees a preliminary result. Calpaca marks their calendar availability as unknown.

**What they learn**

Calpaca schedules a purpose and a viable team, not a duration attached to a URL.

**Why they continue**

The proposed playbook removes setup work and makes the eventual meeting more useful.

**Calendly test**

Templates exist elsewhere. The difference is that roles, preparation, outcome, and engagement continuity become scheduling inputs.

### Minute 4: The recommendation

#### Screen: First scheduling decision

**Shown**

Prompt:

> When should the Acme kickoff happen?

The owner enters or selects:

- next week
- client timezone: America/Chicago
- afternoons preferred

Calpaca shows three recommendations:

1. **Tuesday, 2:00 PM**
   - Keeps the account lead and delivery lead together
   - Falls inside Acme's preferred afternoon
   - Sits next to an existing client meeting
   - Preserves a 2-hour delivery block
2. **Wednesday, 1:00 PM**
   - Earliest option
   - Breaks a 2.5-hour delivery block
3. **Thursday, 3:30 PM**
   - Best client convenience
   - Delivery lead availability is not yet confirmed

If the teammate has not connected a calendar, Calpaca does not invent availability. It distinguishes:

- confirmed available
- calendar not connected
- tentatively proposed

Actions:

- Send these options to the client
- Invite teammate to confirm availability
- View all viable times
- Change constraints

**Decision**

- Use the recommendation
- choose a tradeoff
- wait for teammate availability

**Interaction**

The owner selects Tuesday and previews a short client proposal.

**What they learn**

Calpaca can explain the operational cost of a time and the confidence of its participant data.

**Why they continue**

The recommendation saves judgment, not just clicks.

**Calendly test**

Three “best times” without reasons are insufficient. The recommendation must use the engagement, roles, delivery protection, client preference, and confidence.

### Minute 5: The result

#### Screen: Proposal ready

**Shown**

Summary:

- Acme website relaunch
- Kickoff
- intended outcome
- proposed participants by role
- selected time or three proposed options
- preparation required
- client-facing timezone
- what Calpaca will send
- what remains unconfirmed

Primary action:

- Send proposal

Secondary actions:

- Copy private proposal link
- Preview as client
- Save draft

Trust statement:

> Calpaca will not confirm the meeting until required participants and the client agree.

After sending:

- proposal delivery state
- teammate confirmation state
- client response state
- next automatic action

**What they learn**

Scheduling is a controlled decision with context, confidence, and a known outcome.

**Why they continue**

The owner has experienced a new scheduling model before being asked to configure a dashboard.

### The five-minute failure conditions

The experience fails if:

- a user must create availability rules before seeing a recommendation
- Calpaca claims insight from calendar data it did not receive
- teammate availability is guessed
- the owner must invite the whole agency
- a project integration is mandatory
- AI generates a proposal without showing interpreted constraints
- the owner is pushed into a generic organizer dashboard after setup
- the result is merely a booking link

---

## Phase 2: The first hour

### First-hour outcome

After one hour, the agency owner should have:

- one connected calendar
- one protected-delivery policy
- one real engagement
- two conversation playbooks
- one teammate invited
- one client proposal sent or one private scheduling link published
- one project connection or manual project reference
- one tested conflict-recovery scenario
- a clear list of what is working and what remains unverified

### 0 to 5 minutes: Prove the thesis

Complete the five-minute experience above.

### 5 to 12 minutes: Confirm calendar behavior

#### Screen: Calendar protection

The owner sees:

- calendars that block availability
- calendar that receives confirmed meetings
- protected delivery blocks
- meeting-density preferences
- stale or incomplete connection warnings

The owner chooses:

- which calendars represent real conflicts
- whether tentative events block availability
- which calendar receives client meetings

Calpaca runs a test:

- reads free and busy state
- creates a private test event
- updates it
- deletes it

It reports each step without exposing technical logs unless requested.

**Thesis reinforcement**

Calendar connection is framed as protecting work and verifying reliability, not as an integration checkbox.

### 12 to 20 minutes: Establish availability without building a schedule

#### Screen: Effective client availability

Calpaca proposes a weekly policy from observed calendar patterns:

- client conversations: Tuesday through Thursday, 1 PM to 4 PM
- urgent conversations: any open weekday time with approval
- protect 90-minute delivery blocks
- maximum 3 client meetings per day
- 15-minute preparation before kickoffs and reviews

The owner can:

- accept
- edit on a week view
- compare “more client availability” and “more delivery protection”
- preview the number of viable hours each policy produces

**Thesis reinforcement**

The user chooses an operating policy and sees the consequence, rather than filling out repeated working-hour forms.

### 20 to 28 minutes: Create services as conversation playbooks

#### Screen: Engagement playbooks

The owner creates:

1. Client kickoff
2. Weekly client check-in

Each playbook defines:

- purpose
- minimum and ideal duration
- required roles
- optional roles
- preparation
- expected outcome
- default urgency
- default client availability policy

It does not define a theme, slug, layout, or email sequence during initial creation.

The owner can later publish a playbook as:

- a private engagement link
- a reusable agency service
- an internal scheduling action
- an embedded client-portal action

**Thesis reinforcement**

“Services” are not pages. They are repeatable conversations with a useful result.

### 28 to 36 minutes: Connect a client and project

#### Screen: Engagement context

The owner chooses one:

- connect project system
- paste project URL
- create manual context

Minimum manual context:

- client name
- engagement name
- account lead
- delivery team
- client contacts
- relevant timezone
- current stage

With a project connection, Calpaca imports only:

- project name and stable ID
- active members
- role where available
- milestone dates
- project status

It does not import tasks, files, comments, or all project history by default.

The owner reviews and approves every mapped person.

**Thesis reinforcement**

Calpaca gains enough project context to schedule responsibly without becoming a project manager.

### 36 to 44 minutes: Invite teammates by role

#### Screen: Team readiness

The owner invites:

- one delivery lead
- one specialist

Each invite states:

- engagement or workspace role
- calendar access requested
- what Calpaca can recommend
- what Calpaca cannot change without approval

Before acceptance, the owner sees:

- invited
- calendar unknown
- can be proposed but not confirmed

After acceptance:

- calendar protected
- meeting preferences available
- project relationships confirmed

**Thesis reinforcement**

The invitation is about participation and control, not simply occupying a paid seat.

### 44 to 50 minutes: Schedule actual work

#### Screen: Engagement timeline

The owner sees:

- kickoff proposal in progress
- client contacts
- project team
- preparation state
- upcoming milestone
- recommended next conversation

They send the proposal created in minute five or publish a private engagement link that only offers:

- relevant playbooks
- appropriate participants
- protected times
- client timezone

**Thesis reinforcement**

The client does not browse the agency's entire meeting catalogue.

### 50 to 56 minutes: Simulate conflict recovery

#### Screen: What if someone becomes unavailable?

Calpaca offers a safe preview:

> Simulate the delivery lead becoming unavailable.

It shows:

- meetings affected
- qualified substitute
- relationship tradeoff
- same-time option
- next-time option
- communication that would be sent
- approval required

Nothing changes.

The owner selects a recovery policy:

- Always ask me
- Allow same-time substitution within the project team
- Never substitute client-facing roles

**Thesis reinforcement**

Recovery is designed before the first disruption.

### 56 to 60 minutes: The operating summary

#### Screen: Workspace readiness

Shown as outcomes:

- Delivery time protected: 11 hours next week
- First engagement ready
- Kickoff proposal sent
- 1 of 2 teammates connected
- Client timezone confirmed
- Recovery policy defined

Attention required:

- Delivery lead has not connected a calendar
- No project integration connected
- Microsoft and Zoom not configured, if relevant

Next recommended action:

- Ask the delivery lead to confirm Tuesday

This is not a setup-completion percentage. It tells the owner whether Calpaca can make trustworthy decisions.

---

## Phase 3: The primary object

### Choice: Engagement

The Engagement is the primary object in Calpaca.

An engagement is a bounded body of work between an agency and a client. It may be:

- a project
- a retainer
- a prospect evaluation
- an implementation
- a support escalation
- an internal initiative

### Why not Client?

A client can have several projects, different teams, different cadences, and different scheduling policies. Client is too broad to determine who should attend or what work should be protected.

### Why not Relationship?

Relationship is the thesis but is too abstract as an operating object. Users cannot reliably define or complete a relationship. An engagement makes the relationship actionable.

### Why not Project?

Some agency relationships are retainers, ongoing services, pre-sales work, or escalations that do not map cleanly to a project. “Project” also implies Calpaca might manage project execution.

### Why not Team?

Teams serve many engagements. They do not explain client context or meeting purpose.

### Why not Conversation?

A conversation is an action inside an engagement. Centering it would recreate meeting-type-centric scheduling with better terminology.

### Why not Schedule?

A schedule is a constraint, not the reason work exists.

### The engagement-centered hierarchy

```text
Workspace
└── Engagement
    ├── Client and contacts
    ├── Agency team and roles
    ├── External project reference
    ├── Delivery protection policy
    ├── Conversation playbooks
    ├── Proposals
    ├── Confirmed meetings
    ├── Preparation
    ├── Outcomes
    └── Recovery history
```

### The engagement lifecycle

1. Potential
2. Active
3. Paused
4. Completing
5. Completed
6. Archived

The lifecycle affects scheduling:

- Potential engagements prioritize quick response and qualification.
- Active engagements prioritize continuity and delivery protection.
- Paused engagements do not offer public scheduling.
- Completing engagements emphasize approval, handoff, and follow-up.
- Completed engagements retain history but do not offer new meetings without reopening.

---

## Phase 4: Ten magic moments

### 1. Calpaca protects a work block the owner did not explicitly configure

Calpaca notices that Wednesday morning is the only three-hour uninterrupted block before a milestone. It recommends client times elsewhere and explains why.

**Real pain solved:** agencies sacrifice delivery time one harmless-looking meeting at a time.

**Guardrail:** the user can remove the signal and see the resulting availability.

### 2. The recurring client sees the same relationship holder

An Acme contact opens a scheduling action. Calpaca prefers the account lead and prior specialist even though another teammate has more open time.

**Real pain solved:** clients repeat context to a rotating cast of people.

**Guardrail:** urgency can override continuity, but the tradeoff is visible.

### 3. Calpaca assembles roles, not names

A technical review requires an account lead, one technical lead, and an optional designer. Calpaca selects the smallest viable team from the engagement.

**Real pain solved:** coordinators manually compare several calendars and project rosters.

**Guardrail:** required roles and eligible people are inspectable.

### 4. A recommendation explains its operational cost

Two times work. Calpaca says:

> Tuesday protects two delivery blocks. Wednesday is one day sooner but fragments work for three people.

**Real pain solved:** users cannot distinguish harmless open time from expensive open time.

**Guardrail:** scores never appear without reasons.

### 5. A callout produces a recovery plan

A required participant marks time off. Calpaca proposes a project-qualified substitute at the same time and a continuity-preserving reschedule.

**Real pain solved:** schedule changes trigger calendar comparison, staffing decisions, and multiple messages.

**Guardrail:** no external change occurs outside the engagement's approval policy.

### 6. Preparation controls reminders

The client uploaded the brief but the agency has not assigned a workshop lead. Calpaca reminds the agency, not the client.

**Real pain solved:** generic reminders create noise while required preparation remains missing.

**Guardrail:** preparation is structured and minimal, not a task-management system.

### 7. The next meeting starts with inherited context

After a review, the host chooses “Approval session needed.” Calpaca carries forward the engagement, client contacts, relevant participants, and decision deadline.

**Real pain solved:** every follow-up starts with another link and repeated configuration.

**Guardrail:** the host confirms changed purpose and participants.

### 8. Calpaca detects relationship fragmentation

Calpaca notices that one client has met five agency people across four recent meetings with no consistent owner.

It recommends:

> Make Priya the continuity lead for future Acme conversations.

**Real pain solved:** relationship quality degrades invisibly through operational scheduling.

**Guardrail:** the recommendation is based on meeting history, not inferred sentiment.

### 9. Calpaca predicts an impossible booking policy

A meeting playbook requires three roles, two days of preparation, and a one-week booking window. Current calendars leave no viable time.

Calpaca warns before publication and offers:

- extend the window
- make one role optional
- reduce preparation lead time
- add an eligible teammate

**Real pain solved:** teams publish links that silently show no availability.

**Guardrail:** every alternative states its consequence.

### 10. Natural language becomes an auditable proposal

The owner asks:

> Find time for the Acme escalation with someone who knows billing and the account lead.

Calpaca shows:

- Acme engagement selected
- escalation playbook selected
- account lead required
- billing skill required
- urgency inferred as high
- three ranked options
- approval required

**Real pain solved:** translating intent into calendars, people, and rules.

**Guardrail:** interpreted constraints are confirmed before action.

---

## Phase 5: Core objects

### 1. Engagement

**Why it exists**

To give scheduling a durable client-work context.

**Users care about**

- client
- purpose
- status
- team
- current stage
- delivery deadlines
- meeting history
- next required conversation

**Relationships**

Owns conversation playbooks, proposals, meetings, preparation, outcomes, and recovery cases. References client, contacts, people, external project, and policies.

**Information**

- name and type
- client
- lifecycle
- account lead
- delivery roles
- external project reference
- timezone context
- active milestones
- continuity policy
- scheduling policy
- retention policy

### 2. Client

**Why it exists**

To represent the organization or person receiving agency work without becoming a CRM.

**Users care about**

- identity
- contacts
- timezone
- active engagements
- relationship owner
- scheduling preferences
- prior meeting history

**Relationships**

Has contacts and engagements.

**Information**

- name
- domain
- default timezone
- key contacts
- relationship owner
- approved scheduling notes
- data-retention state

No deals, pipelines, campaigns, or enrichment.

### 3. Person

**Why it exists**

To identify a human who can participate, whether agency teammate or client contact.

**Users care about**

- role
- availability confidence
- relationship to the engagement
- skills
- timezone
- participation history
- authority

**Relationships**

Can belong to a workspace, client, team, engagement, proposal, or meeting.

**Information**

- identity
- organization
- engagement roles
- skills relevant to scheduling
- calendar connection health
- preferences
- consent and visibility

### 4. Role requirement

**Why it exists**

To describe who a conversation needs without hard-coding names.

**Users care about**

- why the role is needed
- required or optional
- eligible people
- substitution rules
- authority required

**Relationships**

Belongs to a conversation playbook or one-off proposal. Matches people through engagement role, skill, relationship, and policy.

**Information**

- role label
- required state
- eligibility
- minimum count
- continuity preference
- fallback behavior

### 5. Conversation playbook

**Why it exists**

To define a repeatable conversation that advances an engagement.

**Users care about**

- purpose
- duration
- participants
- preparation
- intended outcome
- when it should happen

**Relationships**

Belongs to a workspace template or engagement. Produces proposals and meetings.

**Information**

- purpose
- recommended and allowed duration
- role requirements
- preparation requirements
- outcome choices
- scheduling policy
- location
- client-facing explanation

### 6. Scheduling policy

**Why it exists**

To encode the tradeoffs that make one available time better than another.

**Users care about**

- client convenience
- delivery protection
- urgency
- continuity
- meeting density
- preparation time
- approval boundaries

**Relationships**

Can be inherited from workspace, engagement, playbook, or person. Effective policy is visible at the decision.

**Information**

- protected delivery rules
- client windows
- density limits
- urgency overrides
- continuity priorities
- substitution policy
- approval policy

### 7. Proposal

**Why it exists**

To represent an unconfirmed scheduling decision rather than pretending every shared link is availability.

**Users care about**

- options
- participants
- confidence
- tradeoffs
- responses
- expiry
- next action

**Relationships**

Belongs to an engagement and playbook. Contains candidate assemblies and times. Can become a meeting or recovery case.

**Information**

- interpreted intent
- constraints
- candidate times
- candidate participants
- explanation
- confidence
- recipients
- responses
- delivery state
- approval state

### 8. Meeting

**Why it exists**

To represent a confirmed commitment and its complete lifecycle.

**Users care about**

- purpose
- time
- participants
- location
- preparation
- delivery
- changes
- outcome

**Relationships**

Comes from a proposal or direct booking. Belongs to an engagement and playbook. Has preparation, outcome, communication, and recovery history.

**Information**

- confirmed time and timezone
- participants by role
- location
- calendar and delivery state
- preparation state
- attendance
- lifecycle history
- outcome

### 9. Preparation

**Why it exists**

To ensure the meeting can achieve its purpose without becoming a task manager.

**Users care about**

- what is required
- who owns it
- whether it is complete
- whether missing preparation threatens the meeting

**Relationships**

Defined by playbook, instantiated on meeting, owned by a person or party.

**Information**

- requirement
- responsible party
- status
- due time
- link or confirmation
- impact if missing

### 10. Outcome

**Why it exists**

To determine whether the conversation advanced the engagement and what should happen next.

**Users care about**

- meeting completed
- intended decision reached
- follow-up required
- next owner
- next conversation

**Relationships**

Belongs to a meeting and updates engagement context. Can create a next-step proposal.

**Information**

- attendance
- outcome category
- next action
- action owner
- next conversation requirement
- external system reference

### 11. Recovery case

**Why it exists**

To turn disruption into an explainable operational workflow.

**Users care about**

- what changed
- meetings affected
- smallest safe repair
- tradeoffs
- approval
- client communication

**Relationships**

References meeting, people, engagement, policy, proposals, and event history.

**Information**

- trigger
- affected commitments
- candidate remedies
- rationale
- approvals
- executed change
- communication state
- audit history

### 12. Connection

**Why it exists**

To establish the external truth Calpaca uses.

**Users care about**

- system
- account
- data read
- actions allowed
- freshness
- failures
- affected engagements

**Relationships**

Provides calendar, project, conferencing, CRM, or messaging signals.

**Information**

- provider
- identity
- permission scope
- health
- last successful activity
- objects affected
- repair action

---

## Phase 6: Fifty deliberate anti-features

### Scheduling scope

1. **No generic event-type marketplace.** Templates should encode agency conversations, not become a catalogue of arbitrary appointment types.
2. **No unlimited structural booking layouts.** One adaptive, excellent client experience is more trustworthy than a layout builder.
3. **No theme marketplace.** Brand identity is supported; decorative proliferation is not.
4. **No public host beauty pages.** Calpaca schedules work, not creator profiles.
5. **No social discovery directory.** Client relationships arrive from agency channels.
6. **No resource inventory engine.** Rooms, vehicles, equipment, and stock require a different operational product.
7. **No shift scheduling.** Employee rosters and labor compliance are outside client-meeting scheduling.
8. **No field-service dispatch.** Routes, travel, job duration, and crews are a separate domain.
9. **No class-management system.** Courses, attendance series, and curriculum are not the wedge.
10. **No event-ticketing platform.** Registration, ticket types, and admission belong elsewhere.

### Commerce

11. **No marketplace payments.** Calpaca will not split funds between providers.
12. **No invoicing.** Agencies already use accounting systems.
13. **No subscriptions for client services.** Billing retainers is not a scheduling job.
14. **No package or credit balances.** Session packs pull the product toward consumer appointments.
15. **No promo-code engine.** Marketing discounts do not strengthen relationship-aware scheduling.
16. **No point of sale.** In-person commerce is unrelated.
17. **No tax engine.** Calpaca should not calculate global service tax.
18. **No financial ledger.** Payment truth belongs to payment and accounting providers.

### CRM and project management

19. **No sales pipeline.** Opportunities and stages remain in CRM.
20. **No lead scoring.** Calpaca may consume qualification, not own sales judgment.
21. **No email campaign builder.** Scheduling messages are transactional and outcome-specific.
22. **No contact enrichment.** Calpaca should not purchase or infer personal profiles.
23. **No project task boards.** Tasks remain in the project system.
24. **No Gantt charts.** Milestone context is enough.
25. **No file repository.** Preparation links to the system of record.
26. **No collaborative document editor.** Meeting context should reference documents.
27. **No team chat.** Recovery communication may notify chat tools but not replace them.
28. **No timesheets.** Delivery-time protection is not time tracking.
29. **No utilization billing.** Meeting load signals should not become employee surveillance.

### AI

30. **No AI meeting recorder.** Recording, transcription, storage, and consent are a different trust domain.
31. **No generic meeting summarizer.** Calpaca uses structured outcomes or external summaries.
32. **No AI email-copy playground.** Generated prose is not a scheduling advantage.
33. **No autonomous movement of existing meetings.** Consequential changes require policy and, where specified, approval.
34. **No hidden recommendation score.** Every recommendation needs human-readable reasons.
35. **No inferred sensitive traits.** Skills and relationships come from approved systems or explicit input.
36. **No AI persona or chatbot mascot.** The product should communicate directly.
37. **No task auto-scheduling.** Motion owns that category; Calpaca protects work blocks without managing tasks.
38. **No fully autonomous client outreach.** Agents may draft and propose within policy, not invent relationship communication.

### Platform breadth

39. **No plugin marketplace.** A focused adapter surface and webhooks keep the product coherent.
40. **No hundreds of native integrations.** Build only calendar, conferencing, project, CRM-context, and messaging connections that strengthen the thesis.
41. **No multiple database engines.** PostgreSQL correctness is more valuable than deployment novelty.
42. **No native video service.** Use Meet, Zoom, and Teams.
43. **No native mobile app until mobile web demand proves a platform gap.** Avoid duplicating clients.
44. **No white-label reseller platform.** Workspace branding is enough until a real channel proves otherwise.
45. **No arbitrary no-code application builder.** Calpaca should remain opinionated.
46. **No custom scripting inside the product.** Use API and webhooks with clear security boundaries.

### Management and analytics

47. **No generic dashboard builder.** Provide agency decisions and export data.
48. **No employee productivity score.** Meeting behavior should improve systems, not rank people.
49. **No vanity AI insights.** Every insight must show evidence and support an action.
50. **No feature added solely for competitor parity.** Commodity gaps need adoption evidence and a defined maintenance budget.

---

## Phase 7: Intelligent defaults

### First booking

**Default behavior**

- Calpaca uses the engagement's client timezone.
- It prefers the account lead and required engagement roles.
- It ranks times by delivery protection and participant continuity.
- It shows three recommendations before all times.
- It includes purpose, participants, preparation, and expected outcome.
- It requires confirmation from any participant whose calendar is unknown.

**What the agency does not configure**

- slot ranking
- default continuity
- basic delivery-block protection
- confirmation email structure
- time-zone display

### First cancellation

**Default behavior**

- The cancelling person gives a reason category and optional detail.
- Calpaca checks whether the engagement still needs the conversation.
- It offers reschedule, substitute, or cancel based on roles and policy.
- It retains preparation and context for rescheduling.
- It sends one coherent update after the decision.

**Default policy**

Client cancellation offers rescheduling. Required-host cancellation asks the agency to choose recovery. Optional-host cancellation does not cancel the meeting.

### First reschedule

**Default behavior**

- Original participants, purpose, preparation, and outcome remain attached.
- Calpaca ranks replacement times by the same policy.
- The old time remains until the replacement is confirmed.
- Participants see what changed and what did not.

### First recurring client

**Default behavior**

- After the second meeting with the same client and engagement, Calpaca asks whether to preserve a cadence.
- It prefers known participants and learned, explicit time preferences.
- It does not silently create an infinite recurring series.
- Each future meeting remains recoverable independently.

### First new employee

**Default behavior**

- The employee is invited with role and engagement context.
- They connect a calendar and confirm protected work preferences.
- They are not immediately eligible for every client.
- Account leads or managers assign engagement roles.
- Calpaca explains when the employee becomes eligible for a proposal.

### First conflict

**Default behavior**

- New proposals stop using stale or conflicting availability.
- Confirmed meetings are not silently changed.
- Calpaca identifies affected commitments and proposes the smallest repair.
- The user sees cause, confidence, and approval requirement.

### First vacation

**Default behavior**

- The person marks time off.
- Calpaca shows affected proposals and meetings before saving.
- Optional participants are removed when safe.
- Required roles trigger substitution or reschedule proposals.
- Client-facing roles default to human approval.

### First no-show

**Default behavior**

- The organizer marks who did not attend.
- Calpaca records the outcome without blame language.
- It offers a context-preserving rebook.
- Repeated no-shows can trigger confirmation, shorter booking windows, or manual approval, but only after the agency chooses the policy.

### First follow-up

**Default behavior**

- Outcome asks only whether another conversation is required.
- If yes, Calpaca carries forward engagement, relevant participants, preparation, and timing constraints.
- It proposes times before asking the user to create another link.

### First completed project

**Default behavior**

- The engagement moves to Completing.
- Calpaca shows upcoming meetings and unresolved proposals.
- The owner can cancel, retain, or convert the final conversations.
- After completion, public engagement scheduling closes.
- History remains searchable according to retention policy.
- New scheduling requires reopening or creating a new engagement.

---

## Phase 8: Product narrative

### The problem that existed

Scheduling products were built around calendar vacancy.

They made it easy to publish open time, let someone choose a slot, and place an event on a calendar. As teams grew, those products added routing, round robin, forms, reminders, workflows, polls, analytics, payments, and administration.

They became better at processing bookings.

They did not become much better at understanding the work around the booking.

For a client-service agency, an empty calendar slot is not necessarily available capacity. It may be the only uninterrupted time before a deliverable. The fastest available employee may be the wrong person for an established client. A fair round robin can damage continuity. A cancellation is not just a deleted event; it may require a substitute, a changed decision, new preparation, and careful client communication.

### Why existing products solve the wrong problem

Traditional scheduling asks:

- What type of meeting is this?
- When is the host free?
- Which booking page should the client see?
- Which available person gets assigned?
- What reminders should be sent?

Agencies need to ask:

- What client work is this conversation advancing?
- Which roles and relationships are required?
- What time protects delivery work?
- What preparation makes the meeting worthwhile?
- What changes if one person becomes unavailable?
- What should happen after the conversation?

The difference is not semantic. It changes the data, recommendation, workflow, and measure of success.

### How Calpaca changes scheduling

Calpaca starts with an engagement.

It understands the client, project or retainer, agency team, required roles, protected work, and intended outcome. It uses that context to recommend a small number of strong options and explains the tradeoff behind each one.

When plans change, Calpaca does not merely expose a reschedule link. It preserves the engagement, evaluates qualified substitutes, finds the smallest safe change, and asks for approval according to policy.

After the meeting, Calpaca captures enough outcome to schedule the next necessary conversation without rebuilding context.

### What users begin doing differently

They:

- schedule from client work rather than generic links
- protect delivery blocks explicitly
- define required roles instead of manually choosing names
- review recommendations and tradeoffs instead of scanning slot walls
- treat preparation as part of scheduling
- recover meetings through controlled proposals
- schedule next steps from outcomes
- inspect why the system recommended or changed something

### What users stop worrying about

They stop worrying:

- whether a harmless booking will fracture the delivery week
- whether a client will meet another stranger
- whether every required specialist is actually included
- whether time off silently breaks confirmed meetings
- whether a reschedule loses context
- whether a teammate's calendar is stale
- whether AI acted without permission
- whether the next meeting starts from zero

### The narrative test

A future feature belongs in Calpaca only if it improves at least one of:

- engagement context
- delivery protection
- participant fit
- preparation
- recovery
- outcome continuity
- explainability and trust

---

## Phase 9: The founder test

### Why Calendly cannot simply copy this in six months

The honest answer:

Calendly can copy individual features.

It can add:

- protected blocks
- project fields
- continuity preferences
- role-based participants
- recommendation explanations
- outcome forms
- recovery suggestions

None is technically impossible for a large incumbent.

If Calpaca's advantage is a collection of those controls, there is no defense.

### The actual defense

#### 1. A different primary object

Calendly is organized around event types, routing, booking pages, and scheduled events. Making Engagement the primary object would require product, data, navigation, onboarding, analytics, and integration changes across its mature platform.

An incumbent can add engagement fields. It is harder to make engagement context govern the whole scheduling decision.

#### 2. A compounding relationship graph

Over time Calpaca learns approved operational facts:

- who owns each client relationship
- who participates in each engagement
- what roles conversations require
- what tradeoffs teams accept
- which substitutions succeed
- what client preferences are explicit
- what outcomes lead to follow-up

This is customer-specific operational history, not a generic model that a competitor can ship.

#### 3. A decision and recovery history

Calpaca's append-only lifecycle can capture:

- the constraints used
- the alternatives considered
- the recommendation made
- the human override
- the disruption
- the recovery proposed
- the final outcome

That history improves policy and trust. It also creates switching cost because it explains how an agency operates.

#### 4. Focus

Calendly must serve individuals, sales, recruiting, customer success, education, enterprise administration, and many other markets.

Calpaca can make agency-specific defaults that would be too opinionated for a horizontal platform.

#### 5. Open, policy-controlled delegation

Calpaca can make scheduling decisions accessible through a public API and MCP while keeping explanation, approval, and audit native. Agencies can place the engine inside their own operating workflows without surrendering control to a closed assistant.

### What is not defensible

- open source alone
- self-hosting alone
- scored slots alone
- MCP support alone
- an agency template library
- a prettier booking experience
- a natural-language scheduling box

### The cold-start problem

The relationship graph and decision history do not exist on day one.

Calpaca must therefore deliver immediate value from:

- calendar-shape interpretation
- delivery protection
- role-based team assembly
- explainable recommendations
- basic recovery

Project and relationship context deepen the product after initial use.

### The defensibility test

The strategy is failing if, after six months of use, an agency can export only meetings and contacts. It should also have valuable, portable operating knowledge:

- engagement roles
- conversation playbooks
- scheduling policies
- explicit client preferences
- recovery rules
- outcome patterns

Calpaca should make that data exportable. Defensibility should come from accumulated value and workflow fit, not hostage-taking.

---

## Phase 10: Experience roadmap

### Stage 1: Prove the thesis

#### Objective

Demonstrate that Calpaca schedules a real agency conversation better than a booking-page product.

#### Product

1. Engagement as a manual primary object
2. Client and engagement team
3. Five agency conversation playbooks
4. Required and optional roles
5. Google Calendar connection and health
6. Delivery-block protection
7. Explainable ranked times
8. Proposal with confidence and participant confirmation
9. Confirmed meeting with preparation
10. Manual outcome and next-step proposal
11. Basic recovery after required-host unavailability
12. Append-only decision and recovery history

#### Deliberate omissions

- project-system integration
- CRM integration
- automatic preference learning
- autonomous agents
- generic workflow builder
- payments
- advanced analytics
- Microsoft calendar

#### Thesis demonstration

A user creates an Acme engagement, defines a kickoff requiring two roles, receives a recommendation that preserves delivery time, sends a proposal, and recovers it after one participant becomes unavailable.

#### Success criteria

- 70% of activated users create an engagement
- median time to first explained recommendation under five minutes
- 50% of first recommendations are sent or confirmed
- 60% of users understand why the first time was recommended without help
- at least 30% create a second conversation from an engagement outcome
- qualitative evidence that delivery protection or team continuity changed a decision

### Stage 2: Deepen the advantage

#### Objective

Make relationship continuity and recovery compound with daily use.

#### Product

1. Client history across engagements
2. Explicit client time preferences
3. Relationship continuity scoring
4. Skill and project-role matching
5. Required-role pools and qualified substitution
6. Time-off impact analysis
7. Recovery approval policies
8. Project connections for membership and milestones
9. CRM context for ownership and client identity
10. Microsoft Calendar
11. Zoom and Microsoft Teams
12. Preparation-driven reminders
13. Engagement-level insights
14. Policy-controlled natural-language proposals
15. Audit log and granular roles

#### Thesis demonstration

A team member calls out. Calpaca proposes a same-time project-qualified substitute and a continuity-preserving reschedule, explains both, and executes the approved choice across calendars and communication.

#### Success criteria

- 80% of active client meetings attached to an engagement
- 70% retain a prior relationship participant where policy prefers continuity
- 50% reduction in manual calendar comparisons for multi-role meetings
- 40% of disruptions resolved from Calpaca's first proposal
- preparation completion improves relative to baseline
- fewer support requests about missing availability and assignment

### Stage 3: Scheduling operations as infrastructure

#### Objective

Make Calpaca the accountable coordination layer across agency systems and external participants.

#### Product

1. Engagement graph across client, project, roles, conversations, and outcomes
2. Adaptive policy recommendations based on explicit historical decisions
3. Proactive scheduling-risk detection
4. Cross-engagement delivery-capacity optimization
5. Outcome-triggered next-step automation
6. Multi-party agent coordination through open protocols
7. Policy simulation before changes
8. Recovery orchestration across connected systems
9. Portable agency scheduling playbooks
10. Aggregated operational insights without employee scoring

#### Thesis demonstration

An operations lead changes a delivery deadline. Calpaca identifies which proposed and confirmed client conversations now threaten delivery, recommends policy or timing changes, forecasts client and team impact, and coordinates approved recovery.

#### Success criteria

- measurable delivery blocks preserved
- reduced time from scheduling intent to confirmed meeting
- high continuity for active client engagements
- majority of disruptions recovered without cancellation
- majority of completed meetings record a next action
- agent recommendations have high approval and low correction rates
- customers cite scheduling operations, not price or self-hosting, as the reason they stay

### Features that do not enter any stage

- more themes
- more booking layouts
- waitlists
- meeting payments
- full CRM
- task management
- AI notetaking
- native video
- native mobile applications
- integration marketplace
- generic automation canvas
- dashboard customization

If future evidence supports one, it must still pass the engagement, delivery, continuity, recovery, outcome, and trust test.

---

## Final experience statement

Calpaca changes the unit of scheduling from the available slot to the client engagement.

It changes the core question from:

> When are you free?

to:

> What conversation moves this work forward, who needs to be there, and when can it happen without damaging the work around it?

That is the experience users should feel in five minutes, deepen in an hour, and depend on after a year.
