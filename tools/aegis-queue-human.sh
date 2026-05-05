#!/usr/bin/env bash
# aegis-queue-human.sh — append an entry to the human action queue.
#
# Usage:
#   tools/aegis-queue-human.sh \
#     --category "Explicit approval gate" \
#     --title-en "Approve production deploy" \
#     --title-th "อนุมัติ deploy prod" \
#     --desc-en "v2.3.0 passed all gates. Confirm deploy to prod?" \
#     --desc-th "v2.3.0 ผ่าน gate ครบ อนุมัติ deploy prod?" \
#     --agent nick-fury \
#     --blocks "/aegis-deploy v2.3.0"
#
# Inserts the entry between <!-- PENDING_START --> and <!-- PENDING_END -->
# in .aegis/brain/human-queue.md. Safely idempotent w.r.t. the placeholder.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUEUE="$REPO_ROOT/.aegis/brain/human-queue.md"

# ── Parse args ──────────────────────────────────────────────────────────────
CATEGORY=""
TITLE_EN=""
TITLE_TH=""
DESC_EN=""
DESC_TH=""
AGENT=""
BLOCKS=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --category) CATEGORY="$2"; shift 2 ;;
        --title-en) TITLE_EN="$2"; shift 2 ;;
        --title-th) TITLE_TH="$2"; shift 2 ;;
        --desc-en)  DESC_EN="$2";  shift 2 ;;
        --desc-th)  DESC_TH="$2";  shift 2 ;;
        --agent)    AGENT="$2";    shift 2 ;;
        --blocks)   BLOCKS="$2";   shift 2 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

# ── Validate ────────────────────────────────────────────────────────────────
for REQ in "$CATEGORY:category" "$TITLE_EN:title-en" "$TITLE_TH:title-th" \
           "$DESC_EN:desc-en" "$DESC_TH:desc-th" "$AGENT:agent"; do
    VAL="${REQ%%:*}"; NAME="${REQ##*:}"
    [[ -z "$VAL" ]] && { echo "ERROR: --$NAME is required" >&2; exit 1; }
done

case "$CATEGORY" in
    "Identity"|"Irreversible scope"|"External access"|"Explicit approval gate") ;;
    *)
        echo "ERROR: --category must be one of:" >&2
        echo "  Identity | Irreversible scope | External access | Explicit approval gate" >&2
        echo "Got: '$CATEGORY'" >&2
        echo "(Per MBP / Golden Rule #7, no other category may reach the human.)" >&2
        exit 1 ;;
esac

[[ ! -f "$QUEUE" ]] && { echo "ERROR: queue file not found: $QUEUE" >&2; exit 1; }
grep -q "<!-- PENDING_START -->" "$QUEUE" || { echo "ERROR: sentinel markers missing in $QUEUE" >&2; exit 1; }

# ── Insert entry via Python (safer than sed with markdown) ─────────────────
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATE=$(date -u +"%Y-%m-%d")
CATEGORY_TAG=$(echo "$CATEGORY" | cut -d' ' -f1 | tr '[:lower:]' '[:upper:]')
BLOCKS_DISPLAY="${BLOCKS:-(none specified)}"

python3 - "$QUEUE" <<PYEOF
import sys, re
path = sys.argv[1]
with open(path) as f:
    content = f.read()

entry = f"""
### [${DATE}] ${CATEGORY_TAG} — ${TITLE_EN} / ${TITLE_TH}

- **EN**: ${DESC_EN}
- **TH**: ${DESC_TH}
- **Category**: ${CATEGORY}
- **Raised by**: ${AGENT}
- **Blocks**: ${BLOCKS_DISPLAY}
- **Raised**: ${TS}
- **Resolved**: _(pending)_
"""

start = "<!-- PENDING_START -->"
end = "<!-- PENDING_END -->"
m = re.search(re.escape(start) + r'(.*?)' + re.escape(end), content, re.DOTALL)
if not m:
    print("ERROR: sentinel markers not found", file=sys.stderr)
    sys.exit(2)

inner = m.group(1)
placeholder = "_No pending items. / ไม่มีคิวรอ._"

if placeholder in inner:
    # First entry — replace placeholder
    new_inner = "\n" + entry.strip() + "\n"
else:
    # Append after existing entries
    new_inner = inner.rstrip() + "\n\n" + entry.strip() + "\n"

new_block = start + new_inner + end
new_content = content[:m.start()] + new_block + content[m.end():]

with open(path, 'w') as f:
    f.write(new_content)
PYEOF

# ── Log ─────────────────────────────────────────────────────────────────────
LOG="$REPO_ROOT/.aegis/brain/logs/activity.log"
if [[ -f "$LOG" ]]; then
    echo "[${TS}] [HUMAN-QUEUE] PENDING_ADDED — category=${CATEGORY_TAG} agent=${AGENT} title=\"${TITLE_EN}\"" >> "$LOG"
fi

echo "✅ Appended: ${TITLE_EN}"
echo "   See .aegis/brain/human-queue.md § Pending"
