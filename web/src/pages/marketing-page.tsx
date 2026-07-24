import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronRight,
  GitFork,
  Menu,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";

const appUrl = "https://app.calpaca.io/sign-in";
const githubUrl = "https://github.com/e1i3or-commits/Calpaca";

const workflow = [
  {
    number: "01",
    title: "Start with the client engagement",
    text: "Keep the client, project, team, and scheduling history together instead of rebuilding context for every meeting.",
  },
  {
    number: "02",
    title: "Use a conversation playbook",
    text: "Define the purpose, participants, availability, location, and preparation once. Reuse it throughout the relationship.",
  },
  {
    number: "03",
    title: "Send an explained proposal",
    text: "Offer a short list of workable times with clear reasons, freshness, and tradeoffs. Clients can accept or request another option.",
  },
  {
    number: "04",
    title: "Carry context into the meeting",
    text: "The confirmed meeting stays connected to its engagement, participants, preparation, and next step.",
  },
];

const foundations = [
  "Google Calendar conflict checking and write-through",
  "Solo, round robin, collective, and capacity scheduling",
  "Meeting polls with calendar-aware suggestions and live results",
  "Routing forms, one-off offers, and sign-up sheets",
  "Email verification, signed webhooks, and append-only booking history",
  "Public API and MCP tools for controlled scheduling automation",
];

const plans = [
  {
    label: "Cloud Basic",
    title: "Free",
    price: "$0",
    priceNote: "forever",
    description: "The relationship-aware workspace for one person.",
    points: ["One user", "Google Calendar sync", "Engagements, booking pages, and meeting polls"],
    action: "Start for free",
    href: appUrl,
    featured: false,
  },
  {
    label: "Cloud Pro",
    title: "For agencies",
    price: "$7",
    priceNote: "per user / month",
    description: "Team scheduling and shared client work without operational overhead.",
    points: ["Teams and shared booking pages", "Round robin and group scheduling", "Managed updates, email, backups, and support"],
    action: "Start with Pro",
    href: appUrl,
    featured: true,
  },
  {
    label: "Community Edition",
    title: "Self-host",
    price: "Free",
    priceNote: "AGPL v3",
    description: "The complete platform on infrastructure you control.",
    points: ["Full source code", "Docker Compose deployment", "Public API and MCP server"],
    action: "View on GitHub",
    href: githubUrl,
    featured: false,
  },
];

function Wordmark() {
  return (
    <a href="#top" className="flex items-center gap-2.5" aria-label="Calpaca home">
      <BrandMark className="h-9 w-9" />
      <span className="text-lg font-semibold tracking-[-0.035em]">Calpaca</span>
    </a>
  );
}

