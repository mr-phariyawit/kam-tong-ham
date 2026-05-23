#!/usr/bin/env bash
# aegis-return-validator.sh — sprint v15-20 Story A.
#
# Scans a sub-agent return-text blob (or file) and classifies each
# non-trivial claim as [VERIFIED], [PRODUCED], or UNTAGGED.
#
# Rule (per Contra-Thai research report F-C):
#   Every non-trivial claim in a sub-agent return MUST be tagged either:
#     [VERIFIED: <command>]   — backed by an executed command output
#     [PRODUCED: unverified]  — produced but not verified
#   Claims without a tag default to UNTAGGED.
#
# Why this matters:
#   Across Contra-Thai's 3 sprints, sub-agent returns like
#   "28 tests added, all quality bar checks pass" were inherited by
#   main agent as ground truth — but the tests were never RUN.
#   Tagging makes the conflation visible.
#
# Soft gate:
#   This tool always exits 0. It produces a report. The threshold
#   warning is for human review, not automatic block.
#
# Usage:
#   aegis-return-validator.sh check <file>           # scan a file
#   aegis-return-validator.sh check -                # scan stdin
#   aegis-return-validator.sh check --inline "..."   # scan inline text
#   aegis-return-validator.sh summary <file>         # one-liner: VERIFIED=N PRODUCED=M UNTAGGED=K

set -uo pipefail

red()    { printf '\033[0;31m%s\033[0m' "$*"; }
green()  { printf '\033[0;32m%s\033[0m' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m' "$*"; }
bold()   { printf '\033[1m%s\033[0m' "$*"; }

UNTAGGED_THRESHOLD="${AEGIS_RETURN_UNTAGGED_THRESHOLD:-0.30}"  # 30% of claims without a tag → warn

# Heuristic claim detector: sentences that make a measurable assertion.
# Triggers (any of):
#   - Numeric claim: "28 tests added", "13 findings", "3 stories closed"
#   - Boolean status: "all tests pass", "build succeeded", "no errors"
#   - Closure: "Closes S<NN>-<NN>", "Resolves issue #N"
#   - Done declaration: "DONE", "✓", "complete"
# A claim qualifies as TAGGED if the same line contains [VERIFIED:...] or [PRODUCED:...].

scan_text() {
    local txt="$1"
    local verified=0 produced=0 untagged=0
    local total=0
    local untagged_lines=()

    while IFS= read -r line; do
        # Skip empty + comment-only lines
        [[ -z "${line// }" ]] && continue
        [[ "$line" =~ ^[[:space:]]*# ]] && continue

        # Does this line make a claim worth checking?
        local is_claim=0
        if echo "$line" | grep -qiE '\b[0-9]+ +(tests?|findings?|stories?|files?|lines?|points?|gaps?|bugs?|issues?)\b'; then
            is_claim=1
        elif echo "$line" | grep -qiE '(all|every|no)( +[a-z-]+){0,2} +(tests?|checks?|errors?|warnings?|failures?|gates?) +(pass|fail|succeed|complete)'; then
            is_claim=1
        elif echo "$line" | grep -qiE '\bclos(es|ed) +S[0-9]+-[0-9]+'; then
            is_claim=1
        elif echo "$line" | grep -qiE '\b(DONE|COMPLETE|SHIPPED|PASSED|VERIFIED)\b'; then
            is_claim=1
        fi
        [[ "$is_claim" == "0" ]] && continue
        total=$((total + 1))

        # Is the claim tagged?
        if echo "$line" | grep -qE '\[VERIFIED:'; then
            verified=$((verified + 1))
        elif echo "$line" | grep -qE '\[PRODUCED:'; then
            produced=$((produced + 1))
        else
            untagged=$((untagged + 1))
            untagged_lines+=("$line")
        fi
    done <<< "$txt"

    printf '%s %d  %s %d  %s %d  %s %d\n' \
        "$(bold TOTAL:)" "$total" \
        "$(green VERIFIED:)" "$verified" \
        "$(yellow PRODUCED:)" "$produced" \
        "$(red UNTAGGED:)" "$untagged"

    if [[ "$total" -gt 0 ]] && [[ "$untagged" -gt 0 ]]; then
        local untag_ratio
        untag_ratio=$(awk "BEGIN { printf \"%.2f\", $untagged / $total }")
        local breach
        breach=$(awk "BEGIN { print ($untag_ratio > $UNTAGGED_THRESHOLD) }")
        if [[ "$breach" == "1" ]]; then
            echo ""
            echo "$(yellow '⚠️  Untagged-claim ratio') = $untag_ratio (threshold $UNTAGGED_THRESHOLD)"
            echo "$(yellow 'Untagged claims (treat as unverified):')"
            for l in "${untagged_lines[@]}"; do
                printf '    %s\n' "$l"
            done
            echo ""
            echo "Tag fix: add $(green '[VERIFIED: <command>]') if the claim ran successfully,"
            echo "         or $(yellow '[PRODUCED: unverified]') if the artifact exists but wasn't executed."
        fi
    fi

    # Always exit 0 (soft gate)
    return 0
}

summary_text() {
    local txt="$1"
    local verified=0 produced=0 untagged=0 total=0

    while IFS= read -r line; do
        [[ -z "${line// }" ]] && continue
        [[ "$line" =~ ^[[:space:]]*# ]] && continue

        local is_claim=0
        if echo "$line" | grep -qiE '\b[0-9]+ +(tests?|findings?|stories?|files?|lines?|points?|gaps?|bugs?|issues?)\b'; then is_claim=1
        elif echo "$line" | grep -qiE '(all|every|no)( +[a-z-]+){0,2} +(tests?|checks?|errors?|warnings?|failures?|gates?) +(pass|fail|succeed|complete)'; then is_claim=1
        elif echo "$line" | grep -qiE '\bclos(es|ed) +S[0-9]+-[0-9]+'; then is_claim=1
        elif echo "$line" | grep -qiE '\b(DONE|COMPLETE|SHIPPED|PASSED|VERIFIED)\b'; then is_claim=1
        fi
        [[ "$is_claim" == "0" ]] && continue
        total=$((total + 1))

        if echo "$line" | grep -qE '\[VERIFIED:'; then verified=$((verified + 1))
        elif echo "$line" | grep -qE '\[PRODUCED:'; then produced=$((produced + 1))
        else untagged=$((untagged + 1)); fi
    done <<< "$txt"

    echo "VERIFIED=$verified PRODUCED=$produced UNTAGGED=$untagged TOTAL=$total"
}

read_input() {
    local source="$1"
    if [[ "$source" == "-" ]]; then
        cat
    elif [[ -f "$source" ]]; then
        cat "$source"
    else
        echo "ERROR: input not found: $source" >&2
        exit 2
    fi
}

cmd="${1:-help}"
case "$cmd" in
    check)
        shift
        if [[ "${1:-}" == "--inline" ]]; then
            txt="${2:-}"
        else
            txt=$(read_input "${1:-help}")
        fi
        scan_text "$txt"
        ;;
    summary)
        shift
        if [[ "${1:-}" == "--inline" ]]; then
            txt="${2:-}"
        else
            txt=$(read_input "${1:-help}")
        fi
        summary_text "$txt"
        ;;
    help|--help|-h)
        sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
        ;;
    *)
        echo "Usage: $0 {check|summary} <file|-|--inline <text>>" >&2
        exit 2
        ;;
esac
