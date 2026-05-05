#!/usr/bin/env bash
# aegis-brain-search.sh — Query the FTS5 brain index built by aegis-brain-index.sh
#
# Sprint v10-06 Story B (3pt) — searchable brain query interface
#
# Usage:
#   aegis-brain-search.sh "query terms"
#   aegis-brain-search.sh --type learnings "policy"
#   aegis-brain-search.sh --since 2026-04-20 --limit 5 "MBP"
#   aegis-brain-search.sh --json "hermes"
#
# Returns ranked snippets from the brain (handoffs, retros, learnings,
# resonance, sprints, decisions) with file path + line number for follow-up.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="$PROJECT_ROOT/.aegis/brain/index.db"

# --- Defaults ---
TYPE_FILTER=""
SINCE_FILTER=""
LIMIT=10
FORMAT="text"
QUERY=""

usage() {
  cat <<EOF
Usage: aegis-brain-search.sh [options] <query>

Query the FTS5 brain index. Returns ranked snippets with provenance.

Options:
  --type <name>       Filter by source_type (handoffs|retros|learnings|resonance|sprints|decisions)
  --since <YYYY-MM-DD> Only entries with mtime on or after this date
  --limit <N>         Max results (default: 10)
  --json              Output raw JSON (one record per line)
  --stats             Print index stats and exit
  --help              Show this help

Examples:
  aegis-brain-search.sh "MBP violation"
  aegis-brain-search.sh --type learnings "policy without test"
  aegis-brain-search.sh --since 2026-04-20 --limit 5 "hermes"
  aegis-brain-search.sh --json "v10-05" | jq .

Build/refresh the index first via: bash tools/aegis-brain-index.sh --incremental
EOF
}

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --type)    TYPE_FILTER="$2"; shift 2 ;;
    --since)   SINCE_FILTER="$2"; shift 2 ;;
    --limit)   LIMIT="$2"; shift 2 ;;
    --json)    FORMAT="json"; shift ;;
    --stats)   exec bash "$SCRIPT_DIR/aegis-brain-index.sh" --stats ;;
    --help|-h) usage; exit 0 ;;
    --*)       echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)         QUERY="${QUERY:+$QUERY }$1"; shift ;;
  esac
done

# --- Validate ---
if [[ -z "$QUERY" ]]; then
  echo "Error: query is required" >&2
  usage >&2
  exit 2
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "Error: brain index not found at $DB_PATH" >&2
  echo "Build it first: bash tools/aegis-brain-index.sh --full" >&2
  exit 1
fi

# Validate type filter against known set
if [[ -n "$TYPE_FILTER" ]]; then
  case "$TYPE_FILTER" in
    handoffs|retros|learnings|resonance|sprints|decisions|other) ;;
    *) echo "Error: invalid --type '$TYPE_FILTER'" >&2
       echo "Valid: handoffs|retros|learnings|resonance|sprints|decisions|other" >&2
       exit 2 ;;
  esac
fi

