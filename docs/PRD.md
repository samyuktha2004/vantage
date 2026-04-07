# Product Requirements Document — Vantage

**Version:** 1.0
**Date:** February 2026
**Owner:** Travel Boutique Online (TBO)
**Platform:** Group Travel Management for MICE & Destination Weddings

---

## 1. Executive Summary

Group travel for MICE (Meetings, Incentives, Conferences, Exhibitions) and destination weddings is still largely coordinated offline through emails, spreadsheets, and manual follow-ups. Vantage digitizes this complexity by introducing:

1. **Group Inventory Management** — Negotiated rates, protected allotments, inclusions, and validity mapped per event
2. **Event Microsite** — Branded per-event page where guests self-serve RSVPs and bookings
3. **TBO API Integration** — Live hotel and flight search replacing manual data entry

---

## 2. User Roles

**RBAC source of truth:** Detailed permissions (who can do what) are maintained in [USER_FLOWS.md — Role Permission Matrix](./USER_FLOWS.md#role-permission-matrix-for-shared-modules). This PRD keeps role descriptions high-level to avoid duplicated permission logic across docs.

### 2.1 Travel Agent (TBO Partner)

The primary operator of the platform. Creates and manages events end-to-end.

**Primary responsibility:** Owns event setup, guest operations, approvals, inventory actions, and final reporting.

### 2.2 Client (Event Host)

The corporate client or wedding family who commissioned the event.

**Primary responsibility:** Reviews event progress, controls host-side inclusions/cost decisions within allowed scope, and approves forwarded requests.

### 2.3 Ground Team (On-site Check-in Staff)

Staff deployed at the event venue for day-of operations.

**Primary responsibility:** Executes check-in and on-ground operations for one scoped event (operational actions only).

### 2.4 Guest (Attendee / Delegate / Wedding Guest)

The end attendee. Accesses via a unique secure link — no account creation required.

**Primary responsibility:** Completes RSVP and travel-related self-service steps using a tokenized guest portal link.

---

## 3. Feature Requirements

### 3.1 Event Management

| ID  | Feature                                                       | Priority | Status      |
| --- | ------------------------------------------------------------- | -------- | ----------- |
| E1  | Create event with name, date, location, description           | P0       | ✅ Done     |
| E2  | Auto-generate unique event code (format: CLIENTEVENTyearMMDD) | P0       | ✅ Done     |
| E3  | Publish/unpublish event                                       | P0       | ✅ Done     |
| E4  | Delete event (cascades all data)                              | P0       | ✅ Done     |
| E5  | Event preview before publish                                  | P0       | ✅ Done     |
| E6  | Event microsite (public branded page per event)               | P0       | ❌ To Build |
| E7  | Self-registration via microsite (pending guest creation)      | P1       | ❌ To Build |

### 3.2 Group Inventory Management

| ID  | Feature                                                | Priority | Status                          |
| --- | ------------------------------------------------------ | -------- | ------------------------------- |
| I1  | TBO Hotel search integrated into event setup           | P0       | ❌ To Build                     |
| I2  | Hotel room block with TBO PreBook/Book flow            | P0       | ❌ To Build                     |
| I3  | TBO Flight search integrated into event setup          | P0       | ❌ To Build                     |
| I4  | Group flight booking with PNR from TBO                 | P0       | ❌ To Build                     |
| I5  | Track rooms blocked vs confirmed (inventory dashboard) | P0       | ❌ To Build                     |
| I6  | Track seats allocated vs confirmed                     | P0       | ❌ To Build                     |
| I7  | Store negotiated rate, inclusions, validity per event  | P1       | ❌ To Build                     |
| I8  | Alert when inventory <10% remaining                    | P1       | ✅ Done (capacity alerts exist) |
| I9  | Manual hotel/flight entry fallback                     | P1       | ✅ Done                         |

### 3.3 Guest Management

| ID  | Feature                                                    | Priority | Status                           |
| --- | ---------------------------------------------------------- | -------- | -------------------------------- |
| G1  | Manual guest add with full details                         | P0       | ✅ Done                          |
| G2  | Bulk import via Excel/CSV                                  | P0       | ✅ Done                          |
| G3  | Unique secure access token per guest                       | P0       | ✅ Done                          |
| G4  | Human-readable booking reference                           | P0       | ✅ Done                          |
| G5  | Label assignment (VIP, Family, Staff, etc.)                | P0       | ✅ Done                          |
| G6  | Guest status tracking (pending/confirmed/declined/arrived) | P0       | ⚠️ Partial (no 'arrived' status) |
| G7  | Family member management                                   | P1       | ✅ Done                          |
| G8  | Waitlist with priority by tier                             | P1       | ✅ Done                          |
| G9  | Seat allocation per guest                                  | P1       | ✅ Done                          |
| G10 | Guest QR code + shareable link                             | P1       | ✅ Done                          |
| G11 | Delete guest                                               | P0       | ✅ Done                          |

### 3.4 Label & Perk System

| ID  | Feature                                               | Priority | Status  |
| --- | ----------------------------------------------------- | -------- | ------- |
| P1  | Create custom labels per event                        | P0       | ✅ Done |
| P2  | Create perks per event (transport, meals, activities) | P0       | ✅ Done |
| P3  | Toggle perk enabled/disabled per label                | P0       | ✅ Done |
| P4  | Toggle expense covered by client vs. self-pay         | P0       | ✅ Done |
| P5  | Guest sees "Included" for covered perks               | P0       | ✅ Done |
| P6  | Guest sees "Contact Agent" for self-pay perks         | P0       | ✅ Done |
| P7  | Guest request for perks outside their label           | P1       | ✅ Done |
| P8  | Agent approval workflow for requests                  | P1       | ✅ Done |

### 3.5 Guest Portal (8 Pages)

| ID  | Feature                                                | Priority | Status                |
| --- | ------------------------------------------------------ | -------- | --------------------- |
| GP1 | Booking ref lookup (Guest Lookup)                      | P0       | ✅ Done               |
| GP2 | Guest dashboard with event overview                    | P0       | ✅ Done               |
| GP3 | RSVP + seat confirmation                               | P0       | ✅ Done               |
| GP4 | Travel details view (read-only)                        | P0       | ✅ Done               |
| GP5 | Concierge (perks confirmation/contact)                 | P0       | ✅ Done               |
| GP6 | Itinerary with activity selection + conflict detection | P1       | ✅ Done               |
| GP7 | Bleisure calendar (stay extension, self-pay)           | P1       | ✅ Done (static rate) |
| GP8 | ID Vault (document upload)                             | P1       | ✅ Done               |
| GP9 | Room upgrade request                                   | P1       | ✅ Done               |

### 3.6 Ground Team Check-in

| ID  | Feature                               | Priority | Status      |
| --- | ------------------------------------- | -------- | ----------- |
| GR1 | Ground team role + agent-issued login | P1       | ❌ To Build |
| GR2 | Guest search by name or booking ref   | P1       | ❌ To Build |
| GR3 | QR code scan verification             | P1       | ❌ To Build |
| GR4 | Mark guest as arrived                 | P1       | ❌ To Build |
| GR5 | Mobile-optimized rooming list         | P1       | ❌ To Build |

### 3.7 Reporting & Analytics

| ID  | Feature                                   | Priority | Status      |
| --- | ----------------------------------------- | -------- | ----------- |
| R1  | Excel export: 6-sheet full event report   | P0       | ✅ Done     |
| R2  | Real-time inventory consumption dashboard | P0       | ❌ To Build |
| R3  | Guest arrival tracking (check-in stats)   | P1       | ❌ To Build |

---

## 4. Technical Requirements

### 4.1 Architecture

- **Frontend:** React 18 + TypeScript + Tailwind CSS + shadcn/ui components
- **Backend:** Node.js + Express 5 (server-side proxy for all TBO API calls)
- **Database:** PostgreSQL via Supabase + Drizzle ORM
- **Auth:** Session-based (express-session + connect-pg-simple)
- **State Management:** TanStack Query (React Query v5)
- **Build:** Vite (client) + esbuild (server)

### 4.2 API Integration

- All TBO API calls MUST be server-side only — credentials never sent to browser
- TBO Air API token cached in memory with 55-minute TTL
- Graceful fallback to manual entry if TBO API unavailable
- Raw TBO responses stored in JSONB columns for forward compatibility

### 4.3 Security

- Guest portal: token-based (UUID access token in URL) — no password required
- Agent/Client: session-based with bcrypt-hashed passwords
- Ground team: session-based, scoped to specific event by agent
- Public microsite: returns only human-readable summaries — no PII, no TBO credentials, no booking codes

### 4.4 Non-Functional Requirements

- Mobile-responsive (critical for guests traveling and ground team on-site)
- Luxury design aesthetic: Champagne/Navy/Slate color palette
- Real-time capacity monitoring
- Bulk operations: import 500+ guests via Excel without timeout

---

## 5. Out of Scope (V1 MVP)

- Payment processing (Stripe/Razorpay integration)
- Email/SMS notification system
- WhatsApp integration for guest communication
- Train booking API (rail data)
- Multi-currency support
- Advanced analytics and reporting dashboards
- White-labeling for TBO partner agents
- Mobile native app (iOS/Android)

---

## 6. Acceptance Criteria

### Full End-to-End Flow

1. Agent signs in → creates event → searches TBO hotel → blocks rooms → searches TBO flight → allocates seats
2. Agent sets up labels (VIP, Family) → assigns perks with expense toggles
3. Agent imports guest list → assigns labels → publishes event
4. Guest receives link → opens microsite → enters booking ref → lands in guest portal
5. Guest completes RSVP → views travel details → selects optional activities → confirms included perks
6. Ground team signs in → searches guest → marks arrived on check-in day
7. Agent views inventory dashboard → sees rooms blocked vs confirmed → downloads rooming list

### API Integration Criteria

- `GET /api/tbo/hotel/countries` returns live TBO country list
- `POST /api/tbo/hotel/search` returns available hotels for given city/dates
- `POST /api/tbo/hotel/book` returns a real `ConfirmationNumber` stored in DB
- `POST /api/tbo/flight/search` returns live flight results with `TraceId`
- `POST /api/tbo/flight/book` returns a real `PNR` stored in DB
