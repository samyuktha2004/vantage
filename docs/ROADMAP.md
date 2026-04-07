# Roadmap — Vantage

**Last Updated:** February 2026

---

## Phase Legend

- **MVP** — Minimum viable product; required for TBO internal demo and pilot
- **V1** — Production-ready; first live partner agents
- **V2** — Scale; white-labeling and advanced features

---

## MVP (Current Sprint)

### Foundation

- [x] Agent + Client authentication (session-based)
- [x] Event CRUD with auto-generated event codes
- [x] Label/Perk matrix with expense coverage toggles
- [x] Guest management (CRUD + bulk Excel/CSV import)
- [x] Guest portal (8 pages, token-based, no login required)
- [x] RSVP + seat allocation
- [x] Request approval workflow
- [x] Capacity monitoring and alerts
- [x] Excel report generation (6 sheets)

### TBO API Integration (In Progress)

- [ ] TBO Hotel API proxy (server-side: countries, cities, search, prebook, book, cancel)
- [ ] TBO Flight API proxy (server-side: authenticate, search, fareQuote, fareRule, book, ticket)
- [ ] Hotel search UI in EventSetup (tabbed: TBO Search | Manual entry)
- [ ] Flight search UI in EventSetup (tabbed: TBO Search | Manual entry)
- [ ] Store TBO booking data (JSONB) in hotel_bookings + travel_options tables

#### Credential Strategy (Important)

- [x] **Current (MVP demo):** Use shared/default TBO credentials from server environment variables (`TBO_*`).
- [ ] **Future (V1):** Pull TBO credentials per agent account/profile after sign-in (agent-scoped credentials, not global defaults).
- [ ] Add secure credential storage + encryption at rest for agent TBO credentials.
- [ ] Add fallback order: agent credentials → org credentials → explicit demo default (non-production only).
- [ ] Add clear UI state in agent settings: "TBO Connected / Missing Credentials".

### Group Inventory Management (In Progress)

- [ ] `group_inventory` table (rooms blocked/confirmed, seats allocated/confirmed)
- [ ] Inventory dashboard tab in EventDetails
- [ ] Negotiated rate + inclusions storage per event

### Event Microsite (In Progress)

- [ ] Public `/event/:eventCode` route (no auth required)
- [ ] Hero, Package Overview, Itinerary, Access Portal, Footer sections
- [ ] Booking ref lookup from microsite → redirect to guest portal
- [ ] New attendee self-registration → pending guest creation
- [ ] Agent notified of pending registrations

### Ground Team Check-in (In Progress)

- [ ] Ground team role added to auth system
- [ ] Agent creates ground team accounts (scoped to event)
- [ ] Mobile check-in dashboard (search + QR scan + mark arrived)
- [ ] Rooming list view (mobile-optimized + PDF download)

### Documentation (In Progress)

- [x] PRD (this file)
- [x] Roadmap (this file)
- [ ] Progress tracker
- [ ] TBO API Integration Guide
- [ ] TBO API Setup & Credentials Guide

**Permissions / RBAC:** The authoritative permissions table is maintained in [USER_FLOWS.md — Role Permission Matrix](./USER_FLOWS.md#role-permission-matrix-for-shared-modules). Roadmap items that affect roles (auth, ground team, client controls) should reference that matrix when describing access changes.

---

## V1 — Production Ready (Q2 2026)

### Notifications

- [ ] Email to guest when booking confirmed
- [ ] Email to agent when guest completes RSVP
- [ ] SMS / WhatsApp notification option (Twilio)
- [ ] In-app notification bell for agents (new requests, new self-registrations)

### Payment (Self-Pay Guests)

- [ ] Razorpay/Stripe payment link for self-pay perks
- [ ] Payment status tracking per guest
- [ ] Receipt generation and email delivery

### Enhanced Bleisure

- [ ] Connect bleisure extension to live TBO hotel rates (currently hardcoded $250/night)
- [ ] Agent pre-configures allowable extension dates and rates
- [ ] Guest selects extension → payment triggered automatically

### Train Booking

- [ ] IRCTC API integration for domestic India train bookings
- [ ] Train search in EventSetup (alongside flight)
- [ ] Guest travel details show train PNR

### Advanced Guest Portal

- [ ] Guest can update dietary restrictions and special requests
- [ ] Conflict-aware itinerary suggestions ("You've selected X which overlaps with Y")
- [ ] Digital boarding pass / itinerary PDF download

### Agent Dashboard Enhancements

- [ ] Revenue summary per event (total collected vs. outstanding)
- [ ] Guest completion rate funnel (invited → RSVP'd → travel confirmed → perks selected)
- [ ] Automated reminders for incomplete RSVPs

---

## V2 — Scale & White-labeling (Q3 2026)

### TBO Platform Integration

- [ ] Native TBO B2B portal SSO (agents sign in with TBO credentials)
- [ ] Event data synced with TBO CRM
- [ ] Commission tracking per event booking

### White-labeling

- [ ] Partner agents can brand the microsite with their own logo/colors
- [ ] Custom domain support for microsites (e.g., `events.agencyname.com`)
- [ ] Email templates branded per agent

### Analytics & Reporting

- [ ] Real-time analytics dashboard (events live, guests confirmed, revenue)
- [ ] Comparative reporting across events
- [ ] Export to TBO internal BI tools

### Mobile App

- [ ] React Native app for ground team check-in (offline-capable)
- [ ] Push notifications for agents
- [ ] Guest app with offline itinerary access

### AI Features

- [ ] Smart guest categorization (auto-suggest label based on name/email domain)
- [ ] Flight recommendation engine (best group fare based on event dates)
- [ ] Chatbot for guest queries (integrated in microsite)

### Multi-Currency & Globalization

- [ ] Multi-currency pricing display
- [ ] GST/VAT support for invoicing
- [ ] Multilingual microsite (English, Hindi, Arabic)

---

## Technical Debt Backlog

| Item                                                                              | Priority | Notes                                                            |
| --------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| Add `arrived` to guest status enum                                                | High     | Needed for ground team check-in                                  |
| Fix `travelSchedules` Drizzle relation (references non-existent `eventId` column) | Medium   | Bug in current schema                                            |
| Replace hardcoded `$250/night` bleisure rate                                      | Medium   | Connect to TBO hotel live rate                                   |
| Add Redis for TBO Air token cache                                                 | Low      | In-memory cache fine for single-process, needs Redis for scaling |
| Add rate limiting on `/api/tbo/*` proxy routes                                    | Medium   | Prevent excessive TBO API calls                                  |
| Add comprehensive error handling for TBO API failures                             | High     | TBO may return non-standard error formats                        |
| HTTPS enforcement in production                                                   | High     | Required before going live                                       |
