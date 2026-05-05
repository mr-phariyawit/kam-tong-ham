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

set -euo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
source "${HOOK_DIR}/lib/quality-check.sh"
quality_check

# Don't loop (stop_hook_active prevents infinite recursion)
if [[ "$STOP_HOOK_ACTIVE" == "True" ]]; then
    exit 0
fi

# Extract transcript path for scan modules
TRANSCRIPT_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transcript_path', ''))" 2>/dev/null || echo "")

if [[ -n "$TRANSCRIPT_PATH" && -f "$TRANSCRIPT_PATH" ]]; then
    # --- Module 2: MBP violation scan ---
    source "${HOOK_DIR}/lib/mbp-scan.sh"
    if ! mbp_scan "$TRANSCRIPT_PATH" "$LOG"; then
        # MBP block emitted -- exit immediately so the block JSON is clean
        exit 0
    fi

    # --- Module 3: False-ready guard ---
    source "${HOOK_DIR}/lib/false-ready.sh"
    false_ready_check "$TRANSCRIPT_PATH" "$LOG"
fi

# --- Module 4: Session-end banners ---
source "${HOOK_DIR}/lib/queue-banner.sh"
show_instinct_reinforce
show_human_queue
show_progress
show_team_chat
show_retro_reminder

exit 0
