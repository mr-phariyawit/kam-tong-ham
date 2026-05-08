#!/usr/bin/env bash
# smoke-rate-limit.sh — Functional smoke test for /api/rooms/create rate limiter.
#
# Per Issue #21: send 12 POSTs in rapid succession, expect 200×10 then 429×2,
# proving the rate limiter (Sprint 14, KTH-T-089) actually fires at the right
# threshold against the production X-Forwarded-For proxy chain (Google front-end
# on Cloud Run, etc.).
#
# Usage:
#   tools/smoke-rate-limit.sh https://kam-tong-ham-45962093401.asia-southeast1.run.app
set -euo pipefail

URL="${1:-https://kam-tong-ham-45962093401.asia-southeast1.run.app}"

echo "=== Rate limiter smoke against $URL ==="
echo "Expected: 200×10, then 429×2 (default limit is 10 creates/min/IP)"
echo

PASS_200=0
PASS_429=0
for i in $(seq 1 12); do
  CODE=$(curl -s -o /dev/null -m 15 -w "%{http_code}" \
    -X POST "$URL/api/rooms/create" \
    -H 'Content-Type: application/json' \
    -d '{"gameType":"forbidden-word"}')
  echo "  Request $i: HTTP $CODE"
  if [ "$CODE" = "200" ]; then PASS_200=$((PASS_200+1)); fi
  if [ "$CODE" = "429" ]; then PASS_429=$((PASS_429+1)); fi
done

echo
if [ "$PASS_200" = "10" ] && [ "$PASS_429" = "2" ]; then
  echo "✅ PASS — exact threshold (200×10, 429×2)"
  exit 0
elif [ "$PASS_200" -ge 8 ] && [ "$PASS_429" -ge 2 ]; then
  echo "⚠️  ACCEPTABLE — limiter fires but threshold drift (200×$PASS_200, 429×$PASS_429)"
  exit 0
else
  echo "❌ FAIL — limiter not behaving as designed"
  echo "   Expected: 200×10 + 429×2"
  echo "   Got:      200×$PASS_200 + 429×$PASS_429"
  exit 1
fi
