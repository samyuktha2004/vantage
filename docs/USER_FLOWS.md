# User Flows — Vantage

**Last Updated:** March 2026

> This document maps every user type's complete journey through the platform,
> including nuances specific to MICE vs. Wedding contexts, label transparency rules,
> and reporting flows.

---

## Scope of This Document

**In-scope actors:**

- Agency / Travel Agent (including Event Manager operations)
- Client (Event Host)
- Guest
- Ground Team (hired by agency or client, event-scoped access)

**Out of scope as primary actors:**

- Hotel staff (hotel operations are handled via agency/client + ground team workflows)

---

## Critical Design Rule: Label Invisibility

**Guests must NEVER see or know their label name.**

Labels (VIP, Family, Staff, Executive, etc.) are internal classification tools used by agents and clients to configure entitlements. From the guest's perspective, they simply see what they're entitled to — not _why_ they're entitled to it.

**Example:**

- A VIP guest sees: "Airport Transfer — Included" and "Suite Upgrade — Included"
- A Standard guest sees: "Airport Transfer — Contact Agent to Book" and (no suite option visible)
- Neither guest sees the word "VIP" or "Standard" anywhere

**Implementation note:** Guest-facing UI filters perks and options based on the label assigned to them, but label names, descriptions, and the label system itself are entirely hidden from the guest portal. Even the booking reference does not reveal the tier.

---

## Shared Flow Modules (Single Source of Truth)

To avoid duplicate logic across agent/client/ground-team/guest flows, common journeys should be defined once and reused with role-based permissions.

| Module | Shared flow                            | Reused by                  | Permission differences                                                                                        |
| ------ | -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| M1     | Event access & scope resolution        | Agent, Client, Ground Team | Agent sees all managed events; Client sees only mapped event via code; Ground Team sees only one scoped event |
| M2     | Guest directory & profile view         | Agent, Client, Ground Team | Agent can create/edit/import; Client read-only; Ground Team operational read + arrival notes only             |
| M3     | Labels, perks & entitlement matrix     | Agent, Client, Guest       | Agent full configure; Client cost/inclusion toggles only; Guest sees entitlement outcome only (no labels)     |
| M4     | Requests & approval queue              | Agent, Client, Guest       | Guest can create requests; Agent approve/reject/forward; Client approve/reject only when forwarded            |
| M5     | Inventory & pending confirmation queue | Agent, Client              | Agent confirms/promotes with human-in-loop; Client monitors status only                                       |
| M6     | Itinerary & attendance operations      | Agent, Guest, Ground Team  | Agent configures itinerary; Guest opts into allowed items; Ground Team marks arrived                          |
| M7     | Reports & exports                      | Agent, Client              | Agent full exports incl. financial sheets; Client scoped views without internal label logic                   |

**Implementation direction:** When building screens/routes, reuse the same module logic and gate actions by role permissions instead of creating separate duplicated flows for each actor.

---

## 1. Agency / Travel Agent (Event Manager)

### 1.1 Event Creation Flow

```
Sign In → Dashboard → Create Event
  ↓
Enter: Event Name, Date, Location, Description, Client Name
  → System generates Event Code (e.g., RAJWED20260415)
  ↓
Step 1 — Client Details
  → Client name, address, phone
  → Guest type flags: Has VIP guests? Has Family? Has Staff?
  ↓
Step 2 — Hotel Setup (TBO-powered)
  Mode A: TBO Live Search
    → Select Country → Select City
    → Set Check-In / Check-Out / Number of Rooms / Nationality
    → [Search] → View hotel results (name, stars, price/night)
    → Select hotel → View room options (room type, meal plan, refund policy)
    → Select room → PreBook (rate hold) → Confirm Booking
    → TBO ConfirmationNumber stored; hotel name auto-populated
  Mode B: Manual Entry (fallback)
    → Enter hotel name, check-in, check-out, number of rooms manually
  ↓
Step 3 — Travel Setup (TBO-powered)
  Mode A: TBO Flight Search
    → Enter Origin, Destination, Date, Journey Type (One-Way / Return)
    → Enter Pax count (Adults / Children / Infants for the group)
    → [Search Flights] → View results (airline, times, duration, stops, price)
    → Select flight → View fare rules (cancellation policy)
    → Confirm → TBO PNR stored; flight details auto-populated
  Mode B: Manual Entry (fallback)
    → Enter travel mode, dates, from/to location manually
  ↓
Event created → Move to EventDetails
```

