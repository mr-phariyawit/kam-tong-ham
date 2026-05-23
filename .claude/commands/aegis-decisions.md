---
name: aegis-decisions
description: "Search Nick Fury's decision-audit log — filter by source, date, or free-text query"
triggers:
  en: decisions, decision audit, search decisions, why did we
  th: ค้นการตัดสินใจ, ทำไมเราถึง
---

# /aegis-decisions

## Quick Reference

Search the AEGIS decision-audit log via the FTS5 brain index (v10-06 infrastructure). Returns ranked decisions with full question + answer + reasoner.

Use this when you need to recall *why* a past decision was made — the audit log captures Nick Fury's reasoning, the source of the call (instinct/ADR/framework/judgment), and the confidence score.

## Flags

| Flag | Effect |
|------|--------|
| (default) | Full-text search across decision-audit.log via FTS5 |
| `--source <name>` | Filter by source: `framework`, `judgment`, `instinct:promoted`, `adr:*`, etc. |
| `--since YYYY-MM-DD` | Only decisions on or after this date |
| `--limit <N>` | Max results (default: 10) |
| `--tail <N>` | Skip search; print last N decisions chronologically |
| `--json` | Output JSONL for piping into jq |

## Examples

```
/aegis-decisions "MBP escalation"
/aegis-decisions --source judgment "approve"
/aegis-decisions --source framework --since 2026-05-01 "v14"
/aegis-decisions --tail 5
/aegis-decisions --json "hermes" | jq '.[] | select(.confidence > 0.9)'
```

## Implementation

Backed by `tools/aegis-decision-search.sh`, which wraps `tools/aegis-brain-search.sh --type decisions` and post-filters by source. Requires an up-to-date brain index — run `bash tools/aegis-brain-index.sh --incremental` first if results look stale.

## Decision sources (per aegis-log-decision.sh schema)

| Source | When used |
|--------|-----------|
| `framework` | Decision derived from framework rules (CLAUDE.md, ADRs, sprint plan) |
| `judgment` | Free judgment when no instinct/framework rule applied — requires `--reasoning` at log time |
| `instinct:promoted` | Decision backed by a promoted instinct |
| `instinct:active` / `instinct:pending` | Lower-confidence instinct backing |
| `resonance:<file>` | Decision derived from a resonance file |
| `adr:<id>` | Decision derived from a specific ADR |
| `retro:<date>` | Decision derived from a retro's lesson |
| `identity` | Identity-level decision (rare) |
| `auto-defer-to-captain` | Auto-deferred to Captain America orchestrator |

## Continuation Protocol (MBP / Golden Rule #7)

After running, do NOT pause to ask "what next?" — apply the chain in [command-chain.md](../references/command-chain.md).
