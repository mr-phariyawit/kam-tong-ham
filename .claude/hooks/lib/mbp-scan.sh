#!/usr/bin/env bash
# AEGIS on-stop module: mbp-scan.sh
# Master Brain Protocol violation scanner.
# Scans the last assistant message for option-menu and soft-ask patterns.
# Sourced by on-stop.sh orchestrator.
#
# Required env: STOP_HOOK_ACTIVE (optional), AEGIS_MBP_BLOCK_DISABLE (optional)
# Args: $1 = transcript_path, $2 = activity log path
# Output: stdout JSON (decision:block) if violation found, stderr warnings
# Returns: 0 = clean or logged, 1 = violation blocked

mbp_scan() {
    local TRANSCRIPT_PATH="${1:-}"
    local LOG="${2:-}"

    if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]]; then
        return 0
    fi

    local MBP_VIOLATION
    MBP_VIOLATION=$(python3 - "$TRANSCRIPT_PATH" <<'PYEOF' 2>/dev/null || echo "error"
import sys, json, re
try:
    with open(sys.argv[1]) as f:
        lines = f.readlines()
    # Find the very last assistant text turn
    last_text = ''
    for line in reversed(lines):
        try:
            e = json.loads(line)
        except Exception:
            continue
        if e.get('type') == 'assistant' or (e.get('message', {}).get('role') == 'assistant'):
            msg = e.get('message', {})
            content = msg.get('content', [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get('type') == 'text':
                        last_text = block.get('text', '')
                        break
            elif isinstance(content, str):
                last_text = content
            if last_text:
                break
    if not last_text:
        print('no_text')
        sys.exit(0)
    # Scan last 2000 chars for option-menu patterns
    tail = last_text[-2000:]
    # The very tail (last 400 chars) is where the actionable end-of-response
    # decision-handoff lives — a question or "what next?" buried mid-message
    # is usually rhetorical; one in the closing paragraph is the violation.
    closing = last_text[-400:]
    option_patterns = [
        r'Options?:\s*\n\s*[-\*]\s*["\x27]',
        r'Options?:\s*\n\s*A\s*[\)\.]',
        r'\n\s*A\)\s*.+?\n\s*B\)',
        r'\n\s*1\.\s*.+?\n\s*2\.\s*.+?\n\s*3\.',
        # "X หรือ Y หรือ Z" in close — Thai option enumeration
        r'\S+\s+หรือ\s+\S+\s+หรือ\s+\S+',
        # "X / Y / Z" closing pick-list with a question
        r'\S+\s*[·•/]\s*\S+\s*[·•/]\s*\S+\s*\?',
    ]
    open_patterns = [
        r'\?\s*$',
        r'(what|which|how).{0,40}(do you|would you|should).{0,60}\?',
        r'(let me know|tell me|your call)',
    ]
    # SOFT-ASK patterns: agent hands the next operational action back to the
    # human (= board) instead of executing it or routing through Nick Fury
    # (= CEO). Per user 2026-05-07 feedback: the recurring regression is
    # that mbp-scan was English-only and AND-gated, so common Thai/prose
    # endings like "ต้องการอะไรต่อ — X หรือ Y" slipped through.
    soft_ask_patterns = [
        # JingJai-style aegis recommendations (v10-04 original)
        r'recommend\s+(running\s+)?[\\\/]?aegis-',
        r'recommend\s+\w+\s+after\s+you',
        r'natural\s+(continuation|next\s+step|next\s+sprint)',
        r'next\s+chain\s+step\s*:',
        r'(sprint\s+\d+\s+planning|planning\s+(is|would\s+be))\s+the\s+natural',
        r'after\s+you\s+(decide|confirm|approve|review)\s+(on\s+)?the',
        # English "what next" decision-handoff (added 2026-05-07)
        r'what\s+(would\s+you\s+like|do\s+you\s+want|should\s+(i|we)\s+do)\s+(to\s+do\s+)?next\s*\??',
        r"(what's|whats)\s+next\s*\??",
        r'next\s+action\s*\??',
        r'pick\s+(by\s+name|one|any)',
        r'anything\s+else',
        r'your\s+call\s*[—\-:]',
        r'let\s+me\s+know\s+(if|when|what)',
        # Thai equivalents (added 2026-05-07 — the actual phrasing the agent
        # keeps regressing to despite multiple memory entries)
        r'ต้องการ.{0,20}อะไร.{0,5}ต่อ',           # ต้องการอะไรต่อ / ต้องการให้ทำอะไรต่อ
        r'(ต่อไป|ทำ).{0,5}(จะ)?\s*ทำ\s*อะไร\s*(ต่อ|ดี)?',  # ต่อไปจะทำอะไร / จะทำอะไรต่อ
        r'อยาก.{0,15}(ทำ|ให้ทำ).{0,15}อะไร',         # อยากให้ทำอะไรต่อ / อยากทำอะไร
        r'(ทำ|จัดการ|ไป).{0,5}อันไหน.{0,20}(ก่อน|ดี)',  # ทำอันไหนก่อน / จัดการอันไหนดี
        r'(เลือก|pick).{0,15}(ตาม|by).{0,5}(ใจ|name|อารมณ์)',  # เลือกตามใจ / pick by name
        r'หรือ.{0,5}มี.{0,15}อย่างอื่น',                 # หรือมีอย่างอื่นค้าง
        r'พิมพ์.{0,30}(imperative|by-name|ตรง.?ๆ)',       # พิมพ์ imperative ตรง ๆ
        r'จะให้ผม.{0,15}ทำ\s*(อะไร|อันไหน)',             # จะให้ผมทำอะไร / ทำอันไหน
        # Round 2 — caught me 2026-05-07 right after PR #135 shipped
        r'บอก\s*ผม',                                  # "บอกผม → ผมจะ..." soft handoff
        r'ถ้า.{0,30}เจอ.{0,40}(บอก|พิมพ์|ส่ง)',        # "ถ้ายังเจอ X — บอกผม"
        r'→\s*ผม.{0,30}จะ',                           # "→ ผมจะเพิ่ม X" arrow-conditional
        r'ถ้า.{0,40}(อยากให้|ต้องการให้)\s*ผม',         # "ถ้าอยากให้ผม..."
    ]
    has_option = any(re.search(p, tail, re.IGNORECASE|re.MULTILINE) for p in option_patterns)
    has_open = any(re.search(p, tail.strip(), re.IGNORECASE|re.MULTILINE) for p in open_patterns)
    has_soft_ask = any(re.search(p, tail, re.IGNORECASE|re.MULTILINE) for p in soft_ask_patterns)
    # Closing-only versions — looser threshold for the very tail of message
    closing_open = any(re.search(p, closing.strip(), re.IGNORECASE|re.MULTILINE) for p in open_patterns)
    closing_soft = any(re.search(p, closing, re.IGNORECASE|re.MULTILINE) for p in soft_ask_patterns)
    # Three ways to fire:
    #   1. Classic A/B menu + open question (original v10-04 trigger)
    #   2. Soft-ask phrase anywhere (English or Thai)
    #   3. Open-ended question in the very closing paragraph (decision-handoff)
    #      AND not just rhetorical — must combine with "หรือ" / option list / soft-ask
    if (has_option and has_open) or has_soft_ask or (closing_open and closing_soft):
        print('violation')
    else:
        print('clean')
except Exception as ex:
    print('error:' + str(ex)[:80])
PYEOF
)

    if [[ "$MBP_VIOLATION" == "violation" ]]; then
        if [[ -n "$LOG" && -f "$LOG" ]]; then
            local TS
            TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
            echo "[${TS}] [HOOK:on-stop] MBP_VIOLATION_BLOCKED -- option menu detected, hook returning decision=block (Golden Rule #7)" >> "$LOG" 2>/dev/null || true
        fi

        # HARD BLOCK unless disabled
        if [[ "${AEGIS_MBP_BLOCK_DISABLE:-0}" == "1" ]] || [[ "${STOP_HOOK_ACTIVE:-False}" == "True" ]]; then
            echo "" >&2
            echo "AEGIS MBP CHECK -- option menu detected (logged, NOT blocked: AEGIS_MBP_BLOCK_DISABLE=1 or stop_hook_active)" >&2
        else
            cat <<'BLOCK_JSON'
{
  "decision": "block",
  "reason": "AEGIS MBP Golden Rule #7 violation — your last response ended with an option menu (A/B/C/numbered list) PLUS an open question to the human. This is the #1 observed MBP failure pattern. You MUST NOT ask the human to pick from a menu. Instead, do ONE of these and produce a NEW response that takes action: (1) Decide autonomously per the Decision Matrix and execute the chosen path. (2) Route the question through Nick Fury via QUESTION_TO_BRAIN — he scans state and decides. (3) If it is genuinely Identity / Irreversible-scope / External-access / Explicit-approval-gate, write to .aegis/brain/human-queue.md via tools/aegis-queue-human.sh and CONTINUE with everything else you can do. The current option-menu response was already shown to the user; produce a corrective response that picks one path and acts. To bypass this block for a legitimate menu (rare — e.g., literal slash-command output), set AEGIS_MBP_BLOCK_DISABLE=1."
}
BLOCK_JSON
            return 1
        fi
    fi

    return 0
}

# Allow direct invocation for testing
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    mbp_scan "$@"
fi
