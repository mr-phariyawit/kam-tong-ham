#!/usr/bin/env bash
# AEGIS Hook — linear-sync-on-kanban.sh
# Fires aegis-linear-sync.sh push <sprint> async whenever Captain America
# writes to a sprint kanban.md. Non-blocking — never delays the agent's turn.
#
# Activation conditions (ALL must be true):
#   1. Tool is Edit / Write / MultiEdit
#   2. file_path matches .aegis/brain/sprints/sprint-*/kanban.md
#   3. .aegis/config/linear.json exists (Linear configured for this repo)
#   4. project.throwaway is NOT true
#
# Failure modes:
#   - Any non-match → silent exit 0 (do not pollute hook output)
#   - Sync command failure → logged to .aegis/brain/logs/linear-hook.log, never propagated
#
# Spec ref: roadmap Phase 2 (Hook-driven auto-sync); user instruction 2026-05-11

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo '{}')

# Parse tool name + file path
TOOL=$(printf '%s' "$INPUT" | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('tool_name',''))
except: pass" 2>/dev/null || true)
FILE=$(printf '%s' "$INPUT" | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))
except: pass" 2>/dev/null || true)

# Match only write-family tools
case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

[[ -z "$FILE" ]] && exit 0

# Match only kanban.md inside a sprint dir
case "$FILE" in
  */.aegis/brain/sprints/sprint-*/kanban.md) ;;
  *) exit 0 ;;
esac

# Find repo root by walking up from the file path
REPO_ROOT="${FILE%/.aegis/brain/sprints/*}"
CONFIG="${REPO_ROOT}/.aegis/config/linear.json"
SYNC="${REPO_ROOT}/tools/aegis-linear-sync.sh"
LOG_DIR="${REPO_ROOT}/.aegis/brain/logs"
LOG="${LOG_DIR}/linear-hook.log"

# Config + sync tool present?
[[ -f "$CONFIG" ]] || exit 0
[[ -x "$SYNC" || -f "$SYNC" ]] || exit 0

# Skip throwaway repos
if command -v jq >/dev/null 2>&1; then
  throwaway=$(jq -r '.project.throwaway // false' "$CONFIG" 2>/dev/null)
  [[ "$throwaway" == "true" ]] && exit 0
fi

# Extract sprint_id from path
SPRINT_DIR="${FILE%/kanban.md}"
SPRINT_ID="${SPRINT_DIR##*/}"
[[ "$SPRINT_ID" =~ ^sprint- ]] || exit 0

mkdir -p "$LOG_DIR" 2>/dev/null || true
TS="$(date +'%Y-%m-%d %H:%M:%S')"
echo "[$TS] HOOK_FIRE sprint=$SPRINT_ID file=$FILE" >> "$LOG" 2>/dev/null

# v15-08: CC 2.1.141 desktop attention ping when async sync starts.
# The sync itself runs background (fire-and-forget); the notification fires
# synchronously here so the human sees feedback even though stdout is silent.
NOTIFY_LIB="${REPO_ROOT}/tools/aegis-notify.sh"
if [[ -f "$NOTIFY_LIB" ]]; then
    # shellcheck disable=SC1090
    source "$NOTIFY_LIB" 2>/dev/null && aegis_notify "linear_sync_start" "Linear sync started: $SPRINT_ID" || true
fi

# Async fire-and-forget. Output goes to log, not stdout (no agent noise).
( bash "$SYNC" push "$SPRINT_ID" >> "$LOG" 2>&1 ; echo "[$TS] HOOK_DONE sprint=$SPRINT_ID exit=$?" >> "$LOG" ) &
disown 2>/dev/null || true

exit 0
