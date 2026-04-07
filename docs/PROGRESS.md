# Progress Tracker — Vantage

**Last Updated:** March 1, 2026

---

## Status: Hackathon MVP — complete ✅

All planned features implemented. Nomination logic intentionally dropped. See "Dropped Features" below.

---

## Completed Features

### Auth & Roles

| Feature                  | Notes                                     |
| ------------------------ | ----------------------------------------- |
| Agent sign-up / sign-in  | Session-based, bcrypt                     |
| Client sign-up / sign-in | Session-based, event code required        |
| Ground team sign-in      | Scoped to one event via `user.eventCode`  |
| Guest access             | Token URL (`/guest/:token`) — no password |

### Event Management (Agent)

| Feature                               | Notes                                                     |
| ------------------------------------- | --------------------------------------------------------- |
| Event CRUD + publish                  | Auto event codes (e.g. `TINA2026`)                        |
| TBO hotel search + block confirmation | Live API via `HotelSearchPanel`                           |
| TBO flight search + seat confirmation | Live API via `FlightSearchPanel`                          |
| TBO credential mode                   | **Current:** shared/default `TBO_*` env creds (demo)      |
| Label management                      | VIP, Family, etc. — custom names, free-text               |
| Perk management                       | `included` / `requestable` / `self_pay` with unit cost    |
| Label-perk matrix                     | Toggle enabled + `expenseHandledByClient` per tier        |
| Bulk guest import (agent)             | Excel (.xlsx) + CSV via Papa Parse + XLSX                 |
| Guest CRUD + QR codes                 | UUID access tokens, human-readable booking refs           |
| Seat allocation per guest             | `allocatedSeats` + `confirmedSeats`                       |
| Waitlist system                       | Priority-based with waitlist bell                         |
| Request approval workflow             | Approve/decline with notes + Bulk Approve All             |
| Copy invite link                      | Copies microsite URL to clipboard                         |
| Copy event code                       | Copies raw code (e.g. `TINA2026`) for sharing with client |
| Download Manifest (Excel)             | All columns: PNR, meal, emergency contact, transport      |
| Inventory EWS banners                 | Warning/critical banners when rooms >70%/>90% filled      |
| Cover image / video                   | URL input in Microsite Appearance tab                     |
| Create staff account                  | Ground team account scoped to event                       |

### Client View

| Feature                            | Notes                                                           |
| ---------------------------------- | --------------------------------------------------------------- |
| Multi-event dashboard              | Client sees all their events                                    |
| ClientEventView                    | Separate view from agent tabs                                   |
| Per-label add-on budget (editable) | PATCH `/api/events/:id/labels/:labelId`                         |
| Perk coverage toggles (editable)   | Switch: client-covered vs guest-pays                            |
| Cost breakdown                     | Total allocated vs used, by label                               |
| Pending requests (read-only)       | Guest name visible per request                                  |
| Import guests from Excel           | Same parse + POST flow as agent                                 |
| Add custom labels                  | Dialog → POST `/api/events/:id/labels` → reflects in agent view |

### Role Parity — Snapshot

