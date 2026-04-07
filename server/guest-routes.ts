/**
 * Guest Portal API Routes - Reference Implementation
 * 
 * These routes handle all guest-facing operations through token-based authentication.
 * Integrate these into your existing Express router.
 */

import { Router } from 'express';
import { db } from './db';
import { guests, guestFamily, itineraryEvents, guestItinerary, events, labels, labelPerks, perks, guestRequests, groupInventory, hotelBookings, bookingLabelInclusions } from '@shared/schema';
import { eq, and, lt, sql, sum, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const guestRoutes = Router();

/**
 * Helper: Find guest by access token
 */
async function getGuestByToken(token: string) {
  const [guest] = await db
    .select()
    .from(guests)
    .where(eq(guests.accessToken, token))
    .limit(1);
  
  if (!guest) {
    throw new Error('Invalid access token');
  }
  
  return guest;
}

/**
 * GET /api/guest/portal/:token
 * 
 * Main guest portal endpoint - returns all guest data including:
 * - Guest info
 * - Event details
 * - Label/tier
 * - Available perks
 * - Itinerary with registration status
 * - Family members
 */
guestRoutes.get('/api/guest/portal/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Get guest with relations
    const guest = await getGuestByToken(token);
    
    // Fetch event details
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, guest.eventId))
      .limit(1);
    
    // Fetch label
    const label = guest.labelId 
      ? (await db
          .select()
          .from(labels)
          .where(eq(labels.id, guest.labelId))
          .limit(1))[0]
      : null;
    
    // Fetch family members
    const family = await db
      .select()
      .from(guestFamily)
      .where(eq(guestFamily.guestId, guest.id));
    
    // Fetch available perks (filtered by label) — include new pricing fields
    const availablePerks = guest.labelId
      ? await db
          .select({
            id: labelPerks.id,
            labelId: labelPerks.labelId,
            perkId: labelPerks.perkId,
            isEnabled: labelPerks.isEnabled,
            expenseHandledByClient: labelPerks.expenseHandledByClient,
            budgetConsumed: labelPerks.budgetConsumed,
            agentOverride: labelPerks.agentOverride,
            perk: perks,
          })
          .from(labelPerks)
          .leftJoin(perks, eq(labelPerks.perkId, perks.id))
          .where(eq(labelPerks.labelId, guest.labelId))
      : [];
    
    // Fetch itinerary events with registration status
    const allEvents = await db
      .select()
      .from(itineraryEvents)
      .where(eq(itineraryEvents.eventId, guest.eventId));
    
    const guestRegistrations = await db
      .select()
      .from(guestItinerary)
      .where(eq(guestItinerary.guestId, guest.id));
    
    const registrationMap = new Map(
      guestRegistrations.map(r => [r.itineraryEventId, r.status])
    );
    
    const itinerary = allEvents.map(event => ({
      ...event,
      registered: registrationMap.has(event.id) && registrationMap.get(event.id) === 'attending',
      hasConflict: false, // TODO: Implement conflict detection
    }));
    
    // Fetch bleisure rate and occupancy from group inventory (hotel type)
    const hotelInventory = await db
      .select()
      .from(groupInventory)
      .where(and(eq(groupInventory.eventId, guest.eventId), eq(groupInventory.inventoryType, "hotel")))
      .limit(1);
    const bleisureRatePerNight = hotelInventory[0]?.negotiatedRate
      ? Number(hotelInventory[0].negotiatedRate)
      : 250;
    const hotelRoomsBlocked = Number(hotelInventory[0]?.roomsBlocked ?? 0);
    const hotelRoomsConfirmed = Number(hotelInventory[0]?.roomsConfirmed ?? 0);
    // Hotel is full when all blocked rooms are confirmed and at least one room was blocked
    const isHotelFull = hotelRoomsBlocked > 0 && hotelRoomsConfirmed >= hotelRoomsBlocked;

    // Fetch flight inventory and compute isFlightFull
    const flightInventory = await db
      .select()
      .from(groupInventory)
      .where(and(eq(groupInventory.eventId, guest.eventId), eq(groupInventory.inventoryType, "flight")))
      .limit(1);
    const flightSeatsAllocated = Number(flightInventory[0]?.seatsAllocated ?? 0);
    const flightSeatsConfirmed = Number(flightInventory[0]?.seatsConfirmed ?? 0);
    const isFlightFull = flightSeatsAllocated > 0 && flightSeatsConfirmed >= flightSeatsAllocated;

    // Fetch all hotel options for this event (agent may set up multiple hotels)
    const allHotelBookings = await db
      .select()
      .from(hotelBookings)
      .where(eq(hotelBookings.eventId, guest.eventId));
    const hotelOptions = allHotelBookings.map(h => ({
      id: h.id,
      name: h.hotelName,
      checkIn: h.checkInDate,
      checkOut: h.checkOutDate,
      numberOfRooms: h.numberOfRooms,
    }));
    // Primary hotel = guest's selected one, or first available
    const selectedHotelBooking = allHotelBookings.find(h => h.id === guest.selectedHotelBookingId)
      ?? allHotelBookings[0]
      ?? null;
    const primaryHotel = selectedHotelBooking
      ? {
          id: selectedHotelBooking.id,
          name: selectedHotelBooking.hotelName,
          checkIn: selectedHotelBooking.checkInDate,
          checkOut: selectedHotelBooking.checkOutDate,
          numberOfRooms: selectedHotelBooking.numberOfRooms,
        }
      : null;

    // Fetch label inclusions — which hotel/flight bookings are included for this guest's tier
    const labelInclusions = guest.labelId
      ? await db
          .select()
          .from(bookingLabelInclusions)
          .where(
            and(
              eq(bookingLabelInclusions.labelId, guest.labelId),
              eq(bookingLabelInclusions.isIncluded, true)
            )
          )
      : [];

    // Calculate usedBudget: sum of budgetConsumed for approved requests
    const usedBudgetResult = await db
      .select({ total: sql<number>`coalesce(sum(${guestRequests.budgetConsumed}), 0)` })
      .from(guestRequests)
      .where(and(eq(guestRequests.guestId, guest.id), eq(guestRequests.status, "approved")));
    const usedBudget = Number(usedBudgetResult[0]?.total ?? 0);

    // Return complete guest invitation.
    // IMPORTANT: Label name/description are NEVER sent to the guest — only budget info.
    // Guests must not know their tier or that others receive different perks.
    const labelForGuest = label ? {
      id: label.id,
      addOnBudget: (label as any).addOnBudget ?? 0,
      // name and description intentionally omitted
    } : null;

    // Fetch guest's own requests (so Add-ons page can show status without refetching)
    const myRequests = await db
      .select({ id: guestRequests.id, perkId: guestRequests.perkId, status: guestRequests.status, addonType: guestRequests.addonType })
      .from(guestRequests)
      .where(eq(guestRequests.guestId, guest.id));

    res.json({
      ...guest,
      event,
      label: labelForGuest,
      family,
      availablePerks: availablePerks.map((lp: any) => ({
        ...lp.perk,
        isEnabled: lp.isEnabled,
        expenseHandledByClient: lp.expenseHandledByClient,
        unitCost: lp.perk?.unitCost ?? 0,
        pricingType: lp.perk?.pricingType ?? "requestable",
        currency: lp.perk?.currency ?? "INR",
        budgetConsumed: lp.budgetConsumed ?? 0,
        agentOverride: lp.agentOverride ?? false,
      })),
      itinerary,
      bleisureRatePerNight,
      usedBudget,
      isHotelFull,
      isFlightFull,
      primaryHotel,
      hotelOptions,
      labelInclusions,
      myRequests,
    });
    
  } catch (error) {
    console.error('Guest portal error:', error);
    res.status(404).json({ message: 'Invalid access token' });
  }
});

