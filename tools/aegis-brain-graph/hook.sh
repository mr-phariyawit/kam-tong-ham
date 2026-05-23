#!/usr/bin/env bash
# tools/aegis-brain-graph/hook.sh — debounced PostToolUse hook (sprint-v12-04)
#
# Behavior:
#   - Spawns a background coalescer that holds a flock for 3s, then runs an
#     incremental graph build.
#   - If a coalescer is already running (lock held), this invocation is a
#     no-op — the existing one will absorb the change.
#   - Returns to the parent (Claude Code) in ~1ms, never blocks the user.
#   - Fail-OPEN per DoD §2: any internal error → exit 0 with optional warning.
#
# Spec: AEGIS Knowledge-Layer Mega Plan v1.1, sprint v12-04 story E.

set +e

REPO="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOCK="$REPO/.aegis/brain/state/graph-build.lock"
BUILD="$REPO/tools/aegis-brain-graph/build.mjs"

mkdir -p "$(dirname "$LOCK")" 2>/dev/null

# If flock is not available (macOS without coreutils), skip — fail-OPEN.
if ! command -v flock >/dev/null 2>&1; then
    # Run synchronously with the cheap incremental gate; exit 0 regardless.
    node "$BUILD" --incremental --quiet >/dev/null 2>&1
    exit 0
fi

# Background coalescer: lock → sleep N → build → unlock.
# Non-blocking lock; if held, this is a duplicate invocation within the
# debounce window — exit immediately without rebuild.
#
# v15-16: debounce raised from 3s to 10s. Heavy edit bursts (e.g.
# multi-file refactors) used to re-trigger ~5 rebuilds in 15s; the
# graph data is informational, not load-bearing, so a longer window
# is fine. Trade-off: staleness banner on SessionStart shows up
# sooner if a session ends mid-burst. Override via env if needed.
DEBOUNCE_S="${AEGIS_BRAIN_GRAPH_DEBOUNCE_S:-10}"
{
    exec 9>"$LOCK" 2>/dev/null
    if flock -n 9 2>/dev/null; then
        sleep "$DEBOUNCE_S"
        node "$BUILD" --incremental --quiet 2>/dev/null
        flock -u 9 2>/dev/null
    fi
} >/dev/null 2>&1 </dev/null & disown 2>/dev/null

exit 0
