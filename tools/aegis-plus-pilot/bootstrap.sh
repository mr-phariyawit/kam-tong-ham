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
info "Step 4/6 — configuring issue prefix + live storage"
mkdir -p "$PILOT/.aegis/brain/issues" \
         "$PILOT/.aegis/brain/live" \
         "$PILOT/.aegis/brain/activity" \
         "$PILOT/.aegis/brain/memory"
echo "prefix: $ISSUE_PREFIX" > "$PILOT/.aegis/brain/issues/_config.yaml"
success "issue prefix set: $ISSUE_PREFIX"

# 5. Self-heal: drop hook entries whose target file doesn't exist post-install
#    (Day-0 friction signal F1: pilots bootstrapped with older install.sh end up
#    with hooks referencing tools/aegis-token-profile.sh that was never copied,
#    producing non-blocking "No such file" noise on every Bash call.)
info "Step 5/6 — self-heal: scanning hooks for missing targets"
SETTINGS="$PILOT/.claude/settings.json"
if [[ -f "$SETTINGS" ]] && command -v python3 >/dev/null 2>&1; then
    HEAL_REPORT=$(PILOT="$PILOT" META="$META_DIR" python3 - "$SETTINGS" <<'PYEOF'
import json, os, re, shutil, sys
settings_path = sys.argv[1]
pilot = os.environ["PILOT"]
meta = os.environ["META"]
with open(settings_path) as f:
    s = json.load(f)
healed, dropped, copied = [], [], []
for event_name, event_entries in (s.get("hooks") or {}).items():
    for entry in event_entries or []:
        keep = []
        for h in entry.get("hooks") or []:
            cmd = h.get("command", "")
            # Extract any tools/<file>.{sh,mjs,js} or .claude/hooks/<file>.sh path
            m = re.findall(r'(tools/[^"\s)]+\.(?:sh|mjs|js)|\.claude/hooks/[^"\s)]+\.sh)', cmd)
            missing_targets = []
            for rel in m:
                if not os.path.isfile(os.path.join(pilot, rel)):
                    missing_targets.append(rel)
            if not missing_targets:
                keep.append(h)
                continue
            # Try self-heal: copy from meta if it exists there
            healed_all = True
            for rel in missing_targets:
                meta_src = os.path.join(meta, rel)
                pilot_dst = os.path.join(pilot, rel)
                if os.path.isfile(meta_src):
                    os.makedirs(os.path.dirname(pilot_dst), exist_ok=True)
                    shutil.copy2(meta_src, pilot_dst)
                    os.chmod(pilot_dst, 0o755)
                    copied.append(rel)
                else:
                    healed_all = False
            if healed_all:
                keep.append(h)
                healed.append(cmd[:60])
            else:
                dropped.append({"event": event_name, "matcher": entry.get("matcher", ""), "cmd": cmd[:60]})
        entry["hooks"] = keep
with open(settings_path, "w") as f:
    json.dump(s, f, indent=2)
    f.write("\n")
print(f"copied={len(copied)} healed={len(healed)} dropped={len(dropped)}")
for d in dropped:
    print(f"  dropped: [{d['event']}:{d['matcher']}] {d['cmd']}...", file=sys.stderr)
for c in copied:
    print(f"  copied:  {c}", file=sys.stderr)
PYEOF
2>&1)
    success "$HEAL_REPORT"
else
    warn "settings.json or python3 missing — skipping self-heal"
fi

# 6. If pilot is a git repo, untrack runtime brain dirs that should be ignored
#    (Day-0 friction signal F3: pre-v12-04 bootstraps tracked .aegis/brain/{activity,
#    runs,logs,state}/, causing every hook write to race with merges.)
info "Step 6/6 — untracking runtime brain dirs (if tracked)"
if [[ -d "$PILOT/.git" ]]; then
    UNTRACK_PATHS=(
        ".aegis/brain/activity"
        ".aegis/brain/runs"
        ".aegis/brain/logs"
        ".aegis/brain/state"
    )
    untracked_count=0
    for p in "${UNTRACK_PATHS[@]}"; do
        # Only attempt if there are tracked files at this path
        if (cd "$PILOT" && git ls-files --error-unmatch "$p" >/dev/null 2>&1); then
            (cd "$PILOT" && git rm --cached -rq "$p" 2>/dev/null) && untracked_count=$((untracked_count+1))
        fi
    done
    # Ensure entries are in .gitignore.
    # Use anchored regex so e.g. ".aegis/brain/logs/*.log" doesn't make us
    # think ".aegis/brain/logs/" is already there. Also disable any explicit
    # "!<path>/<file>" re-include lines that would undo our intent (this was
    # the bug that let kam-tong-ham re-track activity.log after F3).
    GI="$PILOT/.gitignore"
    for p in "${UNTRACK_PATHS[@]}"; do
        line="$p/"
        if [[ -f "$GI" ]]; then
            if ! grep -qE "^${line}$" "$GI"; then
                echo "$line" >> "$GI"
            fi
            if grep -qE "^!${p}/" "$GI"; then
                sed -i.bak "s|^!${p}/|# disabled-by-bootstrap: !${p}/|g" "$GI"
                rm -f "$GI.bak"
            fi
        fi
    done
    if [[ $untracked_count -gt 0 ]]; then
        success "untracked $untracked_count runtime dir(s); .gitignore updated. Commit the change to make it permanent."
    else
        success "no tracked runtime dirs found (already clean)"
    fi
else
    info "pilot is not a git repo — skipping untrack"
fi

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