/**
 * PUT /api/guest/:token/rsvp
 * 
 * Update guest RSVP status and family members
 */
guestRoutes.put('/api/guest/:token/rsvp', async (req, res) => {
  try {
    const { token } = req.params;
    const { status, confirmedSeats, familyMembers } = req.body;
    
    const guest = await getGuestByToken(token);
    
    // If guest is declining, clean up and auto-promote next waitlisted guest
    if (status === 'declined') {
      // Waitlist auto-promote: give their spot to the highest-priority waitlisted guest
      const [nextOnWaitlist] = await db
        .select()
        .from(guests)
        .where(and(eq(guests.eventId, guest.eventId), eq(guests.isOnWaitlist, true)))
        .orderBy(asc(guests.waitlistPriority), asc(guests.id))
        .limit(1);
      if (nextOnWaitlist) {
        await db
          .update(guests)
          .set({ isOnWaitlist: false, status: 'confirmed', confirmedSeats: nextOnWaitlist.allocatedSeats ?? 1 })
          .where(eq(guests.id, nextOnWaitlist.id));
        console.log(`[waitlist] Promoted guest #${nextOnWaitlist.id} (${nextOnWaitlist.name}) from waitlist`);
      }

      // Delete family members first
      await db.delete(guestFamily).where(eq(guestFamily.guestId, guest.id));
      // Delete guest itinerary registrations
      await db.delete(guestItinerary).where(eq(guestItinerary.guestId, guest.id));
      // Delete the guest
      await db.delete(guests).where(eq(guests.id, guest.id));

      return res.json({
        success: true,
        message: 'Your response has been recorded. You have been removed from the guest list.',
        ...(nextOnWaitlist ? { waitlistPromoted: true } : {}),
      });
    }
    
    // Handle confirmation flow with capacity enforcement
    if (status === 'confirmed') {
      if (confirmedSeats > guest.allocatedSeats) {
        return res.status(400).json({ 
          message: `Cannot confirm ${confirmedSeats} seats. Only ${guest.allocatedSeats} allocated.` 
        });
      }

      // Check event capacity
      const [eventRow] = await db.select().from(events).where(eq(events.id, guest.eventId)).limit(1);
      const capacity = eventRow?.capacity ?? null;

      if (capacity && capacity > 0) {
        const confirmedSumRes = await db.select({ total: sql<number>`coalesce(sum(${guests.confirmedSeats}),0)` })
          .from(guests)
          .where(and(eq(guests.eventId, guest.eventId), eq(guests.isOnWaitlist, false), eq(guests.status, 'confirmed')));
        const currentConfirmed = Number(confirmedSumRes[0]?.total ?? 0);
        const seatsRequested = Number(confirmedSeats ?? 1);

        if (currentConfirmed + seatsRequested > capacity) {
          // place on waitlist
          let priority = 3;
          if (guest.labelId) {
            const [label] = await db.select().from(labels).where(eq(labels.id, guest.labelId)).limit(1);
            if (label?.name.toLowerCase().includes('vip')) priority = 1;
            else if (label?.name.toLowerCase().includes('family')) priority = 2;
          }

          const [updatedGuest] = await db
            .update(guests)
            .set({ isOnWaitlist: true, waitlistPriority: priority })
            .where(eq(guests.id, guest.id))
            .returning();

          const higherPriorityCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(guests)
            .where(and(eq(guests.eventId, guest.eventId), eq(guests.isOnWaitlist, true), lt(guests.waitlistPriority, priority)));
          const samePriorityCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(guests)
            .where(and(eq(guests.eventId, guest.eventId), eq(guests.isOnWaitlist, true), eq(guests.waitlistPriority, priority), lt(guests.id, guest.id)));

          const position = (higherPriorityCount[0]?.count || 0) + (samePriorityCount[0]?.count || 0) + 1;

          return res.json({ success: true, message: 'Venue full — added to waitlist', position, guest: updatedGuest });
        }
      }

      // Enough capacity — confirm the guest
      const [updatedGuest] = await db
        .update(guests)
        .set({ status: 'confirmed', confirmedSeats: confirmedSeats ?? 1, isOnWaitlist: false })
        .where(eq(guests.id, guest.id))
        .returning();

      // attach updatedGuest to local variable for family handling below
      Object.assign(guest, updatedGuest);
    } else {
      const [updatedGuest] = await db
        .update(guests)
        .set({ status, confirmedSeats: 0 })
        .where(eq(guests.id, guest.id))
        .returning();
      Object.assign(guest, updatedGuest);
    }
    
    // Handle family members if confirming
    if (status === 'confirmed' && familyMembers?.length) {
      // Clear existing family members
      await db
        .delete(guestFamily)
        .where(eq(guestFamily.guestId, guest.id));
      
      // Add new family members
      for (const member of familyMembers) {
        await db.insert(guestFamily).values({
          guestId: guest.id,
          name: member.name,
          relationship: member.relationship,
          age: member.age,
        });
      }
    }
    
    res.json(guest);
    
  } catch (error) {
    console.error('RSVP update error:', error);
    res.status(400).json({ message: 'Failed to update RSVP' });
  }
});

