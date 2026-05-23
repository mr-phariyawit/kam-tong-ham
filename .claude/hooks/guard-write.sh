#!/usr/bin/env bash
# AEGIS Hook — guard-write.sh
# Blocks Edit/Write/MultiEdit on protected lint/format/typecheck config files (PreToolUse).
# Prevents agents from "fixing" quality errors by weakening the rules instead of the code.
#
# Input:  JSON on stdin  { "tool_name": "Edit|Write|MultiEdit", "tool_input": { "file_path": "..." } }
# Output (modern, CC 2.1.141+ — default):
#   stdout: {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
#   exit 0
# Output (legacy, AEGIS_GUARD_LEGACY=1):
#   stdout: {"decision":"block","reason":"..."} + stderr reason + exit 2

set -euo pipefail

INPUT=$(cat)

TOOL=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")
FILE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

# Only act on write-family tools
case "$TOOL" in
    Edit|Write|MultiEdit) ;;
    *) exit 0 ;;
esac

[[ -z "$FILE" ]] && exit 0

BASENAME=$(basename "$FILE")

# v15-15: emit CC 2.1.141 permission-decision schema by default. Avoids
# the stderr+exit-2 combo that made CC label legitimate blocks as
# "Write hook error" in red. Set AEGIS_GUARD_LEGACY=1 to opt back into
# the v15-09 dual-path behavior for older CC versions.
block() {
    local reason="$1"
    local escaped
    escaped=$(printf '%s' "$reason" | python3 -c '
import json, sys
print(json.dumps(sys.stdin.read())[1:-1], end="")
' 2>/dev/null || printf '%s' "$reason")

    if [[ "${AEGIS_GUARD_LEGACY:-}" == "1" ]]; then
        printf '{"decision":"block","reason":"%s","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
            "$escaped" "$escaped"
        printf '%s\n' "$reason" >&2
        exit 2
    fi

    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
        "$escaped"
    exit 0
}

# ── ADR-004 Phase 2: Maintainer-mode AUTHORIZATION ────────────────────────
# Token format: AEGIS_MAINTAINER_MODE="<path>|<nonce>|<expiry-epoch>"
# Generated via tools/aegis-maintainer-grant.sh, one-shot, 60s TTL.
# If the grant is valid AND the target file matches, skip all blocking checks.
# Audit every outcome (allow + deny reasons) to .aegis/brain/logs/maintainer-mode.log.
MM_LOG=".aegis/brain/logs/maintainer-mode.log"
MM_STATE_DIR=".aegis/brain/state/maintainer-grants"

mm_audit() {
    local decision="$1"
    local reason="$2"
    local nonce_short="$3"
    [[ -d "$(dirname "$MM_LOG")" ]] || return 0
    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
    echo "[${ts}] [PHASE2-${decision}] nonce=${nonce_short} tool=${TOOL} file=${FILE} reason=\"${reason}\"" >> "$MM_LOG" 2>/dev/null || true
}

if [[ -n "${AEGIS_MAINTAINER_MODE:-}" ]]; then
    # Parse token: split on '|' into path, nonce, expiry
    IFS='|' read -r MM_PATH MM_NONCE MM_EXPIRY <<< "${AEGIS_MAINTAINER_MODE}"
    MM_NONCE_SHORT="${MM_NONCE:0:8}"

    if [[ -z "${MM_PATH:-}" || -z "${MM_NONCE:-}" || -z "${MM_EXPIRY:-}" ]]; then
        # Malformed grant -- fail closed, fall through to normal blocking
        mm_audit "DENY" "malformed grant (expected <path>|<nonce>|<expiry>)" "${MM_NONCE_SHORT:-none}"
    elif ! [[ "$MM_EXPIRY" =~ ^[0-9]+$ ]]; then
        mm_audit "DENY" "malformed expiry (not epoch seconds)" "${MM_NONCE_SHORT}"
    else
        MM_NOW=$(date -u +%s 2>/dev/null || echo 0)
        MM_STATE_FILE="${MM_STATE_DIR}/${MM_NONCE}.used"

        # Derive repo-relative target for comparison against grant path
        # FILE may be absolute (e.g. /Users/.../AEGIS-Team/.claude/...) or relative.
        MM_REPO_ROOT="$(pwd)"
        MM_TARGET_REL="${FILE#${MM_REPO_ROOT}/}"

        if [[ "$MM_NOW" -gt "$MM_EXPIRY" ]]; then
            mm_audit "DENY" "grant expired ($((MM_NOW - MM_EXPIRY))s past expiry)" "${MM_NONCE_SHORT}"
        elif [[ -f "$MM_STATE_FILE" ]]; then
            mm_audit "DENY" "grant already consumed (one-shot)" "${MM_NONCE_SHORT}"
        elif [[ "$MM_TARGET_REL" != "$MM_PATH" && "$FILE" != "$MM_PATH" ]]; then
            mm_audit "DENY" "path mismatch (grant=${MM_PATH}, target=${MM_TARGET_REL})" "${MM_NONCE_SHORT}"
        else
            # All checks passed -- consume grant and allow write
            mkdir -p "$MM_STATE_DIR" 2>/dev/null || true
            echo "consumed=$(date -u +%s) tool=${TOOL} file=${FILE}" > "$MM_STATE_FILE" 2>/dev/null || true
            mm_audit "ALLOW" "grant consumed for ${MM_PATH}" "${MM_NONCE_SHORT}"
            # Skip all subsequent blocking categories -- maintainer authorized
            exit 0
        fi
    fi
fi

# ── Protected config patterns ─────────────────────────────────────────────
# Category 1: JavaScript/TypeScript lint + format configs
JS_PATTERNS=(
    ".eslintrc" "eslint.config."
    ".prettierrc" "prettier.config."
    "biome.json" "biome.jsonc"
    "tsconfig" "jsconfig.json"
)

# Category 2: Python lint + format configs
PY_PATTERNS=(
    "pyproject.toml"        # [tool.ruff] / [tool.black] / [tool.mypy]
    "ruff.toml" ".ruff.toml"
    ".flake8" "setup.cfg"
    "mypy.ini" ".mypy.ini"
    "tox.ini"
)

# Category 3: Go / Rust / other language configs
OTHER_PATTERNS=(
    "rustfmt.toml" ".rustfmt.toml"
    "clippy.toml" ".clippy.toml"
    ".golangci.yml" ".golangci.yaml"
    ".editorconfig"
)

# Category 4: Test runner strict configs
TEST_PATTERNS=(
    "jest.config." "vitest.config."
    "pytest.ini"
    "playwright.config."
)

ALL_PATTERNS=( "${JS_PATTERNS[@]}" "${PY_PATTERNS[@]}" "${OTHER_PATTERNS[@]}" "${TEST_PATTERNS[@]}" )

for pattern in "${ALL_PATTERNS[@]}"; do
    if [[ "$BASENAME" == *"$pattern"* ]]; then
        block "AEGIS Config Protection: '${BASENAME}' is a quality config file. Fix the code, not the rules. If this change is intentional (e.g. tightening rules, adding a new rule), ask the human to edit it directly — agents should not weaken quality gates to bypass failing builds."
    fi
done

# Category 5: AEGIS framework self-protection (never let agents edit hooks/settings mid-session)
# S3-03: .aegis/brain/design-library/ added for library immutability (per spec §8 Security).
# Agents must not modify reference library files in place — copy to project root and customize.
# ADR-004 maintainer-mode override still works for legitimate library updates by the human.
AEGIS_PATTERNS=(
    ".claude/settings.json"
    ".claude/settings.local.json"
    ".aegis/brain/design-library/"
)
for pattern in "${AEGIS_PATTERNS[@]}"; do
    if [[ "$FILE" == *"$pattern"* ]]; then
        block "AEGIS Self-Protection: '${FILE}' is part of the AEGIS framework. Mid-session edits to hooks/settings would destabilize the running session. Ask the human to make this change between sessions."
    fi
done

# Allow — log to activity.log (best-effort, don't fail if log missing)
LOG=".aegis/brain/logs/activity.log"
if [[ -f "$LOG" ]]; then
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
    SHORT_FILE=$(echo "$FILE" | head -c 120)
    echo "[${TIMESTAMP}] [HOOK:guard-write] ALLOW — ${TOOL} ${SHORT_FILE}" >> "$LOG" 2>/dev/null || true
fi

exit 0
