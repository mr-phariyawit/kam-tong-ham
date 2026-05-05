#!/usr/bin/env bash
# bootstrap.sh — Day-0 setup for the v11 Phase-1 pilot week.
#
# Installs AEGIS into the target pilot project, verifies all 4 v11 P1 skills
# landed, wires hooks, sets the issue prefix, and tells you how to start
# the live-tail pane.
#
# Usage:
#   bash tools/aegis-plus-pilot/bootstrap.sh <pilot-project-path>
#   bash tools/aegis-plus-pilot/bootstrap.sh ~/Documents/kam-tong-ham
#   bash tools/aegis-plus-pilot/bootstrap.sh --prefix KTH ~/Documents/kam-tong-ham
#
# Idempotent: safe to re-run; install.sh creates a timestamped backup.
# Refuses to bootstrap the meta source repo into itself.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

ISSUE_PREFIX=""
PILOT=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --prefix) ISSUE_PREFIX="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
            exit 0 ;;
        --*) echo "unknown flag: $1" >&2; exit 2 ;;
        *) PILOT="$1"; shift ;;
    esac
done

[[ -z "$PILOT" ]] && { echo "usage: $0 <pilot-project-path>" >&2; exit 2; }
PILOT="$(cd "$PILOT" && pwd 2>/dev/null)" || { echo "no such dir: $PILOT" >&2; exit 1; }

# Refuse self-bootstrap.
[[ "$PILOT" == "$META_DIR" ]] && { echo "refusing to bootstrap meta source ($META_DIR) into itself" >&2; exit 1; }

# Default issue prefix to project basename, uppercased, first 3 letters.
if [[ -z "$ISSUE_PREFIX" ]]; then
    base="$(basename "$PILOT")"
    ISSUE_PREFIX="$(echo "$base" | tr -dc '[:alnum:]' | tr '[:lower:]' '[:upper:]' | head -c 3)"
    [[ -z "$ISSUE_PREFIX" ]] && ISSUE_PREFIX="KTH"
fi

cyan='\033[0;36m'; green='\033[0;32m'; yellow='\033[1;33m'; nc='\033[0m'
info()    { echo -e "${cyan}[bootstrap]${nc} $*"; }
success() { echo -e "${green}[ok]${nc} $*"; }
warn()    { echo -e "${yellow}[warn]${nc} $*"; }

echo ""
info "META source: $META_DIR"
info "Pilot:       $PILOT"
info "Issue prefix: $ISSUE_PREFIX"
echo ""

# 1. Run install.sh --upgrade (uses upgrade mode if .aegis/ exists, else fresh install).
info "Step 1/4 — running install.sh"
PROJECT_NAME="$(basename "$PILOT")"
if [[ -d "$PILOT/.aegis" || -f "$PILOT/CLAUDE.md" ]]; then
    bash "$META_DIR/install.sh" --upgrade --target-dir "$PILOT" --project-name "$PROJECT_NAME" --profile standard
else
    bash "$META_DIR/install.sh" --target-dir "$PILOT" --project-name "$PROJECT_NAME" --profile standard
fi

# 2. Verify all 4 v11 P1 skills + tools landed.
info "Step 2/4 — verifying v11 Phase-1 artifacts"
missing=0
for f in skills/aegis-live-tail.md \
         skills/aegis-activity-logger.md \
         skills/aegis-issue-thread.md \
         skills/aegis-parallel-dispatch.md \
         tools/aegis-live-tail/emit.mjs \
         tools/aegis-live-tail/watch.mjs \
         tools/aegis-live-tail/start.sh \
         tools/aegis-activity-logger/log.mjs \
         tools/aegis-activity-logger/view.mjs \
         tools/aegis-activity-logger/stats.mjs \
         tools/aegis-issue-thread/issue.mjs \
         tools/aegis-parallel-dispatch/dispatch.mjs ; do
    if [[ ! -f "$PILOT/$f" ]]; then
        warn "missing: $f"; missing=$((missing+1))
    fi
done
[[ $missing -eq 0 ]] && success "all 12 v11 artifacts present" || { echo "missing $missing artifacts — abort" >&2; exit 1; }

# 3. Sanity-check hook wiring.
info "Step 3/4 — checking PostToolUse hook wiring"
if grep -qE 'aegis-live-tail/emit\.mjs' "$PILOT/.claude/settings.json" 2>/dev/null; then
    success "live-tail emit hook wired"
else
    warn "live-tail hook not found in $PILOT/.claude/settings.json — meta install.sh may be older than this skill set"
fi
if grep -qE 'aegis-activity-logger/log\.mjs' "$PILOT/.claude/settings.json" 2>/dev/null; then
    success "activity-logger hook wired"
else
    warn "activity-logger hook not found — manual wiring required (see skills/aegis-activity-logger.md)"
fi

# 4. Configure issue prefix + create live storage dirs.
info "Step 4/4 — configuring issue prefix + live storage"
mkdir -p "$PILOT/.aegis/brain/issues" \
         "$PILOT/.aegis/brain/live" \
         "$PILOT/.aegis/brain/activity" \
         "$PILOT/.aegis/brain/memory"
echo "prefix: $ISSUE_PREFIX" > "$PILOT/.aegis/brain/issues/_config.yaml"
success "issue prefix set: $ISSUE_PREFIX"

# Seed the friction log if absent.
FB="$PILOT/.aegis/brain/memory/aegis-plus-feedback.md"
if [[ ! -f "$FB" ]]; then
    cat > "$FB" <<EOF
# AEGIS-Plus Pilot Feedback — $(basename "$PILOT")

Pilot started: $(date -u +%Y-%m-%d)
v11 P1 skills active: live-tail / activity-logger / issue-thread / parallel-dispatch

Append one block per day. Run \`bash tools/aegis-plus-pilot/daily-eod.sh\` at end of day
to auto-append the boilerplate.

EOF
    success "seeded $FB"
fi

echo ""
success "Pilot ready. Next:"
echo "  cd $PILOT"
echo "  tmux new-session -s pilot   # or attach an existing one"
echo "  bash tools/aegis-live-tail/start.sh   # splits 70/30, watcher in bottom"
echo "  claude                                 # open Claude Code in top pane"
echo ""
echo "  At end of each day: bash $META_DIR/tools/aegis-plus-pilot/daily-eod.sh $PILOT"
echo "  On Day 7:           bash $META_DIR/tools/aegis-plus-pilot/gate-check.sh $PILOT"
echo ""