/**
 * PUT /api/guest/:token/hotel-selection
 *
 * Guest selects their preferred hotel from the available options for this event.
 */
guestRoutes.put('/api/guest/:token/hotel-selection', async (req, res) => {
  try {
    const { token } = req.params;
    const { hotelBookingId } = req.body;

    const guest = await getGuestByToken(token);

    // Validate the hotel booking belongs to this event
    if (hotelBookingId !== null && hotelBookingId !== undefined) {
      const [booking] = await db
        .select()
        .from(hotelBookings)
        .where(and(eq(hotelBookings.id, hotelBookingId), eq(hotelBookings.eventId, guest.eventId)))
        .limit(1);
      if (!booking) {
        return res.status(400).json({ message: 'Invalid hotel selection' });
      }
    }

    await db
      .update(guests)
      .set({ selectedHotelBookingId: hotelBookingId ?? null })
      .where(eq(guests.id, guest.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Hotel selection error:', error);
    res.status(400).json({ message: 'Failed to update hotel selection' });
  }
});

/**
 * PUT /api/guest/:token/bleisure
 *
 * Update bleisure date extensions
 */
guestRoutes.put('/api/guest/:token/bleisure', async (req, res) => {
  try {
    const { token } = req.params;
    const { extendedCheckIn, extendedCheckOut } = req.body;
    
    const guest = await getGuestByToken(token);
    
    // Validate dates
    if (extendedCheckIn && guest.hostCoveredCheckIn) {
      const extended = new Date(extendedCheckIn);
      const hostStart = new Date(guest.hostCoveredCheckIn);
      
      if (extended >= hostStart) {
        return res.status(400).json({ 
          message: 'Extended check-in must be before host-covered dates' 
        });
      }
    }
    
    if (extendedCheckOut && guest.hostCoveredCheckOut) {
      const extended = new Date(extendedCheckOut);
      const hostEnd = new Date(guest.hostCoveredCheckOut);
      
      if (extended <= hostEnd) {
        return res.status(400).json({ 
          message: 'Extended check-out must be after host-covered dates' 
        });
      }
    }
    
    // Update dates
    const [updatedGuest] = await db
      .update(guests)
      .set({
        extendedCheckIn: extendedCheckIn ? new Date(extendedCheckIn) : null,
        extendedCheckOut: extendedCheckOut ? new Date(extendedCheckOut) : null,
      })
      .where(eq(guests.id, guest.id))
      .returning();
    
    res.json(updatedGuest);
    
  } catch (error) {
    console.error('Bleisure update error:', error);
    res.status(400).json({ message: 'Failed to update dates' });
  }
});

/**
 * POST /api/guest/:token/upload-id
 * 
 * Upload and verify ID document
 */
guestRoutes.post('/api/guest/:token/upload-id', async (req, res) => {
  try {
    const { token } = req.params;
    const { documentUrl, verifiedName } = req.body;
    
    if (!verifiedName) {
      return res.status(400).json({ message: "verifiedName is required" });
    }

    const guest = await getGuestByToken(token);

    // Verify name match (case-insensitive)
    const nameMatch = verifiedName.toLowerCase().trim() === guest.name.toLowerCase().trim();
    
    const verificationStatus = nameMatch ? 'verified' : 'failed';
    
    // Update guest with ID info
    const [updatedGuest] = await db
      .update(guests)
      .set({
        idDocumentUrl: documentUrl,
        idVerifiedName: verifiedName,
        idVerificationStatus: verificationStatus,
      })
      .where(eq(guests.id, guest.id))
      .returning();
    
    res.json({
      success: nameMatch,
      message: nameMatch 
        ? 'ID verified successfully' 
        : 'Name mismatch - verification failed',
    });
    
  } catch (error) {
    console.error('ID upload error:', error);
    res.status(400).json({ message: 'Failed to upload ID' });
  }
});

/**
 * PUT /api/guest/:token/self-manage
 * 
 * Toggle self-management preferences
 */
guestRoutes.put('/api/guest/:token/self-manage', async (req, res) => {
  try {
    const { token } = req.params;
    const { selfManageFlights, selfManageHotel } = req.body;
    
    const guest = await getGuestByToken(token);
    
    const updates: any = {};
    if (typeof selfManageFlights === 'boolean') {
      updates.selfManageFlights = selfManageFlights;
    }
    if (typeof selfManageHotel === 'boolean') {
      updates.selfManageHotel = selfManageHotel;
    }
    
    const [updatedGuest] = await db
      .update(guests)
      .set(updates)
      .where(eq(guests.id, guest.id))
      .returning();
    
    // TODO: Update logistics counts (shuttles, room blocks, etc.)
    
    res.json(updatedGuest);
    
  } catch (error) {
    console.error('Self-manage update error:', error);
    res.status(400).json({ message: 'Failed to update preferences' });
  }
});

/**
 * POST /api/guest/:token/waitlist
 * 
 * Join hotel waitlist
 */
guestRoutes.post('/api/guest/:token/waitlist', async (req, res) => {
  try {
    const { token } = req.params;
    const guest = await getGuestByToken(token);
    
    // Determine priority based on label
    let priority = 3; // Default (General)
    if (guest.labelId) {
      const [label] = await db
        .select()
        .from(labels)
        .where(eq(labels.id, guest.labelId))
        .limit(1);
      
      if (label?.name.toLowerCase().includes('vip')) {
        priority = 1;
      } else if (label?.name.toLowerCase().includes('family')) {
        priority = 2;
      }
    }
    
    // Add to waitlist
    const [updatedGuest] = await db
      .update(guests)
      .set({
        isOnWaitlist: true,
        waitlistPriority: priority,
      })
      .where(eq(guests.id, guest.id))
      .returning();
    
    // Calculate position in queue
    const higherPriorityCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(guests)
      .where(
        and(
          eq(guests.eventId, guest.eventId),
          eq(guests.isOnWaitlist, true),
          lt(guests.waitlistPriority, priority)
        )
      );
    
    const samePriorityCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(guests)
      .where(
        and(
          eq(guests.eventId, guest.eventId),
          eq(guests.isOnWaitlist, true),
          eq(guests.waitlistPriority, priority),
          lt(guests.id, guest.id)
        )
      );
    
    const position = (higherPriorityCount[0]?.count || 0) + (samePriorityCount[0]?.count || 0) + 1;
    
    res.json({
      success: true,
      position,
    });
    
  } catch (error) {
    console.error('Waitlist join error:', error);
    res.status(400).json({ message: 'Failed to join waitlist' });
  }
});

/**
 * POST /api/guest/:token/itinerary/:eventId/register
 * 
 * Register for an itinerary event
 */
guestRoutes.post('/api/guest/:token/itinerary/:eventId/register', async (req, res) => {
  try {
    const { token, eventId } = req.params;
    const guest = await getGuestByToken(token);
    
    // Get event details
    const [event] = await db
      .select()
      .from(itineraryEvents)
      .where(eq(itineraryEvents.id, parseInt(eventId)))
      .limit(1);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check capacity
    if (event.capacity && (event.currentAttendees ?? 0) >= event.capacity) {
      return res.status(400).json({ message: 'Event is full' });
    }
    
    // Conflict-Aware Logic: reject if this event overlaps a registered one
    const existingRegs = await db
      .select({ ev: itineraryEvents })
      .from(guestItinerary)
      .innerJoin(itineraryEvents, eq(guestItinerary.itineraryEventId, itineraryEvents.id))
      .where(eq(guestItinerary.guestId, guest.id));

    const conflict = existingRegs.find(({ ev }) =>
      ev.startTime < event.endTime && ev.endTime > event.startTime
    );
    if (conflict) {
      return res.status(409).json({
        message: `This activity overlaps with "${conflict.ev.title}". Please deselect it first.`,
        conflicts: [conflict.ev.title],
      });
    }
    // Use advisory lock per (guestId, itineraryEventId) to avoid duplicate registrations under concurrency
    const hash32 = (s: string) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
      }
      return Math.abs(h);
    };

    const key1 = guest.id;
    const key2 = hash32(String(event.id));

    const client = await (require('./db').pool).connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [key1, key2]);

      const existingRes = await client.query('SELECT * FROM guest_itinerary WHERE guest_id = $1 AND itinerary_event_id = $2 LIMIT 1', [guest.id, event.id]);
      if (existingRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.json({ success: true, alreadyRegistered: true });
      }

      await client.query('INSERT INTO guest_itinerary (guest_id, itinerary_event_id, status) VALUES ($1,$2,$3)', [guest.id, event.id, 'attending']);

      await client.query('UPDATE itinerary_events SET current_attendees = COALESCE(current_attendees,0) + 1 WHERE id = $1', [event.id]);

      await client.query('COMMIT');
      res.json({ success: true, alreadyRegistered: false });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Event registration error:', err);
      res.status(400).json({ message: 'Failed to register for event' });
    } finally {
      client.release();
    }
    
    res.json({ success: true, conflicts: [] });
    
  } catch (error) {
    console.error('Event registration error:', error);
    res.status(400).json({ message: 'Failed to register for event' });
  }
});

