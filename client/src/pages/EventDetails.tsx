import { DashboardLayout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useEvent } from "@/hooks/use-events";
import { useRoute, useLocation } from "wouter";
import ClientEventView from "./ClientEventView";
import { Loader2, Users, Tag, Gift, Inbox, Upload, FileSpreadsheet, Download, Eye, Edit, Plus, Trash2, Settings, FileDown, CheckSquare, BarChart3, Hotel, Plane, AlertTriangle, Globe, UserPlus, Copy } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useGuests, useDeleteGuest, useUpdateGuest } from "@/hooks/use-guests";
import { useLabels } from "@/hooks/use-labels";
import { usePerks } from "@/hooks/use-perks";
import { useRequests } from "@/hooks/use-requests";
import { useHotelBookings } from "@/hooks/use-hotel-bookings";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { parseExcelFile, parseCSVFile, generateGuestListTemplate, exportManifestToExcel } from "@/lib/excelParser";
import { generateEventReport } from "@/lib/reportGenerator";
import { useToast } from "@/hooks/use-toast";
import { GuestLinkManager } from "@/components/GuestLinkManager";
import { CapacityAlert } from "@/components/CapacityAlert";
import { RsvpBreakdownCard } from "@/components/RsvpBreakdownCard";

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

  if (!startDate || Number.isNaN(startDate.getTime())) return "TBD";
  if (!endDate || Number.isNaN(endDate.getTime())) return format(startDate, "PPP");

  const sameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate();

  return sameDay
    ? format(startDate, "PPP")
    : `${format(startDate, "PPP")} → ${format(endDate, "PPP")}`;
}

function getSelfPaidLabels(guest: any): string[] {
  const labels: string[] = [];
  const fullFlightSelfPaid = !!guest?.selfManageFlights || (!!guest?.selfManageArrival && !!guest?.selfManageDeparture);
  const hotelSelfPaid = !!guest?.selfManageHotel;

  if (fullFlightSelfPaid && hotelSelfPaid) {
    return ["Self Paid · All"];
  }

  if (fullFlightSelfPaid) {
    labels.push("Self Paid · Flight");
  } else {
    if (guest?.selfManageArrival) labels.push("Self Paid · Arrival");
    if (guest?.selfManageDeparture) labels.push("Self Paid · Departure");
  }

  if (hotelSelfPaid) {
    labels.push("Self Paid · Hotel");
  }

  return labels;
}

