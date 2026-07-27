import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";

// Google's OAuth verification reads these two pages directly, so the privacy
// policy must describe the actual Google data flow: which scopes, what is
// persisted, and the Limited Use commitment. Keep it in sync with
// src/sync/busy-mapping.ts and src/db/schema.ts — an inaccurate disclosure
// here is a failed brand review, not just a stale doc.
const LAST_UPDATED = "July 27, 2026";
const CONTACT_EMAIL = "kai@tourscale.com";
const ENTITY = "TourScale Enterprises, LLC";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6 sm:px-8">
        <a href="/" className="flex items-center gap-2.5" aria-label="Calpaca home">
          <BrandMark className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-[-0.035em]">Calpaca</span>
        </a>
        <a href="/" className="text-xs text-muted-foreground hover:text-foreground">
          Back to Calpaca
        </a>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-24 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <div className="mt-10 flex flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-[-0.02em]">{heading}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 pl-5 text-sm leading-relaxed text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="list-disc">{item}</li>
      ))}
    </ul>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <P>
        Calpaca is a scheduling service operated by {ENTITY} ("we", "us"), a Delaware
        limited liability company. This policy explains what we collect, why, and what we
        never touch. It covers the hosted service at calpaca.io. Calpaca is open source
        under AGPL v3; if you run your own instance, you are the operator of that instance
        and this policy does not apply to it.
      </P>

      <Section heading="Information you give us">
        <List
          items={[
            <>
              <strong className="text-foreground">Account details</strong> from Google
              sign-in: your name, email address, and profile picture.
            </>,
            <>
              <strong className="text-foreground">Scheduling configuration</strong> you
              create: working hours, time zone, buffers, notice periods, event types,
              booking pages, teams, and scheduling preferences.
            </>,
            <>
              <strong className="text-foreground">Booking details</strong> from people who
              book with you: the name, email address, and any answers they provide on your
              booking form.
            </>,
          ]}
        />
      </Section>

      <Section heading="Google Calendar data, specifically">
        <P>
          When you sign in with Google, we request two Calendar scopes. Here is exactly what
          each one does:
        </P>
        <List
          items={[
            <>
              <code className="text-foreground">calendar.readonly</code> — we read the{" "}
              <strong className="text-foreground">start time, end time, status, and busy/free
              flags</strong> of events on the calendars you connect, plus the names of your
              calendars so you can choose which ones to use. This is how Calpaca knows when
              you are unavailable.
            </>,
            <>
              <code className="text-foreground">calendar.events</code> — we create, update,
              and cancel the calendar events for meetings booked through Calpaca, and invite
              the attendees for those meetings. We do not modify events we did not create.
            </>,
          ]}
        />
        <P>
          <strong className="text-foreground">
            We never read or store the contents of your existing calendar events.
          </strong>{" "}
          Event titles, descriptions, attendee lists, locations, attachments, and notes are
          not requested, not parsed, and not saved. For each busy event we store only a start
          time, an end time, and the opaque Google event ID needed to keep that entry in sync
          when the event moves or is deleted. To Calpaca, your calendar is a set of anonymous
          blocked intervals.
        </P>
        <P>
          We also store the OAuth access and refresh tokens Google issues, so availability
          stays current without asking you to sign in repeatedly. Availability is always
          computed from our own cache, never by calling Google while someone is viewing your
          booking page.
        </P>
      </Section>

      <Section heading="Limited Use of Google user data">
        <P>
          Calpaca's use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-foreground underline underline-offset-4"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Concretely, that means we use Google user
          data only to provide and improve the scheduling features you asked for; we do not
          transfer it to third parties except as needed to run the service, to comply with
          applicable law, or in connection with a merger or acquisition; we do not use it for
          advertising of any kind; we do not sell it; and we do not use it to train
          generalized artificial intelligence or machine learning models. No human reads your
          Google data except with your explicit consent, where necessary for security
          purposes such as investigating abuse, or to comply with applicable law.
        </P>
      </Section>

      <Section heading="Who else processes your data">
        <P>
          We keep this list short on purpose. Calpaca runs on a single dedicated server with
          one database, so there are only two providers:
        </P>
        <List
          items={[
            <>
              <strong className="text-foreground">Hetzner</strong> (Germany) — hosting for the
              application and its PostgreSQL database.
            </>,
            <>
              <strong className="text-foreground">Amazon SES</strong> (United States) —
              delivery of booking confirmations, reminders, and other transactional email.
            </>,
          ]}
        />
        <P>
          We do not use advertising networks, third-party analytics, session recording, or
          tracking cookies. Cookies are used only to keep you signed in.
        </P>
      </Section>

      <Section heading="Keeping and deleting your data">
        <P>
          We keep your data for as long as your account is active. You are in control of
          removal, in three ways:
        </P>
        <List
          items={[
            <>
              <strong className="text-foreground">Disconnect a calendar</strong> in Calpaca
              under Calendars. Every cached busy interval for that calendar is deleted along
              with the connection.
            </>,
            <>
              <strong className="text-foreground">Revoke Calpaca's access</strong> at{" "}
              <a
                href="https://myaccount.google.com/permissions"
                className="text-foreground underline underline-offset-4"
              >
                myaccount.google.com/permissions
              </a>
              . This cuts off all future Google Calendar access immediately.
            </>,
            <>
              <strong className="text-foreground">Delete your account and all its data</strong>{" "}
              by emailing{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
                {CONTACT_EMAIL}
              </a>
              . We action these manually within 30 days and will confirm when it is done.
            </>,
          ]}
        />
        <P>
          Records of past bookings may be retained where we need them to resolve a dispute or
          meet a legal obligation. Deleting your Calpaca account does not delete calendar
          events already created on your Google Calendar; those are yours to remove.
        </P>
      </Section>

      <Section heading="Security">
        <P>
          Traffic is encrypted in transit with TLS. OAuth tokens and booking data live in a
          PostgreSQL database that is not publicly reachable, and administrative access is
          limited to the operator. No system is perfectly secure, so if you find a
          vulnerability please report it to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{" "}
          rather than disclosing it publicly.
        </P>
      </Section>

      <Section heading="Your rights">
        <P>
          Depending on where you live, you may have the right to access, correct, export, or
          delete your personal data, and to object to certain processing. Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{" "}
          and we will respond within 30 days. Calpaca is not intended for children under 16,
          and we do not knowingly collect their data.
        </P>
      </Section>

      <Section heading="Changes and contact">
        <P>
          If we change this policy materially, we will update the date above and notify
          account holders by email before the change takes effect. Questions go to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <P>
        These terms govern your use of the hosted Calpaca service at calpaca.io, operated by
        {" "}{ENTITY} ("we", "us"), a Delaware limited liability company. By signing in, you
        agree to them. If you do not agree, do not use the service.
      </P>

      <Section heading="Beta service">
        <P>
          Calpaca is in active beta. Features may change or be removed, availability is not
          guaranteed, and there is no uptime commitment or service level agreement. Do not
          rely on Calpaca as the only record of a commitment that matters to you — confirmed
          meetings are also written to your Google Calendar, and you should treat that as your
          durable copy.
        </P>
      </Section>

      <Section heading="Your account">
        <P>
          You need a Google account to sign in, and you must be at least 16 years old. You are
          responsible for activity under your account and for the accuracy of the availability
          you publish. Keep your Google account secure; we authenticate you through it.
        </P>
      </Section>

      <Section heading="Acceptable use">
        <P>You agree not to:</P>
        <List
          items={[
            "use Calpaca to send unsolicited bulk email or to harass anyone",
            "attempt to access another workspace's data, probe for vulnerabilities without permission, or bypass rate limits",
            "resell or white-label the hosted service without our written agreement",
            "upload unlawful content, or use the service in violation of applicable law or Google's terms",
          ]}
        />
        <P>
          We may suspend or terminate an account that violates these terms, and we will tell
          you why when we do.
        </P>
      </Section>

      <Section heading="Your content and your data">
        <P>
          You keep ownership of everything you put into Calpaca: your scheduling
          configuration, your bookings, and your calendar data. We claim no rights to it
          beyond what we need to operate the service for you, as described in our{" "}
          <a href="/privacy" className="text-foreground underline underline-offset-4">
            Privacy Policy
          </a>
          . You are responsible for having a lawful basis to enter the personal data of the
          people you schedule with.
        </P>
      </Section>

      <Section heading="The software itself">
        <P>
          Calpaca's source code is licensed under AGPL v3 and those license terms, not these,
          govern your use of the code. These terms cover only the hosted service we run. You
          are free to self-host your own instance at any time.
        </P>
      </Section>

      <Section heading="Disclaimer and liability">
        <P>
          The service is provided "as is" and "as available", without warranties of any kind,
          express or implied, including merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that scheduling will be uninterrupted or
          error-free.
        </P>
        <P>
          To the maximum extent permitted by law, we are not liable for indirect, incidental,
          special, consequential, or punitive damages, or for lost profits, lost business, or
          missed meetings. Our total liability for any claim relating to the service is
          limited to the greater of the amount you paid us in the twelve months before the
          claim, or fifty US dollars. Some jurisdictions do not allow these limits, in which
          case they apply to the extent permitted.
        </P>
      </Section>

      <Section heading="Termination">
        <P>
          You may stop using Calpaca at any time and request deletion of your data as
          described in the{" "}
          <a href="/privacy" className="text-foreground underline underline-offset-4">
            Privacy Policy
          </a>
          . We may discontinue the hosted service with 30 days' notice to account holders, and
          because Calpaca is open source you will be able to export your data and self-host if
          you choose.
        </P>
      </Section>

      <Section heading="Changes, governing law, and contact">
        <P>
          We may update these terms; material changes will be announced by email before taking
          effect, and the date above will change. These terms are governed by the laws of the
          State of Delaware, excluding its conflict-of-laws rules, and you and we agree that
          the state and federal courts located in Delaware have exclusive jurisdiction over
          any dispute arising from them. Questions go to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>
    </LegalLayout>
  );
}
