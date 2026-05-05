#!/usr/bin/env bash
# aegis-brain-index.sh — Build FTS5 search index over .aegis/brain/ content
#
# Sprint v10-06 Story A (2pt)
# Schema: entries(id, source_type, source_path, line_no, ts, content_summary, mtime)
# FTS5 virtual table for ranked full-text search
#
# Usage:
#   aegis-brain-index.sh                  # full rebuild
#   aegis-brain-index.sh --incremental    # only re-index files changed since last run
#   aegis-brain-index.sh --stats          # print index statistics
#
# Idempotent. WAL mode. Backup before full rebuild.

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BRAIN_DIR="$PROJECT_ROOT/.aegis/brain"
DB_PATH="$BRAIN_DIR/index.db"
BACKUP_DIR="$BRAIN_DIR/index-backups"

# Source directories to index (per spec)
SOURCES=(
  "$BRAIN_DIR/handoffs"
  "$BRAIN_DIR/retrospectives"
  "$BRAIN_DIR/learnings"
  "$BRAIN_DIR/resonance"
  "$BRAIN_DIR/sprints"
)

# Log files to index (per spec)
LOG_FILES=(
  "$BRAIN_DIR/logs/activity.log"
  "$BRAIN_DIR/logs/decision-audit.log"
)

# --- Helpers ---
log() { echo "[brain-index] $*" >&2; }

ensure_dirs() {
  mkdir -p "$BRAIN_DIR" "$BACKUP_DIR"
}

# Map a source path to its source_type tag
classify_source() {
  local path="$1"
  case "$path" in
    */handoffs/*)        echo "handoffs" ;;
    */retrospectives/*)  echo "retros" ;;
    */learnings/*)       echo "learnings" ;;
    */resonance/*)       echo "resonance" ;;
    */sprints/*)         echo "sprints" ;;
    */activity.log)      echo "decisions" ;;
    */decision-audit.log) echo "decisions" ;;
    *)                   echo "other" ;;
  esac
}

# Extract timestamp from filename or content
extract_ts() {
  local path="$1"
  local basename
  basename="$(basename "$path")"

  # Try YYYY-MM-DD pattern in filename
  if [[ "$basename" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
    echo "${BASH_REMATCH[1]}T00:00:00Z"
    return
  fi

  # Try sprint-vNN-NN pattern
  if [[ "$basename" =~ sprint-v?([0-9]+) ]]; then
    echo "sprint-${BASH_REMATCH[1]}"
    return
  fi

  # Fallback: file mtime
  if [[ -f "$path" ]]; then
    local mtime
    mtime=$(stat -f '%m' "$path" 2>/dev/null || stat -c '%Y' "$path" 2>/dev/null || echo "0")
    date -r "$mtime" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo "unknown"
  else
    echo "unknown"
  fi
}

# --- Schema ---
init_db() {
  sqlite3 "$DB_PATH" <<'SQL'
PRAGMA journal_mode=WAL;

-- Main content table
CREATE TABLE IF NOT EXISTS entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type  TEXT NOT NULL,
  source_path  TEXT NOT NULL,
  line_no      INTEGER DEFAULT 0,
  ts           TEXT DEFAULT '',
  content_summary TEXT NOT NULL,
  mtime        INTEGER NOT NULL
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  content_summary,
  source_type,
  source_path,
  content=entries,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync with main table
CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, content_summary, source_type, source_path)
    VALUES (new.id, new.content_summary, new.source_type, new.source_path);
END;

CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, content_summary, source_type, source_path)
    VALUES ('delete', old.id, old.content_summary, old.source_type, old.source_path);
END;

CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, content_summary, source_type, source_path)
    VALUES ('delete', old.id, old.content_summary, old.source_type, old.source_path);
  INSERT INTO entries_fts(rowid, content_summary, source_type, source_path)
    VALUES (new.id, new.content_summary, new.source_type, new.source_path);
END;

-- Index for incremental lookups
CREATE INDEX IF NOT EXISTS idx_entries_path ON entries(source_path);
CREATE INDEX IF NOT EXISTS idx_entries_mtime ON entries(mtime);
CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(source_type);
SQL

  log "Database initialized at $DB_PATH"
}

