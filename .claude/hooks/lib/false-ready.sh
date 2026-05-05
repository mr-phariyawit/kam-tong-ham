#!/usr/bin/env bash
# AEGIS on-stop module: false-ready.sh
# Golden Rule #4: false-ready guard.
# Scans transcript for Agent tool_use entries without matching tool_result.
# Sourced by on-stop.sh orchestrator.
#
# Args: $1 = transcript_path, $2 = activity log path
# Output: stdout warning/violation banners

false_ready_check() {
    local TRANSCRIPT_PATH="${1:-}"
    local LOG="${2:-}"

    if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]]; then
        return 0
    fi

    local FR_RESULT
    FR_RESULT=$(python3 - "$TRANSCRIPT_PATH" <<'PYEOF' 2>/dev/null || echo "error"
import sys, json, re
try:
    with open(sys.argv[1]) as f:
        lines = f.readlines()
    tool_uses = {}   # id -> {name, desc}
    tool_results = set()
    last_text = ''
    for line in lines:
        try:
            e = json.loads(line)
        except Exception:
            continue
        msg = e.get('message', {})
        content = msg.get('content', [])
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get('type', '')
            if btype == 'tool_use' and block.get('name') in ('Task', 'Agent'):
                ti = block.get('input', {}) or {}
                tool_uses[block.get('id', '')] = {
                    'name': block.get('name'),
                    'desc': (ti.get('description') or ti.get('subagent_type') or '?')[:40],
                }
            elif btype == 'tool_result':
                tool_results.add(block.get('tool_use_id', ''))
            elif btype == 'text':
                last_text = block.get('text', '')  # keep updating; last wins
    unmatched = [(uid, meta) for uid, meta in tool_uses.items() if uid not in tool_results]
    if not unmatched:
        print('clean')
        sys.exit(0)
    # Check for completion-claim text in last assistant turn
    claim_patterns = [
        r'\b(all\s+)?done\b',
        r'\bcomplete[d]?\b',
        r'\bfinished\b',
        r'\bshipped\b',
        r'\bready\s+to\s+(ship|merge|deploy)\b',
        r'\bpipeline\s+complete\b',
        r'✅',  # checkmark
    ]
    tail = last_text[-1500:]
    has_claim = any(re.search(p, tail, re.IGNORECASE) for p in claim_patterns)
    first_desc = unmatched[0][1]['desc'] if unmatched else ''
    sev = 'violation' if has_claim else 'warning'
    print(f'{sev}|{len(unmatched)}|{has_claim}|{first_desc}')
except Exception as ex:
    print('error:' + str(ex)[:80])
PYEOF
)

    case "$FR_RESULT" in
        violation\|*|warning\|*)
            local SEV CNT CLAIM DESC SEV_UPPER
            SEV=$(echo "$FR_RESULT" | cut -d'|' -f1)
            CNT=$(echo "$FR_RESULT" | cut -d'|' -f2)
            CLAIM=$(echo "$FR_RESULT" | cut -d'|' -f3)
            DESC=$(echo "$FR_RESULT" | cut -d'|' -f4)
            SEV_UPPER=$(echo "$SEV" | tr '[:lower:]' '[:upper:]')
            if [[ -n "$LOG" && -f "$LOG" ]]; then
                local TS
                TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
                echo "[${TS}] [HOOK:on-stop] FALSE_READY_${SEV_UPPER} -- ${CNT} unmatched Agent tool_use (no result); completion_claim=${CLAIM}; first=\"${DESC}\"" >> "$LOG" 2>/dev/null || true
            fi
            echo ""
            if [[ "$SEV" == "violation" ]]; then
                echo "AEGIS FALSE-READY GUARD -- Golden Rule #4 violation"
                echo ""
                echo "  ${CNT} spawned agent(s) have NO tool_result, yet the"
                echo "  last response contains a completion claim (done/shipped/"
                echo "  ready). Orchestrator declared success with agents still"
                echo "  running. This is the false-ready pattern Rule #4 bans."
                echo ""
                echo "  First unmatched: ${DESC}"
                echo "  Logged to: .aegis/brain/logs/activity.log"
            else
                echo "AEGIS false-ready check -- unmatched agent(s)"
                echo ""
                echo "  ${CNT} spawned agent(s) have no tool_result in the"
                echo "  transcript. This may be OK (background run still pending,"
                echo "  or Ctrl+C interrupt) -- but verify before closing session."
                echo ""
                echo "  First unmatched: ${DESC}"
            fi
            ;;
    esac
}

# Allow direct invocation for testing
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    false_ready_check "$@"
fi
