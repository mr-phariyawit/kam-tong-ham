#!/usr/bin/env bash
# daily-eod.sh — End-of-day capture for AEGIS-Plus pilot week.
#
# Prints today's activity summary, issue board, and appends a friction-log
# template to .aegis/brain/memory/aegis-plus-feedback.md.
#
# Usage:
#   bash tools/aegis-plus-pilot/daily-eod.sh <pilot-project-path>

set -euo pipefail

PILOT="${1:-$PWD}"
PILOT="$(cd "$PILOT" && pwd)" || { echo "no such dir: $1" >&2; exit 1; }

[[ -d "$PILOT/.aegis" ]] || { echo "$PILOT is not an AEGIS project" >&2; exit 1; }

cyan='\033[0;36m'; green='\033[0;32m'; yellow='\033[1;33m'; nc='\033[0m'
hr() { printf '%.0s─' {1..60}; echo ""; }

cd "$PILOT"

echo ""; hr
echo -e "${cyan}AEGIS-Plus Daily EOD — $(basename "$PILOT") — $(date -u +%Y-%m-%d)${nc}"
hr

echo -e "${green}1) Today's activity (top 50 lines):${nc}"
node tools/aegis-activity-logger/view.mjs --today --limit 50 2>/dev/null \
  || echo "  (view.mjs not yet installed — re-run bootstrap.sh)"
echo ""

echo -e "${green}2) This week's stats (day × tool grid):${nc}"
node tools/aegis-activity-logger/stats.mjs --week 2>/dev/null \
  || echo "  (stats.mjs not yet installed)"
echo ""

echo -e "${green}3) Open issues:${nc}"
node tools/aegis-issue-thread/issue.mjs list --status in_progress 2>/dev/null \
  || echo "  (issue.mjs not yet installed)"
node tools/aegis-issue-thread/issue.mjs list --status todo 2>/dev/null \
  || true
echo ""

echo -e "${green}4) Live-tail pane health:${nc}"
if [[ -p ".aegis/brain/live/current.fifo" ]]; then
    echo "  fifo present at .aegis/brain/live/current.fifo"
else
    echo -e "  ${yellow}fifo missing — pane likely closed; rerun: bash tools/aegis-live-tail/start.sh${nc}"
fi
echo ""

# Append friction template.
FB=".aegis/brain/memory/aegis-plus-feedback.md"
mkdir -p "$(dirname "$FB")"
TODAY="$(date -u +%Y-%m-%d)"
if grep -q "^## $TODAY$" "$FB" 2>/dev/null; then
    echo -e "${yellow}note:${nc} today's block ($TODAY) already exists in $FB — not duplicating."
else
    cat >> "$FB" <<EOF

## $TODAY
- ✅ what worked:
- ⚠️ friction:
- 💡 ideas:
- 🔍 Phase-2 signal seen today (prevented-incident / audit-query / run-replay):
EOF
    echo -e "${green}5) Friction-log template appended to $FB${nc}"
fi

echo ""
echo "Now open $FB and fill in today's block. Tomorrow morning: just keep working."
echo ""