export default function EventDetails() {
  const [match, params] = useRoute("/events/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: event, isLoading: isEventLoading } = useEvent(id);

  // Role-based access flags - both agents and clients can access the tabbed interface
  // with certain features restricted per role
  const isAgent = user?.role === "agent";
  const isClient = user?.role === "client";
  
  // Get tab from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || 'guests';
  const shouldAutoScrollToTabs = urlParams.has("tab");

  useEffect(() => {
    if (!shouldAutoScrollToTabs) return;
    const timer = window.setTimeout(() => {
      document.getElementById("event-details-tabs")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [id, shouldAutoScrollToTabs]);
  
  // Fetch related data
  const { data: guests, refetch: refetchGuests, isLoading: isLoadingGuests, error: guestsError } = useGuests(id);
  const { data: labels } = useLabels(id);
  const { data: perks } = usePerks(id);
  const { data: requests } = useRequests(id);
  const { data: hotelBookings } = useHotelBookings(id);
  const deleteGuest = useDeleteGuest();
  const updateGuest = useUpdateGuest();
  const [updatingLabelForGuest, setUpdatingLabelForGuest] = useState<number | null>(null);
  const labelMap = useMemo(
    () => new Map((labels ?? []).map((l: any) => [l.id, l])),
    [labels]
  );
  const { data: inventoryStatus } = useQuery({
    queryKey: ['inventory-status', id],
    queryFn: async () => {
      const res = await fetch(`/api/events/${id}/inventory/status`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!id,
    staleTime: 30000,
  });
  
  // Debug logging
  console.log('[DEBUG] Event ID:', id);
  console.log('[DEBUG] Guests data:', guests);
  console.log('[DEBUG] Guests loading:', isLoadingGuests);
  console.log('[DEBUG] Guests error:', guestsError);
  
  const [uploading, setUploading] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importedGuests, setImportedGuests] = useState<any[]>([]);
  const [guestSearchTerm, setGuestSearchTerm] = useState("");
  const [guestStatusFilter, setGuestStatusFilter] = useState<"all" | "confirmed" | "declined" | "pending">("all");
  const [guestCategoryFilter, setGuestCategoryFilter] = useState("all");
  
  // Label management state
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelBudget, setNewLabelBudget] = useState(0);
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [showLabelDialog, setShowLabelDialog] = useState(false);

  // Perk management state
  const [newPerkData, setNewPerkData] = useState({
    name: "",
    description: "",
    type: "",
    unitCost: 0,
    baseCost: 0,
    commissionType: "amount",
    commissionValue: 0,
    clientFacingRate: 0,
    pricingType: "requestable"
  });
  const [isAddingPerk, setIsAddingPerk] = useState(false);
  const [showPerkDialog, setShowPerkDialog] = useState(false);
  const [selectedPerkLabelIds, setSelectedPerkLabelIds] = useState<number[]>([]);
  
  // Label-Perk assignment state
  const [selectedLabel, setSelectedLabel] = useState<any>(null);
  const [showAssignPerksDialog, setShowAssignPerksDialog] = useState(false);
  
  // Manual guest creation state
  const [showAddGuestDialog, setShowAddGuestDialog] = useState(false);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [duplicateGuest, setDuplicateGuest] = useState<any | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [newGuestData, setNewGuestData] = useState({
    name: "",
    email: "",
    phone: "",
    category: "",
    dietaryRestrictions: "",
    specialRequests: "",
  });
  
  const [isSeedingItinerary, setIsSeedingItinerary] = useState(false);
  const [isSavingItinerary, setIsSavingItinerary] = useState(false);
  const [editingItineraryId, setEditingItineraryId] = useState<number | null>(null);
  const [itineraryForm, setItineraryForm] = useState({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    location: "",
    capacity: "",
    isMandatory: false,
  });

  // Publish state
  const [isPublishing, setIsPublishing] = useState(false);

  const { data: itineraryEventsData = [], refetch: refetchItinerary } = useQuery({
    queryKey: ["itinerary-events", id],
    queryFn: async () => {
      const res = await fetch(`/api/events/${id}/itinerary`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load itinerary");
      return res.json();
    },
    enabled: !!id,
  });

  const itineraryConflictIds = useMemo(() => {
    const conflicts = new Set<number>();
    const rows = [...(itineraryEventsData as any[])];

    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];
      const aStart = new Date(a.startTime).getTime();
      const aEnd = new Date(a.endTime).getTime();
      if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) continue;

      for (let j = i + 1; j < rows.length; j++) {
        const b = rows[j];
        const bStart = new Date(b.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();
        if (!Number.isFinite(bStart) || !Number.isFinite(bEnd)) continue;

        const overlaps = aStart < bEnd && aEnd > bStart;
        if (overlaps) {
          if (!a.isMandatory) conflicts.add(a.id);
          if (!b.isMandatory) conflicts.add(b.id);
        }
      }
    }

    return conflicts;
  }, [itineraryEventsData]);

  // Microsite appearance state
  const THEME_PRESETS: { value: string; label: string; color: string }[] = [
    { value: "navy",   label: "Navy",   color: "#1B2D5B" },
    { value: "rose",   label: "Rose",   color: "#9B2C2C" },
    { value: "forest", label: "Forest", color: "#1A4731" },
    { value: "slate",  label: "Slate",  color: "#334155" },
    { value: "gold",   label: "Gold",   color: "#92400E" },
    { value: "custom", label: "Custom", color: "" },
  ];
  const [micrositeData, setMicrositeData] = useState({
    coverMediaUrl: (event as any)?.coverMediaUrl ?? "",
    coverMediaType: (event as any)?.coverMediaType ?? "image",
    themePreset: (event as any)?.themePreset ?? "navy",
    themeColor: (event as any)?.themeColor ?? "#1B2D5B",
  });
  const [isSavingMicrosite, setIsSavingMicrosite] = useState(false);

  const normalizeHexColor = (value: string): string => {
    const trimmed = (value ?? "").trim();
    if (!trimmed.startsWith("#")) return "#1B2D5B";
    if (trimmed.length === 4) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    if (trimmed.length === 7) return trimmed;
    return "#1B2D5B";
  };

  const hexToRgb = (hex: string) => {
    const safeHex = normalizeHexColor(hex);
    return {
      r: Number.parseInt(safeHex.slice(1, 3), 16),
      g: Number.parseInt(safeHex.slice(3, 5), 16),
      b: Number.parseInt(safeHex.slice(5, 7), 16),
    };
  };

  const channelToLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const luminance = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
  };

  const contrastRatio = (hexA: string, hexB: string) => {
    const l1 = luminance(hexA);
    const l2 = luminance(hexB);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  const activeThemeColor = micrositeData.themePreset === "custom"
    ? normalizeHexColor(micrositeData.themeColor)
    : (THEME_PRESETS.find((preset) => preset.value === micrositeData.themePreset)?.color || "#1B2D5B");
  const whiteContrast = contrastRatio(activeThemeColor, "#FFFFFF");
  const blackContrast = contrastRatio(activeThemeColor, "#111827");
  const previewTextColor = whiteContrast >= blackContrast ? "#FFFFFF" : "#111827";
  const maxContrast = Math.max(whiteContrast, blackContrast);
  const showCustomContrastWarning = micrositeData.themePreset === "custom" && maxContrast < 5;

  useEffect(() => {
    if (!event) return;
    setMicrositeData({
      coverMediaUrl: (event as any)?.coverMediaUrl ?? "",
      coverMediaType: (event as any)?.coverMediaType ?? "image",
      themePreset: (event as any)?.themePreset ?? "navy",
      themeColor: (event as any)?.themeColor ?? "#1B2D5B",
    });
  }, [event]);

  const handleSaveMicrositeSettings = async () => {
    setIsSavingMicrosite(true);
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(micrositeData),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      toast({ title: "Microsite settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSavingMicrosite(false);
    }
  };

  // Staff account creation state
  const [showStaffDialog, setShowStaffDialog] = useState(false);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [staffData, setStaffData] = useState({ firstName: "", lastName: "", email: "", password: "" });

  const handlePublishEvent = async () => {
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/events/${id}/publish`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to publish event");
      toast({ title: "Event published!", description: "Your event microsite is now live." });
      queryClient.invalidateQueries({ queryKey: [api.events.get.path, id] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCreateStaffAccount = async () => {
    if (!staffData.firstName || !staffData.email || !staffData.password) return;
    setIsCreatingStaff(true);
    try {
      const res = await fetch("/api/groundteam/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...staffData, eventCode: event?.eventCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create account");
      }
      toast({
        title: "Staff account created",
        description: `${staffData.firstName} can sign in at /auth/groundteam/signin`,
      });
      setStaffData({ firstName: "", lastName: "", email: "", password: "" });
      setShowStaffDialog(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      let parsedGuests: any[] = [];
      
      if (file.name.endsWith('.csv')) {
        parsedGuests = await parseCSVFile(file);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        parsedGuests = await parseExcelFile(file);
      } else {
        throw new Error('Unsupported file type. Please upload .csv or .xlsx files.');
      }

      parsedGuests = parsedGuests.filter(g => g.name && g.name.trim() !== '');
      
      setImportedGuests(parsedGuests);
      setShowImportPreview(true);
      toast({ title: "File parsed!", description: `Found ${parsedGuests.length} guests` });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleImportToDatabase = async () => {
    setUploading(true);
    try {
      for (const guest of importedGuests) {
        const res = await fetch(`/api/events/${id}/guests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: guest.name,
            email: guest.email,
            phone: guest.phone ? String(guest.phone) : undefined,
            category: guest.category,
            dietaryRestrictions: guest.dietaryRestrictions,
            specialRequests: guest.specialRequests,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.message || `Failed to import ${guest.name || "guest"}`);
        }
      }

      toast({ title: "Import successful!", description: `${importedGuests.length} guests added` });
      setImportedGuests([]);
      setShowImportPreview(false);
      
      await refetchGuests();
    } catch (error: any) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Label handlers
  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    
    setIsAddingLabel(true);
    try {
      const response = await fetch(`/api/events/${id}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newLabelName, addOnBudget: newLabelBudget }),
      });

      if (!response.ok) throw new Error('Failed to create label');

      toast({ title: "Label created", description: `${newLabelName} has been added` });
      setNewLabelName("");
      setNewLabelBudget(0);
      setShowLabelDialog(false);
      queryClient.invalidateQueries({ queryKey: [api.labels.list.path, id] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAddingLabel(false);
    }
  };

  // Perk handlers
  const handleCreatePerk = async () => {
    if (!newPerkData.name.trim()) return;
    
    setIsAddingPerk(true);
    try {
      const response = await fetch(`/api/events/${id}/perks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...newPerkData }),
      });

      if (!response.ok) throw new Error('Failed to create perk');

      const createdPerk = await response.json();

      if (selectedPerkLabelIds.length > 0) {
        await Promise.all(
          selectedPerkLabelIds.map(async (labelId) => {
            const assignResponse = await fetch(`/api/labels/${labelId}/perks/${createdPerk.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ isEnabled: true, expenseHandledByClient: false }),
            });
            if (!assignResponse.ok) {
              throw new Error('Perk created but failed to assign one or more labels');
            }
          }),
        );
      }
      
      toast({ title: "Perk created", description: `${newPerkData.name} has been added` });
      setNewPerkData({
        name: "",
        description: "",
        type: "",
        unitCost: 0,
        baseCost: 0,
        commissionType: "amount",
        commissionValue: 0,
        clientFacingRate: 0,
        pricingType: "requestable"
      });
      setSelectedPerkLabelIds([]);
      setShowPerkDialog(false);
      queryClient.invalidateQueries({ queryKey: [api.perks.list.path, id] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAddingPerk(false);
    }
  };

  const handleDeleteGuest = async (guestId: number, guestName: string) => {
    if (!confirm(`Are you sure you want to remove ${guestName} from the guest list?`)) {
      return;
    }

    try {
      await deleteGuest.mutateAsync({ id: guestId, eventId: id });
      toast({ 
        title: "Guest removed", 
        description: `${guestName} has been removed from the guest list` 
      });
    } catch (error: any) {
      toast({ 
        title: "Failed to remove guest", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleAddGuest = async () => {
    if (!newGuestData.name.trim() || !newGuestData.email.trim()) {
      toast({ 
        title: "Missing required fields", 
        description: "Name and email are required", 
        variant: "destructive" 
      });
      return;
    }
    
    setIsAddingGuest(true);
    try {
      const makeRequest = async (force = false) => {
        const body: any = {
          name: newGuestData.name,
          email: newGuestData.email,
          phone: newGuestData.phone || undefined,
          category: newGuestData.category || undefined,
          dietaryRestrictions: newGuestData.dietaryRestrictions || undefined,
          specialRequests: newGuestData.specialRequests || undefined,
        };
        if (force) body.force = true;
        return await fetch(`/api/events/${id}/guests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      };

      let response = await makeRequest(false);

      // If duplicate detected (email already exists), show override dialog for user decision
      if (response.status === 409) {
        const payload = await response.json().catch(() => ({}));
        const existing = payload.existing;
        setDuplicateGuest(existing ?? { email: newGuestData.email });
        setShowDuplicateDialog(true);
        setIsAddingGuest(false);
        return;
      }

      if (!response.ok) throw new Error('Failed to add guest');
      
      toast({ 
        title: "Guest added", 
        description: `${newGuestData.name} has been added to the guest list` 
      });
      
      // Reset form
      setNewGuestData({
        name: "",
        email: "",
        phone: "",
        category: "",
        dietaryRestrictions: "",
        specialRequests: "",
      });
      setShowAddGuestDialog(false);
      
      // Refresh guest list
      await refetchGuests();
    } catch (error: any) {
      toast({ 
        title: "Failed to add guest", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setIsAddingGuest(false);
    }
  };

  const handleSeedItinerary = async () => {
    if (isSeedingItinerary) return; // prevent duplicate submissions from rapid clicks
    setIsSeedingItinerary(true);
    try {
      const response = await fetch(`/api/events/${id}/seed-itinerary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to seed itinerary');
      
      const result = await response.json();
      
      toast({ 
        title: "Itinerary seeded!", 
        description: `Added ${result.count} sample events with deliberate conflicts for testing`,
      });
    } catch (error: any) {
      toast({ 
        title: "Failed to seed itinerary", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setIsSeedingItinerary(false);
    }
  };

  const resetItineraryForm = () => {
    setEditingItineraryId(null);
    setItineraryForm({
      title: "",
      description: "",
      startTime: "",
      endTime: "",
      location: "",
      capacity: "",
      isMandatory: false,
    });
  };

  const handleEditItinerary = (item: any) => {
    setEditingItineraryId(item.id);
    setItineraryForm({
      title: item.title ?? "",
      description: item.description ?? "",
      startTime: item.startTime ? format(new Date(item.startTime), "yyyy-MM-dd'T'HH:mm") : "",
      endTime: item.endTime ? format(new Date(item.endTime), "yyyy-MM-dd'T'HH:mm") : "",
      location: item.location ?? "",
      capacity: item.capacity ? String(item.capacity) : "",
      isMandatory: !!item.isMandatory,
    });
  };

  const handleSaveItinerary = async () => {
    if (!itineraryForm.title || !itineraryForm.startTime || !itineraryForm.endTime) {
      toast({ title: "Missing fields", description: "Title, start time and end time are required.", variant: "destructive" });
      return;
    }

    if (new Date(itineraryForm.endTime) <= new Date(itineraryForm.startTime)) {
      toast({ title: "Invalid time range", description: "End time must be after start time.", variant: "destructive" });
      return;
    }

    setIsSavingItinerary(true);
    try {
      const url = editingItineraryId
        ? `/api/events/${id}/itinerary/${editingItineraryId}`
        : `/api/events/${id}/itinerary`;
      const method = editingItineraryId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: itineraryForm.title,
          description: itineraryForm.description || null,
          startTime: itineraryForm.startTime,
          endTime: itineraryForm.endTime,
          location: itineraryForm.location || null,
          capacity: itineraryForm.capacity ? Number(itineraryForm.capacity) : null,
          isMandatory: itineraryForm.isMandatory,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to save itinerary event" }));
        throw new Error(err.message || "Failed to save itinerary event");
      }

      toast({ title: editingItineraryId ? "Itinerary event updated" : "Itinerary event created" });
      resetItineraryForm();
      await refetchItinerary();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSavingItinerary(false);
    }
  };

  const handleDeleteItinerary = async (itemId: number) => {
    try {
      const res = await fetch(`/api/events/${id}/itinerary/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete itinerary event" }));
        throw new Error(err.message || "Failed to delete itinerary event");
      }
      toast({ title: "Itinerary event deleted" });
      if (editingItineraryId === itemId) resetItineraryForm();
      await refetchItinerary();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDownloadManifest = async () => {
    try {
      const res = await fetch(`/api/events/${id}/manifest`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to generate manifest");
      const data = await res.json();
      exportManifestToExcel(data.guests, data.eventName);
      toast({ title: "Manifest downloaded!", description: `${data.guests.length} guests exported` });
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  };

  const handleDownloadReport = () => {
    try {
      generateEventReport({
        event,
        guests: guests || [],
        labels: labels || [],
        perks: perks || [],
        requests: requests || [],
        hotelBookings: hotelBookings || [],
      });
      toast({ 
        title: "Report downloaded!", 
        description: "Your event report has been saved" 
      });
    } catch (error: any) {
      toast({ 
        title: "Download failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleAssignPerksToLabel = async (labelId: number, perkId: number, isEnabled: boolean) => {
    try {
      const response = await fetch(`/api/labels/${labelId}/perks/${perkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isEnabled, expenseHandledByClient: false }),
      });

      if (!response.ok) throw new Error('Failed to update perk assignment');
      
      toast({ title: "Updated", description: "Perk assignment updated" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const allGuests = (guests ?? []) as any[];
  const pendingRequestsCount = (requests ?? []).filter((r: any) => r.status === 'pending').length;

  const guestCategories = useMemo(() => {
    return Array.from(
      new Set(
        allGuests
          .map((guest: any) => guest.category?.trim())
          .filter((category: string | undefined): category is string => !!category),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [allGuests]);

  const filteredGuests = useMemo(() => {
    const query = guestSearchTerm.trim().toLowerCase();
    return allGuests.filter((guest: any) => {
      const normalizedStatus =
        guest.status === "arrived"
          ? "confirmed"
          : guest.status === "no_show"
            ? "declined"
            : (guest.status ?? "pending");

      const statusMatch = guestStatusFilter === "all" || normalizedStatus === guestStatusFilter;
      const categoryMatch = guestCategoryFilter === "all" || (guest.category?.trim() ?? "") === guestCategoryFilter;
      const searchMatch =
        query.length === 0 ||
        guest.name?.toLowerCase().includes(query) ||
        guest.email?.toLowerCase().includes(query) ||
        String(guest.phone ?? "").toLowerCase().includes(query);

      return statusMatch && categoryMatch && searchMatch;
    });
  }, [allGuests, guestCategoryFilter, guestSearchTerm, guestStatusFilter]);

  const hasGuestFilters =
    guestSearchTerm.trim().length > 0 || guestStatusFilter !== "all" || guestCategoryFilter !== "all";

  if (isEventLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!event) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
          <p className="text-2xl font-serif text-muted-foreground">Event not found</p>
          <p className="text-sm text-muted-foreground">This event may have been removed or you may not have access.</p>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <div className="border-b border-border/50 pb-6">
          <div className="mb-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <div className="text-sm text-accent-foreground/80 font-medium mb-1 uppercase tracking-wider">Event Dashboard</div>
              <h1 className="text-4xl font-serif text-primary mb-2">{event.name}</h1>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{formatEventDateRange(event.date, (event as any).endDate)}</span>
                <span>•</span>
                <span>{event.location}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Event Code:</span>
                <code className="text-sm font-mono font-bold bg-primary/10 text-primary px-3 py-1 rounded-md border border-primary/20">
                  {event.eventCode}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(event.eventCode);
                    toast({ title: "Copied!", description: "Event code copied to clipboard" });
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="text-left md:text-right md:mt-1">
              <div className="text-2xl font-serif font-bold text-primary">{guests?.length || 0}</div>
              <div className="text-xs text-muted-foreground uppercase">Guests</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadReport}
              className="gap-2"
            >
              <FileDown className="w-4 h-4" />
              Download Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeedItinerary}
              disabled={isSeedingItinerary}
              className="gap-2"
            >
              {isSeedingItinerary ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <Settings className="w-4 h-4" />
                  Add Demo Events
                </>
              )}
            </Button>
            {/* Edit Setup button - agent only */}
            {isAgent && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/events/${id}/setup`)}
                className="gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit Setup
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => navigate(`/events/${id}/preview`)}
              className="gap-2"
            >
              <Eye className="w-4 h-4" />
              Preview Event
            </Button>
            {/* Publish button - agent only */}
            {isAgent && !event.isPublished && (
              <Button
                size="sm"
                variant="default"
                onClick={handlePublishEvent}
                disabled={isPublishing}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {isPublishing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4" />
                )}
                Publish Event
              </Button>
            )}
            {/* Published status badge - visible to all */}
            {event.isPublished && (
              <>
                <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-md font-medium">
                  <Globe className="w-3.5 h-3.5" /> Published
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/event/${event.eventCode}`);
                    toast({ title: "Link copied!", description: `Invite link for ${event.eventCode} copied to clipboard` });
                  }}
                >
                  <Copy className="w-3 h-3" /> Copy invite link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 font-mono text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(event.eventCode);
                    toast({ title: "Event code copied!", description: event.eventCode });
                  }}
                >
                  <Copy className="w-3 h-3" /> {event.eventCode}
                </Button>
              </>
            )}
            {/* Add Staff button - agent only */}
            {isAgent && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowStaffDialog(true)}
                className="gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Staff
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Create Staff Account Dialog */}
      <Dialog open={showStaffDialog} onOpenChange={setShowStaffDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Ground Team Account</DialogTitle>
            <DialogDescription>
              Create a sign-in account for on-site event staff. They will be scoped to this event only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="staffFirst">First Name *</Label>
                <Input
                  id="staffFirst"
                  placeholder="First name"
                  value={staffData.firstName}
                  onChange={(e) => setStaffData({ ...staffData, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staffLast">Last Name</Label>
                <Input
                  id="staffLast"
                  placeholder="Last name"
                  value={staffData.lastName}
                  onChange={(e) => setStaffData({ ...staffData, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staffEmail">Email *</Label>
              <Input
                id="staffEmail"
                type="email"
                placeholder="staff@example.com"
                value={staffData.email}
                onChange={(e) => setStaffData({ ...staffData, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staffPass">Password *</Label>
              <Input
                id="staffPass"
                type="password"
                placeholder="Min. 6 characters"
                value={staffData.password}
                onChange={(e) => setStaffData({ ...staffData, password: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Staff will sign in at <code className="bg-muted px-1 rounded">/auth/groundteam/signin</code> and will be automatically directed to this event's check-in dashboard.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStaffDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreateStaffAccount}
              disabled={isCreatingStaff || !staffData.firstName || !staffData.email || !staffData.password}
            >
              {isCreatingStaff ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</> : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
          {/* Duplicate Guest Override Dialog */}
          <Dialog open={showDuplicateDialog} onOpenChange={(open) => { if (!open) { setShowDuplicateDialog(false); setDuplicateGuest(null); } }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Duplicate Guest Detected</DialogTitle>
                <DialogDescription>
                  A guest with this email already exists — choose to use the existing record or create a new one anyway.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-4">
                <div>
                  <Label>Name</Label>
                  <div className="text-sm">{duplicateGuest?.name ?? "—"}</div>
                </div>
                <div>
                  <Label>Email</Label>
                  <div className="text-sm">{duplicateGuest?.email}</div>
                </div>
                <div>
                  <Label>Booking ref</Label>
                  <div className="text-sm">{duplicateGuest?.bookingRef ?? "—"}</div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowDuplicateDialog(false); setDuplicateGuest(null); toast({ title: "Using existing guest", description: "No new guest was created." }); }}>
                  Use Existing
                </Button>
                <Button onClick={async () => {
                  setShowDuplicateDialog(false);
                  setIsAddingGuest(true);
                  try {
                    const body: any = {
                      name: newGuestData.name,
                      email: newGuestData.email,
                      phone: newGuestData.phone || undefined,
                      category: newGuestData.category || undefined,
                      dietaryRestrictions: newGuestData.dietaryRestrictions || undefined,
                      specialRequests: newGuestData.specialRequests || undefined,
                      force: true,
                    };
                    const response = await fetch(`/api/events/${id}/guests`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify(body),
                    });
                    if (!response.ok) {
                      const err = await response.json().catch(() => ({}));
                      throw new Error(err?.message || 'Failed to add guest');
                    }
                    toast({ title: "Guest added", description: `${newGuestData.name} has been added to the guest list` });
                    setNewGuestData({ name: "", email: "", phone: "", category: "", dietaryRestrictions: "", specialRequests: "" });
                    setShowAddGuestDialog(false);
                    await refetchGuests();
                  } catch (error: any) {
                    toast({ title: "Failed to add guest", description: error.message, variant: "destructive" });
                  } finally {
                    setIsAddingGuest(false);
                    setDuplicateGuest(null);
                  }
                }}>
                  Create Anyway
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

      {/* Capacity Alert */}
      {hotelBookings && hotelBookings.length > 0 && (
        <CapacityAlert 
          totalRooms={hotelBookings.reduce((sum: number, booking: any) => sum + (booking.numberOfRooms || 0), 0)}
          totalGuests={guests?.length || 0}
          className="mb-6"
        />
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-border/50 shadow-sm">
          <div className="text-muted-foreground text-xs uppercase mb-1">Total Guests</div>
          <div className="text-2xl font-serif text-primary">{guests?.length || 0}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-border/50 shadow-sm">
          <div className="text-muted-foreground text-xs uppercase mb-1">Pending Requests</div>
          <div className="text-2xl font-serif text-accent-foreground">{pendingRequestsCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-border/50 shadow-sm">
          <div className="text-muted-foreground text-xs uppercase mb-1">VIP Labels</div>
          <div className="text-2xl font-serif text-primary">{labels?.length || 0}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-border/50 shadow-sm">
          <div className="text-muted-foreground text-xs uppercase mb-1">Active Perks</div>
          <div className="text-2xl font-serif text-primary">{perks?.length || 0}</div>
        </div>
      </div>

      <div className="mb-8">
        <RsvpBreakdownCard guests={allGuests} title="RSVP Breakdown" />
      </div>

      {/* Quick Actions */}
      <div className="mb-6 bg-gradient-to-r from-primary/5 to-accent/5 p-4 rounded-xl border border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm mb-1">Quick Actions</h3>
            <p className="text-xs text-muted-foreground">Manage your event settings</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/events/${id}/approval`)}
              className="gap-2 relative"
            >
              <CheckSquare className="w-4 h-4" />
              Review & Payment
              {(requests ?? []).filter((r: any) => r.status === 'pending').length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {(requests ?? []).filter((r: any) => r.status === 'pending').length}
                </span>
              )}
            </Button>
            {/* Add Label - agent only (clients can view/toggle but not create) */}
            {isAgent && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLabelDialog(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Label
              </Button>
            )}
            {/* Add Perk - agent only (clients can view/toggle but not create) */}
            {isAgent && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPerkDialog(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Perk
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* Capacity Alert (single instance shown above) - removed duplicate */}
      {/* Tabs */}
      <div id="event-details-tabs">
      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className="bg-white border border-border/50 p-1 mb-6 rounded-xl flex-wrap">
          <TabsTrigger value="guests" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">Guests</TabsTrigger>
          <TabsTrigger value="labels" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">Labels & Permissions</TabsTrigger>
          <TabsTrigger value="perks" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">Perks & Add-ons</TabsTrigger>
          <TabsTrigger value="itinerary" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">Itinerary</TabsTrigger>
          <TabsTrigger value="requests" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">Requests</TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />Inventory
          </TabsTrigger>
          <TabsTrigger value="microsite" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
            <Globe className="w-3.5 h-3.5 mr-1.5" />Microsite
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guests" className="space-y-4">
          {/* Import Section */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Download Template
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={generateGuestListTemplate} variant="outline" className="w-full">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel Template
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Import Guests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} disabled={uploading} />
                {uploading && <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Processing...</div>}
              </CardContent>
            </Card>

            <Card className="border-emerald-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileDown className="w-4 h-4 text-emerald-600" />
                  Ground Team Manifest
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={handleDownloadManifest} variant="outline" className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                  <Download className="w-4 h-4 mr-2" />
                  Download Manifest
                </Button>
                <p className="text-xs text-muted-foreground mt-2">Full Excel with PNR, meal, room, emergency contacts</p>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          {showImportPreview && importedGuests.length > 0 && (
            <Card className="border-primary">
              <CardHeader>
                <CardTitle className="text-base">Preview ({importedGuests.length} guests)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-48 overflow-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Name</th>
                        <th className="p-2 text-left">Email</th>
                        <th className="p-2 text-left">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importedGuests.map((g, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2">{g.name}</td>
                          <td className="p-2 text-muted-foreground">{g.email}</td>
                          <td className="p-2"><span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">{g.category || 'General'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setImportedGuests([]); setShowImportPreview(false); }}>Cancel</Button>
                  <Button size="sm" onClick={handleImportToDatabase} disabled={uploading}>
                    {uploading ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Importing...</> : `Import ${importedGuests.length}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="bg-white rounded-2xl border border-border/50 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border/50 bg-muted/20 space-y-3">
              <div className="flex justify-between items-center gap-3">
                <h3 className="font-medium">Guest List ({filteredGuests.length}{hasGuestFilters ? ` / ${allGuests.length}` : ""})</h3>
                <Button size="sm" onClick={() => setShowAddGuestDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Guest
                </Button>
              </div>

              <div className="grid md:grid-cols-2 gap-2">
                <Input
                  placeholder="Search by name, email, or phone"
                  value={guestSearchTerm}
                  onChange={(e) => setGuestSearchTerm(e.target.value)}
                />
                <div className="flex items-center gap-2 flex-wrap md:justify-end">
                  {(["all", "confirmed", "declined", "pending"] as const).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={guestStatusFilter === status ? "default" : "outline"}
                      onClick={() => setGuestStatusFilter(status)}
                      className="capitalize"
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={guestCategoryFilter === "all" ? "default" : "outline"}
                  onClick={() => setGuestCategoryFilter("all")}
                >
                  All categories
                </Button>
                {guestCategories.map((category) => (
                  <Button
                    key={category}
                    size="sm"
                    variant={guestCategoryFilter === category ? "default" : "outline"}
                    onClick={() => setGuestCategoryFilter(category)}
                  >
                    {category}
                  </Button>
                ))}
                {hasGuestFilters && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setGuestSearchTerm("");
                      setGuestStatusFilter("all");
                      setGuestCategoryFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
            <div className="divide-y divide-border/50">
              {filteredGuests.map(guest => (
                <div key={guest.id} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                  <div className="flex-1">
                    <div className="font-medium text-primary">{guest.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {guest.email && <span>{guest.email}</span>}
                      {guest.phone && <span> • {guest.phone}</span>}
                    </div>
                    {guest.category && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">{guest.category}</span>
                    )}
                    {guest.status && (
                      <span className={`inline-block mt-1 ml-2 px-2 py-0.5 rounded text-xs ${
                        guest.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        guest.status === 'declined' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {guest.status}
                      </span>
                    )}
                    {/* Label badge + inline assignment */}
                    {(labels && labels.length > 0) && (
                      guest.labelId ? (
                        <select
                          className="inline-block mt-1 ml-2 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer"
                          value={guest.labelId}
                          disabled={updatingLabelForGuest === guest.id}
                          onChange={async (e) => {
                            const newLabelId = e.target.value ? Number(e.target.value) : null;
                            setUpdatingLabelForGuest(guest.id);
                            try {
                              await updateGuest.mutateAsync({ id: guest.id, eventId: id, labelId: newLabelId as any });
                            } finally {
                              setUpdatingLabelForGuest(null);
                            }
                          }}
                        >
                          {(labels as any[]).map((l: any) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          className="inline-block mt-1 ml-2 px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground border border-border cursor-pointer"
                          value=""
                          disabled={updatingLabelForGuest === guest.id}
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            const newLabelId = Number(e.target.value);
                            setUpdatingLabelForGuest(guest.id);
                            try {
                              await updateGuest.mutateAsync({ id: guest.id, eventId: id, labelId: newLabelId as any });
                            } finally {
                              setUpdatingLabelForGuest(null);
                            }
                          }}
                        >
                          <option value="">Assign label…</option>
                          {(labels as any[]).map((l: any) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      )
                    )}
                    {getSelfPaidLabels(guest).map((selfPaidLabel) => (
                      <span key={`${guest.id}-${selfPaidLabel}`} className="inline-block mt-1 ml-2 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                        {selfPaidLabel}
                      </span>
                    ))}
                    {guest.selectedHotelBookingId && (() => {
                      const hb = (hotelBookings || []).find((b: any) => b.id === guest.selectedHotelBookingId);
                      return hb ? (
                        <span className="inline-block mt-1 ml-2 px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                          🏨 {hb.hotelName}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <GuestLinkManager guest={guest} />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteGuest(guest.id, guest.name)}
                      disabled={deleteGuest.isPending}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredGuests.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>{allGuests.length === 0 ? "No guests yet. Upload an Excel file to import." : "No guests match current filters."}</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Add Guest Dialog */}
          <Dialog open={showAddGuestDialog} onOpenChange={setShowAddGuestDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Guest</DialogTitle>
                <DialogDescription>
                  Manually add a single guest to the event
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="guestName">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="guestName"
                    placeholder="Full name"
                    value={newGuestData.name}
                    onChange={(e) => setNewGuestData({ ...newGuestData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guestEmail">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="guestEmail"
                    type="email"
                    placeholder="email@example.com"
                    value={newGuestData.email}
                    onChange={(e) => setNewGuestData({ ...newGuestData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guestPhone">Phone</Label>
                  <Input
                    id="guestPhone"
                    placeholder="Phone number"
                    value={newGuestData.phone}
                    onChange={(e) => setNewGuestData({ ...newGuestData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guestCategory">Category</Label>
                  <Input
                    id="guestCategory"
                    placeholder="e.g., VIP, General, Family"
                    value={newGuestData.category}
                    onChange={(e) => setNewGuestData({ ...newGuestData, category: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guestDietary">Dietary Restrictions</Label>
                  <Input
                    id="guestDietary"
                    placeholder="e.g., Vegetarian, Gluten-free"
                    value={newGuestData.dietaryRestrictions}
                    onChange={(e) => setNewGuestData({ ...newGuestData, dietaryRestrictions: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guestRequests">Special Requests</Label>
                  <Input
                    id="guestRequests"
                    placeholder="Any special accommodations"
                    value={newGuestData.specialRequests}
                    onChange={(e) => setNewGuestData({ ...newGuestData, specialRequests: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddGuestDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddGuest} 
                  disabled={isAddingGuest || !newGuestData.name.trim() || !newGuestData.email.trim()}
                >
                  {isAddingGuest ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Guest"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="labels" className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-sans font-medium">Guest Labels & Permissions</h3>
              <p className="text-sm text-muted-foreground">{isAgent ? "Create categories and assign perks to each label" : "View and manage perk coverage for each label"}</p>
            </div>
            {/* Add Label dialog - agent only for creation */}
            {isAgent && (
              <Dialog open={showLabelDialog} onOpenChange={setShowLabelDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Label
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Label</DialogTitle>
                  <DialogDescription>
                    Create a category for your guests (e.g., VIP, Staff, Friend, Family)
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="labelName">Label Name</Label>
                    <Input
                      id="labelName"
                      placeholder="e.g., VIP Guest"
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="labelBudget">Add-on Budget (₹ per guest)</Label>
                    <Input
                      id="labelBudget"
                      type="number"
                      min={0}
                      placeholder="e.g., 5000"
                      value={newLabelBudget || ""}
                      onChange={(e) => setNewLabelBudget(Number(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Amount guests in this tier can spend on requestable add-ons. 0 = no discretionary budget.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowLabelDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateLabel} disabled={isAddingLabel || !newLabelName.trim()}>
                    {isAddingLabel ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create Label"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            )}
          </div>

          <div className="grid gap-4">
            {labels?.map((label: any) => (
              <Card key={label.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{label.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {label.addOnBudget > 0
                          ? `Add-on budget: ₹${label.addOnBudget.toLocaleString()} per guest`
                          : "No discretionary add-on budget"}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedLabel(label);
                        setShowAssignPerksDialog(true);
                      }}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Assign Perks
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}

            {labels?.length === 0 && (
              <div className="bg-white rounded-2xl border border-border/50 p-8 text-center">
                <Tag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium">No Labels Yet</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  Create labels to categorize your guests and control their access to perks.
                </p>
              </div>
            )}
          </div>

          {/* Assign Perks Dialog */}
          <Dialog open={showAssignPerksDialog} onOpenChange={setShowAssignPerksDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Assign Perks to {selectedLabel?.name}</DialogTitle>
                <DialogDescription>
                  Select which perks guests with this label can see and request
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 max-h-96 overflow-y-auto py-4">
                {perks?.map(perk => (
                  <div key={perk.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{perk.name}</div>
                      <div className="text-sm text-muted-foreground">{perk.description}</div>
                      {perk.type && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                          {perk.type}
                        </span>
                      )}
                    </div>
                    <Checkbox
                      onCheckedChange={(checked) => handleAssignPerksToLabel(selectedLabel?.id, perk.id, !!checked)}
                    />
                  </div>
                ))}
                {perks?.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No perks available. Create perks first in the Perks & Add-ons tab.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
        
        <TabsContent value="perks" className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-medium">Perks & Add-ons</h3>
              <p className="text-sm text-muted-foreground">{isAgent ? "Define services guests can request" : "View available perks for this event"}</p>
            </div>
            {/* Add Perk dialog - agent only for creation */}
            {isAgent && (
              <Dialog open={showPerkDialog} onOpenChange={setShowPerkDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Perk
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Perk</DialogTitle>
                  <DialogDescription>
                    Add a service or amenity that guests can request
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="perkName">Perk Name</Label>
                    <Input
                      id="perkName"
                      placeholder="e.g., Airport Pickup"
                      value={newPerkData.name}
                      onChange={(e) => setNewPerkData({ ...newPerkData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="perkDescription">Description</Label>
                    <Input
                      id="perkDescription"
                      placeholder="e.g., Complimentary airport transfer service"
                      value={newPerkData.description}
                      onChange={(e) => setNewPerkData({ ...newPerkData, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="perkType">Type</Label>
                    <Input
                      id="perkType"
                      placeholder="e.g., transport, accommodation, meal, activity"
                      value={newPerkData.type}
                      onChange={(e) => setNewPerkData({ ...newPerkData, type: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="perkBaseCost">Base Cost (₹)</Label>
                    <Input
                      id="perkBaseCost"
                      type="number"
                      min={0}
                      placeholder="e.g., 1500"
                      value={newPerkData.baseCost || ""}
                      onChange={(e) => {
                        const baseCost = Number(e.target.value) || 0;
                        const commission = newPerkData.commissionType === "percentage"
                          ? Math.round((baseCost * (newPerkData.commissionValue || 0)) / 100)
                          : (newPerkData.commissionValue || 0);
                        const clientRate = Math.max(baseCost + commission, 0);
                        setNewPerkData({ ...newPerkData, baseCost, clientFacingRate: clientRate, unitCost: clientRate });
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Base supplier cost before commission</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="perkCommissionType">Commission Type</Label>
                      <select
                        id="perkCommissionType"
                        className="flex h-10 w-full rounded-md border border-input bg-white text-gray-900 px-3 py-2 text-sm"
                        value={newPerkData.commissionType}
                        onChange={(e) => {
                          const commissionType = e.target.value;
                          const baseCost = newPerkData.baseCost || 0;
                          const commission = commissionType === "percentage"
                            ? Math.round((baseCost * (newPerkData.commissionValue || 0)) / 100)
                            : (newPerkData.commissionValue || 0);
                          const clientRate = Math.max(baseCost + commission, 0);
                          setNewPerkData({ ...newPerkData, commissionType, clientFacingRate: clientRate, unitCost: clientRate });
                        }}
                      >
                        <option value="amount">Amount (₹)</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="perkCommissionValue">Commission Value</Label>
                      <Input
                        id="perkCommissionValue"
                        type="number"
                        min={0}
                        placeholder={newPerkData.commissionType === "percentage" ? "e.g., 12" : "e.g., 400"}
                        value={newPerkData.commissionValue || ""}
                        onChange={(e) => {
                          const commissionValue = Number(e.target.value) || 0;
                          const baseCost = newPerkData.baseCost || 0;
                          const commission = newPerkData.commissionType === "percentage"
                            ? Math.round((baseCost * commissionValue) / 100)
                            : commissionValue;
                          const clientRate = Math.max(baseCost + commission, 0);
                          setNewPerkData({ ...newPerkData, commissionValue, clientFacingRate: clientRate, unitCost: clientRate });
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Client/guest visible edited rate is calculated and stored; not shown to agent cards.</p>
                  <div>
                    <Label htmlFor="perkPricingType">Pricing Type</Label>
                    <select
                      id="perkPricingType"
                      className="flex h-10 w-full rounded-md border border-input bg-white text-gray-900 px-3 py-2 text-sm"
                      value={newPerkData.pricingType}
                      onChange={(e) => setNewPerkData({ ...newPerkData, pricingType: e.target.value })}
                    >
                      <option value="included">Included — host covers, no budget deduction</option>
                      <option value="requestable">Requestable — deducted from guest's add-on budget</option>
                      <option value="self_pay">Self-pay — guest pays directly</option>
                    </select>
                  </div>

                  <div>
                    <Label>Enable for Labels</Label>
                    <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                      {labels && labels.length > 0 ? labels.map((label: any) => {
                        const checked = selectedPerkLabelIds.includes(label.id);
                        return (
                          <label key={label.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                const isChecked = !!value;
                                setSelectedPerkLabelIds((prev) =>
                                  isChecked
                                    ? Array.from(new Set([...prev, label.id]))
                                    : prev.filter((id) => id !== label.id),
                                );
                              }}
                            />
                            <span>{label.name}</span>
                          </label>
                        );
                      }) : (
                        <p className="text-xs text-muted-foreground">No labels yet. Create labels first, or assign this perk later.</p>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowPerkDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreatePerk} disabled={isAddingPerk || !newPerkData.name.trim()}>
                    {isAddingPerk ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create Perk"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            )}
          </div>

          <div className="grid gap-4">
            {perks?.map((perk: any) => (
              <Card key={perk.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{perk.name}</CardTitle>
                      <CardDescription>{perk.description}</CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                      {(perk.baseCost || perk.commissionValue) ? (
                        <span className="text-xs text-muted-foreground text-right">
                          Base ₹{(perk.baseCost ?? 0).toLocaleString("en-IN")} + {perk.commissionType === "percentage" ? `${perk.commissionValue ?? 0}%` : `₹${(perk.commissionValue ?? 0).toLocaleString("en-IN")}`} commission
                        </span>
                      ) : perk.unitCost > 0 ? (
                        <span className="text-xs text-muted-foreground">Cost configured</span>
                      ) : null}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        perk.pricingType === "included" ? "bg-green-100 text-green-700" :
                        perk.pricingType === "self_pay" ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {perk.pricingType === "included" ? "Included" :
                         perk.pricingType === "self_pay" ? "Self-pay" : "Requestable"}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {perk.type && (
                  <CardContent>
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
                      {perk.type}
                    </span>
                  </CardContent>
                )}
              </Card>
            ))}

            {perks?.length === 0 && (
              <div className="bg-white rounded-2xl border border-border/50 p-8 text-center">
                <Gift className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium">No Perks Yet</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  Create perks like Airport Pickup, Spa Treatments, or Room Upgrades for your guests.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="itinerary" className="space-y-4">
          {/* Manage Itinerary Card - agent only for creating/editing */}
          {isAgent && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Manage Itinerary</CardTitle>
                <CardDescription>
                  Create and edit the event schedule. Changes reflect in guest itinerary automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Title *</Label>
                    <Input
                      value={itineraryForm.title}
                      onChange={(e) => setItineraryForm({ ...itineraryForm, title: e.target.value })}
                      placeholder="e.g. Welcome Dinner"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Location</Label>
                    <Input
                      value={itineraryForm.location}
                      onChange={(e) => setItineraryForm({ ...itineraryForm, location: e.target.value })}
                      placeholder="e.g. Grand Ballroom"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start Time *</Label>
                    <Input
                      type="datetime-local"
                      value={itineraryForm.startTime}
                      onChange={(e) => setItineraryForm({ ...itineraryForm, startTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Time *</Label>
                    <Input
                      type="datetime-local"
                      value={itineraryForm.endTime}
                      onChange={(e) => setItineraryForm({ ...itineraryForm, endTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Capacity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={itineraryForm.capacity}
                      onChange={(e) => setItineraryForm({ ...itineraryForm, capacity: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-7">
                    <Checkbox
                      id="itinerary-mandatory"
                      checked={itineraryForm.isMandatory}
                      onCheckedChange={(checked) => setItineraryForm({ ...itineraryForm, isMandatory: !!checked })}
                    />
                    <Label htmlFor="itinerary-mandatory">Mandatory event</Label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input
                    value={itineraryForm.description}
                    onChange={(e) => setItineraryForm({ ...itineraryForm, description: e.target.value })}
                    placeholder="Optional details"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={handleSaveItinerary} disabled={isSavingItinerary}>
                    {isSavingItinerary ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {editingItineraryId ? "Update Event" : "Add Event"}
                  </Button>
                  {editingItineraryId && (
                    <Button variant="outline" onClick={resetItineraryForm}>Cancel Edit</Button>
                  )}
                  <Button variant="outline" onClick={handleSeedItinerary} disabled={isSeedingItinerary}>
                    {isSeedingItinerary ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Add Demo Events
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scheduled Events ({itineraryEventsData.length})</CardTitle>
              {itineraryConflictIds.size > 0 && (
                <CardDescription className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {itineraryConflictIds.size} event{itineraryConflictIds.size > 1 ? "s" : ""} have schedule conflicts
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {itineraryEventsData.length === 0 ? (
                <div className="text-sm text-muted-foreground">No itinerary events yet.</div>
              ) : (
                <div className="space-y-3">
                  {[...itineraryEventsData]
                    .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                    .map((item: any) => {
                      const hasConflict = itineraryConflictIds.has(item.id);
                      return (
                      <div key={item.id} className={`rounded-lg border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${hasConflict ? "border-amber-300 bg-amber-50/40" : ""}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{item.title}</p>
                            {item.isMandatory && <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">Mandatory</span>}
                            {hasConflict && <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">Conflict</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(item.startTime), "PPP p")} → {format(new Date(item.endTime), "PPP p")}
                          </p>
                          {item.location && <p className="text-xs text-muted-foreground">{item.location}</p>}
                          {item.description && <p className="text-sm mt-1">{item.description}</p>}
                        </div>
                        {/* Edit/Delete buttons - agent only */}
                        {isAgent && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => handleEditItinerary(item)}>
                              <Edit className="w-3.5 h-3.5 mr-1.5" /> Edit
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDeleteItinerary(item.id)}>
                              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                            </Button>
                          </div>
                        )}
                      </div>
                    )})}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <div className="bg-white rounded-2xl border border-border/50 p-8 text-center">
            <Inbox className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Guest Requests</h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">Review and approve special requests from guests.</p>
          </div>
        </TabsContent>

        {/* ── Inventory Tab ── */}
        <TabsContent value="inventory" className="space-y-4">
          {/* EWS — Inventory Early Warning System */}
          {inventoryStatus && (
            <>
              {inventoryStatus.hotelAlerts?.filter((a: any) => a.severity !== "ok").map((alert: any, i: number) => (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-lg border ${alert.severity === "critical" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${alert.severity === "critical" ? "text-red-600" : "text-amber-600"}`} />
                  <div>
                    <p className={`font-semibold text-sm ${alert.severity === "critical" ? "text-red-800" : "text-amber-800"}`}>
                      {alert.hotelName} — {alert.utilizationPct}% utilized
                    </p>
                    <p className={`text-xs mt-0.5 ${alert.severity === "critical" ? "text-red-700" : "text-amber-700"}`}>{alert.message}</p>
                  </div>
                </div>
              ))}
              {inventoryStatus.flightAlerts?.filter((a: any) => a.severity !== "ok").map((alert: any, i: number) => (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-lg border ${alert.severity === "critical" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${alert.severity === "critical" ? "text-red-600" : "text-amber-600"}`} />
                  <div>
                    <p className={`font-semibold text-sm ${alert.severity === "critical" ? "text-red-800" : "text-amber-800"}`}>
                      Flight Block — {alert.utilizationPct}% utilized
                    </p>
                    <p className={`text-xs mt-0.5 ${alert.severity === "critical" ? "text-red-700" : "text-amber-700"}`}>{alert.message}</p>
                  </div>
                </div>
              ))}
            </>
          )}
          <InventoryTab eventId={id} />
        </TabsContent>

        {/* ── Microsite Appearance Tab ── */}
        <TabsContent value="microsite" className="space-y-6 max-w-2xl">
          <div>
            <h3 className="text-lg font-medium mb-1">Microsite Appearance</h3>
            <p className="text-sm text-muted-foreground">
              Customise how your event invite page looks at <code className="text-xs bg-muted px-1 rounded">/event/{event?.eventCode}</code>
            </p>
          </div>

          {/* Cover Media */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cover Image / Video</CardTitle>
              <CardDescription>Displayed as a full-width hero behind the event title</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <button
                  className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${micrositeData.coverMediaType === "image" ? "bg-primary text-white border-primary" : "border-input"}`}
                  onClick={() => setMicrositeData({ ...micrositeData, coverMediaType: "image" })}
                >
                  Image
                </button>
                <button
                  className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${micrositeData.coverMediaType === "video" ? "bg-primary text-white border-primary" : "border-input"}`}
                  onClick={() => setMicrositeData({ ...micrositeData, coverMediaType: "video" })}
                >
                  Video
                </button>
              </div>
              <div>
                <Label htmlFor="coverMediaUrl">
                  {micrositeData.coverMediaType === "video" ? "Video URL (MP4, WebM)" : "Image URL"}
                </Label>
                <Input
                  id="coverMediaUrl"
                  placeholder={micrositeData.coverMediaType === "video" ? "https://example.com/event-video.mp4" : "https://example.com/event-cover.jpg"}
                  value={micrositeData.coverMediaUrl}
                  onChange={(e) => setMicrositeData({ ...micrositeData, coverMediaUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Leave blank for a solid-color hero</p>
              </div>
              {micrositeData.coverMediaUrl && micrositeData.coverMediaType === "image" && (
                <img
                  src={micrositeData.coverMediaUrl}
                  alt="Cover preview"
                  className="w-full h-32 object-cover rounded-lg border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </CardContent>
          </Card>

          {/* Theme Color */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Theme Colour</CardTitle>
              <CardDescription>Controls the hero background, buttons, and accent colours on the microsite</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {THEME_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => setMicrositeData({
                      ...micrositeData,
                      themePreset: preset.value,
                      themeColor: preset.value !== "custom" ? preset.color : micrositeData.themeColor,
                    })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      micrositeData.themePreset === preset.value ? "ring-2 ring-primary ring-offset-1 border-primary" : "border-input"
                    }`}
                  >
                    {preset.value !== "custom" && (
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: preset.color }} />
                    )}
                    {preset.label}
                  </button>
                ))}
              </div>
              {micrositeData.themePreset === "custom" && (
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={micrositeData.themeColor}
                    onChange={(e) => setMicrositeData({ ...micrositeData, themeColor: e.target.value })}
                    className="w-10 h-10 rounded border border-input cursor-pointer"
                  />
                  <Input
                    className="w-40 font-mono text-sm"
                    value={micrositeData.themeColor}
                    onChange={(e) => setMicrositeData({ ...micrositeData, themeColor: e.target.value })}
                    placeholder="#1B2D5B"
                  />
                  <div
                    className="w-16 h-10 rounded-lg border"
                    style={{ backgroundColor: micrositeData.themeColor }}
                  />
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Live preview</span>
                <span
                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: activeThemeColor, color: previewTextColor, borderColor: activeThemeColor }}
                >
                  Invite Button
                </span>
                {showCustomContrastWarning && (
                  <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                    Close to low contrast
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSaveMicrositeSettings} disabled={isSavingMicrosite} className="w-full">
            {isSavingMicrosite ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Microsite Settings"}
          </Button>
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ── Inventory Tab Component ──────────────────────────────────────────────────

function ProgressBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const isLow = pct >= 90;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{value} / {max}</span>
        <span className={isLow ? "text-destructive font-semibold" : ""}>{pct}%{isLow ? " ⚠" : ""}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all ${isLow ? "bg-destructive" : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function InventoryTab({ eventId }: { eventId: number }) {
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ["inventory", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/inventory`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load inventory");
      return res.json();
    },
    enabled: !!eventId,
  });

  const { data: hotelBookings = [] } = useQuery({
    queryKey: ["hotel-bookings", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/hotel-bookings`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!eventId,
  });

  const { data: travelOptions = [] } = useQuery({
    queryKey: ["travel-options", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/travel-options`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!eventId,
  });

  const [autoTopUp, setAutoTopUp] = useState<Record<number, boolean>>({});

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const hotelInventory = (inventory as any[]).filter((i: any) => i.inventoryType === "hotel");
  const flightInventory = (inventory as any[]).filter((i: any) => i.inventoryType === "flight");

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Rooms Blocked", value: hotelInventory.reduce((s: number, i: any) => s + (i.roomsBlocked ?? 0), 0), icon: Hotel },
          { label: "Rooms Confirmed", value: hotelInventory.reduce((s: number, i: any) => s + (i.roomsConfirmed ?? 0), 0), icon: Hotel },
          { label: "Seats Allocated", value: flightInventory.reduce((s: number, i: any) => s + (i.seatsAllocated ?? 0), 0), icon: Plane },
          { label: "Seats Confirmed", value: flightInventory.reduce((s: number, i: any) => s + (i.seatsConfirmed ?? 0), 0), icon: Plane },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Hotel bookings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Hotel className="w-4 h-4 text-primary" /> Hotel Allocation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(hotelBookings as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No hotel bookings yet.</p>
          ) : (
            (hotelBookings as any[]).map((booking: any) => {
              const inv = hotelInventory.find((i: any) => i.hotelBookingId === booking.id);
              const blocked = inv?.roomsBlocked ?? booking.numberOfRooms ?? 0;
              const confirmed = inv?.roomsConfirmed ?? 0;
              return (
                <div key={booking.id} className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{booking.hotelName}</p>
                    {booking.tboHotelData && (
                      <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">TBO</span>
                    )}
                  </div>
                  {booking.checkInDate && booking.checkOutDate && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(booking.checkInDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {" – "}
                      {new Date(booking.checkOutDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Rooms blocked → confirmed</p>
                    <ProgressBar value={confirmed} max={blocked} />
                  </div>
                  {blocked > 0 && ((blocked - confirmed) / blocked) < 0.1 && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="w-3 h-3" />
                      Less than 10% rooms remaining
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/40">
                    <div className="flex-1 mr-3">
                      <p className="text-xs font-medium">Auto Top-Up</p>
                      <p className="text-xs text-muted-foreground">
                        When block falls below 10%, pull live TBO retail inventory at preset markup.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={autoTopUp[booking.id] ?? false}
                        onCheckedChange={(v) => setAutoTopUp({ ...autoTopUp, [booking.id]: v })}
                      />
                      {autoTopUp[booking.id] && (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold bg-amber-100 text-amber-700 text-xs border-amber-200">
                          Auto Top-Up: ON
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Flight allocation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="w-4 h-4 text-primary" /> Flight Allocation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(travelOptions as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No flight bookings yet.</p>
          ) : (
            (travelOptions as any[]).map((opt: any) => {
              const inv = flightInventory.find((i: any) => i.travelOptionId === opt.id);
              const allocated = inv?.seatsAllocated ?? 0;
              const confirmed = inv?.seatsConfirmed ?? 0;
              return (
                <div key={opt.id} className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm capitalize">
                      {opt.travelMode}
                      {opt.fromLocation && opt.toLocation ? ` — ${opt.fromLocation} → ${opt.toLocation}` : ""}
                    </p>
                    {opt.tboFlightData && (
                      <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">TBO</span>
                    )}
                  </div>
                  {opt.tboFlightData?.pnr && (
                    <p className="text-xs font-mono text-muted-foreground">PNR: {opt.tboFlightData.pnr}</p>
                  )}
                  {allocated > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Seats allocated → confirmed</p>
                      <ProgressBar value={confirmed} max={allocated} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
