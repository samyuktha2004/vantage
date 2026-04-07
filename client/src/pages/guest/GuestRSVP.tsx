import { useState } from "react";
import { useLocation } from "wouter";
import { useGuestPortal, useUpdateRSVP, useUpdateProfile } from "@/hooks/use-guest-portal";
import { GuestLayout } from "@/components/GuestLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users, Plus, X, CheckCircle2, XCircle, Phone, UtensilsCrossed, AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { AvailabilityGate } from "@/components/AvailabilityGate";

const MEAL_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
];

interface FamilyMember {
  name: string;
  relationship: string;
  age?: number;
}

function formatEventDateRange(startValue: unknown, endValue?: unknown, locale: string = "en-US"): string {
  const startDate = startValue instanceof Date
    ? startValue
    : typeof startValue === "string" && startValue
      ? new Date(startValue)
      : null;
  const endDate = endValue instanceof Date
    ? endValue
    : typeof endValue === "string" && endValue
      ? new Date(endValue)
      : null;

  if (!startDate || Number.isNaN(startDate.getTime())) return "TBD";

  const long = (d: Date) => d.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const short = (d: Date) => d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (!endDate || Number.isNaN(endDate.getTime())) return long(startDate);

  const sameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate();

  return sameDay ? long(startDate) : `${short(startDate)} → ${short(endDate)}`;
}