### 1.2 Guest Management Flow

```
EventDetails → Guests Tab
  ↓
Option A: Bulk Import
  → Download template (Excel/CSV format)
  → Fill guest data: name, email, phone, category, dietary needs
  → Upload file → Preview imported guests → Confirm Import
  → Guests created with auto-generated bookingRef and accessToken
  ↓
Option B: Manual Add
  → Fill form: name, email, phone, category, dietary, special requests
  → Assign arrival/departure dates (pre-set travel dates or custom)
  → Set seat allocation (e.g., guest + 2 companions)
  → Submit → Guest created
  ↓
After import/add:
  → Assign Labels: select VIP / Family / Staff / etc. per guest
  → Guest does NOT see their label assignment
  → Share access link (copy URL or send QR code)
  → Options: share all at once, or individually
```

### 1.3 Labels & Perks Configuration Flow

```
EventDetails → Labels Tab
  ↓
Create Labels: VIP, Family, Staff, Media, Speaker, Standard, etc.
  → Each label defines a guest tier (internal use only)
  ↓
EventDetails → Perks Tab
  ↓
Create Perks: Airport Transfer, Spa Access, Premium Meals, Gala Dinner, etc.
  → Each perk has: name, description, type (transport/meal/activity/accommodation)
  ↓
EventDetails → Label-Perk Matrix
  ↓
For each Label × Perk combination:
  Toggle 1: "Allow this perk for this label?" (Enabled / Disabled)
  Toggle 2: "Is this perk paid by the client?" (Client Pays / Guest Self-Pay)

  IF Enabled + Client Pays:
    → Guest sees perk with "Included" badge and "Confirm" button
  IF Enabled + Guest Self-Pay:
    → Guest sees perk with "Contact Agent to Book" button
    → Agent's contact details shown; guest calls/messages to arrange payment
  IF Disabled:
    → Perk is NOT visible to this label's guests at all
    → If guest requests it anyway → Request Record created → Agent reviews
```

### 1.4 Publishing & Sharing Flow

```
EventDetails → Preview Tab
  → Agent reviews full event summary (hotel, travel, itinerary, perks)
  → Adjustments if needed
  ↓
Publish Event
  → Event becomes visible to: clients (via event code) + guest portal (via token)
  → Microsite URL generated: yourdomain.com/event/RAJWED20260415
  ↓
Share with guests:
  → Copy individual guest link (contains accessToken)
  → Generate QR code per guest
  → Bulk share (download all links as CSV or copy microsite URL for broadcast)
  ↓
Share microsite URL with client for their own distribution
```

### 1.5 Monitoring & Approval Flow

```
EventDetails → Requests Tab (ongoing)
  ↓
Guest requests appear here:
  → Perk requests (out of tier entitlement)
  → Room upgrade requests
  → Custom special requests
  ↓
Agent actions per request:
  → Approve (updates guest entitlement)
  → Reject (with note to guest)
  → Forward to Client (for cost approval before actioning)
  ↓
EventDetails → Inventory Tab
  → Rooms Blocked vs Confirmed (progress bar)
  → Seats Allocated vs Confirmed
  → Alert if <10% remaining
  → Auto-refresh inventory every 30 seconds and immediately after approve/reject actions
  → Show "Last updated" timestamp + manual refresh button
  → If data is stale, block confirmation actions until refresh completes
  → If agent increases room/seat block, system opens a "Pending Confirmation Queue" panel
  → Agent must tick/select which guests to promote (human-in-loop), up to newly available capacity
  → Unselected requests remain pending; no automatic bulk confirmation
  ↓
Download Report:
  → Excel export (6 sheets: Summary, Guests, Hotel, Labels/Perks, Requests, Extended)
```

### 1.6 Ground Team Account Creation (Agent-only)

