#!/usr/bin/env bash
# gate-check.sh — measure the v11 Phase-2 gate (Mega Plan §14 D6).
#
# Phase-2 (v11-05..08, 32pt) opens iff ≥2 of these signals materialize
# during the pilot week:
#   1. Prevented-incident value — actionable err/warn/block events surfaced
#   2. Audit-query value        — manual queries against activity / brain
#   3. Run-replay value         — subjective; you tell us via friction log
#
# Usage:
#   bash tools/aegis-plus-pilot/gate-check.sh <pilot-project-path>
#
# Exit codes:
#   0 — gate OPEN  (≥2 signals)
#   1 — gate HOLD  (<2 signals)
#   2 — script error / pilot project invalid

set -uo pipefail

PILOT="${1:-$PWD}"
PILOT="$(SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_TOOLS="$(cd "$SCRIPT_DIR/.." && pwd)"
# Use META's copy of view.mjs (same as the pilot's, by construction); read
# from PILOT's data via CLAUDE_PROJECT_DIR. This is robust to a pilot that
# was bootstrapped against an older meta — tooling drift is bounded.
export CLAUDE_PROJECT_DIR="$PILOT"
cd "$PILOT" && pwd)" || { echo "no such dir: $1" >&2; exit 2; }
[[ -d "$PILOT/.aegis" ]] || { echo "$PILOT is not an AEGIS project" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_TOOLS="$(cd "$SCRIPT_DIR/.." && pwd)"
# Use META's copy of view.mjs (same as the pilot's, by construction); read
# from PILOT's data via CLAUDE_PROJECT_DIR. This is robust to a pilot that
# was bootstrapped against an older meta — tooling drift is bounded.
export CLAUDE_PROJECT_DIR="$PILOT"
cd "$PILOT"

red='\033[0;31m'; green='\033[0;32m'; yellow='\033[1;33m'; cyan='\033[0;36m'; bold='\033[1m'; nc='\033[0m'
hr() { printf '%.0s═' {1..60}; echo ""; }

echo ""; hr
echo -e "${bold}${cyan}AEGIS-Plus Phase-2 Gate Check — $(basename "$PILOT") — $(date -u +%Y-%m-%d)${nc}"
hr

signal_count=0
notes=()

# ── Signal 1: Prevented-incident value ─────────────────────────────────
echo -e "\n${bold}Signal 1 — Prevented-incident value${nc}"
VIEW="$META_TOOLS/aegis-activity-logger/view.mjs"
count_lines() {
  # Run view.mjs, count stdout lines, force a single integer even on error.
  local n
  n=$(node "$VIEW" "$@" 2>/dev/null | wc -l | tr -d ' ' 2>/dev/null) || true
  printf '%s' "${n:-0}"
}
ERR_COUNT=$(count_lines --since 7d --status err)
WARN_COUNT=$(count_lines --since 7d --status warn)
BLOCK_COUNT=$(count_lines --since 7d --status block)
NEAR_MISS_TOTAL=$((${ERR_COUNT:-0} + ${WARN_COUNT:-0} + ${BLOCK_COUNT:-0}))
echo "  err events:   $ERR_COUNT"
echo "  warn events:  $WARN_COUNT"
echo "  block events: $BLOCK_COUNT"
echo "  ── total near-misses: $NEAR_MISS_TOTAL"
if [[ $NEAR_MISS_TOTAL -ge 1 ]]; then
    echo -e "  ${green}✓ signal 1 candidates exist — confirm in friction log they were actionable${nc}"
    notes+=("Signal 1: $NEAR_MISS_TOTAL near-miss events surfaced — confirm actionability in feedback log")
    signal_count=$((signal_count+1))
else
    echo -e "  ${yellow}✗ no near-miss events seen this week${nc}"
fi

# ── Signal 2: Audit-query value ─────────────────────────────────────────
echo -e "\n${bold}Signal 2 — Audit-query value${nc}"
# Count Bash calls that invoked the audit / search tools.
QUERY_COUNT=$(node "$VIEW" --since 7d --tool Bash --json 2>/dev/null \
              | grep -cE 'aegis-activity-logger|aegis-brain-search|issue\.mjs list|issue\.mjs show' \
              2>/dev/null || true)
QUERY_COUNT=${QUERY_COUNT:-0}
echo "  audit/search/list invocations in last 7d: $QUERY_COUNT"
if [[ $QUERY_COUNT -ge 3 ]]; then
    echo -e "  ${green}✓ signal 2 met — ≥3 audit queries${nc}"
    notes+=("Signal 2: $QUERY_COUNT audit queries this week (threshold ≥3)")
    signal_count=$((signal_count+1))
else
    echo -e "  ${yellow}✗ only $QUERY_COUNT audit queries this week (need ≥3)${nc}"
fi

# ── Signal 3: Run-replay value (subjective, from friction log) ──────────
echo -e "\n${bold}Signal 3 — Run-replay value (friction log)${nc}"
FB="$PILOT/.aegis/brain/memory/aegis-plus-feedback.md"
if [[ -f "$FB" ]]; then
    # `grep -c` prints "0" on no-match AND exits 1. The historical `|| echo 0`
    # pattern double-prints "0\n0" — same bug class as PR #91 fix. Use
    # `|| true` to absorb the exit and ${VAR:-0} as a defensive default.
    REPLAY_HITS=$(grep -ciE 'replay|reconstruct|looked? back|gone back' "$FB" 2>/dev/null || true)
    SIGNAL_HITS=$(grep -ciE 'run.?replay|signal[- ]?3' "$FB" 2>/dev/null || true)
    REPLAY_HITS=${REPLAY_HITS:-0}
    SIGNAL_HITS=${SIGNAL_HITS:-0}
    TOTAL=$((REPLAY_HITS + SIGNAL_HITS))
    echo "  feedback log mentions replay/reconstruction: $TOTAL"
    if [[ $TOTAL -ge 1 ]]; then
        echo -e "  ${green}✓ signal 3 met (per friction log)${nc}"
        notes+=("Signal 3: $TOTAL replay/reconstruction mentions in feedback log")
        signal_count=$((signal_count+1))
    else
        echo -e "  ${yellow}✗ no replay/reconstruction mentions in friction log${nc}"
    fi
else
    echo -e "  ${yellow}✗ no friction log at $FB${nc}"
fi

# ── Verdict ─────────────────────────────────────────────────────────────
echo ""
hr
echo -e "${bold}Verdict:${nc} $signal_count of 3 signals met"
# Guard the array expansion: under `set -u` on bash 3.2 (macOS default),
# "${notes[@]}" on an empty array errors with "unbound variable". Same
# class as the EXTRA_ARGS guard added in PR #92 for aegis-upgrade.sh.
if [[ ${#notes[@]} -gt 0 ]]; then
    for n in "${notes[@]}"; do echo "  · $n"; done
fi
hr

if [[ $signal_count -ge 2 ]]; then
    echo -e "${bold}${green}GATE OPEN${nc} — proceed to v11 Phase-2 (v11-05..08, 32pt)"
    echo "Tell the meta agent: \"go phase 2\""
    exit 0
else
    echo -e "${bold}${yellow}GATE HOLD${nc} — stay on Phase-1 ($((2 - signal_count)) more signal$([[ $signal_count -eq 1 ]] || echo s) needed)"
    echo "Either run the pilot another week, or de-scope Phase-2 entirely per Mega Plan §2 principle 10."
    exit 1
fi
