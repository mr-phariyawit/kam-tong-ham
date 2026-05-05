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
    # Split current pane horizontally — bottom 30%.
    # Wrap watcher in a restart loop so a transient watcher exit does not
    # collapse the pane silently. The 1s sleep prevents tight crash loops.
    tmux split-window -v -p 30 \
        "while true; do node '$WATCH_MJS'; echo '[live-tail] watcher exited (rc=$?), restarting in 1s'; sleep 1; done"
    # Refocus top pane.
    tmux select-pane -U
    echo "live-tail pane spawned in tmux (bottom 30%). fifo: $FIFO"
}

cmd_watch() {
    ensure_fifo
    shift  # drop "watch"
    exec node "$WATCH_MJS" "$@"
}

cmd_stop() {
    if [[ -n "${TMUX:-}" ]]; then
        # Kill any pane whose pane_current_command matches "node" running watch.mjs.
        # Best-effort — user may have multiple node processes.
        tmux list-panes -F "#{pane_id} #{pane_current_command}" \
            | awk '/node$/ {print $1}' \
            | xargs -I{} tmux kill-pane -t {} 2>/dev/null || true
    fi
    [[ -p "$FIFO" ]] && rm -f "$FIFO"
    echo "live-tail stopped, fifo removed."
}

case "${1:-start}" in
    start) cmd_start ;;
    watch) cmd_watch "$@" ;;
    stop)  cmd_stop ;;
    -h|--help)
        sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
        ;;
    *)
        echo "unknown subcommand: $1" >&2
        echo "use: start | watch | stop" >&2
        exit 2
        ;;
esac
