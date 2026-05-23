#!/usr/bin/env bash
# AEGIS Hook — guard-bash.sh
# Blocks dangerous Bash commands before execution (PreToolUse)
# Enforces Golden Rules 1-3 at the machine level
#
# Input:  JSON on stdin  { "tool_name": "Bash", "tool_input": { "command": "..." } }
# Output (modern, CC 2.1.141+ — default):
#   stdout: {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
#   exit 0
# Output (legacy, AEGIS_GUARD_LEGACY=1):
#   stdout: {"decision":"block","reason":"..."} + stderr reason text
#   exit 2

set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# v15-15: emit CC 2.1.141 permission-decision schema by default (exit 0,
# JSON-only, no stderr). The old `decision: block` + exit 2 + stderr
# combination made CC label the block as "Bash hook error" in red, even
# though the block was working as intended. Set AEGIS_GUARD_LEGACY=1 to
# opt back into the old dual-path behavior for older CC versions.
block() {
    local reason="$1"
    # JSON-escape the reason string (escape backslashes + double quotes).
    local escaped
    escaped=$(printf '%s' "$reason" | python3 -c '
import json, sys
print(json.dumps(sys.stdin.read())[1:-1], end="")
' 2>/dev/null || printf '%s' "$reason")

    if [[ "${AEGIS_GUARD_LEGACY:-}" == "1" ]]; then
        # Legacy dual-path: emit BOTH schemas + stderr + exit 2.
        printf '{"decision":"block","reason":"%s","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
            "$escaped" "$escaped"
        printf '%s\n' "$reason" >&2
        exit 2
    fi

    # Modern: JSON only, exit 0. CC 2.1.141+ uses the JSON to render the
    # permission-denied dialog; no "Bash hook error" red label.
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
        "$escaped"
    exit 0
}

# Strip quoted strings, heredoc bodies, and commit-message args before matching.
# Rationale: detection targets actually-executed commands. Quoted strings are
# arguments to commands like echo/printf/cat/git-commit-m — they are not
# commands themselves. Previously only heredocs + -m were stripped, which
# false-positived on `echo "git push --force"` etc.
SAFE_CMD=$(python3 -c "
import sys, re
cmd = sys.stdin.read()
# 1. Truncate at heredoc start (<<'WORD' or <<WORD) — body is documentation
cmd = re.sub(r'<<[^\s<>]+.*', '', cmd, flags=re.DOTALL)
# 2. Remove -m '...' and -m \"...\" inline commit messages (kept for safety
#    even though rule 3 below also handles it, in case of edge-case nesting)
cmd = re.sub(r'-m\s+([\'\"]).+?\1', '-m <msg>', cmd, flags=re.DOTALL)
# 3. Strip double-quoted string contents: \"anything including escapes\" → \"\"
cmd = re.sub(r'\"(?:[^\"\\\\]|\\\\.)*\"', '\"\"', cmd)
# 4. Strip single-quoted string contents: 'anything' → ''
#    (single quotes don't interpret escapes in bash, so simpler pattern)
cmd = re.sub(r\"'[^']*'\", \"''\", cmd)
# 5. NOTE: we deliberately do NOT strip \$(...) or backticks — those execute,
#    so dangerous patterns inside them SHOULD be caught.
print(cmd)
" <<< "$CMD" 2>/dev/null || echo "$CMD")

# ── Golden Rule 1: NEVER force-push ──────────────────────────────────────────
if echo "$SAFE_CMD" | grep -qE 'git push\s+(-f|--force)'; then
    block "AEGIS Golden Rule 1 violated: git push --force is banned. Use a branch + PR instead."
fi

# ── Golden Rule 2: warn on push to main (soft check — not all repos require PRs) ──
if echo "$SAFE_CMD" | grep -qE 'git push\s+(origin\s+)?main(\s|$)'; then
    echo "⚠️  AEGIS Golden Rule 2: pushing directly to main. Confirm this is intentional." >&2
    # Warn only — exit 0 allows it. Hard block is reserved for --force.
fi

# ── Golden Rule 3: NEVER amend commits ───────────────────────────────────────
if echo "$SAFE_CMD" | grep -qE 'git commit\s+.*--amend'; then
    block "AEGIS Golden Rule 3 violated: git commit --amend breaks all agents. Create a new commit."
fi

# ── Safety: no rm -rf on root/home ───────────────────────────────────────────
# Only match when rm appears at a command boundary (start, after &&/||/;/newline)
# This avoids false positives when rm -rf appears inside echo/cat arguments
if echo "$SAFE_CMD" | grep -qE '(^|&&|\|\||;|\n)\s*rm\s+-rf?\s+((/|/\*|~|~/)(\s|$)|/(bin|boot|etc|home|lib|proc|root|sbin|sys|usr|var)(/|\s|$))'; then
    block "AEGIS Safety: rm -rf on /, ~, or system dirs is catastrophically dangerous. Operation blocked. Safe targets like /tmp/foo, ./build are allowed."
fi

# ── Safety: no git reset --hard ──────────────────────────────────────────────
if echo "$SAFE_CMD" | grep -qE 'git reset\s+--hard'; then
    block "AEGIS Safety: git reset --hard destroys uncommitted work. Use git stash or create a backup commit first."
fi

# ── Safety: no git clean -f ──────────────────────────────────────────────────
if echo "$SAFE_CMD" | grep -qE 'git clean\s+-f'; then
    block "AEGIS Safety: git clean -f permanently deletes untracked files. Operation blocked."
fi

# ── ADR-004 Phase 2: block agent-originated AEGIS_MAINTAINER_MODE= sets ──
# The grant MUST be set by the human in their own terminal before Claude Code starts.
# Any agent-invoked bash that tries to export/inline-set the flag is an attempted
# self-grant and is denied. Matches: `AEGIS_MAINTAINER_MODE=...`, `export AEGIS_MAINTAINER_MODE=...`,
# `env AEGIS_MAINTAINER_MODE=...`. Does NOT block reads (echo/grep/cat).
if echo "$SAFE_CMD" | grep -qE '(^|[;&|()]\s*|\s)(export\s+|env\s+)?AEGIS_MAINTAINER_MODE='; then
    block "AEGIS ADR-004: agents may not set AEGIS_MAINTAINER_MODE. The grant must be issued by the human via tools/aegis-maintainer-grant.sh in their own terminal before launching Claude Code."
fi

# Allow — log to activity.log (best-effort, don't fail if log missing)
LOG=".aegis/brain/logs/activity.log"
if [[ -f "$LOG" ]]; then
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
    SHORT_CMD=$(echo "$CMD" | head -c 120 | tr '\n' ' ')
    echo "[${TIMESTAMP}] [HOOK:guard-bash] ALLOW — ${SHORT_CMD}" >> "$LOG" 2>/dev/null || true
fi

exit 0
