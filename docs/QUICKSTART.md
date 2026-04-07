# Quickstart (5 Minutes)

Use this if you want the fastest local run path.

## 1) Install and configure

```bash
npm install
cp .env.example .env
```

Update `.env` with:

- `DATABASE_URL` (Supabase Postgres connection string)
- `SESSION_SECRET` (random 48+ bytes hex)
- Optional: `TBO_*` variables for live hotel/flight APIs

## 2) Sync database schema

```bash
npm run db:push
```

This project uses Drizzle schema push from `shared/schema.ts`.

## 3) Start app

```bash
npm run dev
```

Open:

- `http://localhost:5000` (default)
- If macOS port conflict, set `PORT=5001` in `.env` and use `http://localhost:5001`

## 4) Automated smoke test (optional)

An automated smoke script is included to validate core role flows (agent → client → ground-team). The script is not detailed in the main README; run it from your local checkout as part of setup when you need a quick end-to-end check.

Run from the project root:

```bash
# Start your dev server first (default port: 5001 on macOS if needed)
npm run dev

# In a separate terminal, run the smoke script
npm run smoke
```

Notes:

- The script is `scripts/smoke.sh` and generates temporary test users and cookie jars in `/tmp`.
- It is safe to run against local dev only (it creates test data in your connected database).

## Need deeper setup?

- Supabase details: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- TBO credentials/setup: [TBO_API_SETUP.md](./TBO_API_SETUP.md)
- API implementation reference: [API_INTEGRATION.md](./API_INTEGRATION.md)