```
EventDetails → Settings → Ground Team
  → Create ground team account: name, email, password
  → Scoped to this specific event only
  → Ground team receives sign-in link
```

---

## 2. Client — Wedding Host

**Context:** A family hosting a destination wedding. They are paying for certain guest experiences and want control over what's included.

### 2.1 Sign-in Flow (reuses M1)

```
Landing Page → "I'm hosting an event" → Client Sign-in
  → Enter event code (received from travel agent)
  → Access granted to their specific event view
```

### 2.2 Client Event View Flow (reuses M2, M3, M4, M5, M7)

```
Dashboard → Their Event
  ↓
Overview Tab:
  → Event name, dates, location, hotel, travel mode
  → Guest count: invited / confirmed / pending / declined
  ↓
Labels & Perks Tab (permission-scoped):
  → Reuses same entitlement matrix as agent view (M3)
  → Client can toggle coverage/inclusion only for approved client controls
  → Client cannot create labels, rename labels, or alter hidden entitlement rules
  → Example: "Remove spa from hosted package" → toggle off coverage
  ↓
Guest List Tab (M2, read-only):
  → Same guest directory module as agent with client permissions applied
  → Cannot edit guest profile, allocations, labels, or booking references
  → Can see: name, RSVP status, dietary restrictions, high-level booking state
  ↓
Requests Tab (M4):
  → Forwarded requests appear here while we check availability
  → Client can approve or reject only forwarded requests with budget rationale
  → Client cannot directly approve non-forwarded operational requests
  ↓
Inventory Tab (M5, monitor-only):
  → View rooms/seats status and pending confirmation counts
  → Cannot promote queue, cannot confirm inventory actions
  ↓
Reports Tab (M7, scoped):
  → Download guest list and host-facing summaries
  → No internal label-management details exposed
```

---

## 3. Client — MICE (Corporate Event)

**Context:** A corporate client running a conference or incentive trip. Multiple departments have different entitlements (Executives vs. Staff vs. Speakers).

**Key differences from Wedding:**

- Labels map to job hierarchy (C-Suite, Manager, Staff, External Speaker)
- Expense control is tighter; client-side finance approval is often required for upgrades
- Bulk guest import from HR system (Excel)
- Bleisure extensions are common (employees extending the trip personally)
- Self-manage toggle important (some senior staff prefer own bookings)

### 3.1 MICE-Specific Label Structure Example

| Label            | Perks Included                                                      | Self-Pay Options              |
| ---------------- | ------------------------------------------------------------------- | ----------------------------- |
| C-Suite          | Suite upgrade, Airport Limousine, Spa, Gala Dinner, Business Lounge | None                          |
| Manager          | Standard Room, Airport Transfer, Gala Dinner                        | Spa, Room Upgrade             |
| Staff            | Standard Room, Shuttle Bus                                          | Airport Transfer, Gala Dinner |
| External Speaker | Standard Room, Airport Transfer                                     | Spa, Meals                    |

Guest experience on the portal is silently differentiated — they see only what's relevant to them.

### 3.2 Client-Side Finance Approval Branch (Optional)

```
Client finance approver receives read-only report link from agency
  ↓
Dashboard → Financial Summary:
  → Total rooms blocked × rate = hotel cost
  → Flights booked × fare = travel cost
  → Per-perk inclusions total
  → Outstanding self-pay amounts (not client's responsibility)
  ↓
Downloadable: Cost breakdown Excel / PDF
  → By internal category/tier
  → By individual guest
  → Summary vs itemized view
```

---

## 4. Guest Flow

**Important Design Rules:**

- Guest never logs in — authentication is via unique tokenized URL
- Guest never sees their label name
- Guest sees only the perks relevant to their label (others hidden)
- Travel details are read-only (set by agent; guest cannot modify group bookings)
- Guest can self-manage only if the agent enables the self-manage toggle for them
- Guest can create requests (M4) but cannot approve, reject, or edit policy controls
- Guest cannot create labels/perks, edit inventory, or override confirmation queue logic

### 4.1 First Entry — Via Microsite