# Convert --since YYYY-MM-DD to unix epoch for mtime comparison
SINCE_EPOCH=0
if [[ -n "$SINCE_FILTER" ]]; then
  if [[ ! "$SINCE_FILTER" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "Error: --since must be YYYY-MM-DD format" >&2
    exit 2
  fi
  if SINCE_EPOCH=$(date -j -f "%Y-%m-%d" "$SINCE_FILTER" "+%s" 2>/dev/null); then
    :
  elif SINCE_EPOCH=$(date -d "$SINCE_FILTER" "+%s" 2>/dev/null); then
    :
  else
    echo "Error: cannot parse --since date '$SINCE_FILTER'" >&2
    exit 2
  fi
fi

# Validate limit is a positive integer
if [[ ! "$LIMIT" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: --limit must be a positive integer" >&2
  exit 2
fi

# --- Build SQL ---
# FTS5 MATCH does the ranking; bm25() returns a relevance score (lower is better).
# Use parameterized-style escaping by doubling single quotes.
escape_sql() { printf '%s' "$1" | sed "s/'/''/g"; }

# FTS5 treats unquoted hyphens as the NOT operator, so a bare query like
# "ADR-007" parses as "ADR NOT 007" and fails with "no such column: 007".
# Wrap hyphenated identifiers (alnum_ on both sides of a hyphen) in double
# quotes so FTS5 sees them as phrases. Tokens already inside a quoted phrase
# pass through untouched.
preprocess_fts_query() {
  local query="$1" out="" tok="" in_q=0 i ch
  local re='^[[:alnum:]_]+(-[[:alnum:]_]+)+$'
  for ((i=0; i<${#query}; i++)); do
    ch="${query:i:1}"
    if (( in_q )); then
      out+="$ch"; [[ "$ch" == '"' ]] && in_q=0
    elif [[ "$ch" == '"' || "$ch" == ' ' || "$ch" == $'\t' ]]; then
      if [[ "$tok" =~ $re ]]; then out+="\"$tok\""; else out+="$tok"; fi
      tok=""; out+="$ch"
      [[ "$ch" == '"' ]] && in_q=1
    else
      tok+="$ch"
    fi
  done
  if [[ "$tok" =~ $re ]]; then out+="\"$tok\""; else out+="$tok"; fi
  printf '%s' "$out"
}

SAFE_QUERY=$(escape_sql "$(preprocess_fts_query "$QUERY")")

WHERE_CLAUSES=("entries_fts MATCH '$SAFE_QUERY'")
if [[ -n "$TYPE_FILTER" ]]; then
  WHERE_CLAUSES+=("e.source_type = '$(escape_sql "$TYPE_FILTER")'")
fi
if [[ "$SINCE_EPOCH" -gt 0 ]]; then
  WHERE_CLAUSES+=("e.mtime >= $SINCE_EPOCH")
fi

# Join WHERE clauses with " AND " (IFS only takes single chars, so join manually)
WHERE_SQL="${WHERE_CLAUSES[0]}"
for ((i=1; i<${#WHERE_CLAUSES[@]}; i++)); do
  WHERE_SQL="$WHERE_SQL AND ${WHERE_CLAUSES[$i]}"
done

if [[ "$FORMAT" == "json" ]]; then
  # JSON output — one object per line
  SQL="SELECT json_object(
         'rank', bm25(entries_fts),
         'source_type', e.source_type,
         'source_path', e.source_path,
         'line_no', e.line_no,
         'ts', e.ts,
         'mtime', e.mtime,
         'snippet', snippet(entries_fts, 0, '<<', '>>', '...', 16)
       )
       FROM entries_fts
       JOIN entries e ON e.id = entries_fts.rowid
       WHERE $WHERE_SQL
       ORDER BY bm25(entries_fts) ASC
       LIMIT $LIMIT;"
  sqlite3 "$DB_PATH" "$SQL"
else
  # Text output — ranked human-readable list
  SQL="SELECT
         printf('%.2f', bm25(entries_fts)) || '|' ||
         e.source_type || '|' ||
         e.source_path || '|' ||
         e.line_no || '|' ||
         e.ts || '|' ||
         snippet(entries_fts, 0, '«', '»', '…', 18)
       FROM entries_fts
       JOIN entries e ON e.id = entries_fts.rowid
       WHERE $WHERE_SQL
       ORDER BY bm25(entries_fts) ASC
       LIMIT $LIMIT;"

  results=$(sqlite3 "$DB_PATH" "$SQL")

  if [[ -z "$results" ]]; then
    echo "No matches for: $QUERY"
    [[ -n "$TYPE_FILTER" ]] && echo "  (type=$TYPE_FILTER)"
    [[ -n "$SINCE_FILTER" ]] && echo "  (since=$SINCE_FILTER)"
    exit 0
  fi

  echo "=== Brain search: \"$QUERY\" ==="
  [[ -n "$TYPE_FILTER" ]] && echo "    type=$TYPE_FILTER"
  [[ -n "$SINCE_FILTER" ]] && echo "    since=$SINCE_FILTER"
  echo ""

  rank_n=0
  while IFS='|' read -r rank stype spath lineno ts snippet; do
    rank_n=$((rank_n + 1))
    printf "%2d. [%s] %s:%s\n" "$rank_n" "$stype" "$spath" "$lineno"
    [[ "$ts" != "unknown" ]] && [[ -n "$ts" ]] && printf "    ts: %s\n" "$ts"
    printf "    %s\n\n" "$snippet"
  done <<< "$results"
fi
