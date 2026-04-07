#!/usr/bin/env bash
# Simple helper to run DB migrations against the configured DATABASE_URL
set -euo pipefail

if [ -z "${DATABASE_URL-}" ]; then
  echo "Please set DATABASE_URL environment variable (e.g. export DATABASE_URL=\"postgresql://...\")"
  exit 1
fi

MIGRATION_FILE="$(dirname "$0")/../db/migrations/001_create_audit_and_indexes.sql"

echo "Running migration: $MIGRATION_FILE"
psql "$DATABASE_URL" -f "$MIGRATION_FILE"

echo "Migration complete."