export default function GuestRSVP({ token }: { token: string }) {
  const { data: guestData, isLoading } = useGuestPortal(token);
  const updateRSVP = useUpdateRSVP(token);
  const updateProfile = useUpdateProfile(token);
  const [, navigate] = useLocation();

  // Smart Check: guest must verify their name/event before RSVP form shows
  const [smartCheckDone, setSmartCheckDone] = useState(false);
  const [status, setStatus] = useState<'confirmed' | 'declined' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [newMember, setNewMember] = useState<FamilyMember>({ name: "", relationship: "", age: undefined });

  // Emergency contact + meal preference + allergies
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [mealPref, setMealPref] = useState("standard");
  const [allergyNotes, setAllergyNotes] = useState("");

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  if (!guestData) {
    return <div className="p-10 text-center">Invalid access link</div>;
  }

  const maxSeats = guestData.allocatedSeats;
  const currentSeats = 1 + familyMembers.length;
  const canAddMore = currentSeats < maxSeats;

  const handleAddMember = () => {
    if (newMember.name && newMember.relationship && canAddMore) {
      setFamilyMembers([...familyMembers, newMember]);
      setNewMember({ name: "", relationship: "", age: undefined });
    }
  };

  const handleRemoveMember = (index: number) => {
    setFamilyMembers(familyMembers.filter((_, i) => i !== index));
  };

  const handleSubmitRSVP = async () => {
    if (!status) {
      toast({
        title: "Please select your response",
        variant: "destructive"
      });
      return;
    }

    try {
      await updateRSVP.mutateAsync({
        status,
        confirmedSeats: status === 'confirmed' ? currentSeats : 0,
        familyMembers: status === 'confirmed' ? familyMembers : undefined
      });

      setSubmitted(true);

      // Save profile data in background (non-blocking)
      if (status === 'confirmed' && (emergencyName || emergencyPhone || mealPref !== "standard" || allergyNotes)) {
        updateProfile.mutate({
          emergencyContactName: emergencyName,
          emergencyContactPhone: emergencyPhone,
          mealPreference: mealPref,
          specialRequests: allergyNotes || undefined,
        });
      }

      if (status === 'confirmed') {
        toast({
          title: "RSVP Confirmed!",
          description: `${currentSeats} seat(s) confirmed. Let's set up your travel next.`,
        });
        setTimeout(() => navigate(`/guest/${token}/travel-prefs`), 1200);
      } else {
        toast({
          title: "Response Recorded",
          description: "We're sorry you can't make it.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit RSVP. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (submitted && status === 'declined') {
    return (
      <GuestLayout step={1} token={token}>
        <div className="max-w-lg mx-auto text-center py-16 space-y-4">
          <XCircle className="w-16 h-16 text-gray-400 mx-auto" />
          <h2 className="text-2xl font-serif text-primary">Response Recorded</h2>
          <p className="text-muted-foreground">We're sorry you can't make it. Your response has been recorded and the event team has been notified.</p>
        </div>
      </GuestLayout>
    );
  }

  // Smart Check: show verification card before RSVP form
  if (!smartCheckDone) {
    return (
      <GuestLayout step={1} token={token}>
        <div className="max-w-lg mx-auto space-y-6 py-4">
          <div className="text-center">
            <Badge variant="outline" className="mb-3 border-primary/30 text-primary">Smart Check</Badge>
            <h1 className="text-3xl font-serif text-primary mb-2">Before you RSVP…</h1>
            <p className="text-muted-foreground text-sm">Please verify the details below are correct. This ensures your booking goes through without any issues.</p>
          </div>
          <Card className="border-primary/20">
            <CardContent className="pt-5 pb-4 space-y-3">
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-sm text-muted-foreground">Your name</span>
                <span className="font-semibold">{guestData.name}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-sm text-muted-foreground">Event</span>
                <span className="font-semibold text-right max-w-[60%]">{guestData.event.name}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-sm text-muted-foreground">Date</span>
                <span className="font-semibold">
                  {formatEventDateRange(guestData.event.date, (guestData.event as any).endDate, 'en-US')}
                </span>
              </div>
              {guestData.event.location && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Location</span>
                  <span className="font-semibold text-right max-w-[60%]">{guestData.event.location}</span>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setSmartCheckDone(true)}
              className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
            >
              ✓ Details look correct — continue to RSVP
            </button>
            <button
              onClick={() => window.location.href = `mailto:support@vantage.travel?subject=Booking correction for ${guestData.name}&body=Hi, my booking details need updating.`}
              className="w-full py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:bg-muted transition-colors"
            >
              Something's wrong — contact agent
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            If you don't respond, your spot may be released.
          </p>
        </div>
      </GuestLayout>
    );
  }

  return (
    <GuestLayout step={1} token={token}>
      <AvailabilityGate
        isHotelFull={!!guestData.isHotelFull}
        isFlightFull={!!guestData.isFlightFull}
        step={1}
        guestName={guestData.name}
      >
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
            Personal Invitation
          </Badge>
          <h1 className="text-4xl font-serif text-primary mb-3">You're Invited — Join Us</h1>
          <p className="text-xl text-muted-foreground">{guestData.event.name}</p>
          <p className="text-sm text-muted-foreground mt-2">
            {formatEventDateRange(guestData.event.date, (guestData.event as any).endDate, 'en-US')}
          </p>
        </div>

        {/* Event info — no seat count announced */}
        {guestData.event.location && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span><strong className="text-foreground">{guestData.event.location}</strong></span>
                {guestData.event.date && (
                  <span>{formatEventDateRange(guestData.event.date, (guestData.event as any).endDate, 'en-IN')}</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* RSVP Status Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Will you attend?</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Button
              variant={status === 'confirmed' ? "default" : "outline"}
              size="lg"
              className={`h-auto py-6 ${status === 'confirmed' ? 'bg-green-600 hover:bg-green-700' : ''}`}
              onClick={() => setStatus('confirmed')}
            >
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6" />
                <span className="text-lg font-semibold">Confirm Attendance</span>
              </div>
            </Button>
            <Button
              variant={status === 'declined' ? "default" : "outline"}
              size="lg"
              className={`h-auto py-6 ${status === 'declined' ? 'bg-gray-600 hover:bg-gray-700' : ''}`}
              onClick={() => setStatus('declined')}
            >
              <div className="flex flex-col items-center gap-2">
                <XCircle className="w-6 h-6" />
                <span className="text-lg font-semibold">Decline — Notify Host</span>
              </div>
            </Button>
          </CardContent>
        </Card>

        {/* Family Members Section - Only show if confirmed */}
        <AnimatePresence>
          {status === 'confirmed' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Who's coming with you?</CardTitle>
                  <CardDescription>
                    Add the names of any guests joining you
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Primary Guest */}
                  <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{guestData.name}</div>
                      <div className="text-sm text-muted-foreground">Primary Guest</div>
                    </div>
                    <Badge variant="secondary">You</Badge>
                  </div>

                  {/* Additional Family Members */}
                  {familyMembers.map((member, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{member.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {member.relationship}
                          {member.age && `, ${member.age} years old`}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMember(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  ))}

                  {/* Add Member Form */}
                  {canAddMore && (
                    <div className="border-2 border-dashed border-border/50 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="memberName">Name</Label>
                          <Input
                            id="memberName"
                            placeholder="Full name"
                            value={newMember.name}
                            onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="relationship">Relationship</Label>
                          <Input
                            id="relationship"
                            placeholder="e.g., Spouse, Child"
                            value={newMember.relationship}
                            onChange={(e) => setNewMember({ ...newMember, relationship: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <Label htmlFor="age">Age (Optional)</Label>
                          <Input
                            id="age"
                            type="number"
                            placeholder="Age"
                            value={newMember.age || ""}
                            onChange={(e) => setNewMember({ 
                              ...newMember, 
                              age: e.target.value ? parseInt(e.target.value) : undefined 
                            })}
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            onClick={handleAddMember}
                            disabled={!newMember.name || !newMember.relationship}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Guest
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {!canAddMore && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                      <p className="text-sm text-amber-800 font-medium">Need more seats?</p>
                      <p className="text-xs text-amber-700">Your current allocation is {maxSeats} seat{maxSeats !== 1 ? "s" : ""}. To add more guests, let the event team know and they'll check availability.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-400 text-amber-800 hover:bg-amber-100"
                        onClick={() => {
                          // Add a placeholder entry that becomes a pending request on submit
                          setFamilyMembers([...familyMembers, { name: "", relationship: "Additional Guest (under review)", age: undefined }]);
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Request an Extra Seat
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Emergency Contact + Meal Preference - shown after confirming */}
        <AnimatePresence>
          {status === 'confirmed' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    Emergency Contact & Meal Preference
                  </CardTitle>
                  <CardDescription>Required for on-site coordination — takes 30 seconds</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="emergencyName">Emergency Contact Name</Label>
                      <Input
                        id="emergencyName"
                        placeholder="Full name"
                        value={emergencyName}
                        onChange={(e) => setEmergencyName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="emergencyPhone">Phone Number</Label>
                      <Input
                        id="emergencyPhone"
                        placeholder="+91 98xxx xxxxx"
                        value={emergencyPhone}
                        onChange={(e) => setEmergencyPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5">
                      <UtensilsCrossed className="w-3.5 h-3.5" />
                      Meal Preference
                    </Label>
                    <Select value={mealPref} onValueChange={setMealPref}>
                      <SelectTrigger className="max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEAL_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-sm">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      Allergies or dietary restrictions (optional)
                    </Label>
                    <Textarea
                      placeholder="e.g., nut allergy, gluten-free, no shellfish…"
                      value={allergyNotes}
                      onChange={(e) => setAllergyNotes(e.target.value)}
                      rows={2}
                      className="max-w-sm text-sm"
                    />
                    <p className="text-xs text-muted-foreground">Shared with the catering team to keep you safe</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit Button */}
        <div className="flex justify-center pt-4">
          <Button
            size="lg"
            className="px-12 h-14 text-lg btn-primary"
            disabled={!status || updateRSVP.isPending || submitted}
            onClick={handleSubmitRSVP}
          >
            {updateRSVP.isPending || submitted ? (
              <>
                <Loader2 className="animate-spin mr-2" />
                {submitted ? "Redirecting..." : "Submitting..."}
              </>
            ) : (
              <>Submit RSVP</>
            )}
          </Button>
        </div>
      </div>
      </AvailabilityGate>
    </GuestLayout>
  );
}
