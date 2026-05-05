#!/usr/bin/env bash
# aegis-queue-resolve.sh — mark a pending human-queue entry as resolved.
#
# Usage:
#   tools/aegis-queue-resolve.sh --title-en "Approve production deploy" \
#     --how "user approved; deploy proceeded"

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUEUE="$REPO_ROOT/.aegis/brain/human-queue.md"

TITLE_EN=""
HOW=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --title-en) TITLE_EN="$2"; shift 2 ;;
        --how)      HOW="$2";      shift 2 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

[[ -z "$TITLE_EN" ]] && { echo "ERROR: --title-en required (must match a pending entry)" >&2; exit 1; }
[[ ! -f "$QUEUE" ]] && { echo "ERROR: queue file not found: $QUEUE" >&2; exit 1; }

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOW_CLEAN="${HOW:-(no note)}"

python3 - "$QUEUE" "$TITLE_EN" "$TS" "$HOW_CLEAN" <<'PYEOF'
import sys, re
path, title, ts, how = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

with open(path) as f:
    content = f.read()

# Extract pending block
pend_start = "<!-- PENDING_START -->"
pend_end = "<!-- PENDING_END -->"
res_start = "<!-- RESOLVED_START -->"
res_end = "<!-- RESOLVED_END -->"

for marker in (pend_start, pend_end, res_start, res_end):
    if marker not in content:
        print(f"ERROR: sentinel {marker} missing", file=sys.stderr)
        sys.exit(2)

pm = re.search(re.escape(pend_start) + r'(.*?)' + re.escape(pend_end), content, re.DOTALL)
pending_inner = pm.group(1)

# Find the entry by title — tolerate extra whitespace
esc = re.escape(title)
entry_re = re.compile(
    r'(### \[\d{4}-\d{2}-\d{2}\] \w+ — ' + esc + r'.*?)(?=(?:\n### )|\Z)',
    re.DOTALL
)
em = entry_re.search(pending_inner)
if not em:
    print(f"ERROR: no pending entry with title '{title}'", file=sys.stderr)
    print("Available pending titles:", file=sys.stderr)
    for m in re.finditer(r'### \[\d{4}-\d{2}-\d{2}\] \w+ — (.+?) /', pending_inner):
        print(f"  - {m.group(1)}", file=sys.stderr)
    sys.exit(3)

entry = em.group(1).rstrip()
# Fill in Resolved timestamp + note
entry = re.sub(r'\*\*Resolved\*\*:\s*_\(pending\)_', f'**Resolved**: {ts} — {how}', entry)

# Remove from pending
new_pending_inner = entry_re.sub('', pending_inner, count=1).rstrip() + "\n"
# Re-insert placeholder if empty
if not re.search(r'###\s', new_pending_inner):
    new_pending_inner = "\n_No pending items. / ไม่มีคิวรอ._\n"

# Prepend to resolved (newest first)
rm = re.search(re.escape(res_start) + r'(.*?)' + re.escape(res_end), content, re.DOTALL)
resolved_inner = rm.group(1)
new_resolved_inner = "\n\n" + entry + "\n" + resolved_inner.lstrip()

# Reassemble
new_pending_block = pend_start + new_pending_inner + pend_end
new_resolved_block = res_start + new_resolved_inner + res_end

new_content = content[:pm.start()] + new_pending_block + content[pm.end():rm.start()] + new_resolved_block + content[rm.end():]

with open(path, 'w') as f:
    f.write(new_content)

print(f"✅ Resolved: {title}")
print(f"   Timestamp: {ts}")
PYEOF

LOG="$REPO_ROOT/.aegis/brain/logs/activity.log"
if [[ -f "$LOG" ]]; then
    echo "[${TS}] [HUMAN-QUEUE] RESOLVED — title=\"${TITLE_EN}\" how=\"${HOW_CLEAN}\"" >> "$LOG"
fi
