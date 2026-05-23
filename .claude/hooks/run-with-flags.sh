#!/usr/bin/env bash
# AEGIS Hook Wrapper — run-with-flags.sh
# Gates execution of downstream hooks based on:
#   - AEGIS_HOOK_PROFILE  (minimal|standard|strict, default: standard)
#   - AEGIS_DISABLED_HOOKS (comma-separated hook IDs)
#
# Usage: bash .claude/hooks/run-with-flags.sh <hook_id> <path-to-hook-script> [args...]
# Pattern adopted from ECC's scripts/hooks/run-with-flags.js.
#
# The wrapper is INPUT-transparent: stdin is passed through to the downstream
# hook unchanged. If the hook is gated off, stdin is silently consumed and
# exit 0 is returned (no block, no side effects).

set -euo pipefail

HOOK_ID="${1:-}"
HOOK_CMD="${2:-}"
shift 2 || true

if [[ -z "$HOOK_ID" || -z "$HOOK_CMD" ]]; then
    echo "run-with-flags: missing HOOK_ID or HOOK_CMD" >&2
    exit 1
fi

PROFILE="${AEGIS_HOOK_PROFILE:-standard}"
DISABLED="${AEGIS_DISABLED_HOOKS:-}"
MANIFEST=".claude/hooks/profiles.json"

# Consume stdin first so we can pass it through OR discard it consistently.
# Use a fd trick to keep the pipe intact for the downstream call.
STDIN_CACHE=$(cat || true)

# ── Explicit disable wins ─────────────────────────────────────────────────
# Match whole words in the comma-separated list (avoid partial matches).
if [[ -n "$DISABLED" ]]; then
    IFS=',' read -r -a DISABLED_ARR <<< "$DISABLED"
    for d in "${DISABLED_ARR[@]}"; do
        # Trim whitespace
        d=$(echo "$d" | tr -d '[:space:]')
        if [[ "$d" == "$HOOK_ID" ]]; then
            # Hook is explicitly disabled — exit silently
            exit 0
        fi
    done
fi

# ── Profile membership check ──────────────────────────────────────────────
# If manifest exists, check if HOOK_ID is a member of the active profile.
# If manifest is missing or unparseable, fail open (run everything).
if [[ -f "$MANIFEST" ]] && command -v python3 &>/dev/null; then
    IN_PROFILE=$(python3 -c "
import json, sys
try:
    with open('$MANIFEST') as f:
        data = json.load(f)
    profiles = data.get('profiles', {})
    members = profiles.get('$PROFILE', [])
    print('yes' if '$HOOK_ID' in members else 'no')
except Exception:
    print('yes')  # fail open
" 2>/dev/null || echo "yes")

    if [[ "$IN_PROFILE" == "no" ]]; then
        exit 0
    fi
fi

# ── Run the downstream hook with original stdin ────────────────────────────
# v15-12: capture stderr, log full content, emit a single classified
# friendly line if the hook fails. PreToolUse hooks (guard-*, approval-*)
# propagate their exit code so blocks still work; everything else exits 0.
HOOK_STDERR=$(mktemp)
# `set -e` is active, so a non-zero hook exit would abort the wrapper before
# we get a chance to classify the error. The `|| HOOK_EXIT=$?` pattern
# captures the exit code without triggering set-e's abort.
HOOK_EXIT=0
echo "$STDIN_CACHE" | bash "$HOOK_CMD" "$@" 2> "$HOOK_STDERR" || HOOK_EXIT=$?

if [[ "$HOOK_EXIT" -ne 0 ]] && [[ -s "$HOOK_STDERR" ]]; then
    # Append full stderr trace to per-project error log for forensics.
    LOG_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.aegis/brain/logs"
    mkdir -p "$LOG_DIR" 2>/dev/null
    {
        date -u +"[%FT%TZ] hook=${HOOK_ID} exit=${HOOK_EXIT}"
        cat "$HOOK_STDERR"
        echo "---"
    } >> "$LOG_DIR/hook-errors.log" 2>/dev/null

    # Emit one classified line to original stderr (so the user sees it).
    STDERR_CONTENT=$(cat "$HOOK_STDERR")
    if echo "$STDERR_CONTENT" | grep -qE "ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package"; then
        echo "⚠ [${HOOK_ID}] missing Node module — run: bash tools/aegis-doctor.sh --fix" >&2
    elif echo "$STDERR_CONTENT" | grep -q "command not found"; then
        missing=$(echo "$STDERR_CONTENT" | grep -oE "command not found: [^ ]+" | head -1 | sed 's/.*: //')
        echo "⚠ [${HOOK_ID}] missing command: ${missing:-unknown} — install it or set AEGIS_DISABLED_HOOKS=${HOOK_ID}" >&2
    elif echo "$STDERR_CONTENT" | grep -qiE "permission denied"; then
        echo "⚠ [${HOOK_ID}] permission denied — try: chmod +x <script>" >&2
    elif echo "$STDERR_CONTENT" | grep -q "No such file or directory"; then
        echo "⚠ [${HOOK_ID}] missing file — run: bash tools/aegis-doctor.sh" >&2
    elif echo "$STDERR_CONTENT" | grep -q "python3"; then
        echo "⚠ [${HOOK_ID}] python3 unavailable — install: brew install python3" >&2
    else
        first_line=$(echo "$STDERR_CONTENT" | head -1 | cut -c1-120)
        echo "⚠ [${HOOK_ID}] failed: ${first_line} (full trace in .aegis/brain/logs/hook-errors.log)" >&2
    fi
fi

rm -f "$HOOK_STDERR"

# PreToolUse hooks (guard-*, approval-*) must propagate exit code so blocks work.
# Stop / SessionStart / PostToolUse hooks fail-open (exit 0) to avoid disrupting flow.
case "$HOOK_ID" in
    guard-*|approval-*) exit "$HOOK_EXIT" ;;
    *) exit 0 ;;
esac
