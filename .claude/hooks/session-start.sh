#!/usr/bin/env bash
# AEGIS Session Start Hook -- Runs on every Claude Code session start
# Sprint v9-04 deliverable: combines version check (S1-03) + brain sync (S4-01)
#
# INSTALLATION (apply between sessions):
#   cp tools/v9-session-start-hook.sh .claude/hooks/session-start.sh
#   chmod +x .claude/hooks/session-start.sh
#   # Then update .claude/settings.json SessionStart hook:
#   #   "command": "bash .claude/hooks/session-start.sh"
#
# This hook:
#   1. Runs aegis-version-check.sh (warns on version drift)
#   2. Runs aegis-brain-sync.sh --validate (validates brain structure)
#   3. Regenerates MEMORY.md (ensures fresh index for memory_20250818 cache)
#   4. Logs session start to activity.log
#
# All operations are best-effort (warn, not block). Session always starts.
# Exit 0 always.

set -euo pipefail

# --- Resolve paths ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BRAIN_DIR="${REPO_ROOT}/.aegis/brain"
LOG_FILE="${BRAIN_DIR}/logs/activity.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")

# --- Step 1: Version check ---
VERSION_CHECK="${SCRIPT_DIR}/aegis-version-check.sh"
if [[ -x "$VERSION_CHECK" ]]; then
    "$VERSION_CHECK" 2>&1 || true
fi

# --- Step 2: Brain validation + sync ---
BRAIN_SYNC="${REPO_ROOT}/tools/aegis-brain-sync.sh"
if [[ -x "$BRAIN_SYNC" ]]; then
    # Validate structure first
    VALIDATE_OUTPUT=$("$BRAIN_SYNC" --validate 2>&1) || true
    if echo "$VALIDATE_OUTPUT" | grep -q "FAILED"; then
        echo "$VALIDATE_OUTPUT" >&2
    fi

    # Regenerate MEMORY.md (always, to ensure freshness)
    "$BRAIN_SYNC" > /dev/null 2>&1 || true
fi

# --- Step 3: Log session start ---
if [[ -d "$(dirname "${LOG_FILE}")" ]]; then
    # Count brain contents for log
    PATTERN_COUNT=$(grep -c "^## P-" "${BRAIN_DIR}/resonance/evolved-patterns.md" 2>/dev/null || echo "0")
    ANTI_COUNT=$(grep -c "^## A-" "${BRAIN_DIR}/resonance/anti-patterns.md" 2>/dev/null || echo "0")
    ADR_COUNT=$(grep -c "^## ADR-" "${BRAIN_DIR}/resonance/architecture-decisions.md" 2>/dev/null || echo "0")
    PROMOTED=$(find "${BRAIN_DIR}/instincts/promoted" -name "*.yaml" 2>/dev/null | wc -l | tr -d ' ')
    SPRINT_NAME="unknown"
    if [[ -L "${BRAIN_DIR}/sprints/current" ]]; then
        SPRINT_NAME=$(readlink "${BRAIN_DIR}/sprints/current" | sed 's|.*/||')
    fi

    echo "[${TIMESTAMP}] [HOOK:session-start] Session started. Brain: ${PATTERN_COUNT}P/${ANTI_COUNT}A/${ADR_COUNT}ADR/${PROMOTED} promoted. Sprint: ${SPRINT_NAME}" >> "${LOG_FILE}" 2>/dev/null || true
fi

# --- Step 4: S6-01 distill reminder (Pattern A) ---
# Track sessions since last /aegis-distill run. At threshold, surface a
# visible reminder on stderr (session-start log) so Nick Fury / the human
# notices on first inspection. Counter resets when /aegis-distill runs its
# reset step; see .claude/commands/aegis-distill.md.
DISTILL_STATE="${BRAIN_DIR}/state/distill-state.json"
DISTILL_THRESHOLD="${AEGIS_DISTILL_THRESHOLD:-3}"
mkdir -p "$(dirname "$DISTILL_STATE")" 2>/dev/null || true

if [[ ! -f "$DISTILL_STATE" ]]; then
    echo '{"sessions_since_last_distill": 0, "last_distill_at": null, "threshold": '"$DISTILL_THRESHOLD"'}' > "$DISTILL_STATE"
fi

# Read / increment / write atomically via python3 (already a dep of guard-write)
NEW_COUNT=$(python3 - "$DISTILL_STATE" "$DISTILL_THRESHOLD" <<'PY' 2>/dev/null || echo "-1"
import json, sys
path, threshold = sys.argv[1], int(sys.argv[2])
try:
    with open(path) as f:
        s = json.load(f)
except Exception:
    s = {"sessions_since_last_distill": 0, "last_distill_at": None, "threshold": threshold}
s["sessions_since_last_distill"] = int(s.get("sessions_since_last_distill", 0)) + 1
s["threshold"] = threshold  # keep current threshold in state for visibility
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(s, f, indent=2)
import os
os.replace(tmp, path)
print(s["sessions_since_last_distill"])
PY
)