The authoritative role-permission matrix is maintained in [USER_FLOWS.md — Role Permission Matrix](./USER_FLOWS.md#role-permission-matrix-for-shared-modules).

Below was a development snapshot kept for progress tracking. For all RBAC or permission changes, update `USER_FLOWS.md` (the canonical source) and then refresh this snapshot if needed.

**Snapshot date:** March 1, 2026 — refer to `USER_FLOWS.md` for the live matrix.

### Guest Portal (4-Step Wizard)

| Step         | Route                        | Notes                                                         |
| ------------ | ---------------------------- | ------------------------------------------------------------- |
| RSVP         | `/guest/:token/rsvp`         | Confirm/decline, family members, meal pref, emergency contact |
| Travel Prefs | `/guest/:token/travel-prefs` | Transport mode (group/own/train/other/local), PNR/notes       |
| Summary      | `/guest/:token/summary`      | Read-only: arrival, hotel nights, departure, group savings    |
| Add-ons      | `/guest/:token/addons`       | Budget meter, perk action cards, extend stay                  |
| Receipt      | `/guest/:token`              | "You're all set" + edit links                                 |
| Microsite    | `/event/:eventCode`          | Branded public page, booking-ref lookup, self-registration    |

### Ground Team

| Feature                 | Notes                                        |
| ----------------------- | -------------------------------------------- |
| Check-in dashboard      | Live stats, search by name/booking ref       |
| QR code scanner         | Camera overlay, token matching               |
| Mark arrived            | `POST /api/groundteam/checkin/:guestId`      |
| Walk-in registration    | On-spot guest + "Walk-in" badge              |
| Flight status coloring  | Card border: green/blue/amber/red per status |
| Flight status dropdown  | Ground team manually updates per guest       |
| Emergency contact (SOS) | Red badge in expanded guest card             |
| Rooming list            | PNR, meal pref, origin, transport mode icon  |
| Download manifest Excel | All columns from rooming list                |

---

## Intentionally Dropped Features

| Feature                                | Reason                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Nomination logic (pre-filled +1 names) | Increases agent/client work; nickname vs legal name mismatches; guest feels odd editing "chosen" names |
| Cover image file upload                | URL input is sufficient for hackathon demo — paste any Unsplash/hosted URL                             |
| Email/SMS notifications                | No transactional email service configured; out of scope for demo                                       |
| Inventory-low push alerts              | EWS banners in UI are sufficient for demo                                                              |
| Multi-hotel choice UI for guests       | Data model supports multiple inventory rows; guest UI assigns one hotel                                |

---

## Known Issues (Non-blocking)

| Issue                                                                        | Severity | Notes                                                                                                                                                          |
| ---------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MemoryStore sessions lost on restart                                         | Low      | Acceptable for demo; swap to `connect-pg-simple` for production                                                                                                |
| Pre-existing TS errors in Dashboard.tsx, GuestConcierge.tsx, GuestTravel.tsx | Low      | Not caused by recent work; doesn't affect core demo flows                                                                                                      |
| `travelSchedules.eventId` Drizzle error in storage.ts                        | Low      | InMemoryStorage only, not used in production                                                                                                                   |
| Agent forgot-password flow                                                   | Low      | UI link added on agent sign-in; reset password backend/API/email flow pending                                                                                  |
| Event decline optional message                                               | Low      | Microsite UI supports an optional decline message; backend support pending                                                                                     |
| Microsite booking + confirmation UI                                          | Low      | UI-only booking cards and confirmation receipt added to microsite; link to guest booking pages when guest token available; backend/payment integration pending |
| Agent-specific TBO credentials                                               | Medium   | Today uses shared/default env credentials; planned upgrade is fetching credentials from signed-in agent account/profile                                        |

---

## Tech Stack

## Notes for future cleanup

- `package-lock.json` contains an entry for `@vercel/postgres` originating from the initial commit. This is lockfile metadata only and does not affect runtime. We decided not to regenerate or remove the lockfile now to avoid broad dependency resolution changes. To clean later: remove `package-lock.json` and `node_modules`, run `npm install`, run smoke tests (`npm run smoke`), and commit the updated lockfile once validated.

| Layer     | Tech                                                            |
| --------- | --------------------------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite, Wouter, TanStack Query v5           |
| UI        | shadcn/ui, Tailwind CSS, Framer Motion                          |
| Backend   | Express 5, TypeScript, tsx (dev)                                |
| Database  | PostgreSQL via Supabase, Drizzle ORM (`db:push` workflow)       |
| Auth      | bcryptjs + express-session (agents/clients); token URL (guests) |
| APIs      | TBO Hotel B2B, TBO Air (TekTravels UAT)                         |
| Utilities | XLSX, Papaparse, html5-qrcode, multer                           |

---

## Key File Map

```
server/
  tbo/tboHotelService.ts       ← Hotel API (auth + search + book)
  tbo/tboFlightService.ts      ← Flight API (token cache + search)
  tbo-hotel-routes.ts          ← Hotel proxy routes
  tbo-flight-routes.ts         ← Flight proxy routes
  routes.ts                    ← All main API routes
  guest-routes.ts              ← Guest portal routes (token-based)
  storage.ts                   ← All DB queries (Drizzle)
  db.ts                        ← Connection pool

client/src/
  pages/
    EventDetails.tsx            ← Agent event view (tabs: Guests, Labels, Perks, Inventory, Approval, Microsite)
    ClientEventView.tsx         ← Client view (budget, perk toggles, import, add label)
    EventMicrosite.tsx          ← Public branded page at /event/:eventCode
    EventSetup.tsx              ← Hotel + flight search wizard (Steps 1-3)
    ApprovalReview.tsx          ← Agent approves/rejects guest requests
    guest/GuestRSVP.tsx         ← Wizard Step 1
    guest/GuestTravelPrefs.tsx  ← Wizard Step 2
    guest/GuestBookingSummary.tsx ← Wizard Step 3
    guest/GuestAddOns.tsx       ← Wizard Step 4
    groundteam/CheckInDashboard.tsx ← Ground team check-in
    groundteam/RoomingList.tsx  ← Full guest manifest
  components/
    hotel/                      ← HotelSearchPanel → HotelResultsList → HotelRoomSelector → HotelBookingConfirmCard
    flight/                     ← FlightSearchPanel → FlightResultsList → FlightDetailCard → FlightBookingConfirmCard
  lib/excelParser.ts            ← parseExcelFile, parseCSVFile, exportManifestToExcel

shared/schema.ts                ← Single source of truth for all DB tables
```
