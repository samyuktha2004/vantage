import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGuestPortal, useUpdateTravelPrefs, useUpdateBleisure, useSelectHotel } from "@/hooks/use-guest-portal";
import { GuestLayout } from "@/components/GuestLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Plane, Hotel, ArrowRight, AlertTriangle, Train, Bus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, differenceInCalendarDays } from "date-fns";
import { AvailabilityGate } from "@/components/AvailabilityGate";

type TransportMode = "group_flight" | "own_flight" | "train" | "other" | "local";

const TRANSPORT_OPTIONS: { value: TransportMode; label: string; subtext: string; icon: React.ReactNode }[] = [
  { value: "group_flight", label: "Group transport",          subtext: "Join the group — covered by the event", icon: <Plane className="w-4 h-4" /> },
  { value: "own_flight",   label: "Own flight",               subtext: "I'm booking my own flight",              icon: <Plane className="w-4 h-4" /> },
  { value: "train",        label: "Train",                    subtext: "I'm travelling by rail",                 icon: <Train className="w-4 h-4" /> },
  { value: "other",        label: "Bus / car / cab",          subtext: "I'll arrange my own ground transport",   icon: <Bus className="w-4 h-4" /> },
  { value: "local",        label: "I'm in the city / local",  subtext: "Already there — no travel needed",       icon: <Bus className="w-4 h-4" /> },
];