```
Guest receives microsite URL (e.g., events.vantage.com/event/RAJWED20260415)
  ↓
Microsite:
  → Sees event overview (name, date, location, hotel info, itinerary highlights)
  → Two paths:
    Path A: "I have a booking reference"
      → Enters booking ref (format: GPXXXXXX)
      → System looks up guest → redirects to /guest/:accessToken
    Path B: "Register as a new attendee"
      → Fills: name, email, phone
      → Creates pending guest → agent notified
      → Confirmation: "Your request has been received. You'll get a personalized link shortly."
```

### 4.2 Guest Portal Pages (token-based, no login)

#### Page 1: Dashboard

```
→ Welcome by name
→ Event overview card (dates, location, hotel name)
→ Navigation to all portal sections
→ Completion checklist (RSVP, travel details viewed, itinerary selected, ID uploaded)
```

#### Page 2: RSVP

```
→ See allocated seats (e.g., "Reserved for you + 1")
→ Confirm or decline attendance
→ Add companions: name, relationship, age (for rooming list)
→ Seat count auto-calculates room requirements
→ Dietary restrictions entry
→ Special requests text field
```

#### Page 3: Travel Details (Read-only)

```
→ Arrival: date, time, travel mode (Flight/Train)
→ Departure: date, time
→ Flight details if applicable: airline, flight number, route (read-only)
→ Rooming list: guest name + companions
→ Self-manage toggle (if enabled by agent):
    → "I'd prefer to arrange my own flights/hotel" checkbox
    → If checked, guest is removed from group block and manages independently
→ Bleisure option (if applicable):
    → "Extend your stay?" → Bleisure calendar
```

#### Page 4: Bleisure Extension (Self-Pay)

```
→ Agent-defined host stay dates shown (e.g., April 15–18)
→ Calendar to select pre-arrival extension (e.g., arrive April 13)
→ Calendar to select post-event extension (e.g., depart April 21)
→ Rate shown: live TBO hotel rate (or agent-configured flat rate)
→ Confirmation: "Your extension dates will be forwarded to the hotel"
→ Note: Self-pay; not covered by event package
```

#### Page 5: Concierge (Perks)

```
For each perk visible to this guest's label:
  IF Client Pays:
    → Perk name + description + "Included" badge
    → [Confirm] button
  IF Self-Pay:
    → Perk name + description + "Optional — self-pay"
    → [Contact Agent] button → Shows agent phone/WhatsApp/email

Perks outside this guest's tier: completely hidden (no "locked" or "upgrade" messaging)
No mention of labels, tiers, or "VIP" status anywhere on this page
```

#### Page 6: Itinerary

```
→ Day-by-day timeline of event activities
→ Mandatory events shown with lock icon (cannot opt out)
→ Optional events shown with toggle (register/unregister)
→ Conflict detection: if two selected events overlap, warning shown
→ Capacity display for each optional event (e.g., "12 of 30 spots left")
```

#### Page 7: ID Vault

```
→ Upload passport / national ID photo
→ Status: pending verification / verified / failed
→ Verification note: "Required for hotel check-in and flight boarding"
→ Privacy note: "Your document is stored securely and only accessible to the organizer"
```

#### Page 8: Room Upgrade

```
→ Current room type shown
→ Available upgrades listed (based on hotel availability)
→ [Request Upgrade] → Creates request → Agent reviews
→ Self-pay upgrade note (if not included in tier)
```

---

## 5. Ground Team / Event Coordinator

**Context:** On-site teams hired by the agency or client, managing day-of check-in and logistics.

### 5.1 Sign-in Flow (reuses M1)

```
Ground team receives: sign-in URL + credentials (issued by agency or client admin)
  → Credentials are scoped to ONE specific event
  ↓
Sign In → Mobile-optimized Check-in Dashboard
```

### 5.2 Check-in Flow (reuses M2 + M6)

```
Dashboard → Guest Search
  ↓
Method A: Type name or booking ref
  → Guest card appears: name, label icon (visible to staff, NOT shown to guest)
  → Dietary restrictions badge (if any)
  → Special requests note
  → Room number (if hotel check-in already completed)
  ↓
Method B: Scan QR code (from guest's phone)
  → Camera opens → Scans guest's QR → Guest card loads
  ↓
Verify identity → [Mark Arrived] button
  → Status updates to "arrived" in real-time
  → Arrival counter updates on dashboard (e.g., "47 / 120 arrived")
  ↓
Rooming List view:
  → Sorted by room type, then name
  → Download as PDF for physical copy
  ↓
Live stats panel:
  → Total guests / Arrived / Confirmed not yet arrived / Pending (no RSVP)
  → Refresh every 30 seconds
```

