#!/usr/bin/env bash
# aegis-research-probe.sh — sprint v15-20 Story C (closes F-E).
#
# Scans a research doc for URLs (http/https) and probes each with a
# HEAD/OPTIONS request. Adds inline annotations to mark each URL as
# [PROBED ✓ HTTP <code>], [PROBED ✗ HTTP <code>], or [UNPROBED].
#
# Driver: Contra-Thai research doc cited Kie.ai endpoints without
# probing them. 5 fabricated payload-shape / endpoint bugs surfaced
# only when Thor's contra-gen-art.py made real API calls. F-E:
# every URL in a research doc must be probed before being cited as
# ground truth.
#
# Soft gate semantics:
#   - Always exits 0
#   - Modifies the doc in place (adds annotation next to each URL) when --apply
#   - Default mode is --dry-run (report only)
#
# Usage:
#   aegis-research-probe.sh scan <file>             # report which URLs are probed/unprobed
#   aegis-research-probe.sh apply <file>            # rewrite the file with annotations
#   aegis-research-probe.sh check-tags <file>       # ratio of [PROBED] vs [UNPROBED] tags
#
# Probe behavior:
#   - HEAD request with 5s timeout
#   - If HEAD returns 405 (method not allowed), retry with OPTIONS
#   - 2xx + 3xx → PROBED ✓
#   - 4xx + 5xx → PROBED ✗ (HTTP <code>)
#   - timeout / DNS fail → UNPROBED
#   - Skip URLs that are already annotated [PROBED ...]

set -uo pipefail

red()    { printf '\033[0;31m%s\033[0m' "$*"; }
green()  { printf '\033[0;32m%s\033[0m' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m' "$*"; }
bold()   { printf '\033[1m%s\033[0m' "$*"; }

probe_url() {
    local url="$1"
    # Skip URLs already annotated (line context check is the caller's job;
    # here we just probe). We also skip example/template URLs.
    case "$url" in
        *example.com*|*example.org*|*localhost*|*127.0.0.1*|*placeholder*|*your-domain*)
            echo "SKIP"
            return
            ;;
    esac
    # HEAD first
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -I "$url" 2>/dev/null || echo "000")
    # If 405 (method not allowed), try OPTIONS
    if [[ "$code" == "405" ]]; then
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X OPTIONS "$url" 2>/dev/null || echo "000")
    fi
    if [[ "$code" =~ ^(2|3)[0-9][0-9]$ ]]; then
        echo "OK:$code"
    elif [[ "$code" =~ ^(4|5)[0-9][0-9]$ ]]; then
        echo "FAIL:$code"
    else
        echo "TIMEOUT"
    fi
}

extract_urls() {
    local file="$1"
    grep -oE 'https?://[^[:space:])"<>'"'"']+' "$file" 2>/dev/null | sort -u
}

cmd_scan() {
    local file="$1"
    [[ -f "$file" ]] || { echo "ERROR: file not found: $file" >&2; exit 2; }
    local total=0 probed_ok=0 probed_fail=0 unprobed=0 skipped=0
    declare -a unprobed_list fail_list

    echo ""
    echo "$(bold 'Scanning:') $file"
    echo ""
    while IFS= read -r url; do
        [[ -z "$url" ]] && continue
        total=$((total + 1))
        local result
        result=$(probe_url "$url")
        case "$result" in
            OK:*)     probed_ok=$((probed_ok + 1));   printf '  %s %s %s\n' "$(green ✓)" "$url" "${result#OK:}" ;;
            FAIL:*)   probed_fail=$((probed_fail + 1)); fail_list+=("$url HTTP ${result#FAIL:}"); printf '  %s %s HTTP %s\n' "$(red ✗)" "$url" "${result#FAIL:}" ;;
            TIMEOUT)  unprobed=$((unprobed + 1));    unprobed_list+=("$url"); printf '  %s %s timeout/DNS-fail\n' "$(yellow '?')" "$url" ;;
            SKIP)     skipped=$((skipped + 1));      printf '  %s %s (placeholder/example)\n' "$(yellow 'skip')" "$url" ;;
        esac
    done < <(extract_urls "$file")

    echo ""
    echo "$(bold 'Summary:') $total URLs"
    echo "  $(green '✓ probed-ok:') $probed_ok"
    echo "  $(red '✗ probed-fail:') $probed_fail"
    echo "  $(yellow '? unprobed:') $unprobed"
    echo "  $(yellow 'skip:') $skipped"

    if [[ "$unprobed" -gt 0 ]] || [[ "$probed_fail" -gt 0 ]]; then
        echo ""
        echo "$(yellow '⚠️  Treat unprobed and probe-fail URLs as UNVERIFIED.') Do NOT cite payload shapes,"
        echo "    response schemas, or behaviors derived from these without a live successful probe."
        echo "    (Contra-Thai F-E: 5 fabricated bugs traced to research-doc URLs cited without probe.)"
    fi
    exit 0
}

cmd_apply() {
    local file="$1"
    [[ -f "$file" ]] || { echo "ERROR: file not found: $file" >&2; exit 2; }
    local tmp
    tmp=$(mktemp)
    cp "$file" "$tmp"

    while IFS= read -r url; do
        [[ -z "$url" ]] && continue
        # Skip URLs already annotated
        local esc
        esc=$(printf '%s' "$url" | sed 's/[\/&]/\\&/g')
        if grep -E "$esc *\[PROBED" "$tmp" >/dev/null 2>&1; then
            continue
        fi
        local result
        result=$(probe_url "$url")
        local tag
        case "$result" in
            OK:*)     tag="[PROBED ✓ HTTP ${result#OK:}]" ;;
            FAIL:*)   tag="[PROBED ✗ HTTP ${result#FAIL:}]" ;;
            TIMEOUT)  tag="[UNPROBED]" ;;
            SKIP)     continue ;;
        esac
        # Append annotation after first occurrence of the URL
        # Use perl for safe regex with arbitrary URL chars
        perl -i -pe "s{\Q$url\E(?! \[)}{$url $tag}" "$tmp"
    done < <(extract_urls "$file")

    mv "$tmp" "$file"
    echo "$(green 'Applied probe annotations to:') $file"
    exit 0
}

cmd_check_tags() {
    local file="$1"
    [[ -f "$file" ]] || { echo "ERROR: file not found: $file" >&2; exit 2; }
    local probed unprobed total
    probed=$(grep -cE '\[PROBED' "$file" 2>/dev/null || echo 0)
    unprobed=$(grep -cE '\[UNPROBED\]' "$file" 2>/dev/null || echo 0)
    local urls
    urls=$(extract_urls "$file" | wc -l | tr -d ' ')
    total=$((probed + unprobed))
    echo "PROBED=$probed UNPROBED=$unprobed TAGGED=$total URLS=$urls"
    exit 0
}

cmd="${1:-help}"
case "$cmd" in
    scan)         shift; cmd_scan "${1:-}" ;;
    apply)        shift; cmd_apply "${1:-}" ;;
    check-tags)   shift; cmd_check_tags "${1:-}" ;;
    help|--help|-h) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//' ;;
    *)            echo "Usage: $0 {scan|apply|check-tags} <file>" >&2; exit 2 ;;
esac