export default function GuestTravelPrefs({ token }: { token: string }) {
  const { data: guestData, isLoading } = useGuestPortal(token);
  const updateTravelPrefs = useUpdateTravelPrefs(token);
  const updateBleisure = useUpdateBleisure(token);
  const selectHotel = useSelectHotel(token);
  const [, navigate] = useLocation();

  // Arrival
  const [arrivalMode, setArrivalMode] = useState<TransportMode>("group_flight");
  const [originCity, setOriginCity] = useState("");
  const [needsArrivalPickup, setNeedsArrivalPickup] = useState(false);
  const [arrivalTransportRef, setArrivalTransportRef] = useState(""); // flight/train number for pickup coordination
  const [arrivalNotes, setArrivalNotes] = useState("");

  // Departure
  const [departureMode, setDepartureMode] = useState<TransportMode>("group_flight");
  const [needsDepartureDropoff, setNeedsDepartureDropoff] = useState(false);
  const [departureTransportRef, setDepartureTransportRef] = useState(""); // flight/train number for drop-off coordination
  const [departureNotes, setDepartureNotes] = useState("");

  // Note for the event team
  const [agentNote, setAgentNote] = useState("");

  // Hotel selection (when multiple hotels are available)
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null);

  // Hotel
  const [hotelMode, setHotelMode] = useState<"group" | "own" | "partial">("group");
  const [partialCheckIn, setPartialCheckIn] = useState("");
  const [partialCheckOut, setPartialCheckOut] = useState("");

  useEffect(() => {
    if (guestData) {
      if (guestData.selectedHotelBookingId) setSelectedHotelId(guestData.selectedHotelBookingId);
      else if (guestData.primaryHotel?.id) setSelectedHotelId(guestData.primaryHotel.id);

      if (guestData.arrivalMode) setArrivalMode(guestData.arrivalMode as TransportMode);
      else if (guestData.selfManageArrival) setArrivalMode("own_flight");

      if (guestData.departureMode) setDepartureMode(guestData.departureMode as TransportMode);
      else if (guestData.selfManageDeparture) setDepartureMode("own_flight");

      if (guestData.originCity) setOriginCity(guestData.originCity);
      if (guestData.specialRequests) setAgentNote(guestData.specialRequests);

      if (guestData.extendedCheckIn || guestData.extendedCheckOut) {
        setHotelMode("partial");
        if (guestData.extendedCheckIn) {
          setPartialCheckIn(format(new Date(guestData.extendedCheckIn), "yyyy-MM-dd"));
        }
        if (guestData.extendedCheckOut) {
          setPartialCheckOut(format(new Date(guestData.extendedCheckOut), "yyyy-MM-dd"));
        }
      }
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

  const event = guestData.event;
  const hostCheckIn = event?.hostCheckIn ? new Date(event.hostCheckIn) : null;
  const hostCheckOut = event?.hostCheckOut ? new Date(event.hostCheckOut) : null;
  const bleisureRate = guestData.bleisureRatePerNight ?? 250;
  const bleisureRateEstimated = !guestData.bleisureRatePerNight;

  let extraNightsCost = 0;
  let preNights = 0;
  let postNights = 0;
  if (hotelMode === "partial" && partialCheckIn && partialCheckOut && hostCheckIn && hostCheckOut) {
    const pci = new Date(partialCheckIn);
    const pco = new Date(partialCheckOut);
    preNights = Math.max(0, differenceInCalendarDays(hostCheckIn, pci));
    postNights = Math.max(0, differenceInCalendarDays(pco, hostCheckOut));
    extraNightsCost = (preNights + postNights) * bleisureRate;
  }

  const isArrivalSelfManaged = arrivalMode !== "group_flight";
  const isDepartureSelfManaged = departureMode !== "group_flight";

  const handleSave = async () => {
    // Build journey notes from arrangements + notes + agent message
    const arrivalArrangements = needsArrivalPickup ? "Needs pickup" : "";
    const departureArrangements = needsDepartureDropoff ? "Needs drop-off" : "";
    const arrivalPart = [arrivalArrangements, arrivalNotes].filter(Boolean).join(" — ");
    const departurePart = [departureArrangements, departureNotes].filter(Boolean).join(" — ");
    const journeyNotes = [arrivalPart, departurePart].filter(Boolean).join(" | ");

    try {
      await updateTravelPrefs.mutateAsync({
        selfManageArrival: isArrivalSelfManaged,
        selfManageDeparture: isDepartureSelfManaged,
        arrivalMode,
        departureMode,
        originCity: (arrivalMode === "group_flight" || arrivalMode === "own_flight" || arrivalMode === "train") ? (originCity || undefined) : undefined,
        // Only collect transport reference when guest requests pickup — avoids unnecessary data collection
        arrivalPnr: (needsArrivalPickup && arrivalTransportRef) ? arrivalTransportRef : undefined,
        departurePnr: (needsDepartureDropoff && departureTransportRef) ? departureTransportRef : undefined,
        journeyNotes: journeyNotes || undefined,
        specialRequests: agentNote || undefined,
      });

      if (hotelMode === "partial" && partialCheckIn && partialCheckOut) {
        await updateBleisure.mutateAsync({
          extendedCheckIn: new Date(partialCheckIn),
          extendedCheckOut: new Date(partialCheckOut),
        });
      } else if (hotelMode !== "partial") {
        await updateBleisure.mutateAsync({
          extendedCheckIn: undefined,
          extendedCheckOut: undefined,
        });
      }

      // Save hotel selection if multiple options exist
      const hotelOptions = guestData?.hotelOptions ?? [];
      if (hotelOptions.length > 1 && selectedHotelId) {
        await selectHotel.mutateAsync(selectedHotelId);
      }

      toast({ title: "Travel preferences saved!" });
      navigate(`/guest/${token}/summary`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save preferences",
        variant: "destructive",
      });
    }
  };

  const isSaving = updateTravelPrefs.isPending || updateBleisure.isPending || selectHotel.isPending;

  function TransportSelector({
    value,
    onChange,
    id,
    groupLabel,
    groupSubtext,
    needsPickup,
    onNeedsPickupChange,
    pickupLabel,
    transportRef,
    onTransportRefChange,
    notes,
    onNotesChange,
    city,
    onCityChange,
    showCity,
  }: {
    value: TransportMode;
    onChange: (v: TransportMode) => void;
    id: string;
    groupLabel?: React.ReactNode;
    groupSubtext?: string;
    needsPickup: boolean;
    onNeedsPickupChange: (v: boolean) => void;
    pickupLabel: string;
    transportRef: string;
    onTransportRefChange: (v: string) => void;
    notes: string;
    onNotesChange: (v: string) => void;
    city?: string;
    onCityChange?: (v: string) => void;
    showCity?: boolean;
  }) {
    const transportRefLabel = value === "train" ? "Train number (e.g. 12301)" : "Flight number (e.g. 6E-401)";
    const transportRefPlaceholder = value === "train" ? "e.g. 12301" : "e.g. 6E-401";

    return (
      <>
        <RadioGroup
          value={value}
          onValueChange={(v) => onChange(v as TransportMode)}
          className="space-y-2"
        >
          {TRANSPORT_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${value === opt.value ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <RadioGroupItem value={opt.value} id={`${id}-${opt.value}`} className="mt-0.5" />
              <label htmlFor={`${id}-${opt.value}`} className="cursor-pointer flex-1">
                <div className="font-medium flex items-center gap-2">
                  {opt.icon} {opt.label}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {opt.value === "group_flight" && groupSubtext ? groupSubtext : opt.subtext}
                </div>
                {opt.value === "group_flight" && groupLabel}
              </label>
            </div>
          ))}
        </RadioGroup>

        {/* Departure city (for group/own/train) */}
        {(value === "group_flight" || value === "own_flight" || value === "train") && showCity && onCityChange && (
          <div className="pt-2 space-y-2">
            <Label>Your departure city / airport (optional)</Label>
            <Input
              placeholder="e.g., Mumbai, BOM"
              value={city ?? ""}
              onChange={(e) => onCityChange(e.target.value)}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">Helps the team coordinate pickup groups</p>
          </div>
        )}

        {/* Arrangements (for self-managed, non-local modes) */}
        {value !== "group_flight" && value !== "local" && (
          <div className="pt-3 space-y-3 p-4 bg-muted/30 rounded-lg border">
            <p className="text-sm font-medium">Do you need any arrangements from the event team?</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={needsPickup}
                onChange={(e) => onNeedsPickupChange(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">{pickupLabel}</span>
            </label>
            {/* Show transport number only if pickup is requested — to help coordinate timing */}
            {needsPickup && (value === "own_flight" || value === "train") && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{transportRefLabel} (optional — helps us time your pickup)</Label>
                <Input
                  placeholder={transportRefPlaceholder}
                  value={transportRef}
                  onChange={(e) => onTransportRefChange(e.target.value)}
                  className="max-w-xs text-sm"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Other notes (optional)</Label>
              <Textarea
                placeholder="e.g., arriving from Pune, around 2pm"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={2}
                className="max-w-sm text-sm"
              />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <GuestLayout step={2} token={token}>
      <AvailabilityGate
        isHotelFull={!!guestData.isHotelFull}
        isFlightFull={!!guestData.isFlightFull}
        step={2}
        guestName={guestData.name}
      >
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-serif text-primary mb-2">Travel Preferences</h1>
          <p className="text-muted-foreground">Let us know how you'd like to get there</p>
        </div>

        {/* Arrival */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plane className="w-5 h-5 text-primary" />
              Arrival
            </CardTitle>
            <CardDescription>How are you arriving?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TransportSelector
              value={arrivalMode}
              onChange={setArrivalMode}
              id="arrival"
              groupSubtext={
                event?.arrivalFlight
                  ? `${event.arrivalFlight}${guestData.arrivalDate ? ` · ${format(new Date(guestData.arrivalDate), "MMM dd, h:mm a")}` : ""}`
                  : undefined
              }
              groupLabel={<Badge variant="secondary" className="mt-2 text-xs">Host covered</Badge>}
              needsPickup={needsArrivalPickup}
              onNeedsPickupChange={setNeedsArrivalPickup}
              pickupLabel="I'd like a pickup from the airport / station"
              transportRef={arrivalTransportRef}
              onTransportRefChange={setArrivalTransportRef}
              notes={arrivalNotes}
              onNotesChange={setArrivalNotes}
              city={originCity}
              onCityChange={setOriginCity}
              showCity
            />
          </CardContent>
        </Card>

        {/* Departure */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plane className="w-5 h-5 text-primary rotate-180" />
              Departure
            </CardTitle>
            <CardDescription>How are you heading back?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TransportSelector
              value={departureMode}
              onChange={setDepartureMode}
              id="departure"
              groupSubtext={
                event?.departureFlight
                  ? `${event.departureFlight}${guestData.departureDate ? ` · ${format(new Date(guestData.departureDate), "MMM dd, h:mm a")}` : ""}`
                  : undefined
              }
              groupLabel={<Badge variant="secondary" className="mt-2 text-xs">Host covered</Badge>}
              needsPickup={needsDepartureDropoff}
              onNeedsPickupChange={setNeedsDepartureDropoff}
              pickupLabel="I'd like a drop-off to the airport / station"
              transportRef={departureTransportRef}
              onTransportRefChange={setDepartureTransportRef}
              notes={departureNotes}
              onNotesChange={setDepartureNotes}
              showCity={false}
            />
            {isDepartureSelfManaged && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  Your return differs from the group. You can also search and book a return flight in the Add-ons step.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hotel Option Picker — shown only when agent has configured multiple hotel options */}
        {(guestData.hotelOptions ?? []).length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hotel className="w-5 h-5 text-primary" />
                Choose Your Hotel
              </CardTitle>
              <CardDescription>
                Your event has multiple accommodation options — pick your preference
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={selectedHotelId?.toString() ?? ""}
                onValueChange={(v) => setSelectedHotelId(Number(v))}
                className="space-y-3"
              >
                {(guestData.hotelOptions as any[]).map((hotel: any) => (
                  <div
                    key={hotel.id}
                    className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedHotelId === hotel.id ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <RadioGroupItem value={hotel.id.toString()} id={`hotel-${hotel.id}`} className="mt-0.5" />
                    <label htmlFor={`hotel-${hotel.id}`} className="cursor-pointer flex-1">
                      <div className="font-medium">{hotel.name}</div>
                      {hotel.checkIn && hotel.checkOut && (
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {format(new Date(hotel.checkIn), "MMM d")} – {format(new Date(hotel.checkOut), "MMM d, yyyy")}
                        </div>
                      )}
                      <Badge variant="secondary" className="mt-2 text-xs">Host covered</Badge>
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        {/* Hotel Stay — Bleisure extension */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hotel className="w-5 h-5 text-primary" />
              Extend Your Stay <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
            </CardTitle>
            <CardDescription>
              {hostCheckIn && hostCheckOut
                ? `Group stay: ${format(hostCheckIn, "MMM dd")} – ${format(hostCheckOut, "MMM dd, yyyy")}`
                : "Group hotel details to be confirmed"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={hotelMode}
              onValueChange={(v) => setHotelMode(v as "group" | "own" | "partial")}
              className="space-y-3"
            >
              <div className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${hotelMode === "group" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="group" id="hotel-group" className="mt-0.5" />
                <label htmlFor="hotel-group" className="cursor-pointer flex-1">
                  <div className="font-medium">Use the group hotel</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {hostCheckIn && hostCheckOut
                      ? `${format(hostCheckIn, "MMM dd")} – ${format(hostCheckOut, "MMM dd")}`
                      : "Dates to be confirmed"}
                  </div>
                  <Badge variant="secondary" className="mt-2 text-xs">Host covered</Badge>
                </label>
              </div>

              <div className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${hotelMode === "partial" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="partial" id="hotel-partial" className="mt-0.5" />
                <label htmlFor="hotel-partial" className="cursor-pointer flex-1">
                  <div className="font-medium">Extend my stay</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Arrive early or stay later — ₹{bleisureRate.toLocaleString('en-IN')}/night{bleisureRateEstimated ? " (est.)" : ""} · Self-pay
                  </div>
                </label>
              </div>

              <div className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${hotelMode === "own" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="own" id="hotel-own" className="mt-0.5" />
                <label htmlFor="hotel-own" className="cursor-pointer flex-1">
                  <div className="font-medium">I'll book my own hotel</div>
                  <div className="text-sm text-muted-foreground mt-1">Self-pay — you arrange your own accommodation</div>
                </label>
              </div>
            </RadioGroup>

            {hotelMode === "partial" && (
              <div className="space-y-4 pt-2 p-4 bg-muted/30 rounded-lg border">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="partialCheckIn">My check-in date</Label>
                    <Input
                      id="partialCheckIn"
                      type="date"
                      value={partialCheckIn}
                      max={hostCheckIn ? format(hostCheckIn, "yyyy-MM-dd") : undefined}
                      onChange={(e) => setPartialCheckIn(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">On or before {hostCheckIn ? format(hostCheckIn, "MMM dd") : "group check-in"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="partialCheckOut">My check-out date</Label>
                    <Input
                      id="partialCheckOut"
                      type="date"
                      value={partialCheckOut}
                      min={hostCheckOut ? format(hostCheckOut, "yyyy-MM-dd") : undefined}
                      onChange={(e) => setPartialCheckOut(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">On or after {hostCheckOut ? format(hostCheckOut, "MMM dd") : "group check-out"}</p>
                  </div>
                </div>

                {extraNightsCost > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="font-medium">{preNights + postNights} extra night{preNights + postNights !== 1 ? "s" : ""}</span>
                        <span className="text-muted-foreground"> × ₹{bleisureRate.toLocaleString('en-IN')}{bleisureRateEstimated ? " (est.)" : ""}</span>
                      </div>
                      <div className="font-semibold text-amber-800">
                        ₹{extraNightsCost.toLocaleString('en-IN')}{bleisureRateEstimated ? "*" : ""}
                      </div>
                    </div>
                    {bleisureRateEstimated && (
                      <p className="text-xs text-muted-foreground">* Estimated — your event coordinator will confirm the final rate</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Note for the event team */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Anything else to tell the team? (optional)</CardTitle>
            <CardDescription>Special arrangements, dietary needs, accessibility requirements, or anything on your mind</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="e.g., I'll be arriving from a connecting cruise, please be flexible on pickup timing."
              value={agentNote}
              onChange={(e) => setAgentNote(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Save & Continue */}
        <div className="flex justify-between items-center pt-4 pb-8">
          <Button variant="outline" onClick={() => navigate(`/guest/${token}/rsvp`)}>
            ← Back
          </Button>
          <Button
            size="lg"
            className="px-10"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <><Loader2 className="animate-spin mr-2 w-4 h-4" />Saving...</>
            ) : (
              <>Review My Booking <ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
      </AvailabilityGate>
    </GuestLayout>
  );
}
