import { useAuth } from "@/hooks/use-auth";
import { useEvents, useCreateEvent, useDeleteEvent } from "@/hooks/use-events";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/Layout";
import { Link, useLocation } from "wouter";
import { Plus, MapPin, Calendar, ArrowRight, Loader2, Trash2, MoreVertical, Settings, Tag, Gift, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEventSchema } from "@shared/schema";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// EWS Badge — lazy inventory status fetched per event card
function EWSBadge({ eventId }: { eventId: number }) {
  const { data } = useQuery({
    queryKey: ["ews-status", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/inventory/status`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60000,
    retry: false,
  });
  if (!data) return null;
  const allAlerts = [...(data.hotels ?? []), ...(data.flights ?? [])];
  const critical = allAlerts.some((a: any) => a.severity === "critical");
  const warning = allAlerts.some((a: any) => a.severity === "warning");
  if (!critical && !warning) return null;
  return (
    <span
      title={critical ? "Inventory critical — action required" : "Inventory warning"}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
        critical ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      <AlertTriangle className="w-3 h-3" />
      {critical ? "Critical" : "Low inventory"}
    </span>
  );
}

const createEventFormSchema = insertEventSchema.pick({
  name: true,
  date: true,
  endDate: true,
  location: true,
  description: true,
}).extend({
  clientName: z.string().min(1, "Client name is required"),
}).superRefine((data, ctx) => {
  if (!data.endDate) return;
  const start = new Date(data.date as any).getTime();
  const end = new Date(data.endDate as any).getTime();
  if (!Number.isNaN(start) && !Number.isNaN(end) && end < start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date cannot be earlier than start date",
    });
  }
});

type CreateEventFormValues = z.infer<typeof createEventFormSchema>;

const eventCodeSchema = z.object({
  eventCode: z.string().min(1, "Event code is required"),
});

type EventCodeFormValues = z.infer<typeof eventCodeSchema>;

function toDateInputValue(value: unknown): string {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
    return value;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEventDateRange(startValue: unknown, endValue?: unknown): string {
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

  if (!startDate || Number.isNaN(startDate.getTime())) return "—";
  if (!endDate || Number.isNaN(endDate.getTime())) return format(startDate, "PPP");

  const sameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate();

  return sameDay
    ? format(startDate, "PPP")
    : `${format(startDate, "PPP")} → ${format(endDate, "PPP")}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAgent = user?.role === "agent";
  const isClient = user?.role === "client";
  const isGroundTeam = user?.role === "groundTeam";

  // Ground team users are scoped to a single event — redirect them immediately
  useEffect(() => {
    if (!isGroundTeam) return;
    fetch("/api/groundteam/my-event", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        // API now returns an array of events. If single, redirect directly.
        if (Array.isArray(data)) {
          if (data.length === 1) {
            navigate(`/groundteam/${data[0].id}/checkin`);
          } else if (data.length > 1) {
            navigate(`/groundteam/select`);
          }
          return;
        }
        if (data?.id) navigate(`/groundteam/${data.id}/checkin`);
      })
      .catch(() => {});
  }, [isGroundTeam]);

  // Agents use the standard events hook; clients use a dedicated endpoint
  const { data: agentEvents, isLoading: agentLoading } = useEvents();
  const { data: clientEvents, isLoading: clientLoading } = useQuery({
    queryKey: ["my-client-events"],
    queryFn: async () => {
      const res = await fetch("/api/events/my-client-events", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load events");
      return res.json();
    },
    enabled: isClient,
  });

  const events = isClient ? clientEvents : agentEvents;
  const isLoading = isClient ? clientLoading : agentLoading;

  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();
  const [, navigate] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEventCodeDialogOpen, setIsEventCodeDialogOpen] = useState(false);
  const [deleteEventId, setDeleteEventId] = useState<number | null>(null);

  // Show event code dialog for clients without event code
  useEffect(() => {
    if (isClient && !user?.eventCode && !isLoading) {
      setIsEventCodeDialogOpen(true);
    }
  }, [isClient, user, isLoading]);

  const form = useForm<CreateEventFormValues>({
    resolver: zodResolver(createEventFormSchema),
    defaultValues: {
      name: "",
      location: "",
      description: "",
      clientName: "",
      endDate: undefined,
    },
  });

  const eventCodeForm = useForm<EventCodeFormValues>({
    resolver: zodResolver(eventCodeSchema),
    defaultValues: {
      eventCode: "",
    },
  });

  const onSubmit = async (data: CreateEventFormValues) => {
    try {
      console.log("Submitting event data:", data);
      const result = await createEvent.mutateAsync(data);
      console.log("Event created:", result);
      setIsDialogOpen(false);
      form.reset();
      // Navigate to event setup page
      const clientNameParam = encodeURIComponent((data.clientName || "").trim());
      navigate(`/events/${result.id}/setup${clientNameParam ? `?clientName=${clientNameParam}` : ""}`);
    } catch (error: any) {
      console.error("Failed to create event", error);
      toast({ title: "Error", description: error.message || "Failed to create event", variant: "destructive" });
    }
  };

  const onEventCodeSubmit = async (data: EventCodeFormValues) => {
    try {
      const response = await fetch("/api/user/event-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventCode: data.eventCode.trim() }),
      });

      if (!response.ok) {
        throw new Error("Invalid event code");
      }

      const result = await response.json();

      setIsEventCodeDialogOpen(false);

      if (typeof result?.eventId === "number") {
        const displayName = result.eventName ?? result.eventCode ?? `#${result.eventId}`;
        try {
          toast({ title: `Joined event ${displayName}`, description: `Opening ${displayName}…` });
        } catch (e) {
          // swallow if toast fails for any reason
        }

        // Give the toast a moment to appear before navigating
        setTimeout(() => {
          navigate(`/events/${result.eventId}`);
        }, 700);

        return;
      }

      window.location.reload();
    } catch (error) {
      console.error("Failed to set event code", error);
      eventCodeForm.setError("eventCode", { message: "Invalid event code" });
    }
  };

  const handleDeleteEvent = async () => {
    if (!deleteEventId) return;
    try {
      await deleteEvent.mutateAsync(deleteEventId);
      setDeleteEventId(null);
    } catch (error: any) {
      console.error("Failed to delete event", error);
      toast({ title: "Error", description: error.message || "Failed to delete event", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full min-h-[320px] sm:min-h-[500px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Event Code Dialog for Clients */}
      <Dialog open={isEventCodeDialogOpen} onOpenChange={setIsEventCodeDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Enter Event Code</DialogTitle>
            <DialogDescription>
              Please enter the event code provided by your agent to access your event.
            </DialogDescription>
          </DialogHeader>

          <Form {...eventCodeForm}>
            <form onSubmit={eventCodeForm.handleSubmit(onEventCodeSubmit)} className="space-y-4 py-4">
              <FormField
                control={eventCodeForm.control}
                name="eventCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. EVT-2025-ABC123" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={eventCodeForm.formState.isSubmitting} className="bg-primary text-white">
                  {eventCodeForm.formState.isSubmitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Joining…</>
                  ) : "Submit"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2">Welcome back, {user?.firstName}</h1>
          <p className="text-muted-foreground">
            {isAgent ? "Manage your events and logistics." : "Your events are listed below."}
          </p>
        </div>

        {isClient && (
          <Button
            className="bg-primary text-white hover:bg-primary/90"
            onClick={() => setIsEventCodeDialogOpen(true)}
          >
            + Join Another Event
          </Button>
        )}
        
        {isAgent && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="btn-primary">
                <Plus className="w-4 h-4 mr-2" /> New Event
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Create New Event</DialogTitle>
                <DialogDescription>
                  Set up the basics for your new event.
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Summer Gala 2025" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. John Smith" {...field} />
                      </FormControl>
                      <FormMessage />
                      <p className="text-sm text-muted-foreground">Host or primary contact for this event</p>
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={toDateInputValue(field.value)}
                            onChange={(e) => {
                              field.onChange(e.target.value || undefined);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={toDateInputValue(field.value)}
                            min={toDateInputValue(form.watch("date")) || undefined}
                            onChange={(e) => {
                              field.onChange(e.target.value || undefined);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input placeholder="Paris, France" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Event details..." className="resize-none" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createEvent.isPending} className="bg-primary text-white">
                    {createEvent.isPending ? "Creating..." : "Create Event"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <AlertDialog open={!!deleteEventId} onOpenChange={() => setDeleteEventId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this event? This action cannot be undone and will remove all associated data including guests, labels, and perks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteEvent}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteEvent.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Event"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {events?.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-border">
          <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">No events yet</h3>
          <p className="text-muted-foreground mt-2">Create your first event to get started.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events?.map((event: any) => (
            <div key={event.id} className="group bg-white rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-lg hover:border-primary/20 transition-all h-full flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-secondary/30 rounded-xl text-primary group-hover:scale-110 transition-transform">
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                    Active
                  </span>
                  {isAgent && <EWSBadge eventId={event.id} />}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <MoreVertical className="w-5 h-5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteEventId(event.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Event
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              
              <div>
                  <h3 className="text-xl font-bold text-primary mb-2 line-clamp-1">{event.name}</h3>

                  <div className="space-y-2 mt-auto text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span className="truncate">{formatEventDateRange(event.date, event.endDate)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border/50">
                    <div className="flex items-center justify-end gap-2 mb-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label="Labels"
                        title="Labels"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/events/${event.id}?tab=labels`);
                        }}
                      >
                        <Tag className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label="Perks"
                        title="Perks"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/events/${event.id}?tab=perks`);
                        }}
                      >
                        <Gift className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label="Setup"
                        title="Setup"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/events/${event.id}/setup`);
                        }}
                      >
                        <Settings className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <Link href={`/events/${event.id}`}>
                    <div className="flex items-center text-primary font-medium text-sm group-hover:translate-x-1 transition-transform cursor-pointer">
                      Manage Event <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </Link>
                </div>
            </div>
          ))}
        </div>
      )}

    </DashboardLayout>
  );
}