### 5.3 Nuances for Ground Team (permission overrides)

- Ground team sees guest labels for operational reasons (e.g., VIP needs limousine bay, not shuttle)
- Label names shown as icon/color on staff dashboard, never on guest-facing screens
- Ground team cannot edit guest data, only mark arrived / add notes
- Ground team cannot create labels/perks, assign labels, approve financial requests, or change inventory
- Ground team account expires after the event end date

---

## 6. Key Nuances Across All Flows

### Label Transparency Rules

| Who Can See Label Names | Yes / No                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| Agent                   | ✅ Yes — manages labels                                               |
| Client (Event Host)     | ❌ No — sees guest data but not label names                           |
| Ground Team             | ✅ Yes — operational need (e.g., route VIP to dedicated area)         |
| Guest                   | ❌ Never — labels are entirely invisible from the guest's perspective |

### Role Permission Matrix (for shared modules)

Use this matrix to keep one shared flow per module and only vary what each role can do.

**Canonical reference:** This is the single source of truth for role permissions. Other docs (including `PRD.md`) should reference this table instead of duplicating role-by-role capability lists.

| Capability                          | Agent          | Client                          | Ground Team      | Guest     |
| ----------------------------------- | -------------- | ------------------------------- | ---------------- | --------- |
| Create/edit event basics            | ✅             | ❌                              | ❌               | ❌        |
| Add/import/edit guests              | ✅             | ❌                              | ❌               | ❌        |
| View guest list                     | ✅             | ✅ (read-only)                  | ✅ (operational) | Self only |
| Create/assign labels                | ✅             | ❌                              | ❌               | ❌        |
| Configure perks matrix              | ✅             | Limited (coverage toggles only) | ❌               | ❌        |
| Create guest request                | ✅ (on behalf) | ❌                              | ❌               | ✅        |
| Approve/reject request              | ✅             | ✅ (forwarded only)             | ❌               | ❌        |
| Manage inventory & queue promotions | ✅             | ❌ (view only)                  | ❌               | ❌        |
| Mark arrival/check-in               | ✅             | ❌                              | ✅               | ❌        |
| Download full financial reports     | ✅             | Limited summaries               | ❌               | ❌        |

### MICE vs. Wedding Differences

| Aspect        | MICE                                            | Wedding                                         |
| ------------- | ----------------------------------------------- | ----------------------------------------------- |
| Guest labels  | Job title-based (C-Suite, Manager, Staff)       | Relationship-based (Family, Friend, VIP, Staff) |
| Self-manage   | Common (senior staff often prefer own bookings) | Rare                                            |
| Bleisure      | Very common (extend for tourism)                | Rare                                            |
| Group flight  | Often single group flight                       | Mix of individual flights                       |
| Reporting     | Deeper cost reporting needed                    | Simple guest list sufficient                    |
| Approval flow | Multi-level (client-side approvals)             | Single level (host family)                      |
| Scale         | 50–500 guests typical                           | 20–200 guests typical                           |

### Guest Self-Manage Toggle

When an agent enables self-manage for a guest:

- Guest sees "Manage my own [flights/hotel]" toggle in Travel Details page
- If toggled ON: guest is flagged as self-managing in agent dashboard
- Agent manually removes them from group hotel block / flight manifest
- Guest is still part of the event; just not in the group travel arrangement
- Useful for: guests flying from different cities, guests who want different hotel

### Waitlist Logic

- When all seats/rooms are at capacity, new guests go to waitlist
- Waitlist priority determined by label tier (VIP = highest priority)
- When a confirmed guest declines → system automatically notifies next waitlist guest
- Agent manually confirms waitlist promotion (no auto-booking yet — V1 feature)

### Guest Wizard Step Dependencies & Early Exit

