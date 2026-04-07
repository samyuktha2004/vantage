import { useLocation } from "wouter";
import { useGuestPortal } from "@/hooks/use-guest-portal";
import { GuestLayout } from "@/components/GuestLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plane, Hotel, ArrowRight, CheckCircle, AlertTriangle, Gift, IndianRupee, Train, Bus } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { AvailabilityGate } from "@/components/AvailabilityGate";

export default function GuestBookingSummary({ token }: { token: string }) {
  const { data: guestData, isLoading } = useGuestPortal(token);
  const [, navigate] = useLocation();

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
  const bleisureRate = guestData.bleisureRatePerNight ?? 250;
  const bleisureRateEstimated = !guestData.bleisureRatePerNight;

  // Hotel dates
  const hostCheckIn = event?.hostCheckIn ? new Date(event.hostCheckIn) : null;
  const hostCheckOut = event?.hostCheckOut ? new Date(event.hostCheckOut) : null;
  const extCheckIn = guestData.extendedCheckIn ? new Date(guestData.extendedCheckIn) : null;
  const extCheckOut = guestData.extendedCheckOut ? new Date(guestData.extendedCheckOut) : null;

  // Night calculations
  const groupNights = (hostCheckIn && hostCheckOut)
    ? differenceInCalendarDays(hostCheckOut, hostCheckIn)
    : 0;
  const preNights = (extCheckIn && hostCheckIn && extCheckIn < hostCheckIn)
    ? differenceInCalendarDays(hostCheckIn, extCheckIn)
    : 0;
  const postNights = (extCheckOut && hostCheckOut && extCheckOut > hostCheckOut)
    ? differenceInCalendarDays(extCheckOut, hostCheckOut)
    : 0;

  const extraNightsCost = (preNights + postNights) * bleisureRate;

  // Transport modes
  const arrivalMode = guestData.arrivalMode ?? (guestData.selfManageArrival ? "own_flight" : "group_flight");
  const departureMode = guestData.departureMode ?? (guestData.selfManageDeparture ? "own_flight" : "group_flight");
  const selfManageArrival = arrivalMode !== "group_flight";
  const selfManageDeparture = departureMode !== "group_flight";

  const transportLabel: Record<string, string> = {
    own_flight: "Own flight",
    train: "Train",
    other: "Bus / car / other",
  };
  const TransportIcon = ({ mode }: { mode: string }) => {
    if (mode === "train") return <Train className="w-4 h-4 text-blue-600" />;
    if (mode === "other") return <Bus className="w-4 h-4 text-blue-600" />;
    return <Plane className="w-4 h-4 text-blue-600" />;
  };

  // Total self-pay estimate
  let totalSelfPay = extraNightsCost;

  // Retail rate estimate for savings badge (rough estimate: 2× the negotiated group rate)
  const retailRatePerNight = bleisureRate * 2;
  const groupSavings = groupNights * retailRatePerNight; // always shown as "estimated"

  return (
    <GuestLayout step={3} token={token}>
      <AvailabilityGate
        isHotelFull={!!guestData.isHotelFull}
        isFlightFull={!!guestData.isFlightFull}
        step={3}
        guestName={guestData.name}
      >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-serif text-primary mb-2">Booking Summary</h1>
          <p className="text-muted-foreground">Here's an overview of your travel arrangements</p>
        </div>

        {/* Arrival Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plane className="w-4 h-4 text-primary" />
              Arrival
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selfManageArrival ? (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <TransportIcon mode={arrivalMode} />
                </div>
                <div>
                  <p className="font-medium">{transportLabel[arrivalMode] ?? "Self-arranged"} arrival</p>
                  {guestData.arrivalPnr && (
                    <p className="text-sm text-muted-foreground">
                      {arrivalMode === "train" ? "Train PNR" : "PNR"}: <span className="font-mono font-medium">{guestData.arrivalPnr}</span>
                    </p>
                  )}
                  {guestData.specialRequests && arrivalMode === "other" && (
                    <p className="text-sm text-muted-foreground">{guestData.specialRequests}</p>
                  )}
                  <Badge variant="outline" className="mt-1 text-xs text-blue-600 border-blue-300">Self-pay</Badge>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Group flight</p>
                  {event?.arrivalFlight ? (
                    <p className="text-sm text-muted-foreground">{event.arrivalFlight}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Details to be shared by your event coordinator</p>
                  )}
                  {guestData.arrivalDate && (
                    <p className="text-sm text-muted-foreground">{format(new Date(guestData.arrivalDate), "EEE, MMM dd · h:mm a")}</p>
                  )}
                  <Badge variant="secondary" className="mt-1 text-xs">Host covered · ₹0 to you</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hotel Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Hotel className="w-4 h-4 text-primary" />
              Hotel Stay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Primary hotel details */}
            {!guestData.primaryHotel && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Hotel className="w-4 h-4 flex-shrink-0" />
                <span>Hotel details will be shared by your event coordinator</span>
              </div>
            )}
            {guestData.primaryHotel && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Hotel className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{guestData.primaryHotel.name}</p>
                  {(hostCheckIn || guestData.primaryHotel.checkIn) && (hostCheckOut || guestData.primaryHotel.checkOut) && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(hostCheckIn ?? guestData.primaryHotel.checkIn), "EEE, MMM d")}
                      {" → "}
                      {format(new Date(hostCheckOut ?? guestData.primaryHotel.checkOut), "EEE, MMM d, yyyy")}
                      {groupNights > 0 && ` · ${groupNights} night${groupNights > 1 ? "s" : ""}`}
                    </p>
                  )}
                  <Badge variant="secondary" className="mt-1 text-xs">Host covered · ₹0 to you</Badge>
                </div>
              </div>
            )}
            {/* Pre-event extension */}
            {preNights > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">{preNights} pre-event night{preNights > 1 ? "s" : ""}</span>
                  <div className="text-muted-foreground">
                    {extCheckIn && format(extCheckIn, "MMM dd")} – {hostCheckIn && format(hostCheckIn, "MMM dd")}
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">Self-pay{bleisureRateEstimated ? " · est." : ""}</Badge>
                  <div className="text-sm font-semibold text-blue-800 mt-1">₹{(preNights * bleisureRate).toLocaleString('en-IN')}{bleisureRateEstimated ? "*" : ""}</div>
                </div>
              </div>
            )}

            {/* Group stay */}
            {hostCheckIn && hostCheckOut ? (
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">{groupNights} group night{groupNights !== 1 ? "s" : ""}</span>
                  <div className="text-muted-foreground">
                    {format(hostCheckIn, "MMM dd")} – {format(hostCheckOut, "MMM dd, yyyy")}
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="text-xs">Host covered</Badge>
                  <div className="text-sm font-semibold text-green-800 mt-1">₹0</div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground">
                Hotel dates to be confirmed by your event coordinator
              </div>
            )}

            {/* Post-event extension */}
            {postNights > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">{postNights} post-event night{postNights > 1 ? "s" : ""}</span>
                  <div className="text-muted-foreground">
                    {hostCheckOut && format(hostCheckOut, "MMM dd")} – {extCheckOut && format(extCheckOut, "MMM dd")}
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">Self-pay{bleisureRateEstimated ? " · est." : ""}</Badge>
                  <div className="text-sm font-semibold text-blue-800 mt-1">₹{(postNights * bleisureRate).toLocaleString('en-IN')}{bleisureRateEstimated ? "*" : ""}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Departure Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plane className="w-4 h-4 text-primary rotate-180" />
              Departure
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selfManageDeparture ? (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium">Self-arranged departure</p>
                  {guestData.departurePnr && (
                    <p className="text-sm text-muted-foreground">PNR: <span className="font-mono font-medium">{guestData.departurePnr}</span></p>
                  )}
                  <p className="text-xs text-amber-700 mt-1">Your return differs from the group. You can book a return flight in Add-ons.</p>
                  <Badge variant="outline" className="mt-1 text-xs text-blue-600 border-blue-300">Self-pay</Badge>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Group return flight</p>
                  {event?.departureFlight ? (
                    <p className="text-sm text-muted-foreground">{event.departureFlight}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Details to be shared by your event coordinator</p>
                  )}
                  {guestData.departureDate && (
                    <p className="text-sm text-muted-foreground">{format(new Date(guestData.departureDate), "EEE, MMM dd · h:mm a")}</p>
                  )}
                  <Badge variant="secondary" className="mt-1 text-xs">Host covered · ₹0 to you</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Group Savings Badge */}
        {groupSavings > 0 && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-800">You saved an estimated ₹{groupSavings.toLocaleString('en-IN')}</p>
                  <p className="text-sm text-emerald-700">vs. booking {groupNights} hotel night{groupNights !== 1 ? "s" : ""} independently at retail rates</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Total Self-Pay */}
        {totalSelfPay > 0 && (
          <Card className="border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Total estimated cost to you</span>
                </div>
                <span className="text-xl font-bold text-blue-800">₹{totalSelfPay.toLocaleString('en-IN')}{bleisureRateEstimated ? "*" : ""}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                For extended hotel nights. Flight add-ons (if any) will be confirmed in the next step.
              </p>
              {bleisureRateEstimated && (
                <p className="text-xs text-amber-700 mt-1">* Nightly rate is estimated. Your event coordinator will confirm the exact amount.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center pt-4 pb-8">
          <Button variant="outline" onClick={() => navigate(`/guest/${token}/travel-prefs`)}>
            ← Back
          </Button>
          <Button
            size="lg"
            className="px-10"
            onClick={() => navigate(`/guest/${token}/addons`)}
          >
            Choose Add-ons <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
      </AvailabilityGate>
    </GuestLayout>
  );
}
