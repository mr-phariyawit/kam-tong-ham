#!/usr/bin/env bash
# AEGIS Hook — research-probe-on-write.sh (sprint v15-21, closes v15-20 F-E follow-up)
#
# PostToolUse hook for Edit|Write|MultiEdit. Auto-runs `aegis-research-probe.sh
# apply` on any write that lands inside `_aegis-output/research/` so every URL
# gets a [PROBED ✓ / ✗ / UNPROBED] annotation without Beast having to remember
# to invoke the probe manually.
#
# Driver: Contra-Thai F-E. Beast wrote `docs/KIE-AI-INTEGRATION.md` with 4
# fabricated endpoint URLs + 1 fabricated response schema that Thor's
# `contra-gen-art.py` then committed as ground truth. v15-20 shipped the
# probe tool but left invocation manual — this hook makes it automatic.
#
# Soft-gate: always exits 0. The probe tool itself is soft (annotations only,
# no file delete). Hook reports to /tmp/aegis-probe-hook.log for debugging.

set -uo pipefail

INPUT=$(cat)

TOOL=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")
FILE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

# Only fire for write-family tools
case "$TOOL" in
    Edit|Write|MultiEdit) ;;
    *) exit 0 ;;
esac

[[ -z "$FILE" ]] && exit 0
[[ ! -f "$FILE" ]] && exit 0  # File might not exist yet for some Write paths

# Only fire on research-doc writes
case "$FILE" in
    */_aegis-output/research/*.md|*/_aegis-output/research/*/*.md) ;;
    *) exit 0 ;;
esac

# Resolve probe tool path
PROBE_TOOL="${CLAUDE_PROJECT_DIR:-$(pwd)}/tools/aegis-research-probe.sh"
[[ -x "$PROBE_TOOL" ]] || exit 0  # Tool not present (older AEGIS install) → silent skip

# Run the probe + log
LOG="/tmp/aegis-probe-hook.log"
{
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] research-probe-on-write fired on: $FILE"
    bash "$PROBE_TOOL" apply "$FILE" 2>&1 || true
} >> "$LOG" 2>&1

exit 0
