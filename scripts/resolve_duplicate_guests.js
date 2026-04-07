#!/usr/bin/env node
/*
  Resolve duplicate guests by (event_id, lower(email)).

  Behavior:
  - Produces a preview of suggested merges by default.
  - Run with `--yes` to perform changes.
  - Merge rules:
    * Keep earliest `booking_ref` and `access_token` (preserve links).
    * For most fields, prefer the latest non-null value (newer records win).
    * For numeric seat counters, take the MAX.
  - For each duplicate group the script updates references from removed IDs to the kept ID,
    updates the kept row with merged values (if needed), deletes the duplicates, and inserts an audit log.

  Usage:
    export DATABASE_URL="postgresql://user:pass@host:port/dbname"
    node scripts/resolve_duplicate_guests.js        # preview only
    node scripts/resolve_duplicate_guests.js --yes # apply changes

  IMPORTANT: Backup your DB before running this script.
*/

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MERGE_COLS_LATEST = [
  'name', 'phone', 'category', 'dietary_restrictions', 'special_requests',
  'arrival_date', 'departure_date', 'arrival_pnr', 'departure_pnr', 'origin_city',
  'emergency_contact_name', 'emergency_contact_phone', 'meal_preference', 'status', 'flight_status',
  'selected_hotel_booking_id'
];

const MERGE_COLS_MAX = ['allocated_seats', 'confirmed_seats'];

async function findDuplicateGroups(client) {
  const res = await client.query(`
    SELECT event_id, lower(email) AS email_lc, array_agg(id ORDER BY id) AS ids, count(*) AS cnt
    FROM guests
    GROUP BY event_id, lower(email)
    HAVING count(*) > 1
  `);
  return res.rows;
}

async function fetchGuestsByIds(client, ids) {
  const res = await client.query(`SELECT * FROM guests WHERE id = ANY($1::int[]) ORDER BY id ASC`, [ids]);
  return res.rows;
}

function pickLatestNonNull(rows, col) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][col];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

function pickMax(rows, col) {
  let max = null;
  for (const r of rows) {
    const v = r[col];
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isNaN(n)) continue;
    if (max === null || n > max) max = n;
  }
  return max;
}

async function updateReferences(client, fromId, toId) {
  const tables = [
    { table: 'guest_family', col: 'guest_id' },
    { table: 'guest_requests', col: 'guest_id' },
    { table: 'guest_itinerary', col: 'guest_id' },
    { table: 'payment_transactions', col: 'guest_id' },
  ];
  for (const t of tables) {
    await client.query(`UPDATE ${t.table} SET ${t.col} = $1 WHERE ${t.col} = $2`, [toId, fromId]);
  }
}

async function insertAudit(client, actorId, action, targetTable, targetId, details) {
  await client.query(`INSERT INTO audit_logs (actor_id, action, target_table, target_id, details) VALUES ($1,$2,$3,$4,$5)`, [actorId, action, targetTable, targetId, details]);
}

async function processGroup(client, group, applyChanges) {
  const ids = group.ids.map(Number);
  const rows = await fetchGuestsByIds(client, ids);
  if (rows.length <= 1) return null;

  const keptId = rows[0].id; // earliest by id ASC
  const keptRow = { ...rows[0] };
  const removedIds = rows.map(r => r.id).filter(id => id !== keptId);

  // Build merged object
  const merged = {};
  // keep earliest booking_ref/access_token
  merged.booking_ref = keptRow.booking_ref;
  merged.access_token = keptRow.access_token;

  for (const col of MERGE_COLS_LATEST) {
    merged[col] = pickLatestNonNull(rows, col);
  }
  for (const col of MERGE_COLS_MAX) {
    merged[col] = pickMax(rows, col);
  }

  // If merged fields are all equal to keptRow values, we still need to re-point refs and delete duplicates
  let needsUpdate = false;
  const updateCols = {};
  for (const k of Object.keys(merged)) {
    // Normalize undefined -> null
    const existing = keptRow[k] === undefined ? null : keptRow[k];
    const candidate = merged[k] === undefined ? null : merged[k];
    if ((existing === null && candidate !== null) || (existing !== null && String(existing) !== String(candidate))) {
      needsUpdate = true;
      updateCols[k] = candidate;
    }
  }

  return { keptId, removedIds, needsUpdate, updateCols, merged };
}

async function applyGroupChanges(client, groupResult) {
  const { keptId, removedIds, needsUpdate, updateCols, merged } = groupResult;
  if (needsUpdate) {
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const [k, v] of Object.entries(updateCols)) {
      sets.push(`${k} = $${idx}`);
      vals.push(v);
      idx++;
    }
    if (sets.length > 0) {
      vals.push(keptId);
      await client.query(`UPDATE guests SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    }
  }

  for (const rid of groupResult.removedIds) {
    await updateReferences(client, rid, keptId);
  }

  if (groupResult.removedIds.length > 0) {
    await client.query('DELETE FROM guests WHERE id = ANY($1::int[])', [groupResult.removedIds]);
  }

  // Insert audit log
  await insertAudit(client, null, 'merge_guests', 'guests', keptId, { merged, removedIds });
}

async function main() {
  const args = process.argv.slice(2);
  const applyChanges = args.includes('--yes') || args.includes('-y');

  if (!process.env.DATABASE_URL) {
    console.error('Please set DATABASE_URL');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const groups = await findDuplicateGroups(client);
    console.log(`Found ${groups.length} duplicate groups`);
    for (const g of groups) {
      console.log(`\nProcessing event ${g.event_id} email ${g.email_lc} ids=${g.ids}`);
      const groupResult = await processGroup(client, g, applyChanges);
      if (!groupResult) continue;

      console.log('Kept:', groupResult.keptId);
      console.log('Will remove:', groupResult.removedIds);
      console.log('Needs update:', groupResult.needsUpdate);
      if (groupResult.needsUpdate) console.log('Update cols:', groupResult.updateCols);

      if (applyChanges) {
        try {
          await client.query('BEGIN');
          await applyGroupChanges(client, groupResult);
          await client.query('COMMIT');
          console.log('Applied changes for group');
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('Failed to apply changes for group:', err.message || err);
        }
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
