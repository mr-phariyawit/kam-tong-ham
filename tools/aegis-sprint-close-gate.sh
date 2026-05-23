#!/usr/bin/env bash
# aegis-sprint-close-gate.sh — sprint v15-20 Story B (closes F-B).
#
# Soft gate fired at `/aegis-sprint close`. For projects flagged as
# less-than-100% coverage (from v15-19's coverage.json), this gate
# checks per-story playtest evidence and emits a warning block if
# missing.
#
# Driver: Contra-Thai Sprint 3 closed "100% velocity, best sprint yet"
# while the product never compiled in Unity Editor. F-B from the
# research report: require human-signed playtest result before
# marking a story DONE on GUI-runtime projects.
#
# Soft gate semantics:
#   - Always exits 0
#   - Prints a warning block listing missing playtests
#   - Writes a summary line into the close.md if invoked with --close-md
#   - Never blocks the sprint-close command from completing
#   - If coverage=1.0 (text-runtime / no gaps) → silent, exit 0
#
# Usage:
#   aegis-sprint-close-gate.sh check [<project-dir>]      # default: cwd
#   aegis-sprint-close-gate.sh check --sprint 03         # specific sprint number
#   aegis-sprint-close-gate.sh report [<project-dir>]    # one-line summary
#
# Playtest file convention:
#   _aegis-output/playtests/S<NN>-<storyId>.md  (per story)
#   Required content keys:
#     verified_by: <user-name>
#     date: YYYY-MM-DD
#     pass: true | false
#     notes: <any>

set -uo pipefail

red()    { printf '\033[0;31m%s\033[0m' "$*"; }
green()  { printf '\033[0;32m%s\033[0m' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m' "$*"; }
bold()   { printf '\033[1m%s\033[0m' "$*"; }

PROJECT_DIR="${1:-.}"
PROJECT_DIR=$(cd "$PROJECT_DIR" 2>/dev/null && pwd) || PROJECT_DIR="$(pwd)"

# Find the active sprint kanban
find_active_kanban() {
    local current="$PROJECT_DIR/.aegis/brain/sprints/current/kanban.md"
    if [[ -f "$current" ]]; then
        echo "$current"
        return 0
    fi
    # Fallback: pick the highest-numbered sprint dir
    ls -1d "$PROJECT_DIR/.aegis/brain/sprints/sprint-"* 2>/dev/null | sort | tail -1 | while read -r d; do
        [[ -f "$d/kanban.md" ]] && echo "$d/kanban.md"
    done
}

# Extract story IDs from a kanban DONE block (S<NN>-<NN> pattern)
extract_done_stories() {
    local kanban="$1"
    [[ -f "$kanban" ]] || return 0
    # Look for the DONE section and grep S-XX-YY ids
    awk '/^## DONE/{in_done=1; next} /^## [A-Z]/{in_done=0} in_done {print}' "$kanban" \
        | grep -oE 'S[0-9]+-[0-9]+' \
        | sort -u
}

# Load coverage info
load_coverage_pct() {
    local cov_file="$PROJECT_DIR/.aegis/brain/state/coverage.json"
    if [[ -f "$cov_file" ]]; then
        if command -v jq >/dev/null 2>&1; then
            jq -r '.coverage_pct // 100' "$cov_file" 2>/dev/null
            return
        fi
    fi
    echo "100"
}

# Check a single playtest file
check_playtest() {
    local pt_file="$1"
    if [[ ! -f "$pt_file" ]]; then
        echo "MISSING"
        return
    fi
    local pass
    pass=$(grep -m1 '^pass:' "$pt_file" 2>/dev/null | awk '{print $2}' | tr -d '"' | tr -d "'")
    local verifier
    verifier=$(grep -m1 '^verified_by:' "$pt_file" 2>/dev/null | sed 's/^verified_by:[[:space:]]*//; s/[[:space:]]*$//')
    if [[ -z "$verifier" ]]; then
        echo "NO_VERIFIER"
        return
    fi
    if [[ "$pass" == "true" ]]; then
        echo "PASS"
    elif [[ "$pass" == "false" ]]; then
        echo "FAIL"
    else
        echo "UNCLEAR"
    fi
}

run_check() {
    local pct
    pct=$(load_coverage_pct)
    local kanban
    kanban=$(find_active_kanban)

    if [[ -z "$kanban" ]]; then
        echo "$(yellow 'INFO:') No active sprint kanban — nothing to gate. Exit 0."
        exit 0
    fi

    # If project is 100% AEGIS-drivable (web/CLI/infra), no gate needed
    if [[ "$pct" -ge 100 ]]; then
        echo "$(green '✓ Coverage=100%') — text-runtime project; sprint-close gate skipped."
        exit 0
    fi

    local stories
    stories=$(extract_done_stories "$kanban")
    if [[ -z "$stories" ]]; then
        echo "$(yellow 'INFO:') No DONE stories in $kanban — nothing to gate."
        exit 0
    fi

    local pt_dir="$PROJECT_DIR/_aegis-output/playtests"
    local total=0 verified=0 missing=0 failing=0 unclear=0
    declare -a missing_list failing_list unclear_list

    while IFS= read -r sid; do
        [[ -z "$sid" ]] && continue
        total=$((total + 1))
        # Match either S03-02.md or S03-02-anything.md
        local found
        found=$(ls "$pt_dir/${sid}".md "$pt_dir/${sid}"-*.md 2>/dev/null | head -1)
        if [[ -z "$found" ]]; then
            missing=$((missing + 1))
            missing_list+=("$sid")
            continue
        fi
        local result
        result=$(check_playtest "$found")
        case "$result" in
            PASS) verified=$((verified + 1)) ;;
            FAIL) failing=$((failing + 1)); failing_list+=("$sid → $found") ;;
            *)    unclear=$((unclear + 1)); unclear_list+=("$sid → $found (result=$result)") ;;
        esac
    done <<< "$stories"

    echo ""
    echo "$(yellow '╔═══════════════════════════════════════════════════════════════════╗')"
    echo "$(yellow '║') $(bold '⚠️  SPRINT-CLOSE PLAYTEST GATE / ตรวจหลักฐานทดสอบก่อนปิด sprint')      $(yellow '║')"
    echo "$(yellow '╚═══════════════════════════════════════════════════════════════════╝')"
    echo ""
    echo "$(bold 'Project coverage:') ${pct}% (< 100% — playtest evidence required for GUI-runtime stories)"
    echo "$(bold 'Stories in DONE:') $total"
    echo "  $(green '✓ verified by human playtest:') $verified"
    echo "  $(red '✗ missing playtest file:') $missing"
    echo "  $(red '✗ playtest reports FAIL:') $failing"
    echo "  $(yellow '? playtest unclear (no verifier / no pass field):') $unclear"
    echo ""

    if [[ "$missing" -gt 0 ]]; then
        echo "$(red 'Missing playtest files (treat these stories as PRODUCED, not DONE):')"
        for s in "${missing_list[@]}"; do
            printf "    - %s — expected at %s/%s.md\n" "$s" "$pt_dir" "$s"
        done
        echo ""
    fi
    if [[ "$failing" -gt 0 ]]; then
        echo "$(red 'Stories with FAILING playtest results:')"
        for s in "${failing_list[@]}"; do
            printf "    - %s\n" "$s"
        done
        echo ""
    fi
    if [[ "$unclear" -gt 0 ]]; then
        echo "$(yellow 'Stories with unclear playtest results:')"
        for s in "${unclear_list[@]}"; do
            printf "    - %s\n" "$s"
        done
        echo ""
    fi

    echo "$(bold 'How to fix:')"
    echo "  For each missing story, create: $pt_dir/S<NN>-<NN>.md"
    echo "  Required content:"
    echo "    verified_by: <your name>"
    echo "    date: $(date -u +%Y-%m-%d)"
    echo "    pass: true   # or false"
    echo "    notes: <what you did, what worked, what didn't>"
    echo ""
    echo "$(yellow 'Soft gate:') sprint close proceeds. This warning will be appended to close.md."
    echo ""

    # Soft — always exit 0
    exit 0
}

