import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGuestPortal, useSubmitGuestRequest, useUpdateBleisure } from "@/hooks/use-guest-portal";
import { GuestLayout } from "@/components/GuestLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  CheckCircle2,
  Clock,
  CreditCard,
  Sparkles,
  FileText,
  ArrowRight,
  Check,
  Hotel,
  ChevronDown,
  ChevronUp,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, differenceInCalendarDays } from "date-fns";
import { AvailabilityGate } from "@/components/AvailabilityGate";

interface Perk {
  id: number;
  name: string;
  description?: string;
  pricingType: "included" | "requestable" | "self_pay";
  unitCost: number;
  clientFacingRate?: number;
  currency: string;
  isEnabled: boolean;
  expenseHandledByClient: boolean;
  agentOverride: boolean;
}

type PerkRequestStatus = "idle" | "requesting" | "done";

export default function GuestAddOns({ token }: { token: string }) {
  const { data: guestData, isLoading } = useGuestPortal(token);
  const submitRequest = useSubmitGuestRequest(token);
  const updateBleisure = useUpdateBleisure(token);
  const [, navigate] = useLocation();

  // Track per-perk request status
  const [perkStatus, setPerkStatus] = useState<Record<number, PerkRequestStatus>>({});

  // Extend stay state
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [extendCheckIn, setExtendCheckIn] = useState("");
  const [extendCheckOut, setExtendCheckOut] = useState("");
  const [extendSaving, setExtendSaving] = useState(false);

  // Initialize extend-stay dates from existing data
  useEffect(() => {
    if (guestData) {
      const ci = guestData.extendedCheckIn ?? guestData.partialStayCheckIn;
      const co = guestData.extendedCheckOut ?? guestData.partialStayCheckOut;
      if (ci) setExtendCheckIn(format(new Date(ci), "yyyy-MM-dd"));
      if (co) setExtendCheckOut(format(new Date(co), "yyyy-MM-dd"));
      if (ci || co) setShowExtendForm(true);
    }
  }, [guestData]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  if (!guestData) {
    return <div className="p-10 text-center">Invalid access link</div>;
  }

  const perks: Perk[] = (guestData.availablePerks ?? []).filter((p: Perk) => p.isEnabled);
  // Budget used internally for auto-approve logic — NOT shown to guests
  const addOnBudget = guestData.label?.addOnBudget ?? 0;
  const usedBudget = guestData.usedBudget ?? 0;
  const remainingBudget = Math.max(0, addOnBudget - usedBudget);

  // Persisted requests from server (survive page reload)
  const myRequests: Array<{ id: number; perkId: number | null; status: string; addonType: string | null }> =
    guestData.myRequests ?? [];

  const handleRequestPerk = async (perk: Perk) => {
    const status = perkStatus[perk.id];
    if (status === "requesting" || status === "done") return;

    setPerkStatus((prev) => ({ ...prev, [perk.id]: "requesting" }));

    try {
      const result = await submitRequest.mutateAsync({
        type: "perk",
        addonType: "custom",
        perkId: perk.id,
        budgetConsumed: perk.pricingType === "requestable" ? (perk.clientFacingRate ?? perk.unitCost) : 0,
        notes: `Guest requested: ${perk.name}`,
      });

      setPerkStatus((prev) => ({ ...prev, [perk.id]: "done" }));

      const autoApproved = result?.status === "approved";
      toast({
        title: autoApproved ? "Confirmed!" : "Request Sent",
        description: autoApproved
          ? `${perk.name} has been confirmed for your stay.`
          : `Your request for "${perk.name}" is with the event team.`,
      });
    } catch {
      setPerkStatus((prev) => ({ ...prev, [perk.id]: "idle" }));
      toast({
        title: "Error",
        description: "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const bleisureRate = guestData?.bleisureRatePerNight ?? 250;
  const bleisureRateEstimated = !guestData?.bleisureRatePerNight;
  const hostCheckIn = guestData?.event?.hostCheckIn ? new Date(guestData.event.hostCheckIn) : null;
  const hostCheckOut = guestData?.event?.hostCheckOut ? new Date(guestData.event.hostCheckOut) : null;
  let preNights = 0;
  let postNights = 0;
  let extraNightsCost = 0;
  if (extendCheckIn && extendCheckOut && hostCheckIn && hostCheckOut) {
    preNights = Math.max(0, differenceInCalendarDays(hostCheckIn, new Date(extendCheckIn)));
    postNights = Math.max(0, differenceInCalendarDays(new Date(extendCheckOut), hostCheckOut));
    extraNightsCost = (preNights + postNights) * bleisureRate;
  }

  const handleExtendSave = async () => {
    if (!extendCheckIn && !extendCheckOut) return;
    setExtendSaving(true);
    try {
      await updateBleisure.mutateAsync({
        extendedCheckIn: extendCheckIn ? new Date(extendCheckIn) : undefined,
        extendedCheckOut: extendCheckOut ? new Date(extendCheckOut) : undefined,
      });
      toast({ title: "Stay updated!", description: `${preNights + postNights} extra night${(preNights + postNights) !== 1 ? "s" : ""} added.` });
    } catch {
      toast({ title: "Error", description: "Failed to save dates", variant: "destructive" });
    } finally {
      setExtendSaving(false);
    }
  };

  const getPerkBadge = (perk: Perk) => {
    const effectiveRate = perk.clientFacingRate ?? perk.unitCost;
    if (perk.pricingType === "included" || perk.expenseHandledByClient) {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Included</Badge>;
    }
    if (perk.pricingType === "self_pay") {
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs">₹{effectiveRate.toLocaleString("en-IN")} · Self-pay</Badge>;
    }
    // requestable
    if (effectiveRate <= remainingBudget) {
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">₹{effectiveRate.toLocaleString("en-IN")} · Confirmed</Badge>;
    }
    return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 text-xs">₹{effectiveRate.toLocaleString("en-IN")} · Under review</Badge>;
  };

  const getPerkAction = (perk: Perk) => {
    const sessionStatus = perkStatus[perk.id] ?? "idle";

    // In-session spinner (just submitted)
    if (sessionStatus === "requesting") {
      return (
        <Button size="sm" disabled>
          <Loader2 className="w-3 h-3 animate-spin mr-1" /> Sending…
        </Button>
      );
    }

    // In-session confirmation (just submitted this session)
    if (sessionStatus === "done") {
      return (
        <Badge className="bg-green-100 text-green-800 border border-green-200 px-2.5 py-1 text-xs font-medium">
          <Check className="w-3 h-3 mr-1" /> Sent
        </Badge>
      );
    }

    // Persisted status from a previous session
    const existing = myRequests.find((r) => r.perkId === perk.id);
    if (existing) {
      if (existing.status === "approved" || existing.status === "auto_approved") {
        return (
          <Badge className="bg-green-100 text-green-800 border border-green-200 px-2.5 py-1 text-xs font-medium">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmed
          </Badge>
        );
      }
      if (existing.status === "rejected") {
        return (
          <Badge className="bg-red-100 text-red-800 border border-red-200 px-2.5 py-1 text-xs font-medium">
            <XCircle className="w-3 h-3 mr-1" /> Not available — contact event team
          </Badge>
        );
      }
      // pending / forwarded_to_client / any other status
      return (
        <Badge className="bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 text-xs font-medium">
          <Clock className="w-3 h-3 mr-1" /> Under review
        </Badge>
      );
    }

    // No existing request — show action button
    if (perk.pricingType === "included" || perk.expenseHandledByClient) {
      return (
        <Button size="sm" variant="secondary" onClick={() => handleRequestPerk(perk)}>
          <CheckCircle2 className="w-3 h-3 mr-1" /> Confirm
        </Button>
      );
    }

    if (perk.pricingType === "requestable") {
      const effectiveRate = perk.clientFacingRate ?? perk.unitCost;
      const withinBudget = effectiveRate <= remainingBudget;
      return (
        <Button
          size="sm"
          className={withinBudget ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"}
          onClick={() => handleRequestPerk(perk)}
        >
          <Clock className="w-3 h-3 mr-1" />
          {withinBudget ? "Request" : "Send Request"}
        </Button>
      );
    }

    // self_pay
    return (
      <Button size="sm" variant="outline" onClick={() => handleRequestPerk(perk)}>
        <CreditCard className="w-3 h-3 mr-1" /> Contact Agent
      </Button>
    );
  };

  return (
    <GuestLayout step={4} token={token}>
      <AvailabilityGate
        isHotelFull={!!guestData.isHotelFull}
        isFlightFull={!!guestData.isFlightFull}
        step={4}
        guestName={guestData.name}
      >
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-serif text-primary mb-2">Add-ons & Perks</h1>
          <p className="text-muted-foreground">Personalise your experience</p>
        </div>

        {/* Included in Your Package — hotel/flight inclusions from label tier */}
        {(() => {
          const inclusions: Array<{ bookingType: string; bookingId: number; inclusions?: string | null }> =
            guestData.labelInclusions ?? [];
          const includedHotels = inclusions
            .filter((li) => li.bookingType === "hotel")
            .map((li) => {
              const hotel = (guestData.hotelOptions ?? []).find((h: any) => h.id === li.bookingId);
              return hotel ? { ...hotel, notes: li.inclusions } : null;
            })
            .filter(Boolean);
          if (includedHotels.length === 0) return null;
          return (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Included in Your Stay</h2>
              {includedHotels.map((hotel: any) => (
                <Card key={hotel.id} className="border-green-200 bg-green-50/40">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Hotel className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">{hotel.name}</p>
                          {hotel.checkIn && hotel.checkOut && (
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(hotel.checkIn), "d MMM")} – {format(new Date(hotel.checkOut), "d MMM yyyy")}
                            </p>
                          )}
                          {hotel.notes && (
                            <p className="text-xs text-muted-foreground mt-1">{hotel.notes}</p>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-700 border-none shrink-0">Complimentary</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })()}

        {/* Perks Grid */}
        {perks.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Available Perks</h2>
            {perks.map((perk) => {
              const existing = myRequests.find((r) => r.perkId === perk.id);
              const isApproved = perkStatus[perk.id] === "done"
                || existing?.status === "approved"
                || existing?.status === "auto_approved";
              const isRejected = existing?.status === "rejected";
              return (
              <Card
                key={perk.id}
                className={isApproved ? "border-green-200 bg-green-50/50" : isRejected ? "border-red-200 bg-red-50/30" : ""}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{perk.name}</span>
                        {getPerkBadge(perk)}
                      </div>
                      {perk.description && (
                        <p className="text-sm text-muted-foreground">{perk.description}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {getPerkAction(perk)}
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center py-10 space-y-2">
              <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-medium text-muted-foreground">No extras for your tier yet</p>
              <p className="text-xs text-muted-foreground/70">Your host may add perks as the event approaches</p>
            </CardContent>
          </Card>
        )}

        {/* Extend Stay */}
        <Card className={showExtendForm && (extendCheckIn || extendCheckOut) ? "border-amber-200" : ""}>
          <CardContent className="pt-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowExtendForm(!showExtendForm)}
            >
              <div className="flex items-center gap-3">
                <Hotel className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">Extend Your Stay</p>
                  <p className="text-xs text-muted-foreground">
                    {(extendCheckIn || extendCheckOut)
                      ? `Check-in: ${extendCheckIn || "—"}  ·  Check-out: ${extendCheckOut || "—"}`
                      : "Arrive early or stay after the event"}
                  </p>
                </div>
              </div>
              {showExtendForm ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>

            {showExtendForm && (
              <div className="mt-4 space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="addonCheckIn">Check-in date</Label>
                    <Input
                      id="addonCheckIn"
                      type="date"
                      value={extendCheckIn}
                      max={hostCheckIn ? format(hostCheckIn, "yyyy-MM-dd") : undefined}
                      onChange={(e) => setExtendCheckIn(e.target.value)}
                    />
                    {hostCheckIn && <p className="text-xs text-muted-foreground">On or before {format(hostCheckIn, "MMM dd")}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="addonCheckOut">Check-out date</Label>
                    <Input
                      id="addonCheckOut"
                      type="date"
                      value={extendCheckOut}
                      min={hostCheckOut ? format(hostCheckOut, "yyyy-MM-dd") : undefined}
                      onChange={(e) => setExtendCheckOut(e.target.value)}
                    />
                    {hostCheckOut && <p className="text-xs text-muted-foreground">On or after {format(hostCheckOut, "MMM dd")}</p>}
                  </div>
                </div>

                {extraNightsCost > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>
                        <span className="font-medium">{preNights + postNights} extra night{(preNights + postNights) !== 1 ? "s" : ""}</span>
                        <span className="text-muted-foreground"> × ₹{bleisureRate.toLocaleString("en-IN")}/night{bleisureRateEstimated ? " (est.)" : ""}</span>
                      </span>
                      <span className="font-semibold text-amber-800">₹{extraNightsCost.toLocaleString("en-IN")}{bleisureRateEstimated ? "*" : ""}</span>
                    </div>
                    {bleisureRateEstimated && (
                      <p className="text-xs text-muted-foreground">* Estimated — coordinator will confirm the final rate</p>
                    )}
                  </div>
                )}

                <Button size="sm" onClick={handleExtendSave} disabled={extendSaving || (!extendCheckIn && !extendCheckOut)}>
                  {extendSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                  Save dates
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents shortcut */}
        <Card className="border-dashed">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">ID & Documents</p>
                  <p className="text-xs text-muted-foreground">
                    {guestData.idVerificationStatus === "verified"
                      ? "All documents verified"
                      : "Upload your travel documents"}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/guest/${token}/idvault`)}
              >
                {guestData.idVerificationStatus === "verified" ? (
                  <><CheckCircle2 className="w-3 h-3 mr-1 text-green-600" /> Verified</>
                ) : (
                  "Upload"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between items-center pt-4 pb-8">
          <Button variant="outline" onClick={() => navigate(`/guest/${token}/summary`)}>
            ← Back
          </Button>
          <Button
            size="lg"
            className="px-10"
            onClick={() => navigate(`/guest/${token}`)}
          >
            Go to My Portal <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
      </AvailabilityGate>
    </GuestLayout>
  );
}
