import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertEventSchema, insertGuestSchema, insertLabelSchema, insertPerkSchema, insertLabelPerkSchema, type Event as EventType } from "@shared/schema";
import bcrypt from "bcryptjs";
import guestRoutes from "./guest-routes";
import tboHotelRoutes from "./tbo-hotel-routes";
import tboFlightRoutes from "./tbo-flight-routes";
import { db, pool } from "./db";
import { searchHotels } from "./tbo/tboHotelService";
import { events, hotelBookings, travelOptions, itineraryEvents, guests, labels, perks, labelPerks, guestRequests, bookingLabelInclusions, paymentTransactions, auditLogs } from "@shared/schema";
import { eq, and, sql, or } from "drizzle-orm";

// Middleware to get user from session
function getUser(req: any) {
  return req.session?.user;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const authorizeEventEditor = async (req: any, res: any, eventId: number) => {
    const user = getUser(req);
    if (!user || (user.role !== "agent" && user.role !== "client")) {
      res.status(403).json({ message: "Only agents or clients can modify this event" });
      return null;
    }

    const event = await storage.getEvent(eventId);
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return null;
    }

    if (user.role === "agent" && event.agentId !== user.id) {
      res.status(403).json({ message: "You can only edit your own events" });
      return null;
    }

    if (user.role === "client") {
      const canEditAsOwner = event.clientId === user.id;
      const canEditByCode = !!user.eventCode && event.eventCode === user.eventCode;
      if (!canEditAsOwner && !canEditByCode) {
        res.status(403).json({ message: "You can only edit your own event" });
        return null;
      }
    }

    return { user, event };
  };

  // Auth routes
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, firstName, lastName, role } = req.body;
      
      if (!email || !password || !firstName || !lastName || !role) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role,
      });

      // Set session
      req.session.user = user;

      res.status(201).json(user);
    } catch (err) {
      console.error("Signup error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/auth/signin", async (req, res) => {
    try {
      const { email, password, role } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Missing email or password" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check role if provided
      if (role && user.role !== role) {
        return res.status(401).json({ message: "Invalid credentials for this role" });
      }

      // Set session
      req.session.user = user;

      res.json(user);
    } catch (err) {
      console.error("Signin error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/user", async (req, res) => {
    const user = getUser(req);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(user);
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  app.post("/api/user/event-code", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const rawEventCode = req.body?.eventCode;
      const normalizedEventCode = typeof rawEventCode === "string" ? rawEventCode.trim().toUpperCase() : "";
      if (!normalizedEventCode) {
        return res.status(400).json({ message: "Event code is required" });
      }

      // Verify event code exists
      const event = await storage.getEventByCode(normalizedEventCode);
      if (!event) {
        return res.status(404).json({ message: "Invalid event code" });
      }

      // Update user with event code (keeps backward compat for single-event views)
      await storage.updateUserEventCode(user.id, normalizedEventCode);

      // Also link this client to the event via clientId for multi-event support
      await db.update(events)
        .set({ clientId: user.id })
        .where(eq(events.eventCode, normalizedEventCode));

      // Update session
      req.session.user = { ...user, eventCode: normalizedEventCode };

      res.json({
        success: true,
        eventId: event.id,
        eventCode: normalizedEventCode,
        eventName: event.name,
      });
    } catch (err) {
      console.error("Event code error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Events
  app.get(api.events.list.path, async (req, res) => {
    const user = getUser(req);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    let events: EventType[];
    if (user.role === "agent") {
      // Agents see all their events (published and unpublished)
      events = await storage.getEventsByAgent(user.id);
    } else if (user.role === "client" && user.eventCode) {
      // Clients see events matching their event code
      // TODO: In production, filter by: events = events.filter(e => e.isPublished);
      events = await storage.getEventsByCode(user.eventCode);
    } else {
      events = [];
    }

    res.json(events);
  });

  app.post(api.events.create.path, async (req, res) => {
    try {
      const user = getUser(req);
      console.log("Create event - User:", user);
      if (!user || user.role !== "agent") {
        return res.status(403).json({ message: "Only agents can create events" });
      }

      console.log("Create event - Request body:", req.body);
      const input = api.events.create.input.parse(req.body);
      console.log("Create event - Parsed input:", input);
      
      // Auto-generate event code: [CLIENT_3][EVENT_3][YEAR][MMDD]
      const eventDate = new Date(input.date);
      const clientPrefix = (req.body.clientName || '').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'XXX');
      const namePrefix = input.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
      const year = eventDate.getFullYear();
      const month = String(eventDate.getMonth() + 1).padStart(2, '0');
      const day = String(eventDate.getDate()).padStart(2, '0');
      
      // Ensure prefixes are padded to 3 characters
      const paddedClientPrefix = clientPrefix.padEnd(3, 'X');
      const paddedNamePrefix = namePrefix.padEnd(3, 'X');
      
      let eventCode = `${paddedClientPrefix}${paddedNamePrefix}${year}${month}${day}`;
      
      // Check if event code already exists, add random suffix if needed
      let existingEvent = await storage.getEventByCode(eventCode);
      if (existingEvent) {
        // Add random 2-character suffix
        const randomSuffix = Math.random().toString(36).substring(2, 4).toUpperCase();
        eventCode = `${eventCode}${randomSuffix}`;
      }
      
      const event = await storage.createEvent({ ...input, eventCode, agentId: user.id });

      // Seed client details with the provided client name so Event Setup autofills immediately.
      // Address/phone are intentionally left blank for later completion by agent/client.
      const seededClientName = String(req.body.clientName || "").trim() || "Client";
      await storage.createClientDetails({
        eventId: event.id,
        clientName: seededClientName,
        address: "",
        phone: "",
        hasVipGuests: false,
        hasFriends: false,
        hasFamily: false,
      });

      console.log("Create event - Created event:", event);
      res.status(201).json(event);
    } catch (err: any) {
      console.error("Create event error:", err?.message || err);

      if (String(err?.message || "").includes("end_date")) {
        return res.status(500).json({
          message: "Database update required for date ranges. Please run migration 005_add_event_end_date.sql.",
        });
      }
      
      // Handle database constraint violations
      if (err?.code === '23505') {
        return res.status(400).json({ 
          message: "Event code already exists. Please try again." 
        });
      }
      
      if (err instanceof z.ZodError) {
        console.log("Validation errors:", err.errors);
        res.status(400).json({ message: err.errors[0].message, errors: err.errors });
      } else {
        res.status(500).json({ message: err?.message || "Failed to create event" });
      }
    }
  });

  // Must be registered BEFORE /api/events/:id to avoid Express matching "my-client-events" as an id
  app.get("/api/events/my-client-events", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "client") {
        return res.status(403).json({ message: "Client access required" });
      }
      const whereClause = user.eventCode
        ? or(eq(events.clientId, user.id), eq(events.eventCode, user.eventCode))
        : eq(events.clientId, user.id);
      const clientEvents = await db.select().from(events).where(whereClause);
      res.json(clientEvents);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to load events" });
    }
  });

  app.get(api.events.get.path, async (req, res) => {
    const event = await storage.getEvent(Number(req.params.id));
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(event);
  });

  app.post("/api/events/:id/publish", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "agent") {
        return res.status(403).json({ message: "Only agents can publish events" });
      }

      const eventId = Number(req.params.id);
      const event = await storage.updateEvent(eventId, { isPublished: true });
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.json(event);
    } catch (err: any) {
      console.error("Publish event error:", err);
      res.status(500).json({ message: err.message || "Failed to publish event" });
    }
  });

  app.put(api.events.update.path, async (req, res) => {
      try {
          const input = api.events.update.input.parse(req.body);
          const event = await storage.updateEvent(Number(req.params.id), input);
          if (!event) return res.status(404).json({ message: "Event not found" });
          res.json(event);
      } catch (err) {
          if (err instanceof z.ZodError) {
              res.status(400).json({ message: err.errors[0].message });
          } else {
              res.status(500).json({ message: "Internal Server Error" });
          }
      }
  });

  // PATCH /api/events/:id — partial update (microsite appearance settings, etc.)
  app.patch("/api/events/:id", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || (user.role !== "agent" && user.role !== "client")) {
        return res.status(403).json({ message: "Only agents or clients can update events" });
      }
      const eventId = Number(req.params.id);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Scope check: clients may only edit events they own OR events matching their assigned event code
      if (user.role === "client") {
        const canEditAsOwner = event.clientId === user.id;
        const canEditByCode = !!user.eventCode && event.eventCode === user.eventCode;
        if (!canEditAsOwner && !canEditByCode) {
          return res.status(403).json({ message: "You can only update your own events" });
        }
      }

      const { coverMediaUrl, coverMediaType, themeColor, themePreset, scheduleText, inviteMessage, contactPhone, contactEmail } = req.body;
      const updates: Record<string, any> = {};
      if (coverMediaUrl !== undefined) {
        const url = (coverMediaUrl || "").trim();
        const isDataUrl = /^data:(image|video)\//.test(url);
        if (!url) {
          updates.coverMediaUrl = null;
        } else if (isDataUrl) {
          updates.coverMediaUrl = url.length <= 6_000_000 ? url : null;
        } else {
          updates.coverMediaUrl = url.length <= 2048 ? url : null;
        }
      }
      if (coverMediaType !== undefined) updates.coverMediaType = coverMediaType;
      if (themeColor !== undefined) updates.themeColor = themeColor;
      if (themePreset !== undefined) updates.themePreset = themePreset;

      // Sanitise text fields: strip HTML tags, enforce max length
      const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "");
      if (scheduleText !== undefined) {
        updates.scheduleText = scheduleText ? stripHtml(String(scheduleText)).slice(0, 5000) : null;
      }
      if (inviteMessage !== undefined) {
        updates.inviteMessage = inviteMessage ? stripHtml(String(inviteMessage)).slice(0, 2000) : null;
      }
      if (contactPhone !== undefined) updates.contactPhone = contactPhone ? String(contactPhone).slice(0, 50) : null;
      if (contactEmail !== undefined) updates.contactEmail = contactEmail ? String(contactEmail).slice(0, 200) : null;

      const [updated] = await db.update(events).set(updates).where(eq(events.id, eventId)).returning();
      if (!updated) return res.status(404).json({ message: "Event not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "agent") {
        return res.status(403).json({ message: "Only agents can delete events" });
      }

      const eventId = Number(req.params.id);
      const event = await storage.getEvent(eventId);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Verify the agent owns this event
      if (event.agentId !== user.id) {
        return res.status(403).json({ message: "You can only delete your own events" });
      }

      await storage.deleteEvent(eventId);
      res.json({ message: "Event deleted successfully" });
    } catch (err: any) {
      console.error("Delete event error:", err);
      // Handle foreign key constraint errors
      if (err.code === '23503') {
        return res.status(400).json({ 
          message: "Cannot delete event with existing data. Please delete all guests, labels, and perks first." 
        });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Client Details Routes
  app.post("/api/events/:id/client-details", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || (user.role !== "agent" && user.role !== "client")) {
        return res.status(403).json({ message: "Only agents or clients can add client details" });
      }

      const eventId = Number(req.params.id);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (user.role === "client") {
        const canEditAsOwner = event.clientId === user.id;
        const canEditByCode = !!user.eventCode && event.eventCode === user.eventCode;
        if (!canEditAsOwner && !canEditByCode) {
          return res.status(403).json({ message: "You can only edit details for your own event" });
        }
      }
      
      // Check if client details already exist for this event
      const existingDetails = await storage.getClientDetails(eventId);
      
      let clientDetails;
      if (existingDetails) {
        // Update existing client details
        clientDetails = await storage.updateClientDetails(eventId, req.body);
      } else {
        // Create new client details
        clientDetails = await storage.createClientDetails({
          eventId,
          ...req.body,
        });
      }

      res.status(existingDetails ? 200 : 201).json(clientDetails);
    } catch (err: any) {
      console.error("Client details error:", err);
      res.status(500).json({ message: err.message || "Failed to save client details" });
    }
  });

  app.get("/api/events/:id/client-details", async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const clientDetails = await storage.getClientDetails(eventId);
      
      if (!clientDetails) {
        return res.status(404).json({ message: "Client details not found" });
      }

      res.json(clientDetails);
    } catch (err) {
      console.error("Get client details error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Hotel Booking Routes
  app.post("/api/events/:id/hotel-booking", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || (user.role !== "agent" && user.role !== "client")) {
        return res.status(403).json({ message: "Only agents or clients can add hotel bookings" });
      }

      const eventId = Number(req.params.id);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (user.role === "agent" && event.agentId !== user.id) {
        return res.status(403).json({ message: "You can only add hotel bookings to your own events" });
      }

      if (user.role === "client") {
        const canEditAsOwner = event.clientId === user.id;
        const canEditByCode = !!user.eventCode && event.eventCode === user.eventCode;
        if (!canEditAsOwner && !canEditByCode) {
          return res.status(403).json({ message: "You can only add hotel bookings for your own event" });
        }
      }

      const payload = {
        ...req.body,
        eventId,
        checkInDate: req.body?.checkInDate ? new Date(req.body.checkInDate) : req.body?.checkInDate,
        checkOutDate: req.body?.checkOutDate ? new Date(req.body.checkOutDate) : req.body?.checkOutDate,
      };

      const booking = await storage.createHotelBooking(payload);

      // Populate groupInventory so inventory dashboard, bleisure rate, and EWS work
      storage.createGroupInventory({
        eventId: booking.eventId,
        inventoryType: "hotel",
        hotelBookingId: booking.id,
        roomsBlocked: booking.numberOfRooms,
        roomsAvailable: booking.numberOfRooms,
        negotiatedRate: req.body.negotiatedRate ?? null,
        validFrom: booking.checkInDate,
        validTo: booking.checkOutDate,
      }).catch((e: Error) => console.error("[inventory] hotel sync failed:", e.message));

      res.status(201).json(booking);
    } catch (err: any) {
      console.error("Hotel booking error:", err);
      res.status(500).json({ message: err.message || "Failed to create hotel booking" });
    }
  });

  app.get("/api/events/:id/hotel-bookings", async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const bookings = await storage.getHotelBookings(eventId);
      res.json(bookings);
    } catch (err) {
      console.error("Get hotel bookings error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.put("/api/events/:id/hotel-booking/:bookingId", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || (user.role !== "agent" && user.role !== "client")) {
        return res.status(403).json({ message: "Only agents or clients can update hotel bookings" });
      }

      const eventId = Number(req.params.id);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (user.role === "agent" && event.agentId !== user.id) {
        return res.status(403).json({ message: "You can only update hotel bookings for your own events" });
      }

      if (user.role === "client") {
        const canEditAsOwner = event.clientId === user.id;
        const canEditByCode = !!user.eventCode && event.eventCode === user.eventCode;
        if (!canEditAsOwner && !canEditByCode) {
          return res.status(403).json({ message: "You can only update hotel bookings for your own event" });
        }
      }

      const bookingId = Number(req.params.bookingId);
      const existing = (await storage.getHotelBookings(eventId)).find((b) => b.id === bookingId);
      if (!existing) {
        return res.status(404).json({ message: "Hotel booking not found" });
      }

      const updates = {
        baseRate: req.body?.baseRate ?? null,
        commissionType: req.body?.commissionType ?? "amount",
        commissionValue: req.body?.commissionValue ?? 0,
        clientFacingRate: req.body?.clientFacingRate ?? null,
      };

      const updated = await storage.updateHotelBooking(bookingId, updates as any);
      if (!updated) {
        return res.status(404).json({ message: "Hotel booking not found" });
      }

      res.json(updated);
    } catch (err: any) {
      console.error("Update hotel booking error:", err);
      res.status(500).json({ message: err.message || "Failed to update hotel booking" });
    }
  });

  // Travel Options Routes
  app.post("/api/events/:id/travel-options", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || (user.role !== "agent" && user.role !== "client")) {
        return res.status(403).json({ message: "Only agents or clients can add travel options" });
      }

      const eventId = Number(req.params.id);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (user.role === "agent" && event.agentId !== user.id) {
        return res.status(403).json({ message: "You can only add travel options to your own events" });
      }

      if (user.role === "client") {
        const canEditAsOwner = event.clientId === user.id;
        const canEditByCode = !!user.eventCode && event.eventCode === user.eventCode;
        if (!canEditAsOwner && !canEditByCode) {
          return res.status(403).json({ message: "You can only add travel options for your own event" });
        }
      }

      const payload = {
        ...req.body,
        eventId,
        departureDate: req.body?.departureDate ? new Date(req.body.departureDate) : req.body?.departureDate,
        returnDate: req.body?.returnDate ? new Date(req.body.returnDate) : req.body?.returnDate,
      };

      const travelOption = await storage.createTravelOption(payload);

      // Populate groupInventory for flight legs so seat inventory is tracked
      if (travelOption.travelMode === "flight") {
        const seatsAllocated: number =
          req.body.tboFlightData?.adultCount ??
          req.body.adults ??
          1;
        storage.createGroupInventory({
          eventId: travelOption.eventId,
          inventoryType: "flight",
          travelOptionId: travelOption.id,
          seatsAllocated,
          seatsAvailable: seatsAllocated,
          validFrom: travelOption.departureDate ?? undefined,
          validTo: travelOption.returnDate ?? undefined,
        }).catch((e: Error) => console.error("[inventory] flight sync failed:", e.message));
      }

      res.status(201).json(travelOption);
    } catch (err: any) {
      console.error("Travel option error:", err);
      res.status(500).json({ message: err.message || "Failed to create travel option" });
    }
  });

  app.get("/api/events/:id/travel-options", async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const options = await storage.getTravelOptions(eventId);
      res.json(options);
    } catch (err) {
      console.error("Get travel options error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Label inclusions per booking (hotel/flight)
  app.get("/api/events/:id/booking-label-inclusions", async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const bookingType = String(req.query.bookingType || "").trim();
      const bookingId = req.query.bookingId ? Number(req.query.bookingId) : null;

      const filters = [eq(bookingLabelInclusions.eventId, eventId)];
      if (bookingType) {
        filters.push(eq(bookingLabelInclusions.bookingType, bookingType));
      }
      if (bookingId && Number.isFinite(bookingId)) {
        filters.push(eq(bookingLabelInclusions.bookingId, bookingId));
      }

      const rows = await db.select().from(bookingLabelInclusions).where(and(...filters));
      res.json(rows);
    } catch (err: any) {
      console.error("Get booking label inclusions error:", err);
      res.status(500).json({ message: err.message || "Failed to load booking label inclusions" });
    }
  });

  app.post("/api/events/:id/booking-label-inclusions", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || (user.role !== "agent" && user.role !== "client")) {
        return res.status(403).json({ message: "Only agents or clients can edit label inclusions" });
      }

      const eventId = Number(req.params.id);
      const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      const canEditAsAgent = user.role === "agent" && event.agentId === user.id;
      const canEditAsClient = user.role === "client" && (event.clientId === user.id || (!!user.eventCode && event.eventCode === user.eventCode));
      if (!canEditAsAgent && !canEditAsClient) {
        return res.status(403).json({ message: "You can only edit inclusions for your own events" });
      }

      const input = z.object({
        bookingType: z.enum(["hotel", "flight"]),
        bookingId: z.number().int().positive(),
        labelId: z.number().int().positive(),
        isIncluded: z.boolean().default(false),
        inclusions: z.string().optional().nullable(),
      }).parse(req.body);

      const [label] = await db
        .select()
        .from(labels)
        .where(and(eq(labels.id, input.labelId), eq(labels.eventId, eventId)))
        .limit(1);
      if (!label) {
        return res.status(404).json({ message: "Label not found for this event" });
      }

      if (input.bookingType === "hotel") {
        const [booking] = await db
          .select()
          .from(hotelBookings)
          .where(and(eq(hotelBookings.id, input.bookingId), eq(hotelBookings.eventId, eventId)))
          .limit(1);
        if (!booking) {
          return res.status(404).json({ message: "Hotel booking not found for this event" });
        }
      } else {
        const [option] = await db
          .select()
          .from(travelOptions)
          .where(and(eq(travelOptions.id, input.bookingId), eq(travelOptions.eventId, eventId)))
          .limit(1);
        if (!option) {
          return res.status(404).json({ message: "Travel option not found for this event" });
        }
      }

      const [row] = await db
        .insert(bookingLabelInclusions)
        .values({
          eventId,
          labelId: input.labelId,
          bookingType: input.bookingType,
          bookingId: input.bookingId,
          isIncluded: input.isIncluded,
          inclusions: input.inclusions?.trim() || null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            bookingLabelInclusions.bookingType,
            bookingLabelInclusions.bookingId,
            bookingLabelInclusions.labelId,
          ],
          set: {
            isIncluded: input.isIncluded,
            inclusions: input.inclusions?.trim() || null,
            updatedAt: new Date(),
          },
        })
        .returning();

      res.status(201).json(row);
    } catch (err: any) {
      console.error("Upsert booking label inclusion error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid payload" });
      }
      res.status(500).json({ message: err.message || "Failed to save booking label inclusion" });
    }
  });

  // Payment responsibility for a booking (upsert-like)
  app.post("/api/events/:id/booking-payment-responsibility", async (req, res) => {
    try {
      const auth = await authorizeEventEditor(req, res, Number(req.params.id));
      if (!auth) return;
      const { event } = auth;

      const input = z.object({
        bookingType: z.enum(["hotel", "flight"]),
        bookingId: z.number().int().positive(),
        responsibility: z.enum(["client", "guest", "agent", "third_party"]).optional(),
      }).parse(req.body);

      if (input.bookingType === "hotel") {
        const [booking] = await db.select().from(hotelBookings).where(and(eq(hotelBookings.id, input.bookingId), eq(hotelBookings.eventId, event.id))).limit(1);
        if (!booking) return res.status(404).json({ message: "Hotel booking not found" });
        const [updated] = await db.update(hotelBookings).set({ paymentResponsibility: input.responsibility ?? null }).where(eq(hotelBookings.id, input.bookingId)).returning();
        return res.json(updated);
      } else {
        const [opt] = await db.select().from(travelOptions).where(and(eq(travelOptions.id, input.bookingId), eq(travelOptions.eventId, event.id))).limit(1);
        if (!opt) return res.status(404).json({ message: "Travel option not found" });
        const [updated] = await db.update(travelOptions).set({ paymentResponsibility: input.responsibility ?? null }).where(eq(travelOptions.id, input.bookingId)).returning();
        return res.json(updated);
      }
    } catch (err: any) {
      console.error("Set payment responsibility error:", err);
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid payload" });
      res.status(500).json({ message: err.message || "Failed to set payment responsibility" });
    }
  });

  // Payment transactions (create and list)
  app.post("/api/events/:id/payment-transactions", async (req, res) => {
    try {
      const auth = await authorizeEventEditor(req, res, Number(req.params.id));
      if (!auth) return;
      const { event } = auth;

      const input = z.object({
        bookingType: z.enum(["hotel", "flight"]).optional(),
        bookingId: z.number().int().positive().optional(),
        guestId: z.number().int().positive().optional(),
        payer: z.enum(["client", "guest", "agent", "third_party"]),
        amount: z.number().int().positive(),
        currency: z.string().optional().default("INR"),
        transactionRef: z.string().optional(),
      }).parse(req.body);

      const [row] = await db.insert(paymentTransactions).values({
        eventId: event.id,
        bookingType: input.bookingType ?? null,
        bookingId: input.bookingId ?? null,
        guestId: input.guestId ?? null,
        payer: input.payer,
        amount: input.amount,
        currency: input.currency ?? 'INR',
        transactionRef: input.transactionRef ?? null,
      }).returning();

      res.status(201).json(row);
    } catch (err: any) {
      console.error("Create payment transaction error:", err);
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid payload" });
      res.status(500).json({ message: err.message || "Failed to create payment transaction" });
    }
  });

  app.get("/api/events/:id/payment-transactions", async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const rows = await db.select().from(paymentTransactions).where(eq(paymentTransactions.eventId, eventId));
      res.json(rows);
    } catch (err: any) {
      console.error("List payment transactions error:", err);
      res.status(500).json({ message: err.message || "Failed to load payment transactions" });
    }
  });

  // Labels
  app.get(api.labels.list.path, async (req, res) => {
    const labels = await storage.getLabels(Number(req.params.eventId));
    res.json(labels);
  });

  app.post(api.labels.create.path, async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const auth = await authorizeEventEditor(req, res, eventId);
      if (!auth) return;

      const input = api.labels.create.input.parse(req.body);
      const label = await storage.createLabel({ ...input, eventId });
      res.status(201).json(label);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: err.message || "Failed to create label" });
      }
    }
  });
  
  app.put(api.labels.update.path, async (req, res) => {
      try {
        const labelId = Number(req.params.id);
        const [existingLabel] = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
        if (!existingLabel) return res.status(404).json({ message: "Label not found" });

        const auth = await authorizeEventEditor(req, res, Number(existingLabel.eventId));
        if (!auth) return;

          const input = api.labels.update.input.parse(req.body);
        const label = await storage.updateLabel(labelId, input);
          if (!label) return res.status(404).json({ message: "Label not found" });
          res.json(label);
      } catch (err) {
          if (err instanceof z.ZodError) {
              res.status(400).json({ message: err.errors[0].message });
          } else {
              res.status(500).json({ message: "Internal Server Error" });
          }
      }
  });

  // Perks
  app.get(api.perks.list.path, async (req, res) => {
    const perks = await storage.getPerks(Number(req.params.eventId));
    res.json(perks);
  });

  app.post(api.perks.create.path, async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const auth = await authorizeEventEditor(req, res, eventId);
      if (!auth) return;

      const input = api.perks.create.input.parse(req.body);
      const perk = await storage.createPerk({ ...input, eventId });
      res.status(201).json(perk);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  app.put(api.perks.update.path, async (req, res) => {
      try {
        const perkId = Number(req.params.id);
        const [existingPerk] = await db.select().from(perks).where(eq(perks.id, perkId)).limit(1);
        if (!existingPerk) return res.status(404).json({ message: "Perk not found" });

        const auth = await authorizeEventEditor(req, res, Number(existingPerk.eventId));
        if (!auth) return;

          const input = api.perks.update.input.parse(req.body);
        const perk = await storage.updatePerk(perkId, input);
          if (!perk) return res.status(404).json({ message: "Perk not found" });
          res.json(perk);
      } catch (err) {
          if (err instanceof z.ZodError) {
              res.status(400).json({ message: err.errors[0].message });
          } else {
              res.status(500).json({ message: "Internal Server Error" });
          }
      }
  });

  // Label Perks
  app.get(api.labelPerks.list.path, async (req, res) => {
      const labelPerks = await storage.getLabelPerks(Number(req.params.labelId));
      res.json(labelPerks);
  });

  app.put(api.labelPerks.update.path, async (req, res) => {
    try {
      const labelId = Number(req.params.labelId);
      const [existingLabel] = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
      if (!existingLabel) return res.status(404).json({ message: "Label not found" });

      const auth = await authorizeEventEditor(req, res, Number(existingLabel.eventId));
      if (!auth) return;

      const input = api.labelPerks.update.input.parse(req.body);
      const labelPerk = await storage.updateLabelPerk(labelId, Number(req.params.perkId), input);
      res.json(labelPerk);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  // Guests
  app.get(api.guests.list.path, async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const guests = await storage.getGuests(eventId);
      res.json(guests);
    } catch (error) {
      console.error('Failed to fetch guests:', error);
      res.status(500).json({ message: "Failed to fetch guests" });
    }
  });

  app.post(api.guests.create.path, async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const auth = await authorizeEventEditor(req, res, eventId);
      if (!auth) return;
      // Use advisory lock per (eventId, email) to serialize concurrent creates without requiring DB indexes.
      const force = Boolean((req.body as any)?.force);
      const input = api.guests.create.input.parse(req.body);

      // Only agents may force-create duplicates
      if (force && auth.user.role !== 'agent') {
        return res.status(403).json({ message: 'Only agents may force-create duplicate guests' });
      }

      const email = String(input.email || '').toLowerCase();
      // simple 32-bit hash
      const hash32 = (s: string) => {
        let h = 0;
        for (let i = 0; i < s.length; i++) {
          h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        }
        return Math.abs(h);
      };

      const key2 = hash32(email);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [eventId, key2]);

        // Check existing within same transaction/connection
        const existingRes = await client.query(`SELECT * FROM guests WHERE event_id = $1 AND lower(email) = $2 LIMIT 1`, [eventId, email]);
        const existing = existingRes.rows[0];
        if (existing && !force) {
          await client.query('ROLLBACK');
          return res.status(409).json({ message: 'Guest with this email already exists', existing });
        }

        // Insert using storage helper that uses provided client
        const guest = await storage.createGuestWithClient(client, { ...input, eventId });

        if (force) {
          try {
            await client.query(`INSERT INTO audit_logs (actor_id, action, target_table, target_id, details) VALUES ($1,$2,$3,$4,$5)`, [auth.user.id, 'guest_force_create', 'guests', guest.id, { email: input.email, name: input.name, existing: existing ?? null, eventId }]);
          } catch (auditErr) {
            console.error('Failed to write audit log:', auditErr);
          }
        }

        await client.query('COMMIT');
        res.status(201).json(guest);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[ERROR] Failed to create guest:', err.message || String(err));
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err?.code === '23505') {
        // Postgres unique violation (race condition)
        res.status(409).json({ message: 'Guest with this email already exists' });
      } else {
        res.status(500).json({ message: err.message || "Internal Server Error" });
      }
    }
  });

  // Must be registered BEFORE /api/guests/:id to avoid "lookup" being matched as an id
  app.get(api.guests.lookup.path, async (req, res) => {
    const ref = req.query.ref as string;
    if (!ref) return res.status(400).json({ message: "Booking reference required" });
    const guest = await storage.getGuestByRef(ref);
    if (!guest) return res.status(404).json({ message: "Invitation not found" });
    let availablePerks: any[] = [];
    if (guest.label) {
      const labelPerks = await storage.getLabelPerks(guest.label.id);
      availablePerks = labelPerks
        .filter(lp => lp.isEnabled)
        .map(lp => ({ ...lp.perk, isEnabled: lp.isEnabled, expenseHandledByClient: lp.expenseHandledByClient }));
    }
    const family = await storage.getGuestFamily(guest.id);
    res.json({ ...guest, family, availablePerks });
  });

  app.get(api.guests.get.path, async (req, res) => {
    const guest = await storage.getGuest(Number(req.params.id));
    if (!guest) return res.status(404).json({ message: "Guest not found" });
    res.json(guest);
  });

  app.put(api.guests.update.path, async (req, res) => {
      try {
        const guestId = Number(req.params.id);
        const existingGuest = await storage.getGuest(guestId);
        if (!existingGuest) return res.status(404).json({ message: "Guest not found" });

        const auth = await authorizeEventEditor(req, res, Number(existingGuest.eventId));
        if (!auth) return;

          const input = api.guests.update.input.parse(req.body);
        const guest = await storage.updateGuest(guestId, input);
          if (!guest) return res.status(404).json({ message: "Guest not found" });
          res.json(guest);
      } catch (err) {
          if (err instanceof z.ZodError) {
              res.status(400).json({ message: err.errors[0].message });
          } else {
              res.status(500).json({ message: "Internal Server Error" });
          }
      }
  });

  app.delete(api.guests.delete.path, async (req, res) => {
    try {
      const guestId = Number(req.params.id);
      const guest = await storage.getGuest(guestId);
      
      if (!guest) {
        return res.status(404).json({ message: "Guest not found" });
      }

      const auth = await authorizeEventEditor(req, res, Number(guest.eventId));
      if (!auth) return;

      await storage.deleteGuest(guestId);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete guest error:', error);
      res.status(500).json({ message: "Failed to delete guest" });
    }
  });

  app.get(api.guests.lookup.path, async (req, res) => {
    const ref = req.query.ref as string;
    if (!ref) return res.status(400).json({ message: "Booking reference required" });
    
    const guest = await storage.getGuestByRef(ref);
    if (!guest) return res.status(404).json({ message: "Invitation not found" });
    
    // Enrich with available perks based on label
    let availablePerks: any[] = [];
    if (guest.label) {
        const labelPerks = await storage.getLabelPerks(guest.label.id);
        availablePerks = labelPerks
            .filter(lp => lp.isEnabled)
            .map(lp => ({
                ...lp.perk,
                isEnabled: lp.isEnabled,
                expenseHandledByClient: lp.expenseHandledByClient
            }));
    }
    
    // Enrich with family
    const family = await storage.getGuestFamily(guest.id);

    res.json({ ...guest, family, availablePerks });
  });

  // Guest Family
  app.get(api.guestFamily.list.path, async (req, res) => {
      const family = await storage.getGuestFamily(Number(req.params.guestId));
      res.json(family);
  });

  app.post(api.guestFamily.create.path, async (req, res) => {
      try {
          const input = api.guestFamily.create.input.parse(req.body);
          const member = await storage.createGuestFamily({ ...input, guestId: Number(req.params.guestId) });
          res.status(201).json(member);
      } catch (err) {
          if (err instanceof z.ZodError) {
              res.status(400).json({ message: err.errors[0].message });
          } else {
              res.status(500).json({ message: "Internal Server Error" });
          }
      }
  });

  // Requests
  app.get(api.requests.list.path, async (req, res) => {
      const requests = await storage.getRequests(Number(req.params.eventId));
      res.json(requests);
  });

  app.post(api.requests.create.path, async (req, res) => {
      try {
          const input = api.requests.create.input.parse(req.body);
          const request = await storage.createRequest({ ...input, guestId: Number(req.params.guestId) });
          res.status(201).json(request);
      } catch (err: any) {
          if (err instanceof z.ZodError) {
              res.status(400).json({ message: err.errors[0].message });
          } else {
              res.status(500).json({ message: err.message || "Failed to create guest" });
          }
      }
  });

  app.put(api.requests.update.path, async (req, res) => {
      try {
          const input = api.requests.update.input.parse(req.body);
          const request = await storage.updateRequest(Number(req.params.id), input);
          if (!request) return res.status(404).json({ message: "Request not found" });
          res.json(request);
      } catch (err) {
          if (err instanceof z.ZodError) {
              res.status(400).json({ message: err.errors[0].message });
          } else {
              res.status(500).json({ message: "Internal Server Error" });
          }
      }
  });
  
  // GET /api/events/:eventId/itinerary — list itinerary events
  app.get("/api/events/:eventId/itinerary", async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const rows = await db.select().from(itineraryEvents).where(eq(itineraryEvents.eventId, eventId));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to get itinerary" });
    }
  });

  // POST /api/events/:eventId/itinerary — create itinerary event
  app.post("/api/events/:eventId/itinerary", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "agent") return res.status(403).json({ message: "Agent access required" });
      const eventId = Number(req.params.eventId);
      const { title, description, startTime, endTime, location, capacity, isMandatory } = req.body;
      if (!title || !startTime || !endTime) return res.status(400).json({ message: "title, startTime and endTime are required" });
      const [created] = await db.insert(itineraryEvents).values({
        eventId, title, description, startTime: new Date(startTime), endTime: new Date(endTime),
        location, capacity: capacity ?? null, isMandatory: isMandatory ?? false,
      }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to create itinerary event" });
    }
  });

  // PUT /api/events/:eventId/itinerary/:itineraryId — update itinerary event
  app.put("/api/events/:eventId/itinerary/:itineraryId", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "agent") return res.status(403).json({ message: "Agent access required" });

      const eventId = Number(req.params.eventId);
      const itineraryId = Number(req.params.itineraryId);
      const { title, description, startTime, endTime, location, capacity, isMandatory } = req.body;

      if (!title || !startTime || !endTime) {
        return res.status(400).json({ message: "title, startTime and endTime are required" });
      }

      const [updated] = await db
        .update(itineraryEvents)
        .set({
          title,
          description,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          location,
          capacity: capacity ?? null,
          isMandatory: isMandatory ?? false,
        })
        .where(and(eq(itineraryEvents.id, itineraryId), eq(itineraryEvents.eventId, eventId)))
        .returning();

      if (!updated) return res.status(404).json({ message: "Itinerary event not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to update itinerary event" });
    }
  });

  // DELETE /api/events/:eventId/itinerary/:itineraryId — delete itinerary event
  app.delete("/api/events/:eventId/itinerary/:itineraryId", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "agent") return res.status(403).json({ message: "Agent access required" });

      const eventId = Number(req.params.eventId);
      const itineraryId = Number(req.params.itineraryId);

      const [deleted] = await db
        .delete(itineraryEvents)
        .where(and(eq(itineraryEvents.id, itineraryId), eq(itineraryEvents.eventId, eventId)))
        .returning();

      if (!deleted) return res.status(404).json({ message: "Itinerary event not found" });
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to delete itinerary event" });
    }
  });

  // Seed itinerary events (for demo purposes)
  app.post("/api/events/:id/seed-itinerary", async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const event = await storage.getEvent(eventId);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Get event date
      const eventDate = new Date(event.date);
      const year = eventDate.getFullYear();
      const month = eventDate.getMonth();
      const day = eventDate.getDate();
      
      // Create sample itinerary events with some conflicts
      const sampleEvents = [
        {
          eventId,
          title: "Welcome Reception",
          description: "Meet fellow guests and enjoy cocktails",
          startTime: new Date(year, month, day, 18, 0), // 6:00 PM
          endTime: new Date(year, month, day, 19, 30), // 7:30 PM
          location: "Grand Ballroom",
          isMandatory: true,
          capacity: 150,
          currentAttendees: 0,
        },
        {
          eventId,
          title: "Dinner Gala",
          description: "Formal dinner with live entertainment",
          startTime: new Date(year, month, day, 19, 0), // 7:00 PM
          endTime: new Date(year, month, day, 22, 0), // 10:00 PM
          location: "Crystal Hall",
          isMandatory: false,
          capacity: 120,
          currentAttendees: 0,
        },
        {
          eventId,
          title: "Cocktail Lounge Experience",
          description: "Intimate cocktail tasting and mixology demo",
          startTime: new Date(year, month, day, 19, 30), // 7:30 PM - CONFLICTS with Dinner Gala
          endTime: new Date(year, month, day, 21, 0), // 9:00 PM
          location: "Sky Lounge",
          isMandatory: false,
          capacity: 30,
          currentAttendees: 0,
        },
        {
          eventId,
          title: "Morning Yoga Session",
          description: "Start your day with guided meditation and yoga",
          startTime: new Date(year, month, day + 1, 7, 0), // Next day 7:00 AM
          endTime: new Date(year, month, day + 1, 8, 0), // 8:00 AM
          location: "Wellness Center",
          isMandatory: false,
          capacity: 25,
          currentAttendees: 0,
        },
        {
          eventId,
          title: "Breakfast Buffet",
          description: "Continental and hot breakfast buffet",
          startTime: new Date(year, month, day + 1, 7, 30), // Next day 7:30 AM - CONFLICTS with Yoga
          endTime: new Date(year, month, day + 1, 9, 30), // 9:30 AM
          location: "Terrace Restaurant",
          isMandatory: true,
          capacity: 150,
          currentAttendees: 0,
        },
        {
          eventId,
          title: "City Tour",
          description: "Guided tour of local attractions",
          startTime: new Date(year, month, day + 1, 10, 0), // 10:00 AM
          endTime: new Date(year, month, day + 1, 13, 0), // 1:00 PM
          location: "Hotel Lobby (Departure)",
          isMandatory: false,
          capacity: 40,
          currentAttendees: 0,
        },
        {
          eventId,
          title: "Spa & Wellness Workshop",
          description: "Rejuvenating spa treatments and wellness talk",
          startTime: new Date(year, month, day + 1, 11, 0), // 11:00 AM - CONFLICTS with City Tour
          endTime: new Date(year, month, day + 1, 13, 30), // 1:30 PM
          location: "Spa Suite",
          isMandatory: false,
          capacity: 20,
          currentAttendees: 0,
        },
        {
          eventId,
          title: "Farewell Lunch",
          description: "Closing celebration with lunch service",
          startTime: new Date(year, month, day + 1, 13, 0), // 1:00 PM
          endTime: new Date(year, month, day + 1, 15, 0), // 3:00 PM
          location: "Garden Pavilion",
          isMandatory: true,
          capacity: 150,
          currentAttendees: 0,
        },
      ];
      
      // Avoid inserting duplicates: check existing itinerary items for this event
      const existingRows = await db.select().from(itineraryEvents).where(eq(itineraryEvents.eventId, eventId));
      const existingSignatures = new Set(existingRows.map(r => `${r.title}||${new Date(r.startTime).toISOString()}`));

      const toInsert = sampleEvents.filter(ev => {
        const sig = `${ev.title}||${new Date(ev.startTime).toISOString()}`;
        return !existingSignatures.has(sig);
      });

      if (toInsert.length > 0) {
        await storage.seedItineraryEvents(toInsert);
      }

      res.json({ 
        message: "Itinerary events seeded successfully",
        added: toInsert.length,
        attempted: sampleEvents.length,
        conflicts: [
          "Dinner Gala (7:00-10:00 PM) overlaps with Cocktail Lounge (7:30-9:00 PM)",
          "Morning Yoga (7:00-8:00 AM) overlaps with Breakfast Buffet (7:30-9:30 AM)",
          "City Tour (10:00 AM-1:00 PM) overlaps with Spa Workshop (11:00 AM-1:30 PM)"
        ]
      });
    } catch (err: any) {
      console.error("Seed error:", err);
      res.status(500).json({ message: err.message || "Failed to seed itinerary" });
    }
  });
  
  // Seeding disabled - using Supabase with fresh database
  // You can create test data through the UI
  console.log("Database ready!");

  // ─── TBO API Proxy Routes (agent-authenticated, server-side only) ───────────
  app.use(tboHotelRoutes);
  app.use(tboFlightRoutes);

  // ─── Group Inventory Routes ──────────────────────────────────────────────────

  // GET /api/events/:id/inventory — get inventory summary for an event
  app.get("/api/events/:id/inventory", async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const inventory = await storage.getGroupInventory(eventId);
      res.json(inventory);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to fetch inventory" });
    }
  });

  // POST /api/events/:id/inventory — create inventory record
  app.post("/api/events/:id/inventory", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "agent") {
        return res.status(403).json({ message: "Only agents can manage inventory" });
      }
      const record = await storage.createGroupInventory({
        ...req.body,
        eventId: Number(req.params.id),
      });
      res.status(201).json(record);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to create inventory record" });
    }
  });

  // PUT /api/events/:id/inventory/:inventoryId — update inventory record
  app.put("/api/events/:id/inventory/:inventoryId", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "agent") {
        return res.status(403).json({ message: "Only agents can update inventory" });
      }
      const record = await storage.updateGroupInventory(Number(req.params.inventoryId), req.body);
      if (!record) return res.status(404).json({ message: "Inventory record not found" });
      res.json(record);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to update inventory record" });
    }
  });

  // ─── Guest Lookup (for microsite booking-ref entry) ──────────────────────────

  // GET /api/guest/lookup?bookingRef=GP123456 — public, returns accessToken only
  app.get("/api/guest/lookup", async (req, res) => {
    const { bookingRef } = req.query as { bookingRef: string };
    if (!bookingRef) {
      return res.status(400).json({ message: "bookingRef query param required" });
    }
    try {
      const allGuests = await db.select()
        .from(guests)
        .where(eq(guests.bookingRef, bookingRef.toUpperCase()));
      const guest = allGuests[0];
      if (!guest) {
        return res.status(404).json({ message: "No booking found" });
      }
      // Return only the token — never expose PII to public endpoint
      res.json({ token: guest.accessToken });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Lookup failed" });
    }
  });

  // ─── Public Microsite Routes ─────────────────────────────────────────────────

  // GET /api/microsite/:eventCode — public event summary (no PII, no TBO credentials)
  app.get("/api/microsite/:eventCode", async (req, res) => {
    try {
      const event = await storage.getEventByCode(req.params.eventCode);
      if (!event || !event.isPublished) {
        return res.status(404).json({ message: "Event not found or not published" });
      }

      // Fetch safe public data
      const hotelData = await storage.getHotelBookings(event.id);
      const travelData = await storage.getTravelOptions(event.id);
      const [itinerary] = await Promise.all([
        db.select().from(itineraryEvents)
          .where(eq(itineraryEvents.eventId, event.id)),
      ]);

      // Sanitize hotel data — only return human-readable fields, never BookingCode or ConfirmationNumber
      const hotelSummary = hotelData.map(h => ({
        hotelName: h.hotelName,
        checkInDate: h.checkInDate,
        checkOutDate: h.checkOutDate,
        numberOfRooms: h.numberOfRooms,
        // Extract display fields from TBO data if available
        roomType: (h.tboHotelData as any)?.roomType ?? null,
        mealPlan: (h.tboHotelData as any)?.mealPlan ?? null,
        starRating: (h.tboHotelData as any)?.starRating ?? null,
      }));

      const travelSummary = travelData.map(t => ({
        travelMode: t.travelMode,
        departureDate: t.departureDate,
        returnDate: t.returnDate,
        fromLocation: t.fromLocation,
        toLocation: t.toLocation,
        airline: (t.tboFlightData as any)?.airline ?? null,
        flightNumber: (t.tboFlightData as any)?.flightNumber ?? null,
        departureTime: (t.tboFlightData as any)?.departureTime ?? null,
        arrivalTime: (t.tboFlightData as any)?.arrivalTime ?? null,
      }));

      // Show all public itinerary items (mandatory + optional) — no PII exposed
      const mandatoryItinerary = itinerary
        .sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))
        .map(i => ({
          title: i.title,
          description: i.description,
          startTime: i.startTime,
          endTime: i.endTime,
          location: i.location,
          isMandatory: i.isMandatory,
        }));

      const firstHotel = hotelSummary[0];
      const firstTravel = travelSummary[0];
      const eventGuests = await storage.getGuests(event.id);
      const confirmedCount = eventGuests.filter(g => g.status === "confirmed" || g.status === "arrived").length;

      res.json({
        // Top-level fields read directly by EventMicrosite.tsx
        name: event.name,
        date: event.date,
        location: event.location,
        description: event.description,
        eventCode: event.eventCode,
        guestCount: eventGuests.length,
        confirmedCount,
        // Microsite appearance (set by agent in EventSetup / EventDetails)
        coverMediaUrl: event.coverMediaUrl ?? null,
        coverMediaType: event.coverMediaType ?? "image",
        themeColor: event.themeColor ?? "#1B2D5B",
        themePreset: event.themePreset ?? "navy",
        scheduleText: (event as any).scheduleText ?? null,
        inviteMessage: (event as any).inviteMessage ?? null,
        hotel: firstHotel ? {
          name: firstHotel.hotelName,
          checkIn: firstHotel.checkInDate,
          checkOut: firstHotel.checkOutDate,
          roomType: firstHotel.roomType,
          mealPlan: firstHotel.mealPlan,
        } : null,
        travel: firstTravel ? {
          mode: firstTravel.travelMode,
          from: firstTravel.fromLocation,
          to: firstTravel.toLocation,
          airline: firstTravel.airline,
          flightNumber: firstTravel.flightNumber,
        } : null,
        itinerary: mandatoryItinerary,
      });
    } catch (err: any) {
      console.error("[Microsite] Error:", err);
      res.status(500).json({ message: err.message ?? "Failed to load event" });
    }
  });

  /**
   * GET /api/microsite/:eventCode/hotel-rooms
   * Public endpoint used by the microsite to show a selectable room list.
   *
   * Behaviour (safe defaults):
   * - By default this returns a mocked, display-only list so the microsite
   *   UX remains functional without exposing TBO or booking PII.
   * - To enable live TBO-backed behaviour set `ENABLE_TBO_MICROSITE_ROOMS=true`
   *   in your server environment. The live path is gated behind this flag so
   *   the default demo behaviour remains a harmless fallback.
   */
  app.get("/api/microsite/:eventCode/hotel-rooms", async (req, res) => {
    try {
      const event = await storage.getEventByCode(req.params.eventCode);
      if (!event || !event.isPublished) return res.status(404).json({ message: "Event not found or not published" });

      // If operator explicitly enables TBO for microsite rooms, attempt live fetch
      const enableLive = (process.env.ENABLE_TBO_MICROSITE_ROOMS ?? "false") === "true";

      if (enableLive) {
        try {
          // Attempt to derive TBO search parameters from any existing hotel booking
          const hotelBookingsLive = await storage.getHotelBookings(event.id);
          const firstHotelLive = hotelBookingsLive?.[0];
          const tboData = (firstHotelLive as any)?.tboHotelData ?? null;

          // Derive a TBO hotel code if available
          const hotelCode = tboData?.hotelCode ?? tboData?.hotel?.HotelCode ?? tboData?.HotelCode ?? null;
          if (!hotelCode) {
            console.log('[Microsite] No hotelCode found in event hotelBooking.tboHotelData — falling back to mock rooms');
          } else {
            // Build a minimal TBO search request (safe — only availability/pricing)
            const toYMD = (d: any) => {
              if (!d) return null;
              const dt = new Date(d);
              if (isNaN(dt.getTime())) return null;
              return dt.toISOString().slice(0, 10);
            };

            const checkIn = toYMD(firstHotelLive?.checkInDate) ?? toYMD(event.date) ?? null;
            const checkOut = toYMD(firstHotelLive?.checkOutDate) ?? null;

            if (!checkIn || !checkOut) {
              console.log('[Microsite] Missing checkIn/checkOut — cannot perform live TBO search, falling back to mock');
            } else {
              const searchReq = {
                CheckIn: checkIn,
                CheckOut: checkOut,
                HotelCodes: String(hotelCode),
                GuestNationality: (tboData?.GuestNationality ?? tboData?.Nationality ?? 'IN'),
                PaxRooms: [{ Adults: 2, Children: 0 }],
                ResponseTime: 20,
                IsDetailedResponse: true,
                Filters: {
                  Refundable: false,
                  NoOfRooms: firstHotelLive?.numberOfRooms ?? 1,
                  MealType: tboData?.mealPlan ?? 'All',
                  OrderBy: 'Price',
                  StarRating: tboData?.starRating ?? 0,
                  HotelName: '',
                },
              } as any;

              const resp = await searchHotels(searchReq as any);
              const hotelResults = (resp as any)?.HotelResult ?? [];
              const roomsFromTbo: Array<any> = [];
              for (const hr of hotelResults) {
                const hrRooms = hr?.HotelRooms ?? [];
                for (let i = 0; i < hrRooms.length; i++) {
                  const room = hrRooms[i];
                  // Sanitize: DO NOT return booking codes, cancellation policies or vendor IDs
                  const name = Array.isArray(room?.Name) ? room.Name[0] : room?.Name ?? `${hr.HotelName} Room`;
                  const price = Number(room?.TotalFare ?? room?.TotalFare ?? hr?.MinCost ?? 0) || 0;
                  roomsFromTbo.push({
                    id: `tbo-${hr?.HotelCode ?? hotelCode}-${i}`,
                    name,
                    price,
                    refundable: !!room?.IsRefundable,
                    mealPlan: room?.MealType ?? null,
                  });
                }
              }

              if (roomsFromTbo.length > 0) {
                return res.json({ rooms: roomsFromTbo });
              }
              console.log('[Microsite] Live TBO search returned no rooms; falling back to mock.');
            }
          }
        } catch (liveErr: any) {
          console.error('[Microsite] Live TBO fetch failed, falling back to mock rooms:', liveErr?.message ?? liveErr);
        }
      }

      // Fallback/mock rooms — display-only, safe for public pages
      // Use any existing hotel booking info to make the mock feel realistic
      const hotelBookings = await storage.getHotelBookings(event.id);
      const firstHotel = hotelBookings[0];
      const baseName = firstHotel?.hotelName ?? event.name ?? 'Hotel';
      const rooms = [
        { id: 'standard', name: `${baseName} — Standard Room`, price: 2000 },
        { id: 'deluxe', name: `${baseName} — Deluxe Room`, price: 3200 },
      ];

      res.json({ rooms });
    } catch (err: any) {
      console.error('[Microsite Rooms] Error:', err);
      res.status(500).json({ message: err.message ?? 'Failed to load rooms' });
    }
  });

  // POST /api/microsite/:eventCode/register — new attendee self-registration
  // Creates a pending guest; agent reviews in EventDetails
  app.post("/api/microsite/:eventCode/register", async (req, res) => {
    try {
      const event = await storage.getEventByCode(req.params.eventCode);
      if (!event || !event.isPublished) {
        return res.status(404).json({ message: "Event not found or not published" });
      }

      const { name, email, phone } = req.body;
      if (!name || !email) {
        return res.status(400).json({ message: "name and email are required" });
      }

      const guest = await storage.createGuest({
        eventId: event.id,
        name,
        email,
        phone: phone ?? null,
        status: "pending",
        allocatedSeats: 1,
        confirmedSeats: 1,
        isOnWaitlist: false,
        waitlistPriority: 0,
        selfManageFlights: false,
        selfManageHotel: false,
      });

      res.status(201).json({
        bookingRef: guest.bookingRef,
        message: "Your registration request has been received. The event organizer will confirm your details and send you a personalized link.",
      });
    } catch (err: any) {
      console.error("[Microsite Register] Error:", err);
      res.status(500).json({ message: err.message ?? "Registration failed" });
    }
  });

  // POST /api/microsite/:eventCode/draft-booking
  // Create a lightweight, non-sensitive draft booking for microsite flows.
  app.post("/api/microsite/:eventCode/draft-booking", async (req, res) => {
    try {
      const event = await storage.getEventByCode(req.params.eventCode);
      if (!event || !event.isPublished) return res.status(404).json({ message: "Event not found or not published" });

      const { roomId, roomName, price, nights } = req.body ?? {};
      if (!roomId || !roomName) return res.status(400).json({ message: "roomId and roomName are required" });

      // Prefer hotel name from event's first hotel booking, otherwise use event name
      const hotelBookings = await storage.getHotelBookings(event.id);
      const firstHotel = hotelBookings?.[0];
      const hotelName = firstHotel?.hotelName ?? event.name ?? 'Hotel';

      // Derive checkIn/checkOut from booking or event if available
      const checkIn = firstHotel?.checkInDate ?? event.date ?? new Date().toISOString();
      const checkOut = firstHotel?.checkOutDate ?? new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();

      const draftRef = `DRFT-${Date.now().toString(36).toUpperCase()}`;

      const bookingPayload: any = {
        eventId: event.id,
        hotelName,
        checkInDate: new Date(checkIn),
        checkOutDate: new Date(checkOut),
        numberOfRooms: 1,
        tboHotelData: {
          draft: true,
          draftRef,
          selectedRoom: { id: roomId, name: roomName, price: Number(price ?? 0), nights: Number(nights ?? 1) },
          createdAt: new Date().toISOString(),
        },
      };

      const saved = await storage.createHotelBooking(bookingPayload);

      // Return only non-sensitive identifiers
      res.status(201).json({ draftId: saved.id, draftRef });
    } catch (err: any) {
      console.error('[Microsite Draft] Error:', err);
      res.status(500).json({ message: err.message ?? 'Failed to create draft booking' });
    }
  });

  // ─── Client Multi-Event Routes ───────────────────────────────────────────────

  // GET /api/events/my-client-events — all events where the logged-in client is the host
  app.get("/api/events/my-client-events", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "client") {
        return res.status(403).json({ message: "Client access required" });
      }
      // Primary: events explicitly linked to this client via clientId
      // Fallback: events matching user's eventCode (in case clientId wasn't set yet)
      const whereClause = user.eventCode
        ? or(eq(events.clientId, user.id), eq(events.eventCode, user.eventCode))
        : eq(events.clientId, user.id);
      const clientEvents = await db
        .select()
        .from(events)
        .where(whereClause);
      res.json(clientEvents);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to load events" });
    }
  });

  // GET /api/events/:id/cost-breakdown — financial summary for client dashboard
  app.get("/api/events/:id/cost-breakdown", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || (user.role !== "client" && user.role !== "agent")) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      const eventId = Number(req.params.id);

      // Scope check: clients may only view their own event cost breakdown
      if (user.role === "client") {
        const event = await storage.getEvent(eventId);
        if (!event || event.clientId !== user.id) {
          return res.status(403).json({ message: "You can only view your own events" });
        }
      }

      // Fetch labels with budget info
      const eventLabels = await db.select().from(labels).where(eq(labels.eventId, eventId));
      const eventGuests = await storage.getGuests(eventId);

      const byLabel = await Promise.all(eventLabels.map(async (label: any) => {
        const normalizedLabelName = (label.name ?? "").trim().toLowerCase();
        const labelGuests = eventGuests.filter((g: any) => {
          if (g.labelId === label.id) return true;
          const guestCategory = (g.category ?? "").trim().toLowerCase();
          return !g.labelId && guestCategory.length > 0 && guestCategory === normalizedLabelName;
        });
        const guestIds = labelGuests.map(g => g.id);

        // Sum approved guestRequests.budgetConsumed for guests in this label
        let addOnBudgetUsed = 0;
        if (guestIds.length > 0) {
          const result = await db
            .select({ total: sql<number>`coalesce(sum(${guestRequests.budgetConsumed}), 0)` })
            .from(guestRequests)
            .where(and(
              eq(guestRequests.status, "approved"),
              sql`${guestRequests.guestId} = ANY(${sql.raw(`ARRAY[${guestIds.join(",")}]`)})`
            ));
          addOnBudgetUsed = Number(result[0]?.total ?? 0);
        }

        return {
          name: label.name,
          guestCount: labelGuests.length,
          addOnBudget: (label as any).addOnBudget ?? 0,
          addOnBudgetAllocated: ((label as any).addOnBudget ?? 0) * labelGuests.length,
          addOnBudgetUsed,
        };
      }));

      const totalAddOnBudgetAllocated = byLabel.reduce((s, l) => s + l.addOnBudgetAllocated, 0);
      const totalAddOnBudgetUsed = byLabel.reduce((s, l) => s + l.addOnBudgetUsed, 0);

      res.json({
        totalGuests: eventGuests.length,
        confirmedGuests: eventGuests.filter(g => g.status === "confirmed").length,
        totalAddOnBudgetAllocated,
        totalAddOnBudgetUsed,
        byLabel,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to load cost breakdown" });
    }
  });

  // ─── Ground Team Check-in Routes ─────────────────────────────────────────────

  // GET /api/groundteam/my-event — returns event info for logged-in ground team user
  app.get("/api/groundteam/my-event", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || user.role !== "groundTeam") {
        return res.status(403).json({ message: "Ground team access required" });
      }
      if (!user.eventCode) {
        return res.status(404).json({ message: "No event assigned to this account" });
      }
      const events = await storage.getEventsByCode(user.eventCode);
      if (!events || events.length === 0) {
        return res.status(404).json({ message: "Assigned event not found" });
      }
      // Return full list of assigned events (id, name, eventCode) so client can
      // let ground team choose when they are assigned to multiple events.
      const out = events.map(e => ({ id: e.id, name: e.name, eventCode: e.eventCode }));
      res.json(out);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed" });
    }
  });

  // POST /api/groundteam/create-account — agent creates a ground team staff account
  app.post("/api/groundteam/create-account", async (req, res) => {
    try {
      const agent = getUser(req);
      if (!agent || agent.role !== "agent") {
        return res.status(403).json({ message: "Agent access required" });
      }
      const { email, password, firstName, lastName, eventCode } = req.body;
      if (!email || !password || !firstName || !eventCode) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName: lastName ?? "",
        role: "groundTeam",
        eventCode,
      });
      res.status(201).json({ id: newUser.id, email: newUser.email, firstName: newUser.firstName });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to create account" });
    }
  });

  // POST /api/groundteam/checkin/:guestId — mark guest as arrived
  app.post("/api/groundteam/checkin/:guestId", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || (user.role !== "agent" && user.role !== "groundTeam")) {
        return res.status(403).json({ message: "Only agents or ground team can check in guests" });
      }
      const guest = await storage.updateGuest(Number(req.params.guestId), { status: "arrived" } as any);
      if (!guest) return res.status(404).json({ message: "Guest not found" });
      res.json(guest);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Check-in failed" });
    }
  });

  // POST /api/groundteam/no-show/:guestId — mark a guest as no-show
  app.post("/api/groundteam/no-show/:guestId", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user || (user.role !== "agent" && user.role !== "groundTeam")) {
        return res.status(403).json({ message: "Only agents or ground team can mark no-shows" });
      }
      const guest = await storage.updateGuest(Number(req.params.guestId), { status: "no_show" } as any);
      if (!guest) return res.status(404).json({ message: "Guest not found" });
      res.json(guest);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "No-show update failed" });
    }
  });

  // GET /api/events/:id/checkin-stats — live check-in stats for ground team dashboard
  app.get("/api/events/:id/checkin-stats", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const eventId = Number(req.params.id);
      const allGuests = await storage.getGuests(eventId);
      const arrived = allGuests.filter(g => g.status === "arrived").length;
      const confirmed = allGuests.filter(g => g.status === "confirmed").length;
      const pending = allGuests.filter(g => g.status === "pending").length;
      const noShow = allGuests.filter(g => g.status === "no_show").length;

      res.json({
        total: allGuests.length,
        arrived,
        confirmed,
        pending,
        noShow,
        notArrived: allGuests.length - arrived - noShow,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to fetch check-in stats" });
    }
  });

  // GET /api/events/:id/manifest — full guest manifest for Excel download
  app.get("/api/events/:id/manifest", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const eventId = Number(req.params.id);
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const allGuests = await storage.getGuests(eventId);
      const labels = await storage.getLabels(eventId);
      const labelMap = Object.fromEntries(labels.map(l => [l.id, l.name]));
      const manifestGuests = allGuests.map(g => ({
        name: g.name,
        bookingRef: g.bookingRef,
        label: g.labelId ? (labelMap[g.labelId] ?? "") : "",
        status: g.status,
        confirmedSeats: g.confirmedSeats ?? 1,
        arrivalMode: g.arrivalMode ?? "group_flight",
        originCity: g.originCity ?? "",
        arrivalPnr: g.arrivalPnr ?? "",
        departurePnr: g.departurePnr ?? "",
        mealPreference: g.mealPreference ?? "",
        extendedCheckIn: g.partialStayCheckIn ? new Date(g.partialStayCheckIn).toISOString().split("T")[0] : "",
        extendedCheckOut: g.partialStayCheckOut ? new Date(g.partialStayCheckOut).toISOString().split("T")[0] : "",
        emergencyContactName: g.emergencyContactName ?? "",
        emergencyContactPhone: g.emergencyContactPhone ?? "",
        registrationSource: g.registrationSource ?? "invited",
        specialRequests: g.specialRequests ?? "",
      }));
      res.json({ eventName: event.name, guests: manifestGuests });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to generate manifest" });
    }
  });

  // GET /api/events/:id/inventory/status — EWS: utilisation + alerts for hotel/flight blocks
  app.get("/api/events/:id/inventory/status", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const eventId = Number(req.params.id);
      const inventory = await storage.getGroupInventory(eventId);
      const allGuests = await storage.getGuests(eventId);
      const confirmedGuests = allGuests.filter(g => g.status === "confirmed" || g.status === "arrived").length;

      const hotelAlerts = inventory
        .filter(inv => inv.inventoryType === "hotel")
        .map(inv => {
          const blocked = inv.roomsBlocked ?? 0;
          const utilized = inv.roomsConfirmed ?? 0;
          const available = Math.max(0, blocked - utilized);
          const utilizationPct = blocked > 0 ? Math.round((utilized / blocked) * 100) : 0;
          const severity = utilizationPct >= 90 ? "critical" : utilizationPct >= 70 ? "warning" : "ok";
          return {
            hotelName: inv.notes ?? `Hotel block #${inv.id}`,
            roomsBlocked: blocked,
            roomsConfirmed: utilized,
            roomsAvailable: available,
            utilizationPct,
            severity,
            message: severity === "critical"
              ? `Only ${available} room${available !== 1 ? "s" : ""} remaining — act now`
              : severity === "warning"
              ? `${utilizationPct}% of rooms confirmed — ${available} still available`
              : `${available} rooms available`,
          };
        });

      const flightInventory = inventory.filter(inv => inv.inventoryType === "flight");
      const flightAlerts = flightInventory.map(inv => {
        const seatsBlocked = inv.seatsAllocated ?? 0;
        const seatsConfirmed = inv.seatsConfirmed ?? 0;
        const utilizationPct = seatsBlocked > 0 ? Math.round((seatsConfirmed / seatsBlocked) * 100) : 0;
        const severity = utilizationPct >= 90 ? "critical" : utilizationPct >= 70 ? "warning" : "ok";
        return {
          severity,
          seatsBlocked,
          seatsConfirmed,
          utilizationPct,
          message: `Flight block ${utilizationPct}% utilized — ${Math.max(0, seatsBlocked - seatsConfirmed)} seats remaining`,
        };
      });

      res.json({ hotelAlerts, flightAlerts });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to fetch inventory status" });
    }
  });

  // PATCH /api/events/:eventId/guests/:guestId/flight-status — ground team sets flight status
  app.patch("/api/events/:eventId/guests/:guestId/flight-status", async (req, res) => {
    try {
      const user = getUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const guestId = Number(req.params.guestId);
      const { flightStatus } = req.body;
      const VALID_STATUSES = ["unknown", "on_time", "delayed", "landed", "cancelled"];
      if (!VALID_STATUSES.includes(flightStatus)) {
        return res.status(400).json({ message: "Invalid flight status" });
      }
      const [updated] = await db
        .update(guests)
        .set({ flightStatus })
        .where(eq(guests.id, guestId))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to update flight status" });
    }
  });

  // Register guest portal routes
  app.use(guestRoutes);

  return httpServer;
}