The guest portal wizard must not force users through irrelevant steps when inventory is gone.

**Step dependency matrix:**

| Step               | Depends on                       | If unavailable mid-step                                                                                                          |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1. RSVP            | Seats available                  | If seats/rooms run out while filling RSVP → accept the RSVP but move to `Pending Confirmation`; skip steps 2–4                   |
| 2. Travel Prefs    | Flight/transport block available | If group flight is full → hide "Group transport" option, show remaining modes; if ALL transport gone → skip to summary with note |
| 3. Booking Summary | Hotel + transport confirmed      | If hotel ran out since step 1 → show banner: "Room confirmation pending — our agent will contact you"                            |
| 4. Add-ons / Perks | Base booking exists              | If base booking is pending → show perks as read-only preview with "Available after booking is confirmed"                         |

**Early exit rule:** If rooms AND flights are both unavailable when guest opens any wizard step, short-circuit to a single "Pending Confirmation" screen:

- Show: "Your details are saved. Rooms/flights are currently fully booked. Our agent will contact you as soon as availability opens."
- Do NOT ask the guest to upload documents, pick travel, or select add-ons when there is nothing to book against
- Guest's entered data (name, family, meal pref) is still saved — nothing is lost
- Agent gets EWS notification with the guest's partial data

**Per-step availability re-check:** Each wizard step should re-fetch `isHotelFull` and `isFlightFull` from the portal endpoint before rendering. If status changed since the previous step, show the appropriate banner or short-circuit.

### Low Inventory Concurrent Booking Branch

- If inventory is very low (example: 2 rooms left) and another booking consumes rooms while a user is mid-flow, do not drop entered details
- On submit, if full confirmation is no longer possible, move request to `Pending Confirmation` instead of failing silently
- User-facing message should be explicit: "Your request is received. Final confirmation is pending. Our agent will contact you shortly."
- Agent receives EWS notification with conflict context (requested quantity, available now, guest details, event)
- If inventory opens later (cancellation/decline/hold-expiry), promote from Pending Confirmation queue by priority + timestamp
- On promotion, notify both agent and guest; agent performs final confirm action
- If agent adds new block inventory (example: +5 rooms while 10 requests are pending), system should only suggest top candidates; agent explicitly ticks final 5 promotions
- Remaining requests stay in Pending Confirmation and continue to be reconsidered on next inventory release

#### Queue Parity: Extra-Room Requests from Existing Guests

Extra-room requests from already-confirmed guests (for children, plus-ones, elderly parents, etc.) must sit in the **same** Pending Confirmation queue as brand-new guest bookings. In a wedding, a confirmed couple who needs a second room for their kids is at least as important as a completely new guest arriving.

| Request type                         | Example                        | Queue                  | Priority                                      |
| ------------------------------------ | ------------------------------ | ---------------------- | --------------------------------------------- |
| New guest RSVP when hotel full       | Uncle joining late             | Pending Confirmation   | Same as label-based priority                  |
| Existing guest requesting extra room | Couple needs room for kids     | Pending Confirmation   | Same as label-based priority                  |
| Existing guest upgrading room type   | Want suite instead of standard | Separate upgrade queue | Lower — nice-to-have, not blocking attendance |

Rules:

- Extra-room requests use the same priority + timestamp ordering as new guest requests — no separate queue, no downgrade
- Agent sees a single unified list; a tag/icon distinguishes "New guest" vs "Extra room for [Guest Name]"
- A confirmed couple requesting a second room should NEVER be deprioritised below a brand-new guest who hasn't confirmed yet
- Room upgrades (same guest, different room type) are not the same thing and should be handled separately in a lower-priority upgrade queue

#### Partial Booking Acceptance

When a guest requests multiple rooms (example: 1 for themselves, 1 for their children) and only partial inventory can be fulfilled, the system must ask a follow-up **before** the agent acts.

**Guest-facing question (shown in wizard or sent via notification):**

> "We're working on confirming your additional room. In case it isn't available right away, would you prefer to:"
>
> 1. **Keep my confirmed room** — "I'll make alternate arrangements for the others if needed."
> 2. **Wait for both** — "I'd like to wait until all rooms are available before confirming."
> 3. **Decline if incomplete** — "If everyone can't be accommodated together, I'll have to pass."

