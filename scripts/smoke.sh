#!/usr/bin/env bash
set -euo pipefail

# One-command smoke test for agent -> client -> ground-team flows
# Usage: PORT=5001 bash scripts/smoke.sh

PORT=${PORT:-5001}
BASE="http://localhost:${PORT}"
TS=$(date +%s)
AGENT_EMAIL="smoke-agent-${TS}@example.com"
CLIENT_EMAIL="smoke-client-${TS}@example.com"
STAFF_EMAIL="smoke-staff-${TS}@example.com"
AGENT_COOKIE="/tmp/v_agent_${TS}.cookies"
CLIENT_COOKIE="/tmp/v_client_${TS}.cookies"
STAFF_COOKIE="/tmp/v_staff_${TS}.cookies"

cleanup(){
  rm -f "$AGENT_COOKIE" "$CLIENT_COOKIE" "$STAFF_COOKIE"
}
trap cleanup EXIT

echo "Starting smoke tests against $BASE"

echo "1) Agent signup..."
AGENT_RESP=$(curl -s -c "$AGENT_COOKIE" -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d "{\"firstName\":\"Smoke\",\"lastName\":\"Agent\",\"email\":\"$AGENT_EMAIL\",\"password\":\"password123\",\"role\":\"agent\"}")
echo "agent resp: $AGENT_RESP"

echo "2) Agent create event..."
EVENT_DATE=$(date -u +%Y-%m-%d)
EVENT_RESP=$(curl -s -b "$AGENT_COOKIE" -X POST "$BASE/api/events" -H "Content-Type: application/json" -d "{\"name\":\"Smoke Event\",\"slug\":\"smoke-event-${TS}\",\"date\":\"$EVENT_DATE\",\"location\":\"Test Venue\",\"clientName\":\"Smoke Client Co\"}")
echo "event resp: $EVENT_RESP"
EVENT_ID=$(echo "$EVENT_RESP" | sed -n 's/.*"id":[[:space:]]*\([0-9]*\).*/\1/p')
EVENT_CODE=$(echo "$EVENT_RESP" | sed -n 's/.*"eventCode":"\([^"]*\)".*/\1/p')
if [ -z "$EVENT_ID" ] || [ -z "$EVENT_CODE" ]; then
  echo "FAIL: could not create event. response: $EVENT_RESP" >&2
  exit 1
fi
echo "Created event id=$EVENT_ID code=$EVENT_CODE"

echo "3) Client signup..."
CLIENT_RESP=$(curl -s -c "$CLIENT_COOKIE" -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d "{\"firstName\":\"Smoke\",\"lastName\":\"Client\",\"email\":\"$CLIENT_EMAIL\",\"password\":\"password123\",\"role\":\"client\"}")
echo "client resp: $CLIENT_RESP"

echo "4) Client join event via code..."
JOIN_RESP=$(curl -s -b "$CLIENT_COOKIE" -X POST "$BASE/api/user/event-code" -H "Content-Type: application/json" -d "{\"eventCode\":\"$EVENT_CODE\"}")
echo "join resp: $JOIN_RESP"
echo "$JOIN_RESP" | grep -q '"success":true' || { echo "FAIL: client join failed" >&2; exit 1; }

echo "5) Agent create ground-team staff..."
G=$(curl -s -b "$AGENT_COOKIE" -X POST "$BASE/api/groundteam/create-account" -H "Content-Type: application/json" -d "{\"firstName\":\"Smoke\",\"lastName\":\"Staff\",\"email\":\"$STAFF_EMAIL\",\"password\":\"password123\",\"eventCode\":\"$EVENT_CODE\"}")
echo "groundteam create resp: $G"

echo "6) Staff signin..."
S=$(curl -s -c "$STAFF_COOKIE" -X POST "$BASE/api/auth/signin" -H "Content-Type: application/json" -d "{\"email\":\"$STAFF_EMAIL\",\"password\":\"password123\",\"role\":\"groundTeam\"}")
echo "staff signin resp: $S"
echo "$S" | grep -q '"role":"groundTeam"' || { echo "FAIL: staff signin failed" >&2; exit 1; }

echo "7) Verify staff assigned event..."
M=$(curl -s -b "$STAFF_COOKIE" "$BASE/api/groundteam/my-event")
echo "my-event resp: $M"
echo "$M" | grep -q "\"id\":$EVENT_ID" || { echo "FAIL: staff not assigned to event $EVENT_ID" >&2; exit 1; }

echo "PASS: agent create -> client join -> ground-team flows successful (event=$EVENT_ID)"

exit 0
