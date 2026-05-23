#!/usr/bin/env bash
# aegis-notify.sh — Lightweight desktop-attention notifier for AEGIS hooks.
#
# Sprint v15-08 deliverable. Adopts Claude Code 2.1.141's hook
# `terminalSequence` JSON output for desktop attention pings (terminal bell,
# focus prompts, OSC-9/OSC-777 push notifications).
#
# Why a helper instead of inlining the escape sequences?
#   - Schema discovery: as of v15-08 build, the exact CC 2.1.141 JSON shape
#     for `terminalSequence` is documented but not yet exercised by AEGIS.
#     Centralising it here keeps all three downstream hooks pointing at one
#     surface — if the schema changes, only this file changes.
#   - Opt-in safety: older CC versions (< 2.1.141) don't understand the
#     `terminalSequence` field. We gate JSON emission behind
#     `AEGIS_HOOK_NOTIFY=1` so adoption is gradual + reversible.
#   - Terminal-only fallback: BEL (`\x07`) works in EVERY POSIX terminal
#     since 1970, regardless of CC version. We always emit it to stderr
#     so notifications are visible even when `terminalSequence` is off.
#
# Usage (from a hook):
#   source "$REPO_ROOT/tools/aegis-notify.sh"
#   aegis_notify "session_end"        "💤 AEGIS session ended"
#   aegis_notify "sprint_plan_gate"   "⚠️  No sprint dir — run /aegis-sprint plan"
#   aegis_notify "linear_sync_done"   "🔄 Linear sync complete"
#
# Or as a standalone:
#   bash tools/aegis-notify.sh test
#
# Env vars:
#   AEGIS_HOOK_NOTIFY=1   — enable JSON `terminalSequence` emission (default: 0)
#   AEGIS_NOTIFY_BEL=0    — suppress the BEL fallback to stderr (default: 1)
#   AEGIS_NOTIFY_LOG=path — override log path (default: .aegis/brain/logs/notify.log)
#
# Schema reference (best-effort per CC 2.1.141 release notes, 2026-05-13):
#   {"continue": true, "terminalSequence": "<ansi-escape-string>"}
#   The CLI passes <ansi-escape-string> through to the host terminal verbatim.
#   We use OSC-9 (iTerm2/macOS Terminal/Windows Terminal native notification)
#   with BEL fallback. If the schema is later revised, ONLY this file changes.

set -uo pipefail

# Re-entrant guard — sourcing this twice in a hook chain shouldn't redefine
# the function or rerun side effects.
if declare -f aegis_notify >/dev/null 2>&1; then
    return 0 2>/dev/null || exit 0
fi

_AEGIS_NOTIFY_BEL="$(printf '\007')"   # BEL = 0x07
_AEGIS_NOTIFY_ESC="$(printf '\033')"   # ESC = 0x1B

# OSC-9 (notification): ESC ] 9 ; <text> BEL
# iTerm2, macOS Terminal.app (≥ Big Sur), Windows Terminal — native banner.
# Anything else falls back to BEL ping.
_aegis_notify_osc9() {
    local text="$1"
    printf '%s]9;%s%s' "$_AEGIS_NOTIFY_ESC" "$text" "$_AEGIS_NOTIFY_BEL"
}

# Emit JSON to stdout in the shape CC 2.1.141+ hooks expect. Safe to call
# from inside a hook — CC drops the output silently if the schema is wrong
# (continueOnBlock default is true for these matchers).
_aegis_notify_json() {
    local sequence="$1"
    # Escape backslashes + double-quotes for JSON. The sequence itself
    # contains ESC + BEL — both are valid inside a JSON string.
    local escaped
    escaped="$(printf '%s' "$sequence" | python3 -c '
import json, sys
print(json.dumps(sys.stdin.read())[1:-1], end="")
' 2>/dev/null)"
    if [[ -z "$escaped" ]]; then
        # python3 unavailable — emit raw, accept the risk on edge platforms
        escaped="$sequence"
    fi
    # Schema: {"terminalSequence": "<ansi-escape-string>"} — strictly additive.
    # Intentionally omits `continue` so this JSON is safe to emit from ANY
    # hook event (Stop, SessionStart, PostToolUse). CC ignores unknown fields,
    # so the Stop hook's `decision`-based block semantics are unaffected.
    printf '{"terminalSequence":"%s"}\n' "$escaped"
}

# Append to the notify log for forensic + test inspection.
_aegis_notify_log() {
    local event="$1" body="$2"
    local log_path="${AEGIS_NOTIFY_LOG:-${PWD}/.aegis/brain/logs/notify.log}"
    local log_dir
    log_dir="$(dirname "$log_path")"
    [[ -d "$log_dir" ]] || mkdir -p "$log_dir" 2>/dev/null || return 0
    local ts
    ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")"
    printf '[%s] %s %s\n' "$ts" "$event" "$body" >> "$log_path" 2>/dev/null || true
}

# Public entry point.
# Args: <event-name> <human-readable-message>
# Returns: always 0 (notification is best-effort; never block a hook on it)
aegis_notify() {
    local event="${1:-unknown}"
    local message="${2:-AEGIS notification}"

    _aegis_notify_log "$event" "$message"

    # Always emit BEL to stderr unless explicitly suppressed.
    if [[ "${AEGIS_NOTIFY_BEL:-1}" == "1" ]]; then
        printf '%s' "$_AEGIS_NOTIFY_BEL" >&2 2>/dev/null || true
    fi

    # Opt-in JSON terminalSequence for CC 2.1.141+.
    if [[ "${AEGIS_HOOK_NOTIFY:-0}" == "1" ]]; then
        local sequence
        sequence="$(_aegis_notify_osc9 "AEGIS: $message")"
        _aegis_notify_json "$sequence"
    fi

    return 0
}

# Standalone mode: `bash tools/aegis-notify.sh test [event] [message]`
if [[ "${BASH_SOURCE[0]:-$0}" == "${0}" ]]; then
    case "${1:-}" in
        test)
            shift
            event="${1:-test_notification}"
            message="${2:-AEGIS notify helper smoke test}"
            AEGIS_HOOK_NOTIFY=1 aegis_notify "$event" "$message"
            printf '\n[aegis-notify] sent event=%s message=%s\n' "$event" "$message" >&2
            ;;
        --help|-h|"")
            sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
            ;;
        *)
            printf 'aegis-notify: unknown command "%s" (try: test, --help)\n' "$1" >&2
            exit 2
            ;;
    esac
fi
