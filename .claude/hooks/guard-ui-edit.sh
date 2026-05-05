#!/usr/bin/env bash
# AEGIS Hook — guard-ui-edit.sh (S3-04, S3-05, S3-09)
# Blocks Edit/Write/MultiEdit on UI files when DESIGN.md is absent at repo root.
# Prevents agents from writing UI code without a design contract.
#
# Hook type: PreToolUse
# Matcher:   Edit|Write|MultiEdit
#
# Input:  JSON on stdin  { "tool_name": "Edit|Write|MultiEdit", "tool_input": { "file_path": "..." } }
# Output: JSON on stdout { "decision": "block", "reason": "..." }  (exit 2 to block)
# Exit 0: allow  |  Exit 2: block
#
# Pattern evaluation order:
#   1. Path canonicalized via realpath/greadlink/python3 fallback (S3-09)
#   2. EXCLUDE patterns checked FIRST (fail-safe — if any match, exit 0 immediately)
#   3. INCLUDE UI patterns checked second
#   4. If INCLUDE matches AND no DESIGN.md at repo root: exit 2 (block)
#   5. Otherwise: exit 0 (allow)
#
# Patterns sourced from tools/aegis-ui-patterns.sh (SSOT per S3-05).

set -euo pipefail

# ── Source canonical UI patterns (SSOT — S3-05) ───────────────────────────
_HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../tools/aegis-ui-patterns.sh
source "${_HOOK_DIR}/../../tools/aegis-ui-patterns.sh"

INPUT=$(cat)

TOOL=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")
FILE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

# Only act on write-family tools
case "$TOOL" in
    Edit|Write|MultiEdit) ;;
    *) exit 0 ;;
esac

[[ -z "$FILE" ]] && exit 0

# ── STEP 0: Resolve project root ─────────────────────────────────────────
REPO_ROOT="${AEGIS_REPO_ROOT:-$(pwd)}"

# ── Logging helper (best-effort, never fail the hook) ─────────────────────
LOG=".aegis/brain/logs/activity.log"
log_decision() {
    local decision="$1"
    local reason="$2"
    if [[ -f "$LOG" || -d "$(dirname "$LOG")" ]]; then
        local ts
        ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
        echo "[${ts}] [HOOK:guard-ui-edit] ${decision} — ${TOOL} ${FILE}${reason:+ | ${reason}}" >> "$LOG" 2>/dev/null || true
    fi
}

# ── STEP 1: Canonicalize path (S3-09 — prevent traversal false-positives) ─
_canonicalize() {
    local p="$1"
    if command -v realpath >/dev/null 2>&1; then
        realpath -m "$p" 2>/dev/null && return
    fi
    if command -v greadlink >/dev/null 2>&1; then
        greadlink -m "$p" 2>/dev/null && return
    fi
    python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$p" 2>/dev/null && return
    # Literal fallback: warn once per session that resolution degraded
    _SENTINEL="/tmp/.aegis-realpath-warned-${CLAUDE_SESSION_ID:-default}.flag"
    if [[ ! -f "$_SENTINEL" ]]; then
        touch "$_SENTINEL"
        local _ts
        _ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
        echo "[${_ts}] [HOOK:guard-ui-edit] WARN realpath/greadlink/python3 all unavailable — fell through to literal path (resolution degraded)" \
            >> "${AEGIS_ACTIVITY_LOG:-.aegis/brain/logs/activity.log}" 2>/dev/null || true
    fi
    echo "$p"  # fallback: use as-is
}

# Canonicalize REPO_ROOT itself so symlink-resolved paths compare correctly
# (on macOS, /tmp -> /private/tmp; without this, the prefix check fails)
REPO_ROOT=$(_canonicalize "$REPO_ROOT")

# Make path absolute relative to REPO_ROOT if not already absolute
if [[ "$FILE" != /* ]]; then
    FILE="${REPO_ROOT}/${FILE}"
fi
FILE=$(_canonicalize "$FILE")

# Guard: if resolved path is outside repo root, allow (not our concern)
if [[ "$FILE" != "${REPO_ROOT}"* ]]; then
    log_decision "ALLOW" "resolved path outside repo root (${FILE})"
    exit 0
fi

# Strip REPO_ROOT prefix for pattern matching (keep relative path form)
FILE="${FILE#${REPO_ROOT}/}"

# ── STEP 2: EXCLUDE patterns (checked FIRST — fail-safe) ─────────────────
# Sourced from tools/aegis-ui-patterns.sh (is_excluded_file function).
# If a file matches any exclusion, it is NOT a UI file for gate purposes.

if is_excluded_file "$FILE"; then
    log_decision "ALLOW" "excluded (test/spec/stories/config/setup pattern)"
    exit 0
fi

# ── STEP 3: INCLUDE UI patterns ───────────────────────────────────────────
# Sourced from tools/aegis-ui-patterns.sh (is_ui_file function).
# If the file does NOT match any UI pattern, allow unconditionally.

if ! is_ui_file "$FILE"; then
    log_decision "ALLOW" "non-UI file (no INCLUDE pattern match)"
    exit 0
fi

# ── STEP 4: UI file detected — check for DESIGN.md ───────────────────────
DESIGN_MD="${REPO_ROOT}/DESIGN.md"

if [[ -f "$DESIGN_MD" ]]; then
    log_decision "ALLOW" "UI file, DESIGN.md present"
    exit 0
fi

# ── STEP 5: BLOCK ────────────────────────────────────────────────────────
log_decision "BLOCK" "UI file, DESIGN.md missing"
echo '{"decision":"block","reason":"DESIGN.md required before UI code per BLOCK 0F. Run: bash tools/aegis-design-init.sh --blank --output DESIGN.md"}'
exit 2
