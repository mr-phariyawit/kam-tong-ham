#!/usr/bin/env bash
# AEGIS Hook — aegis-version-check.sh
# Validates version consistency across version-aware files (S1-03).
# Runs at SessionStart. Warns on drift (does NOT block — informational only).
#
# Source of truth: VERSION file at repo root (S1-01).
# Tracked files: CLAUDE.md, CLAUDE_safety.md, CLAUDE_skills.md, CLAUDE_lessons.md,
#                install.sh, install-remote.sh, .aegis/brain/resonance/project-identity.md
#
# Exit 0 always (warn-only). To make blocking, change `warn` to `block`.

set -euo pipefail

# Resolve repo root from script location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
VERSION_FILE="${REPO_ROOT}/VERSION"

# No VERSION file = legacy v8.x project, skip silently
[[ ! -f "$VERSION_FILE" ]] && exit 0

EXPECTED="$(cat "$VERSION_FILE" | tr -d '[:space:]')"
[[ -z "$EXPECTED" ]] && exit 0

# Files to check + extraction pattern
declare -a CHECKS=(
    "CLAUDE.md|^# AEGIS v[0-9.]+"
    "CLAUDE_safety.md|^# AEGIS v[0-9.]+"
    "CLAUDE_skills.md|AEGIS Skills Catalog v[0-9.]+"
    "CLAUDE_lessons.md|^# AEGIS v[0-9.]+"
    "install.sh|VERSION="
    "install-remote.sh|VERSION="
    ".aegis/brain/resonance/project-identity.md|^AEGIS v[0-9.]+"
)

DRIFT=()

for entry in "${CHECKS[@]}"; do
    file="${entry%%|*}"
    pattern="${entry##*|}"
    full="${REPO_ROOT}/${file}"

    [[ ! -f "$full" ]] && continue

    # Extract version number from first match of pattern
    found=$(grep -m1 -Eo "$pattern[^ \"]*" "$full" 2>/dev/null | grep -Eo "[0-9]+\.[0-9]+(\.[0-9]+)?" | head -1 || echo "")

    if [[ -n "$found" ]] && [[ "$found" != "$EXPECTED" ]]; then
        DRIFT+=("${file}: expected v${EXPECTED}, found v${found}")
    fi
done

if [[ ${#DRIFT[@]} -gt 0 ]]; then
    # Best-effort log
    LOG="${REPO_ROOT}/.aegis/brain/logs/activity.log"
    if [[ -d "$(dirname "$LOG")" ]]; then
        TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
        echo "[${TIMESTAMP}] [HOOK:version-check] DRIFT detected: ${#DRIFT[@]} file(s)" >> "$LOG" 2>/dev/null || true
        for d in "${DRIFT[@]}"; do
            echo "[${TIMESTAMP}] [HOOK:version-check]   - ${d}" >> "$LOG" 2>/dev/null || true
        done
    fi

    # Print to user (warn, not block)
    echo "⚠️  AEGIS Version Drift Detected (expected v${EXPECTED}):" >&2
    for d in "${DRIFT[@]}"; do
        echo "   - $d" >&2
    done
    echo "   Fix: update files to match VERSION file. Run: cat VERSION" >&2
fi

exit 0
