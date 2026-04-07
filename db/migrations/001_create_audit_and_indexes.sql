-- Migration: create audit_logs table and unique indexes for guests and guest_itinerary
-- IMPORTANT: Ensure there are no duplicate guests (event_id + lower(email)) before creating the unique index.
-- Run the following to find duplicates:
-- SELECT event_id, lower(email) AS email_lc, count(*) AS cnt
-- FROM guests
-- GROUP BY event_id, lower(email)
-- HAVING count(*) > 1;

BEGIN;

-- Create audit_logs table (safe to run multiple times)
CREATE TABLE IF NOT EXISTS audit_logs (
  id serial PRIMARY KEY,
  actor_id text REFERENCES users(id),
  action text NOT NULL,
  target_table text,
  target_id integer,
  details jsonb,
  created_at timestamp DEFAULT now()
);

-- Create a case-insensitive unique index on guests (event_id, lower(email)).
-- NOTE: This will fail if duplicates exist. Resolve duplicates before running.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'guests_event_email_ci_idx'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX guests_event_email_ci_idx ON guests (event_id, lower(email));';
  END IF;
END$$;

-- Create unique index for guest_itinerary (prevent duplicate registrations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'guest_itinerary_unique_idx'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX guest_itinerary_unique_idx ON guest_itinerary (guest_id, itinerary_event_id);';
  END IF;
END$$;

COMMIT;

-- Helpful checks after running migration:
-- 1) Verify index exists: \di guests_event_email_ci_idx
-- 2) Verify audit_logs table: SELECT count(*) FROM audit_logs;
