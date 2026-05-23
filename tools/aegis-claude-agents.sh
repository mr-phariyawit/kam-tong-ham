#!/usr/bin/env bash
# aegis-claude-agents.sh — sprint v15-22 Story A
#
# Thin wrapper around `claude agents --json` (CC 2.1.148+) that gives AEGIS
# cross-session awareness. Returns JSON of live CC sessions on the machine,
# filtered/projected to what AEGIS needs.
#
# Why a wrapper at all?
#   - Cache 1s so tight loops don't re-fork `claude` repeatedly
#   - Filter by --cwd at the wrapper level (CLI doesn't always filter cleanly)
#   - Graceful fallback to [] when `claude` is missing (CI, test fixtures,
#     stale AEGIS installs that don't have CC 2.1.148+ yet)
#   - Single place to evolve the schema mapping if CC changes the JSON
#
# Subcommands:
#   list                  Human-readable table of live sessions
#   list --json           Raw JSON array (passthrough)
#   where <project-name>  Path of named project's session, if any (silent if none)
#   filter --cwd <path>   JSON array of sessions whose cwd is under <path>
#   self                  JSON of THIS session (matched via $CLAUDE_SESSION_ID)
#   help
#
# Exit code: 0 always (soft tool — caller decides what "no data" means)

set -uo pipefail

CACHE_DIR="${TMPDIR:-/tmp}/aegis-claude-agents-cache"
CACHE_TTL_SEC=1
mkdir -p "$CACHE_DIR" 2>/dev/null

# ── helpers ──────────────────────────────────────────────────────────────
red()    { printf '\033[0;31m%s\033[0m' "$*"; }
green()  { printf '\033[0;32m%s\033[0m' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m' "$*"; }
bold()   { printf '\033[1m%s\033[0m' "$*"; }

have_claude() {
    command -v claude >/dev/null 2>&1
}

# Returns raw JSON array from `claude agents --json`, using 1-sec disk cache.
# On any failure (claude missing, command errors, non-array output) returns [].
fetch_raw() {
    local cache_file="$CACHE_DIR/agents.json"
    if [[ -f "$cache_file" ]]; then
        # Cross-platform mtime check: BSD stat -f vs GNU stat -c.
        # Wrap each in its own subshell so any stat error message
        # doesn't leak into outer bash's parser (set -u was tripping
        # on "File:" tokens from GNU stat's -f filesystem-mode help).
        local mtime now
        mtime=$( { stat -f %m "$cache_file" 2>/dev/null; } || { stat -c %Y "$cache_file" 2>/dev/null; } || echo 0)
        # Sanity: must be all digits
        if [[ ! "$mtime" =~ ^[0-9]+$ ]]; then mtime=0; fi
        now=$(date +%s)
        if (( now - mtime < CACHE_TTL_SEC )); then
            cat "$cache_file"
            return 0
        fi
    fi
    local json="[]"
    if have_claude; then
        json=$(claude agents --json 2>/dev/null || echo '[]')
        # Sanity check it's a JSON array
        if ! echo "$json" | jq -e 'type == "array"' >/dev/null 2>&1; then
            json="[]"
        fi
    fi
    echo "$json" > "$cache_file" 2>/dev/null
    echo "$json"
}

cmd_list() {
    local raw
    raw=$(fetch_raw)
    if [[ "${1:-}" == "--json" ]]; then
        echo "$raw"
        return 0
    fi
    local count
    count=$(echo "$raw" | jq 'length' 2>/dev/null || echo 0)
    if [[ "$count" == "0" ]]; then
        echo "(no live CC sessions detected)"
        if ! have_claude; then
            echo "($(yellow note:) \`claude\` not on PATH — wrapper falling back to empty list)"
        fi
        return 0
    fi
    echo "$(bold "Live CC sessions ($count):")"
    echo "$raw" | jq -r '.[] | "  \(.status // "?")  pid=\(.pid // "?")  cwd=\(.cwd // "?")  session=\(.sessionId // "?" | .[0:8])"' 2>/dev/null
}

cmd_where() {
    local name="${1:-}"
    [[ -z "$name" ]] && { echo "ERROR: where requires <project-name>" >&2; exit 0; }
    local mt_path
    # Use multi-tenant registry to map name → path
    if [[ -x "$(dirname "$0")/aegis-multi-tenant/mt.mjs" ]] || [[ -f "$(dirname "$0")/aegis-multi-tenant/mt.mjs" ]]; then
        mt_path=$(node "$(dirname "$0")/aegis-multi-tenant/mt.mjs" cwd "$name" 2>/dev/null || true)
    fi
    [[ -z "$mt_path" ]] && return 0  # name not in registry → silent
    local raw
    raw=$(fetch_raw)
    # Find sessions whose cwd matches the project path
    echo "$raw" | jq -r --arg p "$mt_path" '.[] | select(.cwd == $p) | .cwd' 2>/dev/null | head -1
}

cmd_filter() {
    local path=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --cwd) path="$2"; shift 2 ;;
            *) shift ;;
        esac
    done
    [[ -z "$path" ]] && { echo "ERROR: filter requires --cwd <path>" >&2; exit 0; }
    local raw
    raw=$(fetch_raw)
    # Match either exact equality OR sub-path under $path
    echo "$raw" | jq --arg p "$path" '[.[] | select(.cwd == $p or (.cwd | startswith($p + "/")))]' 2>/dev/null
}

cmd_self() {
    local sid="${CLAUDE_SESSION_ID:-}"
    [[ -z "$sid" ]] && { echo "{}"; return 0; }
    local raw
    raw=$(fetch_raw)
    echo "$raw" | jq --arg s "$sid" '.[] | select(.sessionId == $s) // {}' 2>/dev/null || echo "{}"
}

cmd="${1:-help}"
shift || true
case "$cmd" in
    list)     cmd_list "$@" ;;
    where)    cmd_where "$@" ;;
    filter)   cmd_filter "$@" ;;
    self)     cmd_self ;;
    help|--help|-h) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//' ;;
    *)        echo "Unknown subcommand: $cmd" >&2; echo "Use: list | where | filter | self | help" >&2; exit 0 ;;
esac
