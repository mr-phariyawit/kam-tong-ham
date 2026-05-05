# Decision Audit Protocol (S2-02)

> **Purpose**: Track Nick Fury "judgment" decisions (lvl-8 fallback) to detect knowledge gaps.
> Address Loki Critical #3: "Nick Fury Decision priority lvl-8 = own judgment = hallucination risk"

## Why

Master Brain Protocol decision priority:
1. Promoted instincts (highest)
2. Active instincts
3. Resonance patterns
4. ADRs
5. Project identity
6. Framework defaults
7. Recent retrospectives
8. **Own judgment (lowest, last resort)**

Without audit, lvl-8 decisions are invisible. If Nick Fury falls back to judgment 80% of the time, the brain isn't being utilized -- but no one notices.

## Audit Log Format

File: `.aegis/brain/logs/decision-audit.log` (append-only)

```jsonl
{"ts":"2026-04-20T10:30:00Z","decision_id":"D-001","question":"Which gitignore mode?","source":"instinct:promoted","instinct_id":"sentinel-markers-over-comment-regex","confidence":1.0,"answer":"shared mode with sentinels"}
{"ts":"2026-04-20T10:35:00Z","decision_id":"D-002","question":"Should we add npm to allow list?","source":"judgment","confidence":0.45,"answer":"no, require approval","reasoning":"npm install runs arbitrary install hooks"}
{"ts":"2026-04-20T10:40:00Z","decision_id":"D-003","question":"Sprint 1 first task?","source":"plan","confidence":0.95,"answer":"S1-01 VERSION file","reasoning":"explicit recommendation in plan"}
```

Required fields:
- `ts` — ISO 8601 UTC timestamp
- `decision_id` — sequential within session
- `question` — what was asked (one line)
- `source` — one of: `instinct:promoted|active|pending`, `resonance:<file>`, `adr:<id>`, `identity`, `framework`, `retro:<date>`, `judgment`
- `confidence` — 0.0 to 1.0 self-assessed
- `answer` — what Nick Fury decided (one line)
- `reasoning` — optional, REQUIRED when `source: judgment`

## Auto-Escalation Trigger

Counter file: `.aegis/brain/metrics/judgment-fallback-counter.json`

```json
{
  "session_id": "2026-04-20-001",
  "started_at": "2026-04-20T09:00:00Z",
  "judgment_count": 0,
  "threshold": 3,
  "auto_escalate_on_threshold": true,
  "last_judgment_at": null
}
```

When `judgment_count >= threshold`:
- Next defer goes to Captain America (per [captain-america-fallback.md](captain-america-fallback.md))
- If Captain also returns judgment: escalate to human (4-category protocol)
- Reset counter at session end

## Implementation Hook

In Nick Fury agent decision flow:

```python
def make_decision(question):
    # Try priority chain
    for tier in [PROMOTED_INSTINCTS, ACTIVE_INSTINCTS, RESONANCE, ADRS,
                  IDENTITY, FRAMEWORK, RETROS]:
        result = consult(tier, question)
        if result and result.confidence >= 0.5:
            log_decision(question, source=tier, **result)
            return result.answer

    # Lvl-8 fallback: own judgment
    increment_judgment_counter()
    if judgment_counter.exceeded_threshold():
        log_decision(question, source="auto-defer-to-captain",
                     reasoning="judgment threshold exceeded")
        return defer_to(captain_america, question)

    judgment = synthesize_answer(question)
    log_decision(question, source="judgment",
                 confidence=judgment.confidence,
                 reasoning=judgment.reasoning)
    return judgment.answer
```

## Session Retrospective Integration

`/aegis-retro` command should:
1. Read `decision-audit.log` for the session
2. Compute distribution: `{promoted: X%, active: Y%, ..., judgment: Z%}`
3. Flag if `judgment > 30%` -- indicates brain has knowledge gaps
4. Suggest creating new instincts to cover repeated judgment topics

Example retro output:
```
Decision Sources This Session:
  promoted instincts: 8 (40%)
  resonance        : 5 (25%)
  ADRs             : 3 (15%)
  judgment         : 4 (20%) ⚠️ above 15% target

Recurring judgment topics (consider creating instincts):
  - "permission allow list scope" (3 occurrences)
  - "BLOCK 0 mode for X-pt task" (1)
```

## Acceptance Criteria (S2-02)

- [x] Reference doc explains audit format (this file)
- [x] Counter file schema defined (above)
- [x] Auto-escalation trigger documented (above)
- [x] Nick Fury agent updated to write audit entries (`@references/decision-audit-protocol.md` + QUESTION_TO_BRAIN format referenced in `.claude/agents/nick-fury.md`)
- [x] Aegis-retro command updated to summarize audit (Step 1b added in
  `.claude/commands/aegis-retro.md`: reads `.aegis/brain/logs/decision-audit.log`
  if present, summarizes decisions by source / confidence / judgment-level
  count / escalation count. Silently skips if log missing, so it's forward-
  compatible with Nick Fury's future runtime write-integration.)
- [x] Nick Fury runtime appends to decision-audit.log per decision
  (agent-prompt instruction added in `.claude/agents/nick-fury.md`
  under "How Nick Fury logs decisions (S2-02)": JSONL format,
  decision_id convention, source + confidence taxonomy, skip rule for
  trivial calls, graceful failure if disk write fails. Additive-only
  -- doesn't override existing decision logic, only adds the log step.)
- [ ] Tested: 5 simulated decisions logged correctly (not run -- requires
  live Nick Fury session with instrumented decisions)
- [ ] Tested: judgment counter triggers Captain defer at threshold (not run
  -- same as above)

**Audit note (2026-04-20)**: doc + Nick Fury reference + retro-summary
wiring are in place. The chicken-and-egg is now just on Nick Fury's
runtime write step (agent prompt edit). When that lands, the retro step
activates automatically -- no second deployment needed.

## Source Attribution Rules

The `source` field MUST reflect the actual knowledge source consulted,
not the decision-making mode.

- If Nick Fury read instinct `sentinel-markers-over-comment-regex` before deciding,
  `source` is `instinct:promoted` and `source_id` is
  `sentinel-markers-over-comment-regex` — even though the act of deciding is a judgment.
- Do NOT default to `--source judgment` when an instinct was consulted. The
  auto-reinforce pipeline (F3-02) depends on `instinct:*` entries to close the
  instinct lifecycle loop.
- If multiple sources were consulted, use the highest-priority one (promoted > active >
  pending > resonance > adr > retro > framework > identity > judgment).
- `source_id` is required for all `instinct:*` and `adr:*` sources.

## Privacy Note

Audit log contains decision questions and answers. May reveal sensitive project context.
- For Tier 1 brain (per-project): logs stay in `.aegis/brain/logs/` (project-scoped)
- For Tier 2 brain: logs do NOT promote (privacy boundary per ADR-006)
- For Tier 3 brain: only aggregated metrics promote, not raw logs