# --- Backup ---
backup_db() {
  if [[ -f "$DB_PATH" ]]; then
    local backup_name
    backup_name="index-$(date '+%Y%m%d-%H%M%S').db"
    cp "$DB_PATH" "$BACKUP_DIR/$backup_name"
    # Keep only last 5 backups
    ls -t "$BACKUP_DIR"/index-*.db 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
    log "Backed up to $BACKUP_DIR/$backup_name"
  fi
}

# --- Indexing ---

# Get stored mtime for a path (0 if not indexed)
get_stored_mtime() {
  local path="$1"
  sqlite3 "$DB_PATH" "SELECT COALESCE(MAX(mtime), 0) FROM entries WHERE source_path = '$path';" 2>/dev/null || echo "0"
}

# Index a single markdown file
index_md_file() {
  local filepath="$1"
  local incremental="${2:-false}"

  [[ -f "$filepath" ]] || return 0

  local rel_path="${filepath#$PROJECT_ROOT/}"
  local current_mtime
  current_mtime=$(stat -f '%m' "$filepath" 2>/dev/null || stat -c '%Y' "$filepath" 2>/dev/null || echo "0")

  # Incremental: skip if mtime unchanged
  if [[ "$incremental" == "true" ]]; then
    local stored_mtime
    stored_mtime=$(get_stored_mtime "$rel_path")
    if [[ "$current_mtime" -le "$stored_mtime" ]]; then
      return 0
    fi
  fi

  local source_type
  source_type=$(classify_source "$filepath")
  local ts
  ts=$(extract_ts "$filepath")

  # Remove old entries for this file
  sqlite3 "$DB_PATH" "DELETE FROM entries WHERE source_path = '$(echo "$rel_path" | sed "s/'/''/g")';"

  # Read file and index paragraphs (blocks separated by blank lines)
  local line_no=0
  local block=""
  local block_start=1

  while IFS= read -r line || [[ -n "$line" ]]; do
    line_no=$((line_no + 1))

    if [[ -z "$line" ]] && [[ -n "$block" ]]; then
      # End of block -- index it
      # Escape single quotes for SQL
      local safe_block
      safe_block=$(echo "$block" | sed "s/'/''/g" | head -c 2000)
      local safe_path
      safe_path=$(echo "$rel_path" | sed "s/'/''/g")
      local safe_ts
      safe_ts=$(echo "$ts" | sed "s/'/''/g")

      sqlite3 "$DB_PATH" "INSERT INTO entries (source_type, source_path, line_no, ts, content_summary, mtime) VALUES ('$source_type', '$safe_path', $block_start, '$safe_ts', '$safe_block', $current_mtime);"

      block=""
      block_start=$((line_no + 1))
    else
      if [[ -n "$block" ]]; then
        block="$block $line"
      else
        block="$line"
        block_start=$line_no
      fi
    fi
  done < "$filepath"

  # Index remaining block
  if [[ -n "$block" ]]; then
    local safe_block
    safe_block=$(echo "$block" | sed "s/'/''/g" | head -c 2000)
    local safe_path
    safe_path=$(echo "$rel_path" | sed "s/'/''/g")
    local safe_ts
    safe_ts=$(echo "$ts" | sed "s/'/''/g")

    sqlite3 "$DB_PATH" "INSERT INTO entries (source_type, source_path, line_no, ts, content_summary, mtime) VALUES ('$source_type', '$safe_path', $block_start, '$safe_ts', '$safe_block', $current_mtime);"
  fi
}

