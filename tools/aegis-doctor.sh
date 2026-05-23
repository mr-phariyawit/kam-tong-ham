#!/usr/bin/env bash
# aegis-doctor.sh — Detect orphan references in AEGIS-installed projects.
#
# What it does:
#   Scans the active AEGIS install (current repo) for "wired-but-missing"
#   files — paths referenced by hooks or settings.json that don't exist on
#   disk. This catches the Auto-Affi-class bug where on-stop.sh was upgraded
#   but its lib/ + tool deps were not.
#
# What it checks:
#   1. .claude/hooks/*.sh           — every `source "..."`, `node "..."`,
#                                     `bash "..."` path argument
#   2. .claude/settings.json        — every `command` field that references
#                                     a path under $CLAUDE_PROJECT_DIR
#   3. .claude/hooks/lib/*.sh       — same recursive scan
#
# Exit codes:
#   0 = clean (no orphans)
#   1 = orphans found (printed to stderr; one per line)
#   2 = fatal (no .claude/ at all)
#
# Usage:
#   bash tools/aegis-doctor.sh                 # scan current repo
#   bash tools/aegis-doctor.sh /path/to/repo   # scan target repo
#   bash tools/aegis-doctor.sh --fix           # attempt to copy missing
#                                                files from a sibling
#                                                AEGIS-Team checkout
#   bash tools/aegis-doctor.sh --json          # machine-readable output
#
# Wired by:
#   - install.sh (post-copy verification step)
#   - .claude/hooks/session-start.sh (silent unless orphans detected)

set -uo pipefail

TARGET="${1:-$PWD}"
MODE="check"          # check | fix | json
AEGIS_SOURCE="${AEGIS_SOURCE:-}"   # explicit override; else auto-detect

# Parse flags (any position)
ARGS=()
for arg in "$@"; do
    case "$arg" in
        --fix)  MODE="fix" ;;
        --json) MODE="json" ;;
        --help|-h)
            sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        --*)
            printf 'doctor: unknown flag %s\n' "$arg" >&2
            exit 2
            ;;
        *) ARGS+=("$arg") ;;
    esac
done
TARGET="${ARGS[0]:-$PWD}"
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || {
    printf 'doctor: target does not exist: %s\n' "$TARGET" >&2
    exit 2
}

if [[ ! -d "$TARGET/.claude" ]]; then
    printf 'doctor: no .claude/ directory in %s (not an AEGIS install?)\n' "$TARGET" >&2
    exit 2
fi

# ── Detect a fallback AEGIS source for --fix ────────────────────────────────
detect_source() {
    if [[ -n "$AEGIS_SOURCE" && -d "$AEGIS_SOURCE/.claude" ]]; then
        printf '%s' "$AEGIS_SOURCE"; return 0
    fi
    # Try a sibling AEGIS-Team checkout near $HOME
    local candidate
    for candidate in \
        "$HOME/Documents/AEGIS-Team" \
        "$HOME/AEGIS-Team" \
        "$HOME/projects/AEGIS-Team" \
        "$HOME/code/AEGIS-Team"; do
        if [[ -d "$candidate/.claude/hooks/lib" && "$candidate" != "$TARGET" ]]; then
            printf '%s' "$candidate"
            return 0
        fi
    done
    return 1
}

