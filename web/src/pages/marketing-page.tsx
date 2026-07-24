import {
  ArrowRight,
  Bot,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  GitFork,
  Globe2,
  Menu,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";

const appUrl = "https://app.calpaca.io/sign-in";
const githubUrl = "https://github.com/e1i3or-commits/Calpaca";

const features = [
  {
    icon: CalendarCheck,
    title: "Booking pages that feel like yours",
    text: "Flexible durations, custom questions, branded themes, and the meeting formats your guests actually use.",
    className: "md:col-span-2",
  },
  {
    icon: Users,
    title: "One calendar for the whole crew",
    text: "Collective meetings, weighted round robin, capacity sessions, and team booking pages.",
    className: "",
  },
  {
    icon: Sparkles,
    title: "Better times, surfaced first",
    text: "Calpaca ranks availability instead of making people hunt through a wall of identical buttons.",
    className: "",
  },
  {
    icon: Route,
    title: "Route every request well",
    text: "Ask the right questions, send people to the right host, and retain the decision trail.",
    className: "",
  },
  {
    icon: ShieldCheck,
    title: "Built for trust",
    text: "Email verification, expiring holds, signed webhooks, scoped workspaces, and privacy-aware calendar overlays.",
    className: "md:col-span-2",
  },
];

const plans = [
  {
    label: "Hosted Basic",
    title: "Free",
    price: "$0",
    priceNote: "forever",
    description: "Everything an individual needs to share availability and book meetings.",
    points: ["One user", "Google Calendar sync", "Booking pages and meeting polls"],
    action: "Start for free",
    href: appUrl,
    featured: false,
  },
  {
    label: "Hosted Pro",
    title: "For teams",
    price: "$7",
    priceNote: "per user / month",
    description: "Team scheduling and premium controls for growing organizations.",
    points: ["Teams and shared booking pages", "Round robin and group scheduling", "Premium administration features"],
    action: "Start with Pro",
    href: appUrl,
    featured: true,
  },
  {
    label: "Open source",
    title: "Run it yourself",
    price: "Free",
    priceNote: "AGPL v3",
    description: "The complete AGPL-licensed platform on infrastructure you control.",
    points: ["Bun + PostgreSQL", "Docker Compose deployment", "Public API and MCP server"],
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

function BookingPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[35rem]">
      <div className="marketing-orbit absolute -inset-12 -z-10 rounded-full border border-primary/10" />
      <div className="overflow-hidden rounded-[1.75rem] border border-foreground/10 bg-card shadow-[0_36px_90px_-45px_rgba(29,69,48,.5)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Coffee &amp; a good idea</p>
              <p className="text-xs text-muted-foreground">30 minutes · Google Meet</p>
            </div>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            America/New_York
          </span>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-[.88fr_1.12fr] sm:p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
              July 2026
            </p>
            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px]">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <span key={`${day}-${index}`} className="pb-1.5 text-muted-foreground">{day}</span>
              ))}
              {Array.from({ length: 4 }, (_, index) => <span key={`blank-${index}`} />)}
              {Array.from({ length: 14 }, (_, index) => {
                const day = index + 1;
                return (
                  <span
                    key={day}
                    className={`grid aspect-square place-items-center rounded-full ${
                      day === 8
                        ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                        : day > 4 && day < 12
                          ? "bg-muted/80 text-foreground"
                          : "text-muted-foreground/55"
                    }`}
                  >
                    {day}
                  </span>
                );
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Wednesday, July 8</p>
              <span className="flex items-center gap-1 text-[11px] text-primary">
                <Sparkles className="h-3 w-3" /> Best times
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {["10:00 AM", "11:45 AM", "2:30 PM"].map((time, index) => (
                <button
                  type="button"
                  key={time}
                  className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition hover:-translate-y-0.5 ${
                    index === 0
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/35"
                  }`}
                >
                  {time}
                  {index === 0 ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -left-3 flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium shadow-lg sm:-left-9">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Calendars in sync
      </div>
    </div>
  );
}

function PollPreview() {
  const rows = [
    ["Tuesday · 10:00 AM", "4", "1", "0"],
    ["Wednesday · 2:30 PM", "5", "0", "0"],
    ["Friday · 11:45 AM", "3", "1", "1"],
  ];
  return (
    <div className="rounded-[1.5rem] border border-white/12 bg-white/8 p-4 backdrop-blur sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Design review</p>
          <p className="mt-0.5 text-xs text-white/55">5 people responded</p>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/65">Live results</span>
      </div>
      <div className="mt-5 space-y-2.5">
        {rows.map(([time, yes, maybe, no], index) => (
          <div key={time} className={`rounded-xl border p-3 ${index === 1 ? "border-[#8fcaac]/50 bg-[#8fcaac]/12" : "border-white/10 bg-black/8"}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-white sm:text-sm">{time}</span>
              {index === 1 && <span className="text-[10px] font-semibold uppercase tracking-wider text-[#aee0c3]">Best fit</span>}
            </div>
            <div className="mt-2.5 flex gap-4 text-[11px] text-white/55">
              <span><b className="text-[#aee0c3]">{yes}</b> yes</span>
              <span><b className="text-[#e6c478]">{maybe}</b> maybe</span>
              <span><b className="text-[#da948a]">{no}</b> no</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div id="top" data-organizer className="marketing-site min-h-screen overflow-hidden bg-background text-foreground">
      <header className="relative z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.75rem] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
            <a href="#features" className="text-sm text-muted-foreground transition hover:text-foreground">Features</a>
            <a href="#teams" className="text-sm text-muted-foreground transition hover:text-foreground">Teams</a>
            <a href="#open-source" className="text-sm text-muted-foreground transition hover:text-foreground">Open source</a>
            <a href="#plans" className="text-sm text-muted-foreground transition hover:text-foreground">Plans</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <a href={appUrl} className="px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">Sign in</a>
            <a href={appUrl} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/92">
              Get started <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <button
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-11 w-11 place-items-center rounded-full border border-border md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-border bg-background px-5 py-5 md:hidden" aria-label="Mobile navigation">
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {[
                ["Features", "#features"],
                ["Teams", "#teams"],
                ["Open source", "#open-source"],
                ["Plans", "#plans"],
              ].map(([label, href]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-3 text-sm font-medium hover:bg-muted">
                  {label}
                </a>
              ))}
              <a href={appUrl} className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
                Get started
              </a>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="relative">
          <div className="marketing-dots absolute inset-x-0 top-0 -z-10 h-full opacity-35" />
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-28 pt-20 sm:px-8 sm:pt-28 lg:grid-cols-[1.02fr_.98fr] lg:gap-20 lg:pb-36 lg:pt-32">
            <div>
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/7 px-3.5 py-1.5 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Scheduling, minus the stampede
              </p>
              <h1 className="max-w-3xl text-[clamp(3.5rem,7vw,6.9rem)] font-semibold leading-[.88] tracking-[-.075em]">
                Find time.
                <span className="mt-2 block text-primary">Keep your day.</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Calpaca brings booking links, team scheduling, meeting polls, and thoughtful automation into one focused workspace.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href={appUrl} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[0_12px_30px_-15px_rgba(26,107,70,.8)] transition hover:-translate-y-0.5 hover:bg-primary/92">
                  Start scheduling <ArrowRight className="h-4 w-4" />
                </a>
                <a href={githubUrl} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card px-6 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-primary/30">
                  <GitFork className="h-4 w-4" /> Explore the code
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Hosted or self-hosted</span>
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Google Calendar sync</span>
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> AGPL open source</span>
              </div>
            </div>
            <BookingPreview />
          </div>
        </section>

        <section className="border-y border-border bg-card/60">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-5 py-6 text-xs font-medium text-muted-foreground sm:px-8">
            <span className="uppercase tracking-[.16em] text-foreground/45">One place for</span>
            {[
              [CalendarDays, "Booking links"],
              [Users, "Group polls"],
              [Route, "Team routing"],
              [Bot, "AI scheduling"],
              [Code2, "Open APIs"],
            ].map(([Icon, label]) => {
              const ItemIcon = Icon as typeof CalendarDays;
              return <span key={label as string} className="flex items-center gap-2"><ItemIcon className="h-4 w-4 text-primary" />{label as string}</span>;
            })}
          </div>
        </section>

        <section id="features" className="scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">The useful bits</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Less calendar wrangling.<br />More actual work.</h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">Every scheduling mode shares the same availability engine, calendar connections, and lifecycle, so the product stays coherent as your needs grow.</p>
            </div>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {features.map(({ icon: Icon, title, text, className }, index) => (
                <article key={title} className={`group relative overflow-hidden rounded-[1.5rem] border border-border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_20px_55px_-38px_rgba(29,69,48,.7)] sm:p-7 ${className}`}>
                  {index === 0 && <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-[#e9bd74]/16" />}
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/9 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-9 text-xl font-semibold tracking-[-.03em]">{title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="teams" className="scroll-mt-20 bg-[#183c2d] text-white">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-2 lg:gap-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#9ed0b5]">Bring everyone along</p>
              <h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-.055em] sm:text-6xl">The group chat can retire now.</h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/65">
                Share a meeting poll, let guests connect their calendar if they want, and watch the best option emerge in real time.
              </p>
              <div className="mt-9 grid gap-5 sm:grid-cols-2">
                <div className="flex gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#9ed0b5]" />
                  <div><p className="text-sm font-semibold">Fast suggestions</p><p className="mt-1 text-sm leading-6 text-white/55">Start from times that already work for you.</p></div>
                </div>
                <div className="flex gap-3">
                  <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-[#9ed0b5]" />
                  <div><p className="text-sm font-semibold">Timezone-aware</p><p className="mt-1 text-sm leading-6 text-white/55">Everyone sees options in their own time.</p></div>
                </div>
              </div>
            </div>
            <PollPreview />
          </div>
        </section>

        <section id="open-source" className="scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="relative overflow-hidden rounded-[2rem] border border-border bg-[#efeadf] px-6 py-16 text-[#28261f] sm:px-12 lg:px-16">
              <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border-[42px] border-[#d9a553]/18" />
              <div className="relative grid items-end gap-12 lg:grid-cols-[1.2fr_.8fr]">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#28261f]/12 bg-white/45 px-3 py-1.5 text-xs font-semibold">
                    <GitFork className="h-3.5 w-3.5" /> Open by design
                  </span>
                  <h2 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-.06em] sm:text-6xl">Your schedule shouldn’t be somebody else’s secret.</h2>
                  <p className="mt-6 max-w-2xl text-base leading-7 text-[#28261f]/65 sm:text-lg">
                    Calpaca is AGPL licensed and built on a compact Bun + PostgreSQL stack. Read the code, run it yourself, or use our hosted service.
                  </p>
                </div>
                <div className="lg:text-right">
                  <a href={githubUrl} className="inline-flex h-12 items-center gap-2 rounded-full bg-[#28261f] px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5">
                    See the repository <ArrowRight className="h-4 w-4" />
                  </a>
                  <p className="mt-4 text-xs text-[#28261f]/50">No Redis. No mystery services. No lock-in.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="plans" className="scroll-mt-20 border-y border-border bg-card/50 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Choose your path</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Free to begin.<br />Simple when you grow.</h2>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {plans.map((plan) => (
                <article key={plan.label} className={`rounded-[1.75rem] border p-7 sm:p-9 ${plan.featured ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
                  <p className={`text-xs font-semibold uppercase tracking-[.16em] ${plan.featured ? "text-primary-foreground/65" : "text-primary"}`}>{plan.label}</p>
                  <h3 className="mt-3 text-3xl font-semibold tracking-[-.045em]">{plan.title}</h3>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="text-4xl font-semibold tracking-[-.05em]">{plan.price}</span>
                    <span className={`pb-1 text-xs ${plan.featured ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{plan.priceNote}</span>
                  </div>
                  <p className={`mt-4 min-h-14 text-sm leading-6 ${plan.featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{plan.description}</p>
                  <ul className="mt-8 space-y-3">
                    {plan.points.map((point) => <li key={point} className="flex items-center gap-2.5 text-sm"><Check className="h-4 w-4" />{point}</li>)}
                  </ul>
                  <a href={plan.href} className={`mt-9 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition hover:-translate-y-0.5 ${plan.featured ? "bg-primary-foreground text-primary" : "bg-foreground text-background"}`}>
                    {plan.action} <ArrowRight className="h-4 w-4" />
                  </a>
                </article>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">Basic has no team features. Pro is $7 per active user each month. Self-hosting stays available under the AGPL.</p>
          </div>
        </section>

        <section className="px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto grid max-w-5xl gap-14 lg:grid-cols-[.7fr_1.3fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Good questions</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-.055em]">A few things worth knowing.</h2>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {[
                ["Can I use Calpaca without hosting it myself?", "Yes. The hosted service at app.calpaca.io is the easiest way to get started. Self-hosting is there when you want full infrastructure control."],
                ["Does it connect to my calendar?", "Google Calendar is supported today for conflict checking, write-through, and invitee availability overlays. Microsoft and CalDAV support are on the roadmap."],
                ["What makes it different from a normal booking link?", "Calpaca handles solo bookings, team assignment, group polls, capacity sessions, routing, and AI-assisted scheduling through one consistent API."],
                ["Is the whole product really open source?", "Yes. Calpaca is released under the GNU AGPL v3. The public repository includes the application, database migrations, web UI, MCP server, and deployment example."],
              ].map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-semibold">
                    {question}<span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-lg transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-2xl pt-3 text-sm leading-6 text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-8 sm:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#e1a94f] px-6 py-14 text-center text-[#33230e] sm:px-12 sm:py-20">
            <BrandMark className="mx-auto h-14 w-14" />
            <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-[-.06em] sm:text-6xl">Your next meeting can be the easy one.</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#33230e]/70">Connect your calendar, share a link, and let Calpaca handle the back-and-forth.</p>
            <a href={appUrl} className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#33230e] px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5">
              Open Calpaca <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark />
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">
            <a href={githubUrl} className="hover:text-foreground">GitHub</a>
            <a href={`${githubUrl}/blob/main/docs/SELF-HOSTING.md`} className="hover:text-foreground">Self-hosting</a>
            <a href={`${githubUrl}/blob/main/docs/API.md`} className="hover:text-foreground">API</a>
            <a href={`${githubUrl}/blob/main/SECURITY.md`} className="hover:text-foreground">Security</a>
          </div>
          <p className="text-xs text-muted-foreground">Built with care and PostgreSQL.</p>
        </div>
      </footer>
    </div>
  );
}
