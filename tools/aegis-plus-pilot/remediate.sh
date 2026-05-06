#!/usr/bin/env bash
# remediate.sh — apply Day-0 friction fixes (F1 + F3) to an already-bootstrapped pilot
# without re-running the full bootstrap.
#
# Idempotent: safe to re-run. Reports what changed.
#
# Fixes:
#   F1 — drop or self-heal settings.json hooks whose target file is missing
#        (e.g. tools/aegis-token-profile.sh wired but not copied)
#   F3 — git rm --cached the runtime brain dirs (.aegis/brain/{activity,runs,
#        logs,state}/) and add them to .gitignore so future hook writes don't
#        race with merges.
#
# Usage:
#   bash tools/aegis-plus-pilot/remediate.sh <pilot-project-path>
#
# Exit codes:
#   0 — done (any combination of fixes applied or already-clean)
#   1 — pilot path invalid / not an AEGIS install
#   2 — script error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

PILOT="${1:-}"
if [[ -z "$PILOT" ]]; then
    echo "usage: $0 <pilot-project-path>" >&2
    exit 1
fi
PILOT="$(cd "$PILOT" && pwd 2>/dev/null)" || { echo "no such dir: $1" >&2; exit 1; }
[[ -d "$PILOT/.aegis" ]] || { echo "$PILOT is not an AEGIS install (no .aegis/)" >&2; exit 1; }
[[ "$PILOT" == "$META_DIR" ]] && { echo "refusing to remediate meta source ($META_DIR) into itself" >&2; exit 1; }

cyan='\033[0;36m'; green='\033[0;32m'; yellow='\033[1;33m'; nc='\033[0m'
info()    { echo -e "${cyan}[remediate]${nc} $*"; }
success() { echo -e "${green}[ok]${nc} $*"; }
warn()    { echo -e "${yellow}[warn]${nc} $*"; }

echo ""
info "META source: $META_DIR"
info "Pilot:       $PILOT"
echo ""

# ── Fix F1: self-heal settings.json hooks ─────────────────────────────────
info "F1 — scanning hooks for missing targets"
SETTINGS="$PILOT/.claude/settings.json"
if [[ -f "$SETTINGS" ]] && command -v python3 >/dev/null 2>&1; then
    F1_REPORT=$(PILOT="$PILOT" META="$META_DIR" python3 - "$SETTINGS" <<'PYEOF'
import json, os, re, shutil, sys
settings_path = sys.argv[1]
pilot = os.environ["PILOT"]
meta = os.environ["META"]
with open(settings_path) as f:
    s = json.load(f)
copied, dropped = [], []
for event_name, event_entries in (s.get("hooks") or {}).items():
    for entry in event_entries or []:
        keep = []
        for h in entry.get("hooks") or []:
            cmd = h.get("command", "")
            m = re.findall(r'(tools/[^"\s)]+\.(?:sh|mjs|js)|\.claude/hooks/[^"\s)]+\.sh)', cmd)
            missing_targets = [rel for rel in m if not os.path.isfile(os.path.join(pilot, rel))]
            if not missing_targets:
                keep.append(h)
                continue
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
            else:
                dropped.append({"event": event_name, "matcher": entry.get("matcher", ""), "cmd": cmd[:80]})
        entry["hooks"] = keep
# Backup before write
backup = settings_path + f".pre-remediate.{int(__import__('time').time())}.bak"
shutil.copy2(settings_path, backup)
with open(settings_path, "w") as f:
    json.dump(s, f, indent=2)
    f.write("\n")
print(f"copied={len(copied)} dropped={len(dropped)} backup={backup}")
for d in dropped:
    print(f"  dropped: [{d['event']}:{d['matcher']}] {d['cmd']}...")
for c in copied:
    print(f"  copied:  {c}")
PYEOF
)
    success "$F1_REPORT"
else
    warn "settings.json or python3 missing — skipping F1"
fi

# ── Fix F3: untrack runtime brain dirs ─────────────────────────────────────
info "F3 — untracking runtime brain dirs (if tracked)"
if [[ -d "$PILOT/.git" ]]; then
    UNTRACK_PATHS=(
        ".aegis/brain/activity"
        ".aegis/brain/runs"
        ".aegis/brain/logs"
        ".aegis/brain/state"
    )
    untracked_count=0
    untracked_files=0
    for p in "${UNTRACK_PATHS[@]}"; do
        if (cd "$PILOT" && git ls-files --error-unmatch "$p" >/dev/null 2>&1); then
            count=$(cd "$PILOT" && git ls-files "$p" | wc -l | tr -d ' ')
            (cd "$PILOT" && git rm --cached -rq "$p" 2>/dev/null) && {
                untracked_count=$((untracked_count+1))
                untracked_files=$((untracked_files + count))
                info "  untracked $count file(s) under $p/"
            }
        fi
    done
    GI="$PILOT/.gitignore"
    gi_added=0
    gi_unignored=0
    for p in "${UNTRACK_PATHS[@]}"; do
        line="$p/"
        unignore_line="!$p/"
        if [[ -f "$GI" ]]; then
            # Use anchored regex (line-start + line-end) so e.g. "$p/*.log"
            # does NOT count as having "$p/" — that was the bug that let
            # kam-tong-ham keep tracking .aegis/brain/logs/activity.log via
            # an explicit `!` re-include from an old install.sh template.
            if ! grep -qE "^${line}$" "$GI"; then
                echo "$line" >> "$GI"
                gi_added=$((gi_added+1))
            fi
            # Strip any explicit re-include lines for files under this dir
            # (e.g. "!.aegis/brain/logs/activity.log") — they undo our intent.
            if grep -qE "^!${p}/" "$GI"; then
                # Comment out rather than delete, so operators can audit later
                sed -i.bak "s|^!${p}/|# disabled-by-remediate: !${p}/|g" "$GI"
                rm -f "$GI.bak"
                gi_unignored=$((gi_unignored+1))
            fi
        fi
    done
    if [[ $untracked_count -gt 0 || $gi_added -gt 0 || $gi_unignored -gt 0 ]]; then
        success "untracked $untracked_count dir(s) ($untracked_files files); added $gi_added line(s); disabled $gi_unignored re-include line(s) in .gitignore"
        warn "you must commit this change manually:"
        echo "    cd $PILOT && git add .gitignore && git commit -m 'chore: untrack runtime brain dirs (pilot remediation F3)'"
    else
        success "F3: nothing to untrack (already clean)"
    fi
else
    info "pilot is not a git repo — skipping F3"
fi

echo ""
success "Remediation complete. Pilot: $PILOT"
