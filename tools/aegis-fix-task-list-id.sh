#!/usr/bin/env bash
# aegis-fix-task-list-id.sh — give each project its own Claude Code task list
#
# ROOT CAUSE:
#   AEGIS's .claude/settings.json hardcodes CLAUDE_CODE_TASK_LIST_ID to the
#   literal string "aegis-shared-tasks". Every project that installed AEGIS
#   inherited this verbatim, causing them all to read/write the SAME task
#   list at ~/.claude/tasks/aegis-shared-tasks/. Tasks from DriveWiki-MCP
#   leak into AEGIS-Team and RizzLab sessions (and vice versa).
#
# FIX:
#   Rewrite CLAUDE_CODE_TASK_LIST_ID to a project-specific slug derived
#   from the project directory basename (e.g. "aegis-tasks-drivewiki-mcp").
#   Isolates each project's task list.
#
# USAGE:
#   tools/aegis-fix-task-list-id.sh                      # fix current repo
#   tools/aegis-fix-task-list-id.sh --target-dir <path>  # fix specific project
#   tools/aegis-fix-task-list-id.sh --quiet              # for install.sh integration
#   tools/aegis-fix-task-list-id.sh --id <custom-id>     # override slug
#
# SAFETY:
#   - Timestamped backup: .claude/settings.json.pre-task-id-fix-<ts>
#   - Validates JSON before overwriting
#   - Idempotent: no-op if ID is already unique (not the shared literal)

set -euo pipefail

TARGET_DIR=""
QUIET=false
CUSTOM_ID=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target-dir) TARGET_DIR="$2"; shift 2 ;;
        --quiet)      QUIET=true; shift ;;
        --id)         CUSTOM_ID="$2"; shift 2 ;;
        -h|--help)
            grep -E "^#" "$0" | head -30 | sed 's/^# \?//'
            exit 0
            ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

# ---------- Resolve target ----------
if [[ -z "$TARGET_DIR" ]]; then
    TARGET_DIR="$(cd "$(dirname "$0")/.." && pwd)"
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
SETTINGS="$TARGET_DIR/.claude/settings.json"

log() { [[ "$QUIET" == "true" ]] || echo "$@"; }

# ---------- Preflight ----------
[[ -f "$SETTINGS" ]] || { echo "ERROR: $SETTINGS not found" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 required" >&2; exit 1; }

# ---------- Derive new ID ----------
if [[ -n "$CUSTOM_ID" ]]; then
    NEW_ID="$CUSTOM_ID"
else
    BASE=$(basename "$TARGET_DIR" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
    NEW_ID="aegis-tasks-${BASE}"
fi

# ---------- Idempotency check ----------
# We always rewrite if the current ID doesn't match the derived slug for THIS target.
# This is important because install.sh copies the source's settings.json to every
# target — so the target initially inherits the source's ID (e.g. aegis-tasks-aegis-team)
# and must be rewritten to its own slug.
CURRENT_ID=$(python3 -c "
import json, sys
with open(sys.argv[1]) as f: d = json.load(f)
print(d.get('env', {}).get('CLAUDE_CODE_TASK_LIST_ID', ''))
" "$SETTINGS")

if [[ "$CURRENT_ID" == "$NEW_ID" ]]; then
    log "✓ Task list ID already set to '$NEW_ID'. Nothing to do."
    exit 0
fi

# ---------- Backup ----------
TS=$(date -u +"%Y-%m-%dT%H%M%SZ")
BACKUP="$SETTINGS.pre-task-id-fix-$TS"
cp "$SETTINGS" "$BACKUP"
log "📦 Backup: $BACKUP"

# ---------- Rewrite ----------
python3 - "$SETTINGS" "$NEW_ID" "$QUIET" <<'PYEOF'
import json, sys
path, new_id, quiet_str = sys.argv[1], sys.argv[2], sys.argv[3]
quiet = quiet_str == "true"
with open(path) as f:
    data = json.load(f)
data.setdefault("env", {})
old = data["env"].get("CLAUDE_CODE_TASK_LIST_ID", "(unset)")
data["env"]["CLAUDE_CODE_TASK_LIST_ID"] = new_id
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
if not quiet:
    print(f"✏️  CLAUDE_CODE_TASK_LIST_ID: '{old}' → '{new_id}'")
PYEOF

# ---------- Validate ----------
if ! python3 -c "import json, sys; json.load(open(sys.argv[1]))" "$SETTINGS" 2>/dev/null; then
    echo "❌ Validation FAILED — restoring backup" >&2
    cp "$BACKUP" "$SETTINGS"
    exit 2
fi

log ""
log "✅ Task list isolated: ~/.claude/tasks/${NEW_ID}/"
log "   (Previous shared list at ~/.claude/tasks/aegis-shared-tasks/ left intact."
log "    Prune it manually once every project has been migrated off.)"