/**
 * DELETE /api/guest/:token/itinerary/:eventId/unregister
 * 
 * Unregister from an itinerary event
 */
guestRoutes.delete('/api/guest/:token/itinerary/:eventId/unregister', async (req, res) => {
  try {
    const { token, eventId } = req.params;
    const guest = await getGuestByToken(token);
    
    // Remove registration
    await db
      .delete(guestItinerary)
      .where(
        and(
          eq(guestItinerary.guestId, guest.id),
          eq(guestItinerary.itineraryEventId, parseInt(eventId))
        )
      );
    
    // Update attendee count
    const [event] = await db
      .select()
      .from(itineraryEvents)
      .where(eq(itineraryEvents.id, parseInt(eventId)))
      .limit(1);
    
    if (event && (event.currentAttendees ?? 0) > 0) {
      await db
        .update(itineraryEvents)
        .set({
          currentAttendees: (event.currentAttendees ?? 0) - 1,
        })
        .where(eq(itineraryEvents.id, event.id));
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Event unregistration error:', error);
    res.status(400).json({ message: 'Failed to unregister from event' });
  }
});

/**
 * Helper function to generate guest link
 * Use this when creating new guests
 */
export async function createGuestWithLink(eventId: number, guestData: any) {
  const accessToken = randomUUID();
  const bookingRef = generateBookingRef(); // Implement your own logic
  
  const [guest] = await db
    .insert(guests)
    .values({
      ...guestData,
      eventId,
      accessToken,
      bookingRef,
    })
    .returning();
  
  const guestLink = `${process.env.APP_URL}/guest/${accessToken}`;
  
  // TODO: Send email with link
  await sendGuestInvitationEmail(guest.email, {
    guestName: guest.name,
    guestLink,
    bookingRef,
  });
  
  return {
    ...guest,
    guestLink,
  };
}

/**
 * Generate unique booking reference
 */
function generateBookingRef(): string {
  const prefix = 'BOOK';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${randomNum}`;
}

/**
 * Send guest invitation email
 * Integrate with your email service (SendGrid, Resend, etc.)
 */
async function sendGuestInvitationEmail(email: string, data: any) {
  // TODO: Implement with your email service
  console.log('Sending invitation email to:', email);
  console.log('Guest link:', data.guestLink);
}

/**
 * POST /api/guest/:token/request
 * 
 * Submit a guest request (room upgrade, etc.)
 */
guestRoutes.post('/api/guest/:token/request', async (req, res) => {
  try {
    const { token } = req.params;
    const { type, notes, addonType, perkId, budgetConsumed: requestedBudget } = req.body;

    // Validate guest
    const guest = await getGuestByToken(token);

    // Determine if request should be auto-approved or pending based on budget
    let status: 'pending' | 'approved' = 'pending';
    let budgetConsumed = requestedBudget ?? 0;

    if (requestedBudget && requestedBudget > 0 && guest.labelId) {
      // Fetch label budget
      const [label] = await db.select().from(labels).where(eq(labels.id, guest.labelId)).limit(1);
      const addOnBudget = label?.addOnBudget ?? 0;

      // Fetch already used budget
      const usedResult = await db
        .select({ total: sql<number>`coalesce(sum(${guestRequests.budgetConsumed}), 0)` })
        .from(guestRequests)
        .where(and(eq(guestRequests.guestId, guest.id), eq(guestRequests.status, "approved")));
      const usedBudget = Number(usedResult[0]?.total ?? 0);

      const remaining = addOnBudget - usedBudget;
      if (requestedBudget <= remaining) {
        status = 'approved'; // Within budget — auto-approve
      }
      // else stays 'pending' for agent review
    }

    // Create request
    const [request] = await db
      .insert(guestRequests)
      .values({
        guestId: guest.id,
        perkId: perkId ?? null,
        type: type || 'custom',
        notes,
        addonType: addonType ?? null,
        budgetConsumed,
        status,
      })
      .returning();

    res.status(201).json(request);
  } catch (error: any) {
    console.error('Guest request error:', error);
    res.status(400).json({ message: error.message || 'Failed to submit request' });
  }
});

/**
 * PUT /api/guest/:token/profile
 *
 * Update emergency contact info and meal preference
 */
guestRoutes.put('/api/guest/:token/profile', async (req, res) => {
  try {
    const { token } = req.params;
    const { emergencyContactName, emergencyContactPhone, mealPreference, specialRequests } = req.body;

    const guest = await getGuestByToken(token);

    const updates: any = {};
    if (emergencyContactName !== undefined) updates.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined) updates.emergencyContactPhone = emergencyContactPhone;
    if (mealPreference !== undefined) updates.mealPreference = mealPreference;
    if (specialRequests !== undefined) updates.specialRequests = specialRequests;

    const [updatedGuest] = await db
      .update(guests)
      .set(updates)
      .where(eq(guests.id, guest.id))
      .returning();

    res.json(updatedGuest);
  } catch (error: any) {
    console.error('Profile update error:', error);
    res.status(400).json({ message: error.message || 'Failed to update profile' });
  }
});

/**
 * PUT /api/guest/:token/travel-prefs
 *
 * Update travel preferences: self-manage toggles, PNRs, partial stay dates
 */
guestRoutes.put('/api/guest/:token/travel-prefs', async (req, res) => {
  try {
    const { token } = req.params;
    const {
      selfManageArrival,
      selfManageDeparture,
      arrivalPnr,
      departurePnr,
      partialStayCheckIn,
      partialStayCheckOut,
      originCity,
      arrivalMode,
      departureMode,
      journeyNotes,
      specialRequests,
    } = req.body;

    const guest = await getGuestByToken(token);

    const VALID_MODES = ['group_flight', 'own_flight', 'train', 'other', 'local'];
    const updates: any = {};
    if (typeof selfManageArrival === 'boolean') updates.selfManageArrival = selfManageArrival;
    if (typeof selfManageDeparture === 'boolean') updates.selfManageDeparture = selfManageDeparture;
    if (arrivalPnr !== undefined) updates.arrivalPnr = arrivalPnr;
    if (departurePnr !== undefined) updates.departurePnr = departurePnr;
    if (originCity !== undefined) updates.originCity = originCity;
    if (arrivalMode && VALID_MODES.includes(arrivalMode)) updates.arrivalMode = arrivalMode;
    if (departureMode && VALID_MODES.includes(departureMode)) updates.departureMode = departureMode;
    // Merge journey notes (arrangements) + specialRequests (agent note) into one field
    const combinedNotes = [journeyNotes, specialRequests].filter(Boolean).join('\n\n');
    if (combinedNotes) updates.specialRequests = combinedNotes;
    else if (journeyNotes === '' || specialRequests === '') updates.specialRequests = '';
    if (partialStayCheckIn !== undefined) updates.partialStayCheckIn = partialStayCheckIn ? new Date(partialStayCheckIn) : null;
    if (partialStayCheckOut !== undefined) updates.partialStayCheckOut = partialStayCheckOut ? new Date(partialStayCheckOut) : null;

    const [updatedGuest] = await db
      .update(guests)
      .set(updates)
      .where(eq(guests.id, guest.id))
      .returning();

    res.json(updatedGuest);
  } catch (error: any) {
    console.error('Travel prefs update error:', error);
    res.status(400).json({ message: error.message || 'Failed to update travel preferences' });
  }
});

/**
 * PUT /api/guest/decline
 *
 * Quick decline from the microsite (no full portal required).
 * Body: { bookingRef: string }
 * Marks the guest status as 'declined' without deleting the record.
 */
guestRoutes.put('/api/guest/decline', async (req, res) => {
  try {
    const { bookingRef } = req.body;
    if (!bookingRef) return res.status(400).json({ message: 'bookingRef required' });

    const [guest] = await db
      .select()
      .from(guests)
      .where(eq(guests.bookingRef, bookingRef.trim().toUpperCase()))
      .limit(1);

    if (!guest) return res.status(404).json({ message: 'No booking found with that reference' });

    await db
      .update(guests)
      .set({ status: 'declined' })
      .where(eq(guests.id, guest.id));

    res.json({ success: true, message: 'Your response has been recorded. We hope to see you next time!' });
  } catch (error: any) {
    console.error('Decline error:', error);
    res.status(400).json({ message: error.message || 'Failed to record decline' });
  }
});

/**
 * POST /api/events/:eventId/on-spot-register
 *
 * Ground team adds a walk-in attendee at the door (MICE on-spot registration).
 * Requires ground team or agent session.
 * Returns the new guest's access token so a QR/link can be printed on the spot.
 */
guestRoutes.post('/api/events/:eventId/on-spot-register', async (req: any, res) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const eventId = parseInt(req.params.eventId);
    const { name, email, phone, labelId, mealPreference } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Guest name is required' });
    }

    // Verify event exists
    const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const accessToken = randomUUID();
    const bookingRef = `WALK-${Math.floor(1000 + Math.random() * 9000)}`;

    // Check event capacity and current confirmed seats
    const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    const capacity = eventRow?.capacity ?? null;

    const confirmedSumRes = await db.select({ total: sql<number>`coalesce(sum(${guests.confirmedSeats}),0)` })
      .from(guests)
      .where(and(eq(guests.eventId, eventId), eq(guests.isOnWaitlist, false), eq(guests.status, 'confirmed')));
    const currentConfirmed = Number(confirmedSumRes[0]?.total ?? 0);

    let insertedGuest: any;
    if (capacity && capacity > 0 && currentConfirmed >= capacity) {
      // Venue full — add walk-in to waitlist instead of confirming
      const [guestWL] = await db
        .insert(guests)
        .values({
          eventId,
          name,
          email: email || `walkin-${bookingRef.toLowerCase()}@noemail.local`,
          phone: phone || null,
          bookingRef,
          accessToken,
          labelId: labelId ?? null,
          status: 'pending',
          allocatedSeats: 1,
          confirmedSeats: 0,
          isOnWaitlist: true,
          waitlistPriority: 3,
          mealPreference: mealPreference ?? 'standard',
          registrationSource: 'on_spot',
        })
        .returning();

      // Calculate position
      const higherPriorityCount = await db.select({ count: sql<number>`count(*)` })
        .from(guests)
        .where(and(eq(guests.eventId, eventId), eq(guests.isOnWaitlist, true), lt(guests.waitlistPriority, 3)));
      const samePriorityCount = await db.select({ count: sql<number>`count(*)` })
        .from(guests)
        .where(and(eq(guests.eventId, eventId), eq(guests.isOnWaitlist, true), eq(guests.waitlistPriority, 3), lt(guests.id, guestWL.id)));
      const position = (higherPriorityCount[0]?.count || 0) + (samePriorityCount[0]?.count || 0) + 1;

      insertedGuest = guestWL;

      const guestLink = `${process.env.APP_URL || 'http://localhost:5000'}/guest/${accessToken}`;
      return res.json({ success: true, message: 'Venue full — added to waitlist', position, guest: { id: guestWL.id, name: guestWL.name, bookingRef: guestWL.bookingRef, accessToken: guestWL.accessToken }, guestLink });
    } else {
      const [guest] = await db
        .insert(guests)
        .values({
          eventId,
          name,
          email: email || `walkin-${bookingRef.toLowerCase()}@noemail.local`,
          phone: phone || null,
          bookingRef,
          accessToken,
          labelId: labelId ?? null,
          status: 'confirmed',
          allocatedSeats: 1,
          confirmedSeats: 1,
          mealPreference: mealPreference ?? 'standard',
          registrationSource: 'on_spot',
        })
        .returning();

      insertedGuest = guest;

      const guestLink = `${process.env.APP_URL || 'http://localhost:5000'}/guest/${accessToken}`;

      res.json({
        success: true,
        guest: {
          id: guest.id,
          name: guest.name,
          bookingRef: guest.bookingRef,
          accessToken: guest.accessToken,
        },
        guestLink,
      });
    }
  } catch (error: any) {
    console.error('On-spot registration error:', error);
    res.status(400).json({ message: error.message || 'Failed to register walk-in guest' });
  }
});

export default guestRoutes;
