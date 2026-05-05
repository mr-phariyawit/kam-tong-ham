#!/usr/bin/env bash
# aegis-team-chat.sh — append an inter-agent dialogue event to the team chat log.
#
# Purpose: make the team's internal conversation VISIBLE during processing.
# Before this tool, agent-to-agent handoffs were invisible — only the final
# result reached the human. Now every dispatch / response / verdict is logged
# to a dated chat file, surfaced via /aegis-status and on-stop banner.
#
# Usage:
#   tools/aegis-team-chat.sh \
#     --from <agent>            # e.g. nick-fury, iron-man, loki, spider-man, black-panther
#     --to <agent-or-channel>   # e.g. iron-man, or "team" for broadcast
#     --type <event-type>       # see EVENT_TYPES below
#     --task <task-id>          # e.g. S2-03, DIST-01 (optional)
#     --msg "<one-line-summary>"
#     [--detail "<longer optional detail>"]
#
# Event types (standard vocabulary):
#   DISPATCH       — X tells Y to do Z ("iron-man: please spec S2-03")
#   REPORT         — Y tells X "I did Z"
#   VERDICT        — Loki/Black Panther issues gate result (APPROVE/CONDITIONAL/REJECT/PASS/FAIL)
#   QUESTION       — agent asks another (should route through Nick Fury per MBP)
#   ANSWER         — response to a QUESTION
#   STATUS         — heartbeat-like "still working"
#   HANDOFF        — Y done, passing to Z
#   BLOCKED        — Y stuck, needs help
#   NOTE           — sidebar comment (no action expected)
#
# Storage: `.aegis/brain/conversations/<YYYY-MM-DD>/chat.log` (append-only JSONL).
# One file per day. Rotates at UTC midnight naturally.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

FROM=""
TO=""
TYPE=""
TASK=""
MSG=""
DETAIL=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --from)   FROM="$2";   shift 2 ;;
        --to)     TO="$2";     shift 2 ;;
        --type)   TYPE="$2";   shift 2 ;;
        --task)   TASK="$2";   shift 2 ;;
        --msg)    MSG="$2";    shift 2 ;;
        --detail) DETAIL="$2"; shift 2 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

for REQ in "$FROM:from" "$TO:to" "$TYPE:type" "$MSG:msg"; do
    VAL="${REQ%%:*}"; NAME="${REQ##*:}"
    [[ -z "$VAL" ]] && { echo "ERROR: --$NAME required" >&2; exit 1; }
done

case "$TYPE" in
    DISPATCH|REPORT|VERDICT|QUESTION|ANSWER|STATUS|HANDOFF|BLOCKED|NOTE) ;;
    *)
        echo "ERROR: --type must be one of:" >&2
        echo "  DISPATCH|REPORT|VERDICT|QUESTION|ANSWER|STATUS|HANDOFF|BLOCKED|NOTE" >&2
        exit 1 ;;
esac

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATE=$(date -u +"%Y-%m-%d")
CHAT_DIR="$REPO_ROOT/.aegis/brain/conversations/$DATE"
CHAT_FILE="$CHAT_DIR/chat.log"
mkdir -p "$CHAT_DIR"

# JSONL entry (matches same shape as decision-audit.log style for consistency)
python3 - <<PYEOF >> "$CHAT_FILE"
import json
entry = {
    "ts": "$TS",
    "from": "$FROM",
    "to": "$TO",
    "type": "$TYPE",
    "msg": """$MSG""",
}
if """$TASK""":
    entry["task"] = """$TASK"""
if """$DETAIL""":
    entry["detail"] = """$DETAIL"""
print(json.dumps(entry, ensure_ascii=False))
PYEOF

# Pretty-print the new line to stdout (so main agent can show it immediately)
case "$TYPE" in
    DISPATCH) ICON="📤" ;;
    REPORT)   ICON="📥" ;;
    VERDICT)  ICON="⚖️ " ;;
    QUESTION) ICON="❓" ;;
    ANSWER)   ICON="💡" ;;
    STATUS)   ICON="💓" ;;
    HANDOFF)  ICON="🔁" ;;
    BLOCKED)  ICON="🛑" ;;
    NOTE)     ICON="📝" ;;
    *)        ICON="•"  ;;
esac

TIME_SHORT=$(echo "$TS" | cut -c12-19)
TASK_TAG=""
[[ -n "$TASK" ]] && TASK_TAG="[$TASK] "

echo "$ICON $TIME_SHORT $FROM → $TO  ${TASK_TAG}${TYPE}: ${MSG}"
