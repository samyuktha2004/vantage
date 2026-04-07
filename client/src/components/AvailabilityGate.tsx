import { AlertTriangle, Clock, Phone, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AvailabilityGateProps {
  isHotelFull: boolean;
  isFlightFull: boolean;
  /** Current wizard step number (1-4) */
  step: number;
  /** Guest name for personalized messaging */
  guestName?: string;
  /** Whether the event is a wedding / social event (affects tone) */
  isWedding?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps wizard steps with availability checks.
 *
 * Rules:
 * - If BOTH hotel and flight are full → short-circuit to "Pending Confirmation" on any step
 * - If only hotel is full → allow RSVP (step 1) but show banner; skip hotel-dependent steps
 * - If only flight is full → allow RSVP + hotel steps but hide group-flight option
 * - Per-step banners explain what's happening without forcing data entry for unavailable services
 *
 * Tone guidelines (especially for weddings/social events):
 * - Never say "self-pay", "at your own expense" — guests are invited; it feels transactional
 * - Frame paid alternatives as "special event rates" or "partner rates" — a bonus, not a fallback
 * - Never blame host (budget) or agent (planning) — say "we're working on it"
 * - Default assumption: the hosted room is still being pursued; paid option is additive
 */
export function AvailabilityGate({
  isHotelFull,
  isFlightFull,
  step,
  guestName,
  isWedding = true,
  children,
}: AvailabilityGateProps) {
  const bothFull = isHotelFull && isFlightFull;

  // Full short-circuit: both hotel and flights are gone
  if (bothFull && step > 1) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-serif text-primary">Confirmation Pending</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            {guestName ? `Hi ${guestName}, your` : "Your"} details are saved.
            We're working on confirming your room and travel arrangements.
            You're in the queue and our team will reach out to you shortly.
          </p>
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            Pending Confirmation
          </Badge>
        </div>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
            <p>✓ Your RSVP and personal details have been saved</p>
            <p>✓ You're in the confirmation queue — no need to re-enter anything</p>
            <p>✓ You'll be notified as soon as your booking is confirmed</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Per-step availability banners
  const banner = getBannerForStep(step, isHotelFull, isFlightFull, isWedding);

  return (
    <>
      {banner && (
        <div className="max-w-3xl mx-auto px-4 pt-2">
          <Card className={`border-amber-200 ${banner.variant === 'option' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50'}`}>
            <CardContent className="flex items-start gap-3 py-3">
              {banner.variant === 'option' ? (
                <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="text-sm">
                <p className={`font-medium ${banner.variant === 'option' ? 'text-blue-800' : 'text-amber-800'}`}>
                  {banner.title}
                </p>
                <p className={`mt-0.5 ${banner.variant === 'option' ? 'text-blue-700' : 'text-amber-700'}`}>
                  {banner.description}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {children}
    </>
  );
}

function getBannerForStep(
  step: number,
  isHotelFull: boolean,
  isFlightFull: boolean,
  isWedding: boolean
): { title: string; description: string; variant: 'warning' | 'option' } | null {
  if (!isHotelFull && !isFlightFull) return null;

  if (step === 1) {
    // RSVP step — let them RSVP but explain what's happening
    if (isHotelFull && isFlightFull) {
      return {
        title: "We're working on availability",
        description:
          "Rooms and travel are in high demand right now. Please go ahead and RSVP — you'll be in the confirmation queue and our team will keep you updated.",
        variant: 'warning',
      };
    }
    if (isHotelFull) {
      return {
        title: "Rooms are in high demand",
        description:
          "All rooms are currently reserved but our team is working to accommodate everyone. Please RSVP — we'll update you on room confirmation.",
        variant: 'warning',
      };
    }
    if (isFlightFull) {
      return {
        title: "Group travel is fully reserved",
        description:
          "Group travel seats are fully reserved. You can still RSVP and select your own travel preferences.",
        variant: 'warning',
      };
    }
  }

  if (step === 2) {
    // Travel prefs
    if (isFlightFull) {
      return {
        title: "Group travel unavailable",
        description:
          "Group transport is fully reserved. You can choose your own travel arrangement below.",
        variant: 'warning',
      };
    }
    if (isHotelFull) {
      return {
        title: "Room confirmation in progress",
        description:
          "Our team is working on your room allocation. You can continue setting your travel preferences in the meantime.",
        variant: 'warning',
      };
    }
  }

  if (step === 3) {
    // Booking Summary
    if (isHotelFull) {
      return {
        title: "Room confirmation in progress",
        description: isWedding
          ? "We're finalising room arrangements. Our team will reach out to you once your room is confirmed."
          : "Room allocation is in progress. Our team will update you once confirmed.",
        variant: 'warning',
      };
    }
  }

  if (step === 4) {
    // Add-ons
    if (isHotelFull) {
      return {
        title: "Add-ons available after room confirmation",
        description:
          "Perks and add-ons will be available once your room is confirmed. We'll notify you when they're ready to select.",
        variant: 'warning',
      };
    }
  }

  return null;
}
