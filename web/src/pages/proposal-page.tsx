import { useEffect, useState } from "react";
import { CalendarX2 } from "lucide-react";
import { BookingPage } from "@/pages/booking-page";
import {
  getPublicProposal,
  requestProposalAlternative,
  type PublicProposal,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function unavailable(status?: string) {
  if (status === "accepted") return "This proposal has been accepted";
  if (status === "withdrawn") return "This proposal was withdrawn";
  if (status === "expired") return "This proposal has expired";
  return "This proposal is not ready";
}

export function ProposalPage({ publicId }: { publicId: string }) {
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [failed, setFailed] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    getPublicProposal(publicId).then(setProposal, () => setFailed(true));
  }, [publicId]);

  if (!proposal && !failed) {
    return <div className="mx-auto mt-24 h-40 max-w-2xl animate-pulse rounded-xl bg-muted" />;
  }
  if (failed || !proposal || proposal.status !== "awaiting_client") {
    return (
      <Card className="mx-auto mt-24 max-w-lg">
        <CardHeader>
          <CalendarX2 className="mb-3 h-8 w-8 text-muted-foreground" />
          <CardTitle>{unavailable(proposal?.status)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {proposal?.status === "accepted" && (
            <p>Your selected time is confirmed. Check your email for meeting details.</p>
          )}
          {!proposal || proposal.status !== "accepted"
            ? <p>Ask the organizer for an updated proposal.</p>
            : null}
          <a href="/" className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">
            Return to Calpaca
          </a>
        </CardContent>
      </Card>
    );
  }

  const participants = proposal.participants.map((person) => person.name).join(", ");
  const preparation = proposal.preparationItems.map((item) => item.label).join(", ");
  const context = [
    proposal.message,
    proposal.purpose,
    participants ? `Participants: ${participants}.` : null,
    preparation ? `Preparation: ${preparation}.` : null,
  ].filter(Boolean).join("\n\n");

  return (
    <>
      <BookingPage
        slug={proposal.eventTypeSlug}
        workspaceSlug={proposal.workspaceSlug}
        offeredSlots={proposal.options.map((option) => ({
          start: option.start,
          end: option.end,
          recommendation: option.recommendation,
        }))}
        proposalPublicId={proposal.publicId}
        offerTitle={`${proposal.engagementName}: ${proposal.conversationTitle}`}
        offerMessage={context}
        recipientRestricted
      />
      <section className="mx-auto -mt-10 mb-16 max-w-2xl px-4">
        <details className="border-t border-border pt-5">
          <summary className="min-h-11 cursor-pointer text-sm font-medium">
            None of these times work
          </summary>
          {requested ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Your request was sent. The organizer will follow up with new options.
            </p>
          ) : (
            <form
              className="mt-3 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setRequesting(true);
                requestProposalAlternative(publicId, requestText)
                  .then(() => setRequested(true))
                  .finally(() => setRequesting(false));
              }}
            >
              <label className="grid gap-1 text-sm">
                What should the organizer consider?
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  className="min-h-24 rounded-lg border border-input bg-background p-3"
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                />
              </label>
              <button
                disabled={requesting}
                className="min-h-11 justify-self-start rounded-lg border border-input px-4 text-sm font-medium disabled:opacity-50"
              >
                {requesting ? "Sending…" : "Request other times"}
              </button>
            </form>
          )}
        </details>
      </section>
    </>
  );
}