# ── Extract paths referenced inside a shell script ──────────────────────────
# Returns one absolute path per line. Resolves ${HOOK_DIR}, ${REPO_ROOT},
# $CLAUDE_PROJECT_DIR — but conservatively (any path that survives expansion
# in the target's directory layout will be checked).
extract_refs_sh() {
    local script="$1" base_dir="$2"
    # Common patterns: source "..." / source '...' / node "..." / bash "..."
    # We avoid `eval` — extract the raw string and substitute known vars.
    grep -hoE '(source|node|bash)[[:space:]]+["'\''][^"'\'']+["'\'']' "$script" 2>/dev/null \
      | sed -E 's/^(source|node|bash)[[:space:]]+["'\'']//; s/["'\'']$//' \
      | while IFS= read -r raw; do
            [[ -z "$raw" ]] && continue
            # Substitute env-var-like placeholders against the target layout
            local resolved="$raw"
            resolved="${resolved//\$\{HOOK_DIR\}/${base_dir}}"
            resolved="${resolved//\$HOOK_DIR/${base_dir}}"
            resolved="${resolved//\$\{REPO_ROOT\}/${TARGET}}"
            resolved="${resolved//\$REPO_ROOT/${TARGET}}"
            resolved="${resolved//\$\{CLAUDE_PROJECT_DIR\}/${TARGET}}"
            resolved="${resolved//\$CLAUDE_PROJECT_DIR/${TARGET}}"
            # Skip refs that still contain unresolved vars — can't check
            [[ "$resolved" == *'$'* ]] && continue
            # Skip non-file-like (commands without slashes, e.g. `node`, `git`)
            [[ "$resolved" != */* ]] && continue
            printf '%s\n' "$resolved"
        done
}

# ── Extract paths from settings.json `command` fields ───────────────────────
extract_refs_settings() {
    local settings="$1"
    [[ -f "$settings" ]] || return 0
    python3 - "$settings" "$TARGET" <<'PY' 2>/dev/null
import json, sys, re, os
path, target = sys.argv[1], sys.argv[2]
try:
    data = json.load(open(path))
except Exception:
    sys.exit(0)
# Walk the structure looking for "command" keys with paths
def walk(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == 'command' and isinstance(v, str):
                # Find quoted paths inside the command string
                for m in re.finditer(r'"([^"]+)"', v):
                    p = m.group(1)
                    p = p.replace('$CLAUDE_PROJECT_DIR', target)
                    p = p.replace('${CLAUDE_PROJECT_DIR}', target)
                    if '$' in p: continue
                    if '/' not in p: continue
                    print(p)
            walk(v)
    elif isinstance(node, list):
        for x in node: walk(x)
walk(data)
PY
}

# ── Run the scan ────────────────────────────────────────────────────────────
# Use a flat space-delimited string for dedup (associative arrays require
# bash 4+; macOS ships 3.2). Paths don't contain spaces in this repo, so a
# space-separated set is safe.
ORPHANS=()
SEEN_REFS=" "

was_seen() {
    case "$SEEN_REFS" in
        *" $1 "*) return 0 ;;
        *) return 1 ;;
    esac
}
mark_seen() {
    SEEN_REFS="$SEEN_REFS$1 "
}

scan_script() {
    local script="$1"
    local base_dir
    base_dir="$(cd "$(dirname "$script")" && pwd)"
    local p
    while IFS= read -r p; do
        [[ -z "$p" ]] && continue
        was_seen "$p" && continue
        mark_seen "$p"
        if [[ ! -e "$p" ]]; then
            ORPHANS+=("$script → $p")
        fi
    done < <(extract_refs_sh "$script" "$base_dir")
}

# Hooks directory
if [[ -d "$TARGET/.claude/hooks" ]]; then
    while IFS= read -r f; do
        scan_script "$f"
    done < <(find "$TARGET/.claude/hooks" -type f -name '*.sh' 2>/dev/null)
fi

# settings.json refs
while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    was_seen "$p" && continue
    mark_seen "$p"
    if [[ ! -e "$p" ]]; then
        ORPHANS+=("settings.json → $p")
    fi
done < <(extract_refs_settings "$TARGET/.claude/settings.json")

# ── Report ─────────────────────────────────────────────────────────────────
if [[ "$MODE" == "json" ]]; then
    printf '{"target":"%s","orphan_count":%d,"orphans":[' "$TARGET" "${#ORPHANS[@]}"
    JSON_FIRST=1
    for o in "${ORPHANS[@]:-}"; do
        [[ -z "$o" ]] && continue
        if [[ "$JSON_FIRST" == "1" ]]; then JSON_FIRST=0; else printf ','; fi
        printf '"%s"' "${o//\"/\\\"}"
    done
    printf ']}\n'
    [[ ${#ORPHANS[@]} -eq 0 ]] && exit 0 || exit 1
fi

if [[ ${#ORPHANS[@]} -eq 0 ]]; then
    printf '[doctor] ✅ %s — all hook + settings references resolve.\n' "$TARGET" >&2
    exit 0
fi

printf '[doctor] ❌ %s — %d orphan reference(s):\n' "$TARGET" "${#ORPHANS[@]}" >&2
for o in "${ORPHANS[@]}"; do
    printf '  · %s\n' "$o" >&2
done

# ── Fix mode ───────────────────────────────────────────────────────────────
if [[ "$MODE" == "fix" ]]; then
    SOURCE="$(detect_source || true)"
    if [[ -z "$SOURCE" ]]; then
        printf '[doctor] ❌ --fix requires a sibling AEGIS-Team checkout. Set AEGIS_SOURCE=/path/to/AEGIS-Team\n' >&2
        exit 1
    fi
    printf '[doctor] 🛠  --fix using source: %s\n' "$SOURCE" >&2
    FIX_FIXED=0
    FIX_MISSING=0
    for o in "${ORPHANS[@]}"; do
        missing="${o##* → }"
        # Derive the path RELATIVE to TARGET so we can look it up under SOURCE
        rel="${missing#$TARGET/}"
        src="$SOURCE/$rel"
        if [[ -e "$src" ]]; then
            mkdir -p "$(dirname "$missing")"
            cp -R "$src" "$missing"
            printf '  ✓ copied %s ← %s\n' "$rel" "$src" >&2
            FIX_FIXED=$((FIX_FIXED+1))

            # Bug class fixed 2026-05-14: copying ONLY the orphan path is not
            # enough when the orphan is a JS/MJS module that `import`s sibling
            # files (e.g. check.mjs → lib.mjs). Without the siblings, the
            # entry-point loads but throws ERR_MODULE_NOT_FOUND on first run.
            #
            # Heuristic: if the copied file is inside a tool subdirectory
            # (tools/aegis-*/), bring along all OTHER files in that subdir.
            # We don't recurse beyond one level; deeper trees are rare and
            # the safe stance is "if dir exists with more files, mirror them".
            parent_rel="$(dirname "$rel")"
            src_parent="$SOURCE/$parent_rel"
            dst_parent="$TARGET/$parent_rel"
            case "$parent_rel" in
                tools/aegis-*|.claude/hooks/lib)
                    if [[ -d "$src_parent" && -d "$dst_parent" ]]; then
                        for sibling in "$src_parent"/*; do
                            [[ -e "$sibling" ]] || continue
                            base="$(basename "$sibling")"
                            if [[ ! -e "$dst_parent/$base" ]]; then
                                cp -R "$sibling" "$dst_parent/$base"
                                printf '    + sibling: %s/%s\n' "$parent_rel" "$base" >&2
                                FIX_FIXED=$((FIX_FIXED+1))
                            fi
                        done
                    fi
                    ;;
            esac
        else
            printf '  ✗ source missing too: %s\n' "$src" >&2
            FIX_MISSING=$((FIX_MISSING+1))
        fi
    done
    printf '[doctor] 🩹 fixed=%d, still_missing=%d\n' "$FIX_FIXED" "$FIX_MISSING" >&2
    [[ "$FIX_MISSING" -eq 0 ]] && exit 0 || exit 1
fi

printf '\n[doctor] Run with --fix to auto-copy missing files from a sibling AEGIS-Team checkout.\n' >&2
exit 1
