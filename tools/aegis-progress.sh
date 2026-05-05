#!/usr/bin/env bash
# aegis-progress.sh — compute grand-total progress % across all known work.
#
# Reads .aegis/brain/sprints/roadmap.md to get the denominator breakdown,
# then scans closed sprint close.md files + current kanban to compute
# delivered points. Outputs both a JSON blob (for machine use) and a
# human-readable dashboard.
#
# Usage:
#   tools/aegis-progress.sh           # dashboard
#   tools/aegis-progress.sh --json    # JSON only
#   tools/aegis-progress.sh --bar     # just the progress bar line
#
# Output schema (JSON):
#   {
#     "updated_at": "<ISO8601>",
#     "denominator": <total pt planned/known>,
#     "numerator":   <pt delivered>,
#     "remaining":   <pt outstanding>,
#     "percent":     <0.0-100.0>,
#     "breakdown":   { "<sprint>": { "selected": N, "done": N, "status": "..." } },
#     "current_sprint": "<id or empty>",
#     "human_queue_pending": <N>
#   }

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROADMAP="$REPO_ROOT/.aegis/brain/sprints/roadmap.md"
SPRINTS_DIR="$REPO_ROOT/.aegis/brain/sprints"
CURRENT_SYMLINK="$SPRINTS_DIR/current"
HUMAN_QUEUE="$REPO_ROOT/.aegis/brain/human-queue.md"

MODE="dashboard"
for arg in "$@"; do
    case "$arg" in
        --json) MODE="json" ;;
        --bar)  MODE="bar" ;;
    esac
done

[[ ! -f "$ROADMAP" ]] && { echo "ERROR: roadmap missing: $ROADMAP" >&2; exit 1; }

# Parse the tally table from roadmap.md
# Expected format: rows like "| sprint-X | <selected> | <done> | <stretch-done> | <status> |"
TALLY_JSON=$(python3 - "$ROADMAP" <<'PYEOF'
import sys, re, json

with open(sys.argv[1]) as f:
    content = f.read()

# Extract the Tally table
m = re.search(r'## Tally.*?\n\n(\|.*?\|.*?\n)+?\n', content, re.DOTALL)
if not m:
    print(json.dumps({"error": "tally table not found"}))
    sys.exit(0)

rows = re.findall(r'^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|', m.group(0), re.MULTILINE)

breakdown = {}
total_denom = 0
total_num = 0
for row in rows:
    name = row[0].strip()
    if name.startswith('---') or name.lower() == 'sprint':
        continue  # header/separator
    # Strip markdown bolding
    name_clean = re.sub(r'\*+', '', name).strip()
    try:
        selected = int(row[1].strip())
        done = int(row[2].strip())
    except ValueError:
        continue
    status = row[4].strip()
    breakdown[name_clean] = {"selected": selected, "done": done, "status": status}
    total_denom += selected
    total_num += done

print(json.dumps({
    "breakdown": breakdown,
    "denominator": total_denom,
    "numerator": total_num,
}))
PYEOF
)

DENOM=$(echo "$TALLY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('denominator', 0))")
NUM=$(echo "$TALLY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('numerator', 0))")
REMAINING=$((DENOM - NUM))
if [[ "$DENOM" -gt 0 ]]; then
    PCT=$(python3 -c "print(f'{$NUM / $DENOM * 100:.1f}')")
else
    PCT="0.0"
fi

# Current sprint from symlink
CURRENT_SPRINT=""
if [[ -L "$CURRENT_SYMLINK" ]]; then
    CURRENT_SPRINT=$(readlink "$CURRENT_SYMLINK")
fi

# Human queue pending count
PENDING=0
if [[ -f "$HUMAN_QUEUE" ]]; then
    PENDING=$(python3 -c "
import re
try:
    with open('$HUMAN_QUEUE') as f: c = f.read()
    m = re.search(r'<!-- PENDING_START -->(.*?)<!-- PENDING_END -->', c, re.DOTALL)
    print(len(re.findall(r'^### \[', m.group(1), re.MULTILINE)) if m else 0)
except Exception: print(0)
")
fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build final JSON
FINAL_JSON=$(python3 <<PYEOF
import json
tally = $TALLY_JSON
result = {
    "updated_at": "$TS",
    "denominator": $DENOM,
    "numerator": $NUM,
    "remaining": $REMAINING,
    "percent": float("$PCT"),
    "breakdown": tally.get("breakdown", {}),
    "current_sprint": "$CURRENT_SPRINT",
    "human_queue_pending": $PENDING,
}
print(json.dumps(result, indent=2))
PYEOF
)

# Progress bar (unicode blocks)
bar_chars=20
filled=$(python3 -c "print(min($bar_chars, int($PCT / 100 * $bar_chars)))")
empty=$((bar_chars - filled))
BAR=$(printf '█%.0s' $(seq 1 $filled))$(printf '░%.0s' $(seq 1 $empty))

case "$MODE" in
    json)
        echo "$FINAL_JSON"
        ;;
    bar)
        echo "Progress: [${BAR}] ${PCT}%  (${NUM}/${DENOM}pt · ${REMAINING}pt remaining)"
        ;;
    dashboard|*)
        echo ""
        echo "┌─ AEGIS Grand Total Progress / ความคืบหน้ารวม ───────────────────┐"
        printf "│  [%s]  %5s%%                    │\n" "$BAR" "$PCT"
        printf "│  Done: %3dpt   Remaining: %3dpt   Total scope: %3dpt         │\n" "$NUM" "$REMAINING" "$DENOM"
        echo "├─────────────────────────────────────────────────────────────────┤"
        echo "$TALLY_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for name, b in data.get('breakdown', {}).items():
    n = name[:28]
    print(f'│  {n:<28}  {b[\"done\"]:>3}/{b[\"selected\"]:<3}pt   {b[\"status\"]:<14}│')
"
        echo "├─────────────────────────────────────────────────────────────────┤"
        printf "│  Current sprint: %-30s                │\n" "$CURRENT_SPRINT"
        printf "│  Human queue:    %d pending                                    │\n" "$PENDING"
        echo "│  Source:         .aegis/brain/sprints/roadmap.md                │"
        echo "└─────────────────────────────────────────────────────────────────┘"
        ;;
esac
