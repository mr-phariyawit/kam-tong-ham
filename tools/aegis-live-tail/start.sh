#!/usr/bin/env bash
# start.sh — bootstrap aegis-live-tail in a tmux split.
#
# Usage:
#   bash tools/aegis-live-tail/start.sh                   # split current tmux window
#   bash tools/aegis-live-tail/start.sh watch [flags...]  # run watcher in foreground (no tmux)
#   bash tools/aegis-live-tail/start.sh stop              # close the split + clean fifo
#
# When no subcommand is given and we're inside tmux, splits the current window
# 70/30 horizontally and spawns the watcher in the bottom pane. Returns control
# to the top pane (where the user's Claude Code session lives).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
LIVE_DIR="$PROJECT_DIR/.aegis/brain/live"
FIFO="$LIVE_DIR/current.fifo"
WATCH_MJS="$SCRIPT_DIR/watch.mjs"

# v15-16: PID-tracked cleanup. Every spawned watcher writes its PID here so
# `stop` and `cleanup-orphans` can target exactly the right processes —
# instead of the broad `pkill -f watch.mjs` that risked killing unrelated
# node processes AND missed orphans (ppid=1) created by crashed tmux panes.
PIDFILE="$LIVE_DIR/watchers.pid"

ensure_fifo() {
    mkdir -p "$LIVE_DIR"
    if [[ ! -p "$FIFO" ]]; then
        # If something else exists at that path (regular file from a botched
        # earlier run), remove it so mkfifo can succeed.
        [[ -e "$FIFO" ]] && rm -f "$FIFO"
        mkfifo "$FIFO"
    fi
}

cmd_start() {
    if [[ -z "${TMUX:-}" ]]; then
        echo "Not in tmux. Run one of:"
        echo "  tmux new-session -s aegis"
        echo "  bash $0 watch         # foreground tailer (no tmux)"
        exit 1
    fi
    ensure_fifo
    # v15-16: the inline while-loop wraps `node` with a tracker that
    # writes its OWN PID (the node child) to the pidfile, so `stop` can
    # target the actual watcher even if tmux pane bookkeeping fails. The
    # `trap` removes the PID from the file when the loop exits cleanly.
    tmux split-window -v -p 30 \
        "while true; do
            node '$WATCH_MJS' &
            WATCHER_PID=\$!
            echo \$WATCHER_PID >> '$PIDFILE'
            trap \"sed -i.bak '/^\$WATCHER_PID\$/d' '$PIDFILE' 2>/dev/null; rm -f '$PIDFILE.bak' 2>/dev/null\" EXIT
            wait \$WATCHER_PID
            rc=\$?
            echo '[live-tail] watcher exited (rc='\$rc'), restarting in 1s'
            sleep 1
         done"
    # Refocus top pane.
    tmux select-pane -U
    echo "live-tail pane spawned in tmux (bottom 30%). fifo: $FIFO"
}

cmd_watch() {
    ensure_fifo
    shift  # drop "watch"
    # Track this PID too (foreground watcher case).
    echo "$$" >> "$PIDFILE"
    trap "sed -i.bak '/^$$\\\$/d' '$PIDFILE' 2>/dev/null; rm -f '$PIDFILE.bak' 2>/dev/null" EXIT
    exec node "$WATCH_MJS" "$@"
}

cmd_stop() {
    if [[ -n "${TMUX:-}" ]]; then
        tmux list-panes -F "#{pane_id} #{pane_current_command}" 2>/dev/null \
            | awk '/node$/ {print $1}' \
            | xargs -I{} tmux kill-pane -t {} 2>/dev/null || true
    fi
    # v15-16: kill tracked watcher PIDs directly. SIGTERM first, then SIGKILL
    # survivors after 1s. Tracking via pidfile avoids the broad `pkill -f
    # watch.mjs` pattern that risked killing unrelated node processes.
    if [[ -f "$PIDFILE" ]]; then
        local pids
        pids=$(cat "$PIDFILE" 2>/dev/null | tr '\n' ' ')
        if [[ -n "${pids// /}" ]]; then
            kill -TERM $pids 2>/dev/null || true
            sleep 1
            kill -9 $pids 2>/dev/null || true
        fi
        rm -f "$PIDFILE"
    fi
    [[ -p "$FIFO" ]] && rm -f "$FIFO"
    echo "live-tail stopped, fifo removed."
}

# v15-16: cleanup orphan watchers from prior crashed sessions.
# Targets ONLY processes that:
#   (1) match `aegis-live-tail/watch.mjs` in their command line
#   (2) have ppid=1 (orphaned — parent shell already exited)
#   (3) have been running > 1 hour (etime, avoids killing fresh starts)
# This is conservative — a watcher running for < 1h with a live parent
# is left alone. SessionStart wires this in.
cmd_cleanup_orphans() {
    local killed=0
    while IFS= read -r pid; do
        [[ -z "$pid" ]] && continue
        kill -TERM "$pid" 2>/dev/null && killed=$((killed + 1))
    done < <(ps -eo pid,ppid,etime,command 2>/dev/null \
        | awk '/aegis-live-tail\/watch\.mjs/ && $2 == 1 {
            # parse etime (D-HH:MM:SS, HH:MM:SS, or MM:SS) — orphan must be > 1h old
            etime = $3
            n = split(etime, parts, /[-:]/)
            secs = 0
            if (n == 4) { secs = parts[1]*86400 + parts[2]*3600 + parts[3]*60 + parts[4] }
            else if (n == 3) { secs = parts[1]*3600 + parts[2]*60 + parts[3] }
            else if (n == 2) { secs = parts[1]*60 + parts[2] }
            if (secs >= 3600) print $1
          }')
    if [[ "$killed" -gt 0 ]]; then
        echo "[live-tail] cleaned $killed orphan watcher(s) (ppid=1, etime>1h)" >&2
    fi
    # Wait briefly, then SIGKILL any survivors that ignored TERM.
    sleep 1
    while IFS= read -r pid; do
        [[ -z "$pid" ]] && continue
        kill -9 "$pid" 2>/dev/null || true
    done < <(ps -eo pid,ppid,command 2>/dev/null \
        | awk '/aegis-live-tail\/watch\.mjs/ && $2 == 1 {print $1}')
}

case "${1:-start}" in
    start)            cmd_start ;;
    watch)            cmd_watch "$@" ;;
    stop)             cmd_stop ;;
    cleanup-orphans)  cmd_cleanup_orphans ;;
    -h|--help)
        sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
        ;;
    *)
        echo "unknown subcommand: $1" >&2
        echo "use: start | watch | stop | cleanup-orphans" >&2
        exit 2
        ;;
esac
