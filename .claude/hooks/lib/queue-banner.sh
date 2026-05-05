#!/usr/bin/env bash
# AEGIS on-stop module: queue-banner.sh
# Displays session-end banners: human queue, instinct reinforce,
# progress bar, team chat tail, and retro reminder.
# Sourced by on-stop.sh orchestrator.
#
# Required env: LOG (activity log path)
# Output: stdout banners for user

show_instinct_reinforce() {
    if [[ -x "tools/aegis-instinct-auto-reinforce.sh" ]]; then
        echo ""
        echo "Instinct auto-reinforce..."
        bash tools/aegis-instinct-auto-reinforce.sh 2>/dev/null || true
    fi
}

show_human_queue() {
    local QUEUE=".aegis/brain/human-queue.md"
    if [[ ! -f "$QUEUE" ]]; then
        return 0
    fi

    local PENDING_COUNT
    PENDING_COUNT=$(python3 -c "
import re
with open('$QUEUE') as f:
    c = f.read()
m = re.search(r'<!-- PENDING_START -->(.*?)<!-- PENDING_END -->', c, re.DOTALL)
if m:
    inner = m.group(1)
    print(len(re.findall(r'^### \[', inner, re.MULTILINE)))
else:
    print(0)
" 2>/dev/null || echo "0")

    if [[ "$PENDING_COUNT" -gt 0 ]]; then
        echo ""
        echo "HUMAN QUEUE -- ${PENDING_COUNT} pending item(s)"
        echo "---"
        python3 <<PYEOF
import re
with open('$QUEUE') as f:
    c = f.read()
m = re.search(r'<!-- PENDING_START -->(.*?)<!-- PENDING_END -->', c, re.DOTALL)
if m:
    for entry in re.finditer(r'### \[(\d{4}-\d{2}-\d{2})\] (\w+) — (.+?) / (.+?)$', m.group(1), re.MULTILINE):
        date, cat, en, th = entry.groups()
        print(f"  [{cat}] {en}")
        print(f"  [{cat}] {th}")
        print()
PYEOF
        echo "  See: .aegis/brain/human-queue.md"
        echo "---"
    fi
}

show_progress() {
    if [[ -x "tools/aegis-progress.sh" ]]; then
        echo ""
        bash tools/aegis-progress.sh --bar 2>/dev/null || true
    fi
}

show_team_chat() {
    local CHAT_TODAY=".aegis/brain/conversations/$(date -u +%Y-%m-%d)/chat.log"
    if [[ ! -f "$CHAT_TODAY" ]]; then
        return 0
    fi

    local CHAT_COUNT
    CHAT_COUNT=$(wc -l < "$CHAT_TODAY" | tr -d ' ')
    if [[ "$CHAT_COUNT" -gt 0 ]]; then
        echo ""
        echo "Team chat (last 5 of $CHAT_COUNT today)"
        echo "---"
        tail -5 "$CHAT_TODAY" | python3 -c "
import sys, json
icons = {'DISPATCH':'>>','REPORT':'<<','VERDICT':'==','QUESTION':'??','ANSWER':'!!','STATUS':'..','HANDOFF':'->','BLOCKED':'XX','NOTE':'--'}
for line in sys.stdin:
    try:
        e = json.loads(line)
        icon = icons.get(e.get('type','NOTE'), '*')
        time = e.get('ts','')[11:19]
        task = f\"[{e['task']}] \" if e.get('task') else ''
        msg = (e.get('msg','')[:50]).ljust(50)
        print(f' {icon} {time} {e[\"from\"][:12]:<12} > {e[\"to\"][:12]:<12} {task}{msg}')
    except Exception:
        continue
" 2>/dev/null || true
        echo "---"
    fi
}

show_retro_reminder() {
    echo ""
    echo "AEGIS -- Session Ending"
    echo ""
    echo "  Golden Rule 6: Run /aegis-retro before you leave"
    echo "  This saves lessons, updates resonance, and logs"
    echo "  a handoff for the next session."
    echo ""
    echo "  > /aegis-retro"
}

# Allow direct invocation for testing
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    show_instinct_reinforce
    show_human_queue
    show_progress
    show_team_chat
    show_retro_reminder
fi
