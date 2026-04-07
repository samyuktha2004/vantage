# Vantage

> **Group Travel Management Platform** for MICE, destination weddings, and corporate events.
> Built for **VoyageHacks 3.0 by TBO**.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express.js-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)

[![Deploy: Railway](https://img.shields.io/badge/Deploy-Railway-00A6A6?style=flat&logo=railway&logoColor=white)](https://vantage-production-6f3e.up.railway.app/)

---

## Running the Project Locally

### Prerequisites

- **Node.js 18+** — check with `node -v`
- A **Supabase** project (free tier is fine) — [supabase.com](https://supabase.com)

### Setup steps

```bash
# 1. Clone and install
git clone https://github.com/samyuktha2004/Vantage.git
cd Vantage
npm install

# 2. Create your .env file from the template
cp .env.example .env
# Then open .env and fill in your DATABASE_URL and SESSION_SECRET (see below)

# 3. Push the schema to your Supabase DB (run this once, and again after schema changes)
npm run db:push

# 4. Start the dev server
npm run dev
```

The app runs at **http://localhost:5000** by default.

**Live demo:** https://vantage-production-6f3e.up.railway.app/

| OS              | Default URL           | Notes                                 |
| --------------- | --------------------- | ------------------------------------- |
| Windows / Linux | http://localhost:5000 | Works out of the box                  |
| macOS Monterey+ | http://localhost:5000 | ⚠️ May fail if AirPlay Receiver is on |

> **macOS AirPlay conflict:** macOS Monterey and later reserves port 5000 for AirPlay Receiver.
> If you see an error on startup, add `PORT=5001` to your `.env` and open http://localhost:5001 instead.
> To check: System Settings → General → AirDrop & Handoff → AirPlay Receiver.

---

### Environment Variables

Copy `.env.example` to `.env` and fill in these values:

| Variable                                    | Where to find it                                                                     | Required          |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------- |
| `DATABASE_URL`                              | Supabase → Settings → Database → Connection string → URI                             | Yes               |
| `SESSION_SECRET`                            | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Yes (in prod)     |
| `PORT`                                      | Leave unset (default 5000). Set to `5001` only on macOS if AirPlay conflicts         | No                |
| `TBO_HOTEL_URL`                             | TBO B2B Holidays API base URL                                                        | For hotel search  |
| `TBO_HOTEL_USERNAME` / `TBO_HOTEL_PASSWORD` | TBO Hackathon credentials                                                            | For hotel search  |
| `TBO_AIR_URL`                               | TekTravels UAT endpoint                                                              | For flight search |
| `TBO_AIR_USERNAME` / `TBO_AIR_PASSWORD`     | TBO Hackathon credentials                                                            | For flight search |
| `TBO_AIR_SERVER_IP`                         | Your server's public IP (use `127.0.0.1` for local)                                  | For flight auth   |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are **not required** — the app connects directly to Postgres via `DATABASE_URL`.

---

## How the Database Works

The project uses **Drizzle ORM** connected directly to **Supabase PostgreSQL**.

```
shared/schema.ts          ← Single source of truth for all tables and columns
      ↓
npm run db:push           ← Drizzle reads the schema and syncs it to Supabase
      ↓
server/db.ts              ← Creates a connection pool using DATABASE_URL
      ↓
server/storage.ts         ← All DB queries (wrapped in typed functions)
server/routes.ts          ← API handlers call storage functions
```

### Key points

- **`shared/schema.ts`** is where all tables are defined. If you add a column here, run `npm run db:push` to apply it to the live DB.
- **No migration files are used** — `db:push` applies changes directly. This is fast for development but skips the migration history. The `migrations/` folder is a stale artefact and can be ignored.
- **Session store is in-memory** (`MemoryStore`). Sessions are lost when the server restarts. For production, swap in `connect-pg-simple` to persist sessions in Postgres.
- **DB reset for demos**: Paste `supabase/migrations/002_clear_data.sql` into the Supabase SQL Editor to wipe all data and reset ID sequences.

### Drizzle cheat sheet

```bash
npm run db:push     # Apply schema changes to Supabase (run after editing shared/schema.ts)
npm run dev         # Start dev server (hot reload)
npm run build       # Build for production (output: dist/)
npm run start       # Run production build
```

---

## Deploying

### Free Hosting (Zero Cost Stack)

The entire project can be hosted for **free** using these services:

| Layer           | Service                          | Free tier                                        |
| --------------- | -------------------------------- | ------------------------------------------------ |
| **Database**    | [Supabase](https://supabase.com) | 2 projects, 500 MB DB, always-on                 |
| **App hosting** | [Render](https://render.com)     | 1 free web service, spins down after 15 min idle |
| **App hosting** | [Railway](https://railway.app)   | $5 free credit/month, no spin-down               |

**Supabase** is already set up (your `DATABASE_URL` points to it). You just need to host the app.

#### Render (no credit card required)

1. Push your code to GitHub (make sure `.env` is in `.gitignore`)
2. [render.com](https://render.com) → New → Web Service → Connect your repo
3. Set these fields:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm run start`
   - **Node version:** 18 (set in Environment → `NODE_VERSION=18`)
4. Add your environment variables (same as your local `.env`)
5. Click **Deploy** — Render gives you a `.onrender.com` URL

> **Free tier note:** Render spins your service down after 15 minutes of no traffic. The first request after idle takes ~30 seconds to wake up. For a hackathon demo, open the URL 30s before you present.

#### Railway ($5 free credit/month — no spin-down)

1. Push to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select your repo → Railway auto-detects Node.js
4. Add environment variables in the Railway dashboard
5. Your app is live on a `.railway.app` URL immediately

Railway runs persistently (no cold starts) and the free $5/month credit covers ~500 hours — more than enough for a project this size.

**Live deployment:** https://vantage-production-6f3e.up.railway.app/

---

### Why not serverless hosts or Firebase?

Serverless platforms run short-lived functions rather than a persistent Node.js process. This app relies on Express sessions (stateful) and an in-memory session store — both incompatible with typical serverless deployments without significant refactoring (stateless auth, external session store).

**Firebase Hosting** only serves static files. The Express API would need to be rewritten as Cloud Functions — a significant restructuring.

**Use Render or Railway instead** — they run regular Node.js servers and need zero configuration changes for this project.

---

## Architecture

```
Vantage/
├── client/                     # React 18 frontend (Vite)
│   └── src/
│       ├── components/         # Shared UI (shadcn/ui, hotel search, flight search)
│       ├── hooks/              # TanStack Query hooks (use-tbo-hotels, use-tbo-flights, etc.)
│       ├── lib/                # Utilities (excelParser, report generators)
│       └── pages/
│           ├── auth/           # Sign-in / sign-up pages (agent, client, ground team)
│           ├── guest/          # 4-step guest wizard (rsvp, travel-prefs, summary, addons)
│           └── groundteam/     # Check-in dashboard + rooming list
├── server/
│   ├── index.ts                # Entry point, session middleware, port config
│   ├── routes.ts               # All agent/client/event/inventory API routes
│   ├── guest-routes.ts         # Guest portal routes (token-based, no auth)
│   ├── storage.ts              # All DB queries (Drizzle)
│   ├── db.ts                   # DB connection pool
│   └── tbo/                    # TBO API services (hotel + flight)
├── shared/
│   ├── schema.ts               # ← Drizzle table definitions (source of truth)
│   └── routes.ts               # Shared API route path constants
└── supabase/
    └── migrations/
        └── 002_clear_data.sql  # Utility: wipe all data for demo reset
```

---

## User Roles

| Role            | Access                                                        | Sign-in URL               |
| --------------- | ------------------------------------------------------------- | ------------------------- |
| **Agent**       | Creates events, imports guests, manages all settings          | `/auth/agent/signin`      |
| **Client**      | Views their event, edits label budgets, toggles perk coverage | `/auth/client/signin`     |
| **Ground Team** | Check-in dashboard + rooming list, scoped to one event        | `/auth/groundteam/signin` |
| **Guest**       | Token-based URL — no login required                           | `/guest/:token`           |

---

## Key User Flows

### Agent creates an event

```
Sign in → Dashboard "+ New Event" → EventSetup (hotel + flight via TBO) →
Labels tab (add tiers + budgets) → Perks tab → Import guests (CSV/XLSX) →
Publish → Copy invite link → Share with guests
```

### Guest RSVPs

```
Open microsite /event/:eventCode → Enter booking ref →
/guest/:token → RSVP + family → Travel prefs → Summary → Add-ons → Receipt
```

### Ground team checks in guests

```
Sign in → /groundteam/:id/checkin → Scan QR / search by name →
Mark Arrived → Update flight status → Walk-in registration if needed
```

### Client monitors the event

```
Sign in → Enter event code → ClientEventView →
Edit label budgets → Toggle perk coverage → View pending requests
```

---

## Tech Stack

### Full Stack

| Layer             | Technology                                  | Purpose                                                          |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| **Frontend**      | React 18 + TypeScript                       | UI and state management                                          |
| **Build tool**    | Vite 5                                      | Fast HMR dev server, optimised production bundles                |
| **Routing**       | Wouter                                      | Lightweight client-side router (no Next.js — pure SPA)           |
| **Server state**  | TanStack Query v5                           | Async data fetching, caching, background refetch                 |
| **UI components** | shadcn/ui (Radix UI)                        | Accessible, unstyled primitives                                  |
| **Styling**       | Tailwind CSS v3                             | Utility-first, mobile-first responsive design                    |
| **Animation**     | Framer Motion                               | Page transitions, waitlist promotion banner                      |
| **Backend**       | Express 5 + TypeScript                      | REST API server                                                  |
| **Runtime**       | Node.js 18+ (tsx for dev)                   | Single process: serves API + static SPA                          |
| **Database**      | PostgreSQL via Supabase                     | Managed Postgres, no self-hosting needed                         |
| **ORM**           | Drizzle ORM                                 | Type-safe SQL, schema-first, no migration files in dev           |
| **Auth**          | bcryptjs + express-session                  | Cookie sessions for agents/clients; signed token URLs for guests |
| **APIs**          | TBO Hotel B2B API, TBO Air (TekTravels UAT) | Live hotel and flight search with mock fallback                  |
| **Excel**         | XLSX (SheetJS)                              | Guest list import (CSV/XLSX) + rooming-list export               |
| **CSV**           | Papaparse                                   | Fast CSV parsing in browser                                      |
| **QR**            | html5-qrcode + qrcode                       | Ground team scan + per-guest QR generation                       |
| **PDF/Print**     | Browser `window.print()`                    | Manifest export (no external lib needed)                         |

### Key Architecture Decisions

| Decision                            | Why                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **No Next.js**                      | The app uses Express sessions (stateful) + a persistent server. Next.js serverless functions don't support this without a major rewrite. |
| **No separate client/server ports** | Vite proxies `/api/*` to Express in dev; production serves the Vite bundle from the same Express process. One port, zero CORS issues.    |
| **No real-time WebSocket**          | Ground team dashboard polls every 30 s — sufficient for check-in latency without the overhead of WebSocket infra.                        |
| **Token URLs for guests**           | Guests need zero login friction. A signed random UUID in the URL gives per-guest isolation without credentials.                          |
| **Drizzle `db:push` in dev**        | Schema changes apply directly to Supabase without migration files. Fast for hackathon iteration.                                         |
| **TBO mock fallback**               | When TBO API credentials are unavailable (local dev, demo), the server returns realistic mock data so all guest flows work end-to-end.   |

### Scalability

The same architecture runs a 50-guest boutique wedding or a 5,000-delegate convention:

- **Database**: Supabase PostgreSQL scales vertically (connection pooler available for high concurrency)
- **API**: Express stateless per-request — horizontal scaling behind a load balancer needs only session persistence (swap `MemoryStore` for `connect-pg-simple`)
- **Frontend**: Vite code-splits by route; TanStack Query aggressive caching means minimal server round-trips for repeat views
- **Ground team polling**: 30-second interval — fine for check-in volume of any event size

### Mobile-First Design

Every page is built mobile-first (Tailwind `sm:` / `md:` breakpoints):

- Guest portal: full flow works on a phone browser — no app download
- Ground team dashboard: tablet-optimised for scan + check-in at the door
- Agent dashboard: desktop-primary with responsive fallbacks

---

## USPs at a Glance

| USP                               | Where it works                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Socially-Intelligent Waitlist** | Guest declines → server auto-promotes highest-priority waitlisted guest. Priority = label tier (VIP=1, Family=2, General=3).          |
| **Budget-Cap Auto-Pilot**         | `addOnBudget` per label. Server auto-approves requests within budget (no agent/client call). Client UI toggle shows "Auto-Pilot: ON". |
| **Smart Check gate**              | Guest sees their name + event details before RSVP form — prevents wrong-link confusion.                                               |
| **Conflict-Aware Itinerary**      | Server rejects itinerary registration if two events overlap in time. Guest sees a clear conflict toast.                               |
| **Split Billing**                 | Each perk: `expenseHandledByClient` flag. "Included" = client pays. "₹X" = self-pay. Visible in guest add-ons.                        |
| **Bleisure Upsell**               | Guest can extend hotel stay pre/post event. Extra nights cost calculated at negotiated group rate.                                    |
| **EWS (Early Warning System)**    | Inventory tab shows red "⚠" at ≥90% utilisation. Auto Top-Up toggle (UI) for future TBO retail block pull.                            |
| **Multi-Hotel Selection**         | Agent sets up multiple hotel options per event. Guest picks preferred hotel in travel prefs step.                                     |
| **One-Shot Excel Import**         | Drag-and-drop CSV/XLSX. Preview dialog shows first 5 rows before confirming. Auto-matches Category → Label.                           |
| **QR Check-In**                   | Each guest has a unique QR. Ground team scans with phone camera → instant arrival mark.                                               |
| **Walk-in Registration**          | Ground team adds on-spot guests at the door. Generates booking ref + QR instantly.                                                    |
| **WhatsApp Share**                | Agent copies guest link → shares via WhatsApp `wa.me/?text=...` pre-filled with invite + booking ref.                                 |
