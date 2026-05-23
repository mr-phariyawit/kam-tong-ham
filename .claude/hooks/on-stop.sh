#!/usr/bin/env bash
# AEGIS Hook -- on-stop.sh (orchestrator)
# Fires when Claude is about to stop the session (Stop event).
# Chains 4 modules from lib/: quality-check, mbp-scan, false-ready, queue-banner.
#
# Decomposed in v10-05 from 376-line monolith into single-responsibility modules.
# Each module is independently callable for testing.
#
# Input:  JSON on stdin { "session_id": "...", "stop_hook_active": false, ... }
# Output: stdout message displayed to user (exit 0 = allow stop)

set -uo pipefail
# NOTE: -e dropped at orchestrator level so a missing-module warning never
# kills the Stop event mid-shutdown. Individual modules can still fail-fast
# internally. Resilience > strictness here.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Safe-source helper ──────────────────────────────────────────────────────
# Wraps `source` so a missing lib/*.sh degrades the hook instead of crashing
# the whole Stop event. Defines a no-op stub for each entry function callers
# expect, so the orchestrator continues past a missing module.
#
# Bug class fixed (2026-05-13 — found in Auto-Affi):
# Downstream projects that received `on-stop.sh` via upgrade but didn't get
# `.claude/hooks/lib/` would crash with
#   "lib/quality-check.sh: No such file or directory"
# every session. Now they emit a single WARN line per missing module and
# exit cleanly. Run `tools/aegis-doctor.sh` to detect + repair.
safe_source() {
    local path="$1"; shift
    local entry_fns=("$@")

    if [[ -f "$path" ]]; then
        # shellcheck disable=SC1090
        source "$path"
        return 0
    fi

    printf '[hook:on-stop] WARN — missing module %s (skipping; run tools/aegis-doctor.sh to repair)\n' \
        "$(basename "$path")" >&2

    # Stub out the entry functions so callers in the orchestrator don't
    # explode when they invoke an undefined function.
    local fn
    for fn in "${entry_fns[@]}"; do
        eval "${fn}() { return 0; }"
    done
    return 0
}

INPUT=$(cat)
export STOP_HOOK_ACTIVE
STOP_HOOK_ACTIVE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('stop_hook_active', False))" 2>/dev/null || echo "False")

# Log session end
LOG=".aegis/brain/logs/activity.log"
if [[ -f "$LOG" ]]; then
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
    echo "[${TIMESTAMP}] [HOOK:on-stop] SESSION_END -- Claude stopping" >> "$LOG" 2>/dev/null || true
fi

# --- Module 1: Batched quality check ---
safe_source "${HOOK_DIR}/lib/quality-check.sh" quality_check
quality_check

# Don't loop (stop_hook_active prevents infinite recursion)
if [[ "$STOP_HOOK_ACTIVE" == "True" ]]; then
    exit 0
fi

# Extract transcript path for scan modules
TRANSCRIPT_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transcript_path', ''))" 2>/dev/null || echo "")

if [[ -n "$TRANSCRIPT_PATH" && -f "$TRANSCRIPT_PATH" ]]; then
    # --- Module 2: MBP violation scan ---
    safe_source "${HOOK_DIR}/lib/mbp-scan.sh" mbp_scan
    if ! mbp_scan "$TRANSCRIPT_PATH" "$LOG"; then
        # MBP block emitted -- exit immediately so the block JSON is clean
        exit 0
    fi

    # --- Module 3: False-ready guard ---
    safe_source "${HOOK_DIR}/lib/false-ready.sh" false_ready_check
    false_ready_check "$TRANSCRIPT_PATH" "$LOG"
fi

# --- Module 4: Session-end banners ---
safe_source "${HOOK_DIR}/lib/queue-banner.sh" \
    show_instinct_reinforce show_human_queue show_progress \
    show_team_chat show_retro_reminder
show_instinct_reinforce
show_human_queue
show_progress
show_team_chat
show_retro_reminder

# v15-08: CC 2.1.141 desktop attention ping at session end.
# Opt-in via AEGIS_HOOK_NOTIFY=1 — when off, only BEL fires to stderr.
# Sourced + invoked here so notification appears AFTER all banners.
REPO_ROOT="$(cd "${HOOK_DIR}/../.." && pwd)"
NOTIFY_LIB="${REPO_ROOT}/tools/aegis-notify.sh"
if [[ -f "$NOTIFY_LIB" ]]; then
    # shellcheck disable=SC1090
    source "$NOTIFY_LIB" 2>/dev/null && aegis_notify "session_end" "AEGIS session ended" || true
fi

exit 0
