#!/usr/bin/env bash
# AEGIS Hook — guard-ask-user.sh (PreToolUse on AskUserQuestion)
# Enforces Golden Rule #7 / Master Brain Protocol at the tool level.
#
# Rule: non-Nick-Fury agents MUST NOT invoke AskUserQuestion directly.
# All decisions route through Nick Fury via QUESTION_TO_BRAIN.
#
# Detection strategy:
#   1. Read transcript_path from hook input
#   2. Scan recent transcript for the most recent agent identity marker
#   3. If recent subagent context is nick-fury → allow
#   4. If recent context is main-session OR non-nick-fury subagent → block with MBP reminder
#
# Escape hatch: AEGIS_ALLOW_ASK_USER=1 bypasses the check (for Nick Fury's
# legitimate escalation of the 4 allowed categories, or for debugging).
#
# Input:  JSON on stdin  { "tool_name": "AskUserQuestion", "tool_input": {...}, "transcript_path": "..." }
# Output: JSON on stdout { "decision": "block", "reason": "..." } with exit 2 to block

set -euo pipefail

INPUT=$(cat)

# ── Escape hatch for Nick Fury's legitimate escalation ──────────────────────
if [[ "${AEGIS_ALLOW_ASK_USER:-0}" == "1" ]]; then
    exit 0
fi

# ── Parse hook input ─────────────────────────────────────────────────────────
TRANSCRIPT_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transcript_path', ''))" 2>/dev/null || echo "")
QUESTION_TEXT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    # AskUserQuestion schemas vary; grab whatever text field exists
    for k in ('question', 'questions', 'text', 'prompt'):
        v = ti.get(k)
        if v:
            print(str(v)[:300])
            break
except Exception:
    pass
" 2>/dev/null || echo "")

# ── Log every AskUserQuestion attempt ────────────────────────────────────────
LOG=".aegis/brain/logs/activity.log"
if [[ -f "$LOG" ]]; then
    TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
    SHORT_Q=$(echo "$QUESTION_TEXT" | head -c 120 | tr '\n' ' ')
    echo "[${TS}] [HOOK:guard-ask-user] AskUserQuestion invoked — q='${SHORT_Q}'" >> "$LOG" 2>/dev/null || true
fi

# ── Detect caller context via transcript ─────────────────────────────────────
# Scan last ~200 lines of the transcript for subagent markers.
# If we see "subagent_type":"nick-fury" or an active nick-fury spawn recently,
# we assume Nick Fury is the legitimate caller. Otherwise, we block.
CALLER="unknown"
if [[ -n "$TRANSCRIPT_PATH" && -f "$TRANSCRIPT_PATH" ]]; then
    CALLER=$(python3 -c "
import sys, json
try:
    with open('$TRANSCRIPT_PATH') as f:
        lines = f.readlines()
    # Walk back from the end; find the most recent subagent spawn signal.
    tail = lines[-400:]
    caller = 'main'
    for line in reversed(tail):
        try:
            e = json.loads(line)
        except Exception:
            continue
        # Look for Task/Agent tool spawn
        msg = e.get('message', {})
        content = msg.get('content', [])
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    ti = block.get('input', {}) or {}
                    st = ti.get('subagent_type') or ti.get('subagentType')
                    if st:
                        caller = str(st)
                        break
            if caller != 'main':
                break
    print(caller)
except Exception:
    print('unknown')
" 2>/dev/null || echo "unknown")
fi

# ── Decide ───────────────────────────────────────────────────────────────────
if [[ "$CALLER" == "nick-fury" ]]; then
    # Nick Fury is the legitimate escalator — allow
    if [[ -f "$LOG" ]]; then
        TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
        echo "[${TS}] [HOOK:guard-ask-user] ALLOW — caller=nick-fury (legitimate escalation)" >> "$LOG" 2>/dev/null || true
    fi
    exit 0
fi

# Block — main agent or non-Nick-Fury subagent
REASON="AEGIS Golden Rule #7 (Master Brain Protocol): ${CALLER} is not permitted to call AskUserQuestion. Agents must route decisions through Nick Fury via QUESTION_TO_BRAIN format (see .claude/references/context-rules.md). If this is Nick Fury legitimately escalating one of the 4 allowed categories (Identity/Irreversible scope/External access/Explicit approval gate), set AEGIS_ALLOW_ASK_USER=1 in the environment before invoking. Detected caller: ${CALLER}."

if [[ -f "$LOG" ]]; then
    TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
    echo "[${TS}] [HOOK:guard-ask-user] BLOCK — caller=${CALLER} (MBP violation)" >> "$LOG" 2>/dev/null || true
fi

# Emit block decision
python3 -c "
import json
print(json.dumps({'decision': 'block', 'reason': '''$REASON'''}))
" 2>/dev/null || echo "{\"decision\":\"block\",\"reason\":\"${REASON}\"}"

exit 2