# Index a log file (line-by-line, each line is an entry)
index_log_file() {
  local filepath="$1"
  local incremental="${2:-false}"

  [[ -f "$filepath" ]] || return 0

  local rel_path="${filepath#$PROJECT_ROOT/}"
  local current_mtime
  current_mtime=$(stat -f '%m' "$filepath" 2>/dev/null || stat -c '%Y' "$filepath" 2>/dev/null || echo "0")

  # Incremental: skip if mtime unchanged
  if [[ "$incremental" == "true" ]]; then
    local stored_mtime
    stored_mtime=$(get_stored_mtime "$rel_path")
    if [[ "$current_mtime" -le "$stored_mtime" ]]; then
      return 0
    fi
  fi

  local source_type
  source_type=$(classify_source "$filepath")

  # Remove old entries for this file
  sqlite3 "$DB_PATH" "DELETE FROM entries WHERE source_path = '$(echo "$rel_path" | sed "s/'/''/g")';"

  local line_no=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line_no=$((line_no + 1))
    [[ -z "$line" ]] && continue

    # Try to extract timestamp from JSON log lines
    local ts="unknown"
    if [[ "$line" =~ \"ts\":\ *\"([^\"]+)\" ]]; then
      ts="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ ^\[([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+) ]]; then
      ts="${BASH_REMATCH[1]}"
    fi

    local safe_line
    safe_line=$(echo "$line" | sed "s/'/''/g" | head -c 2000)
    local safe_path
    safe_path=$(echo "$rel_path" | sed "s/'/''/g")
    local safe_ts
    safe_ts=$(echo "$ts" | sed "s/'/''/g")

    sqlite3 "$DB_PATH" "INSERT INTO entries (source_type, source_path, line_no, ts, content_summary, mtime) VALUES ('$source_type', '$safe_path', $line_no, '$safe_ts', '$safe_line', $current_mtime);"
  done < "$filepath"
}

# --- Main ---

mode="${1:---full}"

case "$mode" in
  --incremental)
    ensure_dirs
    if [[ ! -f "$DB_PATH" ]]; then
      log "No existing index -- running full build"
      init_db
      INCREMENTAL="false"
    else
      INCREMENTAL="true"
    fi

    local_count=0

    # Index markdown files from source directories
    for src_dir in "${SOURCES[@]}"; do
      [[ -d "$src_dir" ]] || continue
      while IFS= read -r -d '' file; do
        index_md_file "$file" "$INCREMENTAL"
        local_count=$((local_count + 1))
      done < <(find "$src_dir" -name '*.md' -type f -print0 2>/dev/null)
    done

    # Index log files
    for log_file in "${LOG_FILES[@]}"; do
      if [[ -f "$log_file" ]]; then
        index_log_file "$log_file" "$INCREMENTAL"
        local_count=$((local_count + 1))
      fi
    done

    log "Incremental index complete: scanned $local_count files"
    ;;

  --stats)
    if [[ ! -f "$DB_PATH" ]]; then
      echo "No index exists at $DB_PATH"
      exit 1
    fi

    echo "=== Brain Index Statistics ==="
    echo ""
    echo "Database: $DB_PATH"
    echo "Size: $(du -h "$DB_PATH" | cut -f1)"
    echo ""
    echo "Entries by source_type:"
    sqlite3 "$DB_PATH" "SELECT source_type, COUNT(*) as count FROM entries GROUP BY source_type ORDER BY count DESC;"
    echo ""
    echo "Total entries: $(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entries;")"
    echo "Unique files: $(sqlite3 "$DB_PATH" "SELECT COUNT(DISTINCT source_path) FROM entries;")"
    echo ""
    echo "Most recent indexed files:"
    sqlite3 "$DB_PATH" "SELECT source_path, datetime(mtime, 'unixepoch') as last_modified FROM entries GROUP BY source_path ORDER BY mtime DESC LIMIT 5;"
    ;;

  --full|"")
    ensure_dirs
    backup_db

    # Remove old DB for full rebuild
    rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
    init_db

    file_count=0

    # Index markdown files from source directories
    for src_dir in "${SOURCES[@]}"; do
      [[ -d "$src_dir" ]] || continue
      while IFS= read -r -d '' file; do
        index_md_file "$file" "false"
        file_count=$((file_count + 1))
      done < <(find "$src_dir" -name '*.md' -type f -print0 2>/dev/null)
    done

    # Index log files
    for log_file in "${LOG_FILES[@]}"; do
      if [[ -f "$log_file" ]]; then
        index_log_file "$log_file" "false"
        file_count=$((file_count + 1))
      fi
    done

    # Optimize FTS
    sqlite3 "$DB_PATH" "INSERT INTO entries_fts(entries_fts) VALUES('optimize');"

    log "Full index complete: indexed $file_count files"
    ;;

  --help|-h)
    echo "Usage: aegis-brain-index.sh [--full|--incremental|--stats|--help]"
    echo ""
    echo "Build FTS5 search index over .aegis/brain/ content."
    echo ""
    echo "Options:"
    echo "  --full          Full rebuild (default). Backs up existing index first."
    echo "  --incremental   Only re-index files changed since last run (mtime check)."
    echo "  --stats         Print index statistics."
    echo "  --help          Show this help."
    exit 0
    ;;

  *)
    echo "Unknown option: $mode" >&2
    echo "Usage: aegis-brain-index.sh [--full|--incremental|--stats|--help]" >&2
    exit 1
    ;;
esac