if [[ "$NEW_COUNT" -ge "$DISTILL_THRESHOLD" ]] 2>/dev/null; then
    echo "💡 AEGIS: ${NEW_COUNT} sessions since last /aegis-distill (threshold: ${DISTILL_THRESHOLD}). Consider running it to extract patterns from accumulated learnings." >&2
    if [[ -d "$(dirname "${LOG_FILE}")" ]]; then
        echo "[${TIMESTAMP}] [HOOK:session-start] distill-due count=${NEW_COUNT} threshold=${DISTILL_THRESHOLD}" >> "${LOG_FILE}" 2>/dev/null || true
    fi
fi

# ── v15-07: First-session / no-sprint detection (Sprint Plan Gate Reminder) ──
# Catches the empirical gap where /aegis-start should chain into /aegis-sprint
# plan but the executor sometimes shortcuts (creates kanban directly without
# the ISO 29110 ceremony). Banner explicitly tells Nick Fury "Read + execute
# aegis-sprint.md plan subcommand verbatim, do not shortcut".
SPRINT_DIR="${BRAIN_DIR}/sprints"
SPRINT_GATE_NEEDED=false
if [[ -d "$SPRINT_DIR" ]]; then
    SPRINT_COUNT=$(find "$SPRINT_DIR" -mindepth 1 -maxdepth 1 -type d -name 'sprint-*' 2>/dev/null | wc -l | tr -d ' ')
    if [[ "${SPRINT_COUNT:-0}" -eq 0 ]]; then
        SPRINT_GATE_NEEDED=true
    fi
fi
if [[ "$SPRINT_GATE_NEEDED" == "true" ]]; then
    cat >&2 <<'BANNER'

╭──────────────────────────────────────────────────────────────────────────╮
│ ⚠️  AEGIS sprint-plan gate                                                │
│                                                                          │
│  No sprint directory exists yet under .aegis/brain/sprints/sprint-*      │
│  AEGIS pipeline requires Sprint Planning BEFORE any task enters          │
│  IN_PROGRESS (BLOCK 0D).                                                 │
│                                                                          │
│  Nick Fury MUST:                                                         │
│    1. Read .claude/commands/aegis-sprint.md                              │
│    2. Locate ### Subcommand: Sprint Planning                             │
│    3. Execute Steps 1–9 verbatim (do NOT shortcut — anti-pattern)        │
│    4. Coulson generates ISO 29110 work products in parallel              │
│    5. Return to /aegis-start flow after Display Summary step             │
│                                                                          │
│  Anti-pattern banned: "I'll just create kanban.md inline" — that         │
│  skips 8+ audit artifacts. Always run the full ceremony.                 │
╰──────────────────────────────────────────────────────────────────────────╯
BANNER
    if [[ -d "$(dirname "${LOG_FILE}")" ]]; then
        echo "[${TIMESTAMP}] [HOOK:session-start] sprint-plan-gate-needed dir=${SPRINT_DIR}" >> "${LOG_FILE}" 2>/dev/null || true
    fi

    # v15-08: CC 2.1.141 desktop attention ping when sprint gate triggers.
    # Catches the case where Nick Fury Tab-switches away during /aegis-start
    # — the OSC-9 banner pulls focus back so the gate isn't silently missed.
    NOTIFY_LIB="${REPO_ROOT}/tools/aegis-notify.sh"
    if [[ -f "$NOTIFY_LIB" ]]; then
        # shellcheck disable=SC1090
        source "$NOTIFY_LIB" 2>/dev/null && aegis_notify "sprint_plan_gate" "Sprint plan gate — run /aegis-sprint plan" || true
    fi
fi

# v15-16: cleanup orphan aegis-live-tail/watch.mjs processes from crashed
# prior sessions (ppid=1, etime>1h). Targets the leak that accumulated 170
# zombies before this sprint. Best-effort, silent unless something killed.
LIVE_TAIL_START="${REPO_ROOT}/tools/aegis-live-tail/start.sh"
if [[ -x "$LIVE_TAIL_START" ]]; then
    bash "$LIVE_TAIL_START" cleanup-orphans 2>/dev/null || true
fi

# v15-16: rotate run-archive (gzip >7d, delete >30d). Idempotent; < 100ms
# when nothing to do. Bounds .aegis/brain/runs/ growth (was 98 MB pre-fix).
RUN_ROTATE="${REPO_ROOT}/tools/aegis-run-rotate.sh"
if [[ -x "$RUN_ROTATE" ]]; then
    bash "$RUN_ROTATE" 2>/dev/null || true
fi

exit 0