function ProposalPreview() {
  return (
    <div className="mx-auto min-w-0 w-full max-w-[35rem] border border-border bg-card shadow-[0_28px_70px_-48px_rgba(29,69,48,.55)]">
      <div className="border-b border-border px-5 py-5 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[.15em] text-primary">Northstar rebrand</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-.025em]">Choose a time for the kickoff</h2>
        <p className="mt-1 text-sm text-muted-foreground">Kai, Mina, and the client team</p>
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3 border-b border-border pb-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center bg-primary/10 text-primary">
            <CalendarCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Three workable options</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Checked against the project team’s connected calendars 2 minutes ago.
            </p>
          </div>
        </div>
        <div className="divide-y divide-border">
          {[
            ["Tuesday, July 28", "10:00 AM", "Best continuity", "Kai and Mina are both available"],
            ["Wednesday, July 29", "2:30 PM", "Least disruption", "No focus blocks interrupted"],
            ["Friday, July 31", "11:45 AM", "Client preference", "Matches Northstar’s usual window"],
          ].map(([day, time, reason, evidence], index) => (
            <button
              type="button"
              key={`${day}-${time}`}
              className="group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 text-left"
            >
              <span>
                <span className="block text-sm font-semibold">{day} · {time}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  <b className="font-medium text-primary">{reason}</b> · {evidence}
                </span>
              </span>
              <ChevronRight className={`h-4 w-4 ${index === 0 ? "text-primary" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
        <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-center bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Accept Tuesday at 10:00 AM
        </button>
        <button type="button" className="mt-2 min-h-11 w-full text-sm font-medium text-muted-foreground">
          Request another option
        </button>
      </div>
    </div>
  );
}

export function MarketingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div id="top" data-organizer className="marketing-site min-h-screen overflow-hidden bg-background text-foreground">
      <header className="relative z-50 border-b border-border bg-background">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
            <a href="#product" className="text-sm text-muted-foreground transition hover:text-foreground">Product</a>
            <a href="#capabilities" className="text-sm text-muted-foreground transition hover:text-foreground">Capabilities</a>
            <a href="#plans" className="text-sm text-muted-foreground transition hover:text-foreground">Plans</a>
            <a href="#open-source" className="text-sm text-muted-foreground transition hover:text-foreground">Open source</a>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <a href={appUrl} className="px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">Sign in</a>
            <a href={appUrl} className="inline-flex min-h-10 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/92">
              Start free <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <button
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-11 w-11 place-items-center border border-border md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav id="mobile-navigation" className="border-t border-border bg-background px-5 py-4 md:hidden" aria-label="Mobile navigation">
            <div className="mx-auto flex max-w-7xl flex-col">
              {[
                ["Product", "#product"],
                ["Capabilities", "#capabilities"],
                ["Plans", "#plans"],
                ["Open source", "#open-source"],
              ].map(([label, href]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)} className="min-h-11 px-2 py-3 text-sm font-medium">
                  {label}
                </a>
              ))}
              <a href={appUrl} className="mt-3 inline-flex min-h-11 items-center justify-center bg-primary px-5 text-sm font-medium text-primary-foreground">
                Start free
              </a>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_.9fr] lg:gap-20 lg:py-32">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">
                Relationship-aware scheduling for agencies
              </p>
              <h1 className="mt-5 max-w-3xl text-[clamp(2.7rem,6.5vw,6.25rem)] font-semibold leading-[.92] tracking-[-.07em]">
                Schedule the work, not just the meeting.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Calpaca keeps every client, project, participant, proposal, and meeting connected so agencies can move work forward without reconstructing context.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href={appUrl} className="inline-flex min-h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/92">
                  Start with Cloud Basic <ArrowRight className="h-4 w-4" />
                </a>
                <a href="#product" className="inline-flex min-h-12 items-center justify-center border border-border bg-card px-6 text-sm font-semibold transition hover:border-primary/40">
                  See how it works
                </a>
              </div>
              <p className="mt-5 text-xs leading-5 text-muted-foreground">
                Cloud Basic is free. Cloud Pro is $7 per user each month. Self-hosting is free under the AGPL.
              </p>
            </div>
            <ProposalPreview />
          </div>
        </section>

        <section id="product" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr] lg:gap-20">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">A connected workflow</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">
                  The relationship is the source of truth.
                </h2>
                <p className="mt-5 text-base leading-7 text-muted-foreground">
                  Traditional schedulers treat every booking as a fresh transaction. Calpaca remembers who the work is for, who should be involved, and what should happen next.
                </p>
              </div>
              <ol className="border-t border-border">
                {workflow.map((item) => (
                  <li key={item.number} className="grid gap-3 border-b border-border py-6 sm:grid-cols-[3rem_13rem_1fr] sm:gap-5">
                    <span className="text-xs font-semibold text-primary">{item.number}</span>
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{item.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="capabilities" className="scroll-mt-20 border-y border-border bg-card px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:gap-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Scheduling foundations</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">
                Serious scheduling, without the disconnected tools.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
                Use booking links when they are the right tool. Use a poll, routed request, one-off offer, or client proposal when the work calls for something else.
              </p>
            </div>
            <ul className="grid gap-0 border-t border-border">
              {foundations.map((item) => (
                <li key={item} className="flex gap-3 border-b border-border py-4 text-sm leading-6">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="plans" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Choose how to run Calpaca</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">Cloud convenience or full control.</h2>
            </div>
            <div className="mt-12 grid border-l border-t border-border md:grid-cols-3">
              {plans.map((plan) => (
                <article key={plan.label} className={`flex min-h-full flex-col border-b border-r border-border p-6 sm:p-8 ${plan.featured ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                  <p className={`text-xs font-semibold uppercase tracking-[.16em] ${plan.featured ? "text-primary-foreground/65" : "text-primary"}`}>{plan.label}</p>
                  <h3 className="mt-4 text-2xl font-semibold tracking-[-.035em]">{plan.title}</h3>
                  <p className="mt-6 text-4xl font-semibold tracking-[-.055em]">{plan.price} <span className={`text-xs font-normal tracking-normal ${plan.featured ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{plan.priceNote}</span></p>
                  <p className={`mt-5 text-sm leading-6 ${plan.featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{plan.description}</p>
                  <ul className="mt-7 space-y-3 text-sm">
                    {plan.points.map((point) => <li key={point} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0" />{point}</li>)}
                  </ul>
                  <a href={plan.href} className={`mt-9 inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold ${plan.featured ? "bg-primary-foreground text-primary" : "bg-foreground text-background"}`}>
                    {plan.action} <ArrowRight className="h-4 w-4" />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="open-source" className="scroll-mt-20 border-y border-border bg-[#183c2d] px-5 py-20 text-white sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-20">
            <div>
              <div className="flex items-center gap-3 text-[#a9d5bc]">
                <ShieldCheck className="h-5 w-5" />
                <p className="text-xs font-semibold uppercase tracking-[.18em]">Open source builds trust</p>
              </div>
              <h2 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-.045em] sm:text-5xl">
                Inspect it, extend it, or run the whole platform yourself.
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-7 text-white/65">
                Calpaca Community Edition is fully open source under the GNU AGPL v3. The same code powers Calpaca Cloud, where we manage updates, backups, email delivery, integrations, monitoring, and support.
              </p>
            </div>
            <a href={githubUrl} className="inline-flex min-h-12 items-center justify-center gap-2 border border-white/25 px-6 text-sm font-semibold transition hover:border-white/60">
              <GitFork className="h-4 w-4" /> View the repository
            </a>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-8 border-b border-border pb-20 sm:grid-cols-[1fr_auto] sm:pb-24">
            <div>
              <Users className="h-7 w-7 text-primary" />
              <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-.055em] sm:text-5xl">
                Put client context back into scheduling.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                Start with one workspace and one connected calendar. Add the team when the work grows.
              </p>
            </div>
            <a href={appUrl} className="inline-flex min-h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground">
              Start free <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="px-5 pb-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark />
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">
            <a href={githubUrl} className="hover:text-foreground">GitHub</a>
            <a href={`${githubUrl}/blob/main/docs/SELF-HOSTING.md`} className="hover:text-foreground">Self-hosting</a>
            <a href={`${githubUrl}/blob/main/docs/API.md`} className="hover:text-foreground">API</a>
            <a href={`${githubUrl}/blob/main/SECURITY.md`} className="hover:text-foreground">Security</a>
          </div>
          <p className="text-xs text-muted-foreground">AGPL v3 · Built on Bun and PostgreSQL</p>
        </div>
      </footer>
    </div>
  );
}