Rules:

- This question is triggered when total rooms requested > rooms available for this guest
- Guest's response is stored on the pending request (`partialAcceptance: 'keep_partial' | 'wait_for_all' | 'decline_if_incomplete'`)
- Agent sees this preference in the Pending Confirmation queue and acts accordingly:
  - `keep_partial` → agent can confirm Room 1 immediately; Room 2 stays pending
  - `wait_for_all` → both rooms stay pending until both can be filled
  - `decline_if_incomplete` → if Room 2 becomes impossible, agent reaches out to discuss before cancelling
- Default (if guest doesn't answer within hold window): treated as `wait_for_all` — safest assumption
- The question must NOT make it sound like it's the guest's fault. The wording is "we're working on it" — a promise of effort

#### Sensitive Messaging: Room Availability & Paid Alternatives

In wedding and social event contexts, guests are **invited** — they expect accommodation to be part of the hospitality. Suggesting that they pay for their own room must be handled with extreme care. Bad phrasing feels transactional and can embarrass both the guest and the host.

**Rules for all guest-facing copy:**

1. **Never say "self-pay", "at your own expense", or "you'll need to pay"** — these phrases shift perceived blame to the guest
2. **Never imply the host ran out of money or budget** — protect the client's dignity
3. **Never imply the agent failed to plan** — protect the agency's reputation
4. **Frame paid alternatives as a bonus option, not a fallback** — the guest should feel like they're getting an extra choice, not being turned away

**Tone ladder (from most to least ideal):**

| Situation                       | DO say                                                                                                                                                          | DON'T say                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Rooms full, agent working on it | "We're working on your room. You're in the queue and will be updated shortly."                                                                                  | "No rooms available."                               |
| Rooms full, paid option exists  | "While we work on your included room, we've arranged special event rates at the venue if you'd like to secure a room right away."                               | "You can book and pay for your own room."           |
| Partial rooms available         | "We've confirmed your room. We're still working on the additional room for your family."                                                                        | "Only 1 room is available. Pay for the second one." |
| No rooms available at all       | "All hosted rooms are currently reserved. Would you like us to notify you if one opens? We also have partner rates available if you'd prefer to book directly." | "Rooms are full. Self-pay option available."        |

**Key principle: "special event rates" / "partner rates" framing.** This positions the paid room as:

- A **convenience** ("secure a room right away") — not a penalty
- A **special deal** ("event rates") — the guest feels they're getting insider pricing, not retail overflow
- An **option alongside the default** — the hosted room is still being pursued; this is additive

**Where this messaging appears:**

- AvailabilityGate banners in the guest wizard
- Pending Confirmation notification emails/SMS
- Agent's outbound call script (suggested phrasing in the queue panel)
- Guest portal status page (if guest revisits their link)

### Timeout & Inventory Refresh Rules

- Session timeout for agency/client/ground-team dashboards should be enforced after idle time (configurable by environment)
- Guest token links should have expiry or revocation support to avoid long-lived stale access
- Room/seat holds must have a timeout window; expired holds are auto-released back to inventory
- Any approve/confirm action must re-check latest availability before final save
- If availability changed during user action, show clear outcome: "Not available now" + alternatives (waitlist / different room / different slot)
- Critical counters (rooms left, seats left, waitlist rank) should refresh automatically and also support manual refresh
- Auto-refresh must be non-destructive: never clear typed form fields, selected filters, or in-progress notes
- If user is editing, freeze that record's editable fields and only refresh counters/status around it; show "Inventory updated" prompt to revalidate before submit
- Use two separate timers to avoid confusion:
  - Refresh timer: syncs counters/status only; does NOT kick user out or erase draft inputs
  - Hold timer: reserves scarce inventory for a short window; on expiry it releases hold and may move booking to Pending Confirmation/Waitlist
- Timer expiry must never auto-confirm pending requests; only agent action can move Pending Confirmation → Confirmed
- Recommended rollout: V1 uses polling (every 30 seconds + on key actions), V2 upgrades counters to real-time DB subscriptions while keeping submit-time revalidation mandatory
