import { useEffect, useState } from "react";
import { CalendarX2 } from "lucide-react";
import { BookingPage } from "@/pages/booking-page";
import { getOneOffOffer, type PublicOneOffOffer } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function OneOffOfferPage({ publicId }: { publicId: string }) {
  const [offer, setOffer] = useState<PublicOneOffOffer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getOneOffOffer(publicId).then(setOffer, () => setFailed(true));
  }, [publicId]);

  if (!offer && !failed) {
    return <div className="mx-auto mt-24 h-40 max-w-2xl animate-pulse rounded-2xl bg-muted" />;
  }
  if (failed || !offer || offer.status !== "active") {
    return (
      <Card className="mx-auto mt-24 max-w-lg">
        <CardHeader>
          <CalendarX2 className="mb-3 h-8 w-8 text-muted-foreground" />
          <CardTitle>This offer is no longer available</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>It may have been booked, revoked, or expired. Ask the organizer for a new link.</p>
          <a href="/" className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">
            Return to Calpaca
          </a>
        </CardContent>
      </Card>
    );
  }
  return (
    <BookingPage
      slug={offer.eventTypeSlug}
      workspaceSlug={offer.workspaceSlug}
      offeredSlots={offer.slots}
      offerPublicId={offer.publicId}
      offerTitle={offer.title}
      offerMessage={offer.message}
      recipientRestricted={offer.recipientRestricted}
    />
  );
}