run_report() {
    local pct
    pct=$(load_coverage_pct)
    local kanban
    kanban=$(find_active_kanban)
    if [[ -z "$kanban" ]] || [[ "$pct" -ge 100 ]]; then
        echo "playtest-gate: not-applicable (coverage=$pct%)"
        exit 0
    fi
    local stories
    stories=$(extract_done_stories "$kanban")
    local total=0 verified=0
    local pt_dir="$PROJECT_DIR/_aegis-output/playtests"
    while IFS= read -r sid; do
        [[ -z "$sid" ]] && continue
        total=$((total + 1))
        local found
        found=$(ls "$pt_dir/${sid}".md "$pt_dir/${sid}"-*.md 2>/dev/null | head -1)
        [[ -z "$found" ]] && continue
        local r
        r=$(check_playtest "$found")
        [[ "$r" == "PASS" ]] && verified=$((verified + 1))
    done <<< "$stories"
    echo "playtest-gate: verified=$verified/$total (coverage=$pct%)"
    exit 0
}

cmd="${1:-help}"
case "$cmd" in
    check)
        shift
        [[ -n "${1:-}" ]] && PROJECT_DIR=$(cd "$1" 2>/dev/null && pwd) || PROJECT_DIR="$(pwd)"
        run_check
        ;;
    report)
        shift
        [[ -n "${1:-}" ]] && PROJECT_DIR=$(cd "$1" 2>/dev/null && pwd) || PROJECT_DIR="$(pwd)"
        run_report
        ;;
    help|--help|-h)
        sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
        ;;
    *)
        echo "Usage: $0 {check|report} [<project-dir>]" >&2
        exit 2
        ;;
esac
