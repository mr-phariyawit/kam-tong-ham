#!/usr/bin/env bash
# aegis-log-decision.sh (S2-02) — Nick Fury's decision-audit logger.
#
# Appends one JSONL entry per decision to .aegis/brain/logs/decision-audit.log
# and increments the judgment-fallback counter when source=judgment.
#
# Usage (Nick Fury calls this from his decision flow):
#   tools/aegis-log-decision.sh \
#     --question "Which gitignore mode?" \
#     --source "instinct:promoted" \
#     --source-id "sentinel-markers-over-comment-regex" \
#     --confidence 1.0 \
#     --answer "shared mode with sentinels"
#
#   # For judgment fallback (source=judgment REQUIRES --reasoning):
#   tools/aegis-log-decision.sh \
#     --question "Add npm to allow list?" \
#     --source judgment \
#     --confidence 0.45 \
#     --answer "no, require approval" \
#     --reasoning "npm install runs arbitrary install hooks"
#
# Spec: .claude/references/decision-audit-protocol.md
# Sprint: sprint-v9-02 / S2-02

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$REPO_ROOT/.aegis/brain/logs/decision-audit.log"
COUNTER="$REPO_ROOT/.aegis/brain/metrics/judgment-fallback-counter.json"

# ── Parse args ──────────────────────────────────────────────────────────────
QUESTION=""
SOURCE=""
SOURCE_ID=""
CONFIDENCE=""
ANSWER=""
REASONING=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --question)   QUESTION="$2";   shift 2 ;;
        --source)     SOURCE="$2";     shift 2 ;;
        --source-id)  SOURCE_ID="$2";  shift 2 ;;
        --confidence) CONFIDENCE="$2"; shift 2 ;;
        --answer)     ANSWER="$2";     shift 2 ;;
        --reasoning)  REASONING="$2";  shift 2 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

# ── Validate required fields per decision-audit-protocol.md ────────────────
for REQ in "$QUESTION:question" "$SOURCE:source" "$CONFIDENCE:confidence" "$ANSWER:answer"; do
    VAL="${REQ%%:*}"; NAME="${REQ##*:}"
    [[ -z "$VAL" ]] && { echo "ERROR: --$NAME is required" >&2; exit 1; }
done

# Validate source against allowed values
case "$SOURCE" in
    instinct:promoted|instinct:active|instinct:pending|\
    resonance:*|adr:*|identity|framework|retro:*|\
    judgment|auto-defer-to-captain) ;;
    *)
        echo "ERROR: --source must match one of:" >&2
        echo "  instinct:promoted|active|pending, resonance:<file>, adr:<id>," >&2
        echo "  identity, framework, retro:<date>, judgment, auto-defer-to-captain" >&2
        echo "Got: '$SOURCE'" >&2
        exit 1 ;;
esac

# judgment source REQUIRES reasoning per spec
if [[ "$SOURCE" == "judgment" && -z "$REASONING" ]]; then
    echo "ERROR: --reasoning is required when --source=judgment (per decision-audit-protocol.md)" >&2
    exit 1
fi

# Validate confidence is 0.0-1.0
if ! python3 - "$CONFIDENCE" <<'PYEOF' 2>/dev/null; then
import sys
c = float(sys.argv[1])
assert 0.0 <= c <= 1.0, f"confidence must be 0.0-1.0, got {c}"
PYEOF
    echo "ERROR: --confidence must be a float between 0.0 and 1.0" >&2
    exit 1
fi

# ── Ensure log directory exists ────────────────────────────────────────────
mkdir -p "$(dirname "$LOG")"
mkdir -p "$(dirname "$COUNTER")"

# ── Assign sequential decision_id within session ───────────────────────────
SESSION_ID="${CLAUDE_SESSION_ID:-default}"
COUNT_FILE="/tmp/aegis-decision-count/${SESSION_ID}.txt"
mkdir -p "$(dirname "$COUNT_FILE")"
NEXT=$(( $(cat "$COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$NEXT" > "$COUNT_FILE"
DECISION_ID=$(printf "D-%03d" "$NEXT")

# ── Build JSONL entry ──────────────────────────────────────────────────────
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

ENTRY=$(python3 - "$TS" "$DECISION_ID" "$QUESTION" "$SOURCE" \
    "$CONFIDENCE" "$ANSWER" "$SOURCE_ID" "$REASONING" <<'PYEOF'
import json, sys
ts, did, q, src, conf, ans, sid, reason = sys.argv[1:9]
d = {
    'ts': ts,
    'decision_id': did,
    'question': q,
    'source': src,
    'confidence': float(conf),
    'answer': ans,
}
if sid:
    d['source_id'] = sid
if reason:
    d['reasoning'] = reason
print(json.dumps(d, ensure_ascii=False))
PYEOF
)

echo "$ENTRY" >> "$LOG"

# ── Update judgment-fallback counter if source=judgment ───────────────────
# BP-LOW-02: Uses fcntl.flock for atomic read-modify-write on the counter
# file. Portable across macOS (no flock(1)) and Linux. The lock file is
# adjacent to the counter JSON to avoid /tmp permission issues.
THRESHOLD_HIT=0
if [[ "$SOURCE" == "judgment" ]]; then
    python3 - "$COUNTER" "$TS" "$SESSION_ID" <<'PYEOF'
import json, sys, os, fcntl
path, ts, sid = sys.argv[1], sys.argv[2], sys.argv[3]
lock_path = path + ".lock"

# Ensure parent directory exists
os.makedirs(os.path.dirname(path), exist_ok=True)

# Acquire exclusive lock for atomic read-modify-write
with open(lock_path, 'w') as lock_fd:
    fcntl.flock(lock_fd, fcntl.LOCK_EX)
    try:
        with open(path) as f:
            state = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        state = {
            'session_id': sid,
            'started_at': ts,
            'judgment_count': 0,
            'threshold': 3,
            'auto_escalate_on_threshold': True,
            'last_judgment_at': None,
        }
    # New session -> reset counter
    if state.get('session_id') != sid:
        state = {
            'session_id': sid,
            'started_at': ts,
            'judgment_count': 0,
            'threshold': 3,
            'auto_escalate_on_threshold': True,
            'last_judgment_at': None,
        }
    state['judgment_count'] += 1
    state['last_judgment_at'] = ts
    with open(path, 'w') as f:
        json.dump(state, f, indent=2)
    # Lock released when lock_fd closes (end of with block)

# Alert when threshold hit
if state['judgment_count'] >= state['threshold']:
    print(f"WARN: judgment threshold reached ({state['judgment_count']}/{state['threshold']}) -- next defer should go to Captain America per decision-audit-protocol.md", file=sys.stderr)
PYEOF

    # Check if threshold was hit
    if python3 - "$COUNTER" <<'PYEOF' 2>/dev/null
import json, sys
try:
    with open(sys.argv[1]) as f:
        state = json.load(f)
    sys.exit(0 if state.get('judgment_count', 0) >= state.get('threshold', 3) else 1)
except Exception:
    sys.exit(1)
PYEOF
    then
        THRESHOLD_HIT=1
    fi
fi

echo "logged $DECISION_ID ($SOURCE, conf=$CONFIDENCE)"
if [[ "$THRESHOLD_HIT" -eq 1 ]]; then
    echo "THRESHOLD_EXCEEDED -- route next judgment to Captain America" >&2
    exit 3
fi
exit 0
