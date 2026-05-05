#!/usr/bin/env bash
# AEGIS on-stop module: quality-check.sh
# Batched format/typecheck for files edited during this response.
# Sourced by on-stop.sh orchestrator.
#
# Required env: STOP_HOOK_ACTIVE, CLAUDE_SESSION_ID (optional)
# Output: stdout messages for user

quality_check() {
    if [[ "${STOP_HOOK_ACTIVE:-False}" == "True" ]]; then
        return 0
    fi

    local SESSION_ID="${CLAUDE_SESSION_ID:-default}"
    local ACC_FILE="/tmp/aegis-edits/${SESSION_ID}.txt"

    if [[ ! -f "$ACC_FILE" ]]; then
        return 0
    fi

    # Dedupe and extract file types we can check
    local ALL_FILES
    ALL_FILES=$(sort -u "$ACC_FILE" 2>/dev/null || true)
    local TS_FILES
    TS_FILES=$(echo "$ALL_FILES" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$' || true)
    local PY_FILES
    PY_FILES=$(echo "$ALL_FILES" | grep -E '\.py$' || true)

    local BATCH_COUNT
    BATCH_COUNT=$(echo "$ALL_FILES" | grep -c . 2>/dev/null || echo 0)

    if [[ "$BATCH_COUNT" -gt 0 ]]; then
        echo ""
        echo "AEGIS batched quality check (${BATCH_COUNT} file(s) edited this turn)..."

        # TS/JS: try biome, fall back to prettier + tsc
        if [[ -n "$TS_FILES" ]]; then
            if [[ -f "biome.json" || -f "biome.jsonc" ]] && command -v npx &>/dev/null; then
                echo "  -- biome check..."
                echo "$TS_FILES" | xargs npx --no-install biome check --write 2>&1 | tail -3 || true
            fi
            if [[ -f "tsconfig.json" ]] && command -v npx &>/dev/null; then
                echo "  -- tsc --noEmit..."
                npx --no-install tsc --noEmit 2>&1 | tail -5 || true
            fi
        fi

        # Python: try ruff, fall back silently
        if [[ -n "$PY_FILES" ]]; then
            if command -v ruff &>/dev/null; then
                echo "  -- ruff check..."
                echo "$PY_FILES" | xargs ruff check 2>&1 | tail -5 || true
            fi
        fi

        echo "  -- done"
    fi

    # Clean up accumulator for this session
    rm -f "$ACC_FILE" 2>/dev/null || true
}

# Allow direct invocation for testing
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    quality_check "$@"
fi
