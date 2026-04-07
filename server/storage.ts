import { db } from "./db";
import { randomUUID } from "crypto";
import {
  events, labels, perks, labelPerks, guests, guestFamily, guestRequests,
  users, clientDetails, hotelBookings, travelOptions, travelSchedules, itineraryEvents,
  groupInventory,
  type InsertEvent, type InsertLabel, type InsertPerk, type InsertLabelPerk,
  type InsertGuest, type InsertGuestFamily, type InsertGuestRequest,
  type Event, type Label, type Perk, type LabelPerk, type Guest, type GuestFamily, type GuestRequest,
  type User, type UpsertUser,
  type InsertClientDetails, type ClientDetails, type InsertHotelBooking, type HotelBooking,
  type InsertTravelOption, type TravelOption, type InsertTravelSchedule, type TravelSchedule,
  type ItineraryEvent, type GroupInventory, type InsertGroupInventory
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

// Combine IAuthStorage with app-specific storage methods if needed, 
// or just export a new interface for app data.
// For simplicity in this structure, we'll keep them somewhat separate but can be merged.

export interface IStorage {
  // Users
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  updateUserEventCode(userId: string, eventCode: string): Promise<void>;

  // Events
  getEvents(): Promise<Event[]>;
  getEvent(id: number): Promise<Event | undefined>;
  getEventByCode(code: string): Promise<Event | undefined>;
  getEventsByAgent(agentId: string): Promise<Event[]>;
  getEventsByCode(code: string): Promise<Event[]>;
  createEvent(event: Omit<InsertEvent, 'eventCode'> & { eventCode: string }): Promise<Event>;
  updateEvent(id: number, event: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: number): Promise<void>;

  // Client Details
  createClientDetails(details: InsertClientDetails): Promise<ClientDetails>;
  getClientDetails(eventId: number): Promise<ClientDetails | undefined>;
  updateClientDetails(eventId: number, details: Partial<InsertClientDetails>): Promise<ClientDetails>;

  // Hotel Bookings
  createHotelBooking(booking: InsertHotelBooking): Promise<HotelBooking>;
  getHotelBookings(eventId: number): Promise<HotelBooking[]>;
  updateHotelBooking(id: number, data: Partial<InsertHotelBooking>): Promise<HotelBooking | undefined>;

  // Travel Options
  createTravelOption(option: InsertTravelOption): Promise<TravelOption>;
  getTravelOptions(eventId: number): Promise<TravelOption[]>;
  createTravelSchedule(schedule: InsertTravelSchedule): Promise<TravelSchedule>;
  getTravelSchedules(travelOptionId: number): Promise<TravelSchedule[]>;

  // Labels
  getLabels(eventId: number): Promise<Label[]>;
  createLabel(label: InsertLabel): Promise<Label>;
  updateLabel(id: number, label: Partial<InsertLabel>): Promise<Label | undefined>;

  // Perks
  getPerks(eventId: number): Promise<Perk[]>;
  createPerk(perk: InsertPerk): Promise<Perk>;
  updatePerk(id: number, perk: Partial<InsertPerk>): Promise<Perk | undefined>;

  // LabelPerks
  getLabelPerks(labelId: number): Promise<(LabelPerk & { perk: Perk })[]>;
  updateLabelPerk(labelId: number, perkId: number, data: Partial<InsertLabelPerk>): Promise<LabelPerk>;

  // Guests
  getGuests(eventId: number): Promise<Guest[]>;
  getGuest(id: number): Promise<Guest | undefined>;
  getGuestByRef(ref: string): Promise<(Guest & { event: Event, label: Label | null }) | undefined>;
  createGuest(guest: InsertGuest): Promise<Guest>;
  updateGuest(id: number, guest: Partial<InsertGuest>): Promise<Guest | undefined>;

  // GuestFamily
  getGuestFamily(guestId: number): Promise<GuestFamily[]>;
  createGuestFamily(member: InsertGuestFamily): Promise<GuestFamily>;

  // Requests
  getRequests(eventId: number): Promise<(GuestRequest & { guest: Guest, perk: Perk | null })[]>;
  createRequest(request: InsertGuestRequest): Promise<GuestRequest>;
  updateRequest(id: number, data: { status: string, notes?: string }): Promise<GuestRequest | undefined>;

  // TBO data update helpers
  updateHotelBookingTboData(id: number, tboHotelData: unknown): Promise<HotelBooking>;
  updateTravelOptionTboData(id: number, tboFlightData: unknown): Promise<TravelOption>;

  // Group Inventory
  createGroupInventory(data: InsertGroupInventory): Promise<GroupInventory>;
  getGroupInventory(eventId: number): Promise<GroupInventory[]>;
  updateGroupInventory(id: number, data: Partial<InsertGroupInventory>): Promise<GroupInventory | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: UpsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUserEventCode(userId: string, eventCode: string): Promise<void> {
    await db.update(users).set({ eventCode, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  // Events
  async getEvents(): Promise<Event[]> {
    return await db.select().from(events);
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async getEventByCode(code: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.eventCode, code));
    return event;
  }

  async getEventsByAgent(agentId: string): Promise<Event[]> {
    return await db.select().from(events).where(eq(events.agentId, agentId));
  }

  async getEventsByCode(code: string): Promise<Event[]> {
    return await db.select().from(events).where(eq(events.eventCode, code));
  }

  async createEvent(event: Omit<InsertEvent, 'eventCode'> & { eventCode: string }): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async updateEvent(id: number, event: Partial<InsertEvent>): Promise<Event | undefined> {
    const [updated] = await db.update(events).set(event).where(eq(events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: number): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  // Client Details
  async createClientDetails(details: InsertClientDetails): Promise<ClientDetails> {
    const [newDetails] = await db.insert(clientDetails).values(details).returning();
    return newDetails;
  }

  async getClientDetails(eventId: number): Promise<ClientDetails | undefined> {
    const [details] = await db.select().from(clientDetails).where(eq(clientDetails.eventId, eventId));
    return details;
  }

  async updateClientDetails(eventId: number, details: Partial<InsertClientDetails>): Promise<ClientDetails> {
    const [updated] = await db
      .update(clientDetails)
      .set(details)
      .where(eq(clientDetails.eventId, eventId))
      .returning();
    return updated;
  }

  // Hotel Bookings
  async createHotelBooking(booking: InsertHotelBooking): Promise<HotelBooking> {
    const [newBooking] = await db.insert(hotelBookings).values(booking).returning();
    return newBooking;
  }

  async getHotelBookings(eventId: number): Promise<HotelBooking[]> {
    return await db.select().from(hotelBookings).where(eq(hotelBookings.eventId, eventId));
  }

  async updateHotelBooking(id: number, data: Partial<InsertHotelBooking>): Promise<HotelBooking | undefined> {
    const [updated] = await db
      .update(hotelBookings)
      .set(data)
      .where(eq(hotelBookings.id, id))
      .returning();
    return updated;
  }

  // Travel Options
  async createTravelOption(option: InsertTravelOption): Promise<TravelOption> {
    const [newOption] = await db.insert(travelOptions).values(option).returning();
    return newOption;
  }

  async getTravelOptions(eventId: number): Promise<TravelOption[]> {
    return await db.select().from(travelOptions).where(eq(travelOptions.eventId, eventId));
  }

  async createTravelSchedule(schedule: InsertTravelSchedule): Promise<TravelSchedule> {
    const [newSchedule] = await db.insert(travelSchedules).values(schedule).returning();
    return newSchedule;
  }

  async getTravelSchedules(travelOptionId: number): Promise<TravelSchedule[]> {
    return await db.select().from(travelSchedules).where(eq(travelSchedules.travelOptionId, travelOptionId));
  }

  // Labels
  async getLabels(eventId: number): Promise<Label[]> {
    return await db.select().from(labels).where(eq(labels.eventId, eventId));
  }

  async createLabel(label: InsertLabel): Promise<Label> {
    const [newLabel] = await db.insert(labels).values(label).returning();
    return newLabel;
  }

  async updateLabel(id: number, label: Partial<InsertLabel>): Promise<Label | undefined> {
    const [updated] = await db.update(labels).set(label).where(eq(labels.id, id)).returning();
    return updated;
  }

  // Perks
  async getPerks(eventId: number): Promise<Perk[]> {
    return await db.select().from(perks).where(eq(perks.eventId, eventId));
  }

  async createPerk(perk: InsertPerk): Promise<Perk> {
    const [newPerk] = await db.insert(perks).values(perk).returning();
    return newPerk;
  }

  async updatePerk(id: number, perk: Partial<InsertPerk>): Promise<Perk | undefined> {
    const [updated] = await db.update(perks).set(perk).where(eq(perks.id, id)).returning();
    return updated;
  }

  // LabelPerks
  async getLabelPerks(labelId: number): Promise<(LabelPerk & { perk: Perk })[]> {
    const rows = await db.select()
      .from(labelPerks)
      .innerJoin(perks, eq(labelPerks.perkId, perks.id))
      .where(eq(labelPerks.labelId, labelId));
    
    return rows.map(r => ({ ...r.label_perks, perk: r.perks }));
  }

  async updateLabelPerk(labelId: number, perkId: number, data: Partial<InsertLabelPerk>): Promise<LabelPerk> {
    const [existing] = await db.select().from(labelPerks)
      .where(and(eq(labelPerks.labelId, labelId), eq(labelPerks.perkId, perkId)));

    if (existing) {
      const [updated] = await db.update(labelPerks)
        .set(data)
        .where(eq(labelPerks.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(labelPerks)
        .values({ labelId, perkId, isEnabled: data.isEnabled ?? true, expenseHandledByClient: data.expenseHandledByClient ?? false })
        .returning();
      return created;
    }
  }

  // Guests
  async getGuests(eventId: number): Promise<Guest[]> {
    return await db.select().from(guests).where(eq(guests.eventId, eventId));
  }

  async getGuest(id: number): Promise<Guest | undefined> {
    const [guest] = await db.select().from(guests).where(eq(guests.id, id));
    return guest;
  }

  async getGuestByRef(ref: string): Promise<(Guest & { event: Event, label: Label | null }) | undefined> {
    const [result] = await db.select()
      .from(guests)
      .innerJoin(events, eq(guests.eventId, events.id))
      .leftJoin(labels, eq(guests.category, labels.name))
      .where(eq(guests.bookingRef, ref));
    
    if (result) {
      return { ...result.guests, event: result.events, label: result.labels };
    }
    return undefined;
  }

  async createGuest(guest: InsertGuest): Promise<Guest> {
    try {
      // Auto-generate access token and booking reference for guest portal
      const accessToken = randomUUID();
      const bookingRef = `GP${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      let resolvedLabelId = guest.labelId ?? null;
      if (!resolvedLabelId && guest.category && guest.category.trim()) {
        const normalizedCategory = guest.category.trim().toLowerCase();
        const [matchedLabel] = await db
          .select()
          .from(labels)
          .where(and(
            eq(labels.eventId, guest.eventId),
            sql`lower(${labels.name}) = ${normalizedCategory}`
          ))
          .limit(1);
        if (matchedLabel) {
          resolvedLabelId = matchedLabel.id;
        }
      }
      
      console.log('[STORAGE] Generating guest with token:', accessToken, 'ref:', bookingRef);
      
      // Convert phone to string if it's a number
      const guestData = {
        ...guest,
        labelId: resolvedLabelId,
        phone: guest.phone ? String(guest.phone) : null,
        accessToken,
        bookingRef,
      };
      
      console.log('[STORAGE] Inserting guest data:', guestData);
      
      const [newGuest] = await db.insert(guests).values(guestData).returning();
      
      console.log('[STORAGE] Guest created successfully with id:', newGuest.id);
      
      return newGuest;
    } catch (error: any) {
      console.error('[STORAGE ERROR] Failed to create guest:', error.message);
      throw error;
    }
  }

  // Create guest using an existing pg client (transactional / advisory lock use)
  async createGuestWithClient(client: any, guest: InsertGuest): Promise<any> {
    try {
      const accessToken = randomUUID();
      const bookingRef = `GP${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      let resolvedLabelId = guest.labelId ?? null;
      if (!resolvedLabelId && guest.category && guest.category.trim()) {
        const normalizedCategory = guest.category.trim().toLowerCase();
        const matched = await client.query(
          `SELECT id FROM labels WHERE event_id = $1 AND lower(name) = $2 LIMIT 1`,
          [guest.eventId, normalizedCategory]
        );
        if (matched.rows[0]) resolvedLabelId = matched.rows[0].id;
      }

      const guestData = {
        ...guest,
        labelId: resolvedLabelId,
        phone: guest.phone ? String(guest.phone) : null,
        accessToken,
        bookingRef,
      };

      const cols = Object.keys(guestData).map(c => `"${c}"`).join(', ');
      const vals = Object.values(guestData);
      const placeholders = vals.map((_, i) => `$${i+1}`).join(', ');

      const insertSql = `INSERT INTO guests (${cols}) VALUES (${placeholders}) RETURNING *`;
      const res = await client.query(insertSql, vals);
      return res.rows[0];
    } catch (err) {
      console.error('[STORAGE ERROR] createGuestWithClient failed:', err);
      throw err;
    }
  }

  async updateGuest(id: number, guest: Partial<InsertGuest>): Promise<Guest | undefined> {
    const [updated] = await db.update(guests).set(guest).where(eq(guests.id, id)).returning();
    return updated;
  }

  async deleteGuest(id: number): Promise<void> {
    // First delete related family members
    await db.delete(guestFamily).where(eq(guestFamily.guestId, id));
    
    // Then delete the guest
    await db.delete(guests).where(eq(guests.id, id));
  }

  // GuestFamily
  async getGuestFamily(guestId: number): Promise<GuestFamily[]> {
    return await db.select().from(guestFamily).where(eq(guestFamily.guestId, guestId));
  }

  async createGuestFamily(member: InsertGuestFamily): Promise<GuestFamily> {
    const [newMember] = await db.insert(guestFamily).values(member).returning();
    return newMember;
  }

  // Requests
  async getRequests(eventId: number): Promise<(GuestRequest & { guest: Guest, perk: Perk | null })[]> {
    const rows = await db.select({
      request: guestRequests,
      guest: guests,
      perk: perks
    })
      .from(guestRequests)
      .innerJoin(guests, eq(guestRequests.guestId, guests.id))
      .leftJoin(perks, eq(guestRequests.perkId, perks.id))
      .where(eq(guests.eventId, eventId));

    return rows.map(r => ({ ...r.request, guest: r.guest, perk: r.perk }));
  }

  async createRequest(request: InsertGuestRequest): Promise<GuestRequest> {
    const [newRequest] = await db.insert(guestRequests).values(request).returning();
    return newRequest;
  }

  async updateRequest(id: number, data: { status: string, notes?: string }): Promise<GuestRequest | undefined> {
    const [updated] = await db.update(guestRequests).set(data).where(eq(guestRequests.id, id)).returning();
    return updated;
  }

  // Itinerary Events (seed helper)
  async seedItineraryEvents(events: any[]): Promise<ItineraryEvent[]> {
    const inserted = await db.insert(itineraryEvents).values(events).returning();
    return inserted;
  }

  // TBO data update helpers
  async updateHotelBookingTboData(id: number, tboHotelData: unknown): Promise<HotelBooking> {
    const [updated] = await db
      .update(hotelBookings)
      .set({ tboHotelData })
      .where(eq(hotelBookings.id, id))
      .returning();
    return updated;
  }

  async updateTravelOptionTboData(id: number, tboFlightData: unknown): Promise<TravelOption> {
    const [updated] = await db
      .update(travelOptions)
      .set({ tboFlightData })
      .where(eq(travelOptions.id, id))
      .returning();
    return updated;
  }

  // Group Inventory
  async createGroupInventory(data: InsertGroupInventory): Promise<GroupInventory> {
    const [record] = await db.insert(groupInventory).values(data).returning();
    return record;
  }

  async getGroupInventory(eventId: number): Promise<GroupInventory[]> {
    return await db.select().from(groupInventory).where(eq(groupInventory.eventId, eventId));
  }

  async updateGroupInventory(id: number, data: Partial<InsertGroupInventory>): Promise<GroupInventory | undefined> {
    const [updated] = await db
      .update(groupInventory)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(groupInventory.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();

// Legacy InMemoryStorage - kept for reference but not used
export class InMemoryStorage implements IStorage {
  private users: User[] = [];
  private events: Event[] = [];
  private clientDetails: ClientDetails[] = [];
  private hotelBookings: HotelBooking[] = [];
  private travelOptions: TravelOption[] = [];
  private travelSchedules: TravelSchedule[] = [];
  private labels: Label[] = [];
  private perks: Perk[] = [];
  private labelPerks: LabelPerk[] = [];
  private guests: Guest[] = [];
  private guestFamily: GuestFamily[] = [];
  private guestRequests: GuestRequest[] = [];
  
  private eventIdCounter = 1;
  private clientDetailsIdCounter = 1;
  private hotelBookingIdCounter = 1;
  private travelOptionIdCounter = 1;
  private travelScheduleIdCounter = 1;
  private labelIdCounter = 1;
  private perkIdCounter = 1;
  private labelPerkIdCounter = 1;
  private guestIdCounter = 1;
  private guestFamilyIdCounter = 1;
  private guestRequestIdCounter = 1;
  
  // Users
  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.users.find(u => u.email === email);
  }

  async createUser(user: UpsertUser): Promise<User> {
    const newUser: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      email: user.email ?? null,
      password: user.password ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      role: user.role ?? "client",
      eventCode: user.eventCode ?? null,
      profileImageUrl: user.profileImageUrl ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(newUser);
    return newUser;
  }

  async updateUserEventCode(userId: string, eventCode: string): Promise<void> {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.eventCode = eventCode;
      user.updatedAt = new Date();
    }
  }

  // Events
  async getEvents(): Promise<Event[]> {
    return this.events;
  }

  async getEvent(id: number): Promise<Event | undefined> {
    return this.events.find(e => e.id === id);
  }

  async getEventByCode(code: string): Promise<Event | undefined> {
    return this.events.find(e => e.eventCode === code);
  }

  async getEventsByAgent(agentId: string): Promise<Event[]> {
    return this.events.filter(e => e.agentId === agentId);
  }

  async getEventsByCode(code: string): Promise<Event[]> {
    const event = await this.getEventByCode(code);
    return event ? [event] : [];
  }

  async createEvent(event: Omit<InsertEvent, 'eventCode'> & { eventCode: string }): Promise<Event> {
    const newEvent = { ...event, id: this.eventIdCounter++, createdAt: new Date() } as Event;
    this.events.push(newEvent);
    return newEvent;
  }
  async updateEvent(id: number, event: Partial<InsertEvent>): Promise<Event | undefined> {
    const index = this.events.findIndex(e => e.id === id);
    if (index === -1) return undefined;
    this.events[index] = { ...this.events[index], ...event };
    return this.events[index];
  }

  // Client Details
  async createClientDetails(details: InsertClientDetails): Promise<ClientDetails> {
    const newDetails = { ...details, id: this.clientDetailsIdCounter++ } as ClientDetails;
    this.clientDetails.push(newDetails);
    return newDetails;
  }

  async getClientDetails(eventId: number): Promise<ClientDetails | undefined> {
    return this.clientDetails.find(d => d.eventId === eventId);
  }

  async updateClientDetails(eventId: number, details: Partial<InsertClientDetails>): Promise<ClientDetails> {
    const index = this.clientDetails.findIndex(d => d.eventId === eventId);
    if (index !== -1) {
      this.clientDetails[index] = { ...this.clientDetails[index], ...details };
      return this.clientDetails[index];
    }
    throw new Error('Client details not found');
  }

  // Hotel Bookings
  async createHotelBooking(booking: InsertHotelBooking): Promise<HotelBooking> {
    const newBooking = { ...booking, id: this.hotelBookingIdCounter++ } as HotelBooking;
    this.hotelBookings.push(newBooking);
    return newBooking;
  }

  async getHotelBookings(eventId: number): Promise<HotelBooking[]> {
    return this.hotelBookings.filter(b => b.eventId === eventId);
  }

  async updateHotelBooking(id: number, data: Partial<InsertHotelBooking>): Promise<HotelBooking | undefined> {
    const index = this.hotelBookings.findIndex(h => h.id === id);
    if (index === -1) return undefined;
    this.hotelBookings[index] = { ...this.hotelBookings[index], ...data } as HotelBooking;
    return this.hotelBookings[index];
  }

  // Travel Options
  async createTravelOption(option: InsertTravelOption): Promise<TravelOption> {
    const newOption = { ...option, id: this.travelOptionIdCounter++ } as TravelOption;
    this.travelOptions.push(newOption);
    return newOption;
  }

  async getTravelOptions(eventId: number): Promise<TravelOption[]> {
    return this.travelOptions.filter(o => o.eventId === eventId);
  }

  async createTravelSchedule(schedule: InsertTravelSchedule): Promise<TravelSchedule> {
    const newSchedule = { ...schedule, id: this.travelScheduleIdCounter++ } as TravelSchedule;
    this.travelSchedules.push(newSchedule);
    return newSchedule;
  }

  async getTravelSchedules(travelOptionId: number): Promise<TravelSchedule[]> {
    return this.travelSchedules.filter(s => s.travelOptionId === travelOptionId);
  }

  // Labels
  async getLabels(eventId: number): Promise<Label[]> {
    return this.labels.filter(l => l.eventId === eventId);
  }
  async createLabel(label: InsertLabel): Promise<Label> {
    const newLabel = { ...label, id: this.labelIdCounter++ } as Label;
    this.labels.push(newLabel);
    return newLabel;
  }
  async updateLabel(id: number, label: Partial<InsertLabel>): Promise<Label | undefined> {
    const index = this.labels.findIndex(l => l.id === id);
    if (index === -1) return undefined;
    this.labels[index] = { ...this.labels[index], ...label };
    return this.labels[index];
  }

  // Perks
  async getPerks(eventId: number): Promise<Perk[]> {
    return this.perks.filter(p => p.eventId === eventId);
  }
  async createPerk(perk: InsertPerk): Promise<Perk> {
    const newPerk = { ...perk, id: this.perkIdCounter++ } as Perk;
    this.perks.push(newPerk);
    return newPerk;
  }
  async updatePerk(id: number, perk: Partial<InsertPerk>): Promise<Perk | undefined> {
    const index = this.perks.findIndex(p => p.id === id);
    if (index === -1) return undefined;
    this.perks[index] = { ...this.perks[index], ...perk };
    return this.perks[index];
  }

  // LabelPerks
  async getLabelPerks(labelId: number): Promise<(LabelPerk & { perk: Perk })[]> {
    return this.labelPerks
      .filter(lp => lp.labelId === labelId)
      .map(lp => {
        const perk = this.perks.find(p => p.id === lp.perkId)!;
        return { ...lp, perk };
      });
  }
  async updateLabelPerk(labelId: number, perkId: number, data: Partial<InsertLabelPerk>): Promise<LabelPerk> {
    const existingIndex = this.labelPerks.findIndex(lp => lp.labelId === labelId && lp.perkId === perkId);
    
    if (existingIndex !== -1) {
      this.labelPerks[existingIndex] = { ...this.labelPerks[existingIndex], ...data };
      return this.labelPerks[existingIndex];
    } else {
      const newLabelPerk = { 
        id: this.labelPerkIdCounter++, 
        labelId, 
        perkId, 
        isEnabled: data.isEnabled ?? true, 
        expenseHandledByClient: data.expenseHandledByClient ?? false 
      } as LabelPerk;
      this.labelPerks.push(newLabelPerk);
      return newLabelPerk;
    }
  }

  // Guests
  async getGuests(eventId: number): Promise<Guest[]> {
    return this.guests.filter(g => g.eventId === eventId);
  }
  async getGuest(id: number): Promise<Guest | undefined> {
    return this.guests.find(g => g.id === id);
  }
  async getGuestByRef(ref: string): Promise<(Guest & { event: Event, label: Label | null }) | undefined> {
    const guest = this.guests.find(g => g.bookingRef === ref);
    if (!guest) return undefined;
    
    const event = this.events.find(e => e.id === guest.eventId);
    const label = guest.labelId ? this.labels.find(l => l.id === guest.labelId) : null;
    
    if (event) {
      return { ...guest, event, label: label || null };
    }
    return undefined;
  }
  async createGuest(guest: InsertGuest): Promise<Guest> {
    // Auto-generate access token and booking reference for guest portal
    const accessToken = randomUUID();
    const bookingRef = `GP${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const newGuest = { 
      ...guest, 
      id: this.guestIdCounter++,
      accessToken,
      bookingRef,
    } as Guest;
    this.guests.push(newGuest);
    return newGuest;
  }
  async updateGuest(id: number, guest: Partial<InsertGuest>): Promise<Guest | undefined> {
    const index = this.guests.findIndex(g => g.id === id);
    if (index === -1) return undefined;
    this.guests[index] = { ...this.guests[index], ...guest };
    return this.guests[index];
  }

  // GuestFamily
  async getGuestFamily(guestId: number): Promise<GuestFamily[]> {
    return this.guestFamily.filter(gf => gf.guestId === guestId);
  }
  async createGuestFamily(member: InsertGuestFamily): Promise<GuestFamily> {
    const newMember = { ...member, id: this.guestFamilyIdCounter++ } as GuestFamily;
    this.guestFamily.push(newMember);
    return newMember;
  }

  // Requests
  async getRequests(eventId: number): Promise<(GuestRequest & { guest: Guest, perk: Perk | null })[]> {
    return this.guestRequests
      .filter(req => {
        const guest = this.guests.find(g => g.id === req.guestId);
        return guest && guest.eventId === eventId;
      })
      .map(req => {
        const guest = this.guests.find(g => g.id === req.guestId)!;
        const perk = req.perkId ? this.perks.find(p => p.id === req.perkId) : null;
        return { ...req, guest, perk: perk || null };
      });
  }
  async createRequest(request: InsertGuestRequest): Promise<GuestRequest> {
    const newRequest = { ...request, id: this.guestRequestIdCounter++, createdAt: new Date() } as GuestRequest;
    this.guestRequests.push(newRequest);
    return newRequest;
  }
  async updateRequest(id: number, data: { status: string, notes?: string }): Promise<GuestRequest | undefined> {
    const index = this.guestRequests.findIndex(req => req.id === id);
    if (index === -1) return undefined;
    this.guestRequests[index] = { ...this.guestRequests[index], ...data };
    return this.guestRequests[index];
  }

  // Stubs for new methods (InMemoryStorage not used in production)
  async deleteEvent(_id: number): Promise<void> { throw new Error("Not implemented"); }
  async updateHotelBookingTboData(_id: number, _data: unknown): Promise<HotelBooking> { throw new Error("Not implemented"); }
  async updateTravelOptionTboData(_id: number, _data: unknown): Promise<TravelOption> { throw new Error("Not implemented"); }
  async createGroupInventory(_data: InsertGroupInventory): Promise<GroupInventory> { throw new Error("Not implemented"); }
  async getGroupInventory(_eventId: number): Promise<GroupInventory[]> { return []; }
  async updateGroupInventory(_id: number, _data: Partial<InsertGroupInventory>): Promise<GroupInventory | undefined> { return undefined; }
}
