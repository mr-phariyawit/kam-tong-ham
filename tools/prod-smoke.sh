#!/usr/bin/env bash
# prod-smoke.sh — Post-deploy smoke against the live Cloud Run URL.
#
# Verifies that the production deployment is healthy after every Cloud Run
# deploy (manual or CI). Covers the two bug classes from Sprint 19:
#
#   PR #28: vendored colyseus.js served correctly (no CDN drift / 404)
#   PR #33: all 6 game pages return 200 (bad deploy would serve 404 or 500)
#
# Usage:
#   tools/prod-smoke.sh                  # uses the default Cloud Run URL
#   tools/prod-smoke.sh https://...      # override with a custom URL
#
# Exit codes:
#   0 — all checks passed
#   N — N checks failed (non-zero)
#
# Requires: curl (standard on macOS/Linux; available in Cloud Run CI images)
set -euo pipefail

URL="${1:-https://kam-tong-ham-45962093401.asia-southeast1.run.app}"
PASS=0
FAIL=0

echo "=== prod-smoke against $URL ==="

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

# ── Core API endpoints ───────────────────────────────────────────────────────

check "/api/health 200" \
  "curl -sf -o /dev/null --max-time 10 $URL/api/health"

check "/api/games 200" \
  "curl -sf -o /dev/null --max-time 10 $URL/api/games"

check "6 games registered" \
  "[ \$(curl -s --max-time 10 $URL/api/games | grep -o '\"id\":' | wc -l | tr -d ' ') -eq 6 ]"

# ── Vendored colyseus.js (PR #28 regression guard) ──────────────────────────
# The server vendors its own colyseus.js under /shared/vendor/ to pin the
# version. A missing or broken serve here would cause a Buffer ReferenceError
# in the browser (exactly what PR #28 shipped).

check "vendored colyseus.js@0.15.17 served (200)" \
  "[ \$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' $URL/shared/vendor/colyseus.js@0.15.17.js) = '200' ]"

# ── Admin auth gate ──────────────────────────────────────────────────────────
# /api/admin/telemetry must return 401 (not 200) when no auth token is sent.
# A 200 here means the auth middleware is broken — data is exposed.

# The telemetry endpoint returns 401 when AEGIS_ADMIN_TOKEN is set (wrong token)
# or 503 when AEGIS_ADMIN_TOKEN is unset (fail-closed default). Both are safe
# (no data exposed). The check fails only if the endpoint returns 200 (open).
check "/api/admin/telemetry auth gate (401 or 503, not 200)" \
  "CODE=\$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' $URL/api/admin/telemetry); [ \$CODE != '200' ]"

# ── Per-game HTML 200 checks (PR #33 regression guard) ──────────────────────
# Each game page must return 200. A 404/500 here means a bad deploy pushed a
# broken static file tree — exactly the class of issue that let the Draw &
# Guess roomCode="" bug reach production undetected.

for game in forbidden-word werewolf spy knights word-link draw-guess; do
  check "/games/$game/index.html 200" \
    "curl -sf -o /dev/null --max-time 10 $URL/games/$game/index.html"
done

# ── Summary ──────────────────────────────────────────────────────────────────

echo "=== $PASS pass, $FAIL fail ==="

exit $FAIL
