# Captain America Fallback Protocol (S2-01)

> **Purpose**: Eliminate Nick Fury Single Point of Failure (SPOF) identified in Loki review (Critical #3).

## Problem

Master Brain Protocol routes ALL agent questions through Nick Fury. If Nick Fury:
- Times out (no response in 30s)
- Returns confidence < 0.5 (judgment uncertain)
- Hits context limit
- Crashes mid-decision

…the entire agent pipeline stalls. No fallback exists in v8.4.

## Solution: Tiered Fallback Chain

```
Agent question
     │
     ▼
[Tier 1] Nick Fury (opus)  ── responds in ≤30s, confidence ≥0.5 ──> ✅ ANSWER
     │
     │ (timeout / low confidence / error)
     ▼
[Tier 2] Captain America (opus)  ── consults brain + Nick Fury context if available ──> ✅ ANSWER
     │
     │ (timeout / low confidence / error)
     ▼
[Tier 3] Escalate to human (4 categories from context-rules.md)
```

## Trigger Conditions

Captain America activates when:
1. **Timeout**: Nick Fury response > 30 seconds
2. **Low confidence**: Nick Fury returns `confidence: <0.5`
3. **Explicit defer**: Nick Fury responds with `{"defer_to": "captain-america", "reason": "..."}`
4. **Context exhaustion**: Nick Fury context > 90% full
5. **Error**: Nick Fury process error / non-200 response

## Captain America Resolution Protocol

When invoked, Captain America:

1. **Read context** -- ingest the original question + any Nick Fury partial response
2. **Brain consultation** (same as Nick Fury):
   - `.aegis/brain/instincts/promoted/`
   - `.aegis/brain/resonance/`
   - `.aegis/brain/sprints/current/`
   - Recent retrospectives
3. **Decision** with reasoning + confidence
4. **Log** to `.aegis/brain/logs/captain-fallback.log` with:
   - Trigger reason (which condition fired)
   - Original question
   - Nick Fury partial state (if any)
   - Captain decision + confidence
   - Wall-clock time

## Implementation Hooks

### In Nick Fury Agent (.claude/agents/nick-fury.md)
Add to decision flow:

```markdown
## Self-Defer Protocol (S2-01)
If you encounter ANY of:
- Question outside your knowledge (no brain match, judgment confidence < 0.5)
- Context utilization > 90%
- Multi-domain question requiring synthesis you cannot perform

Respond with:
{
  "defer_to": "captain-america",
  "reason": "<one-line explanation>",
  "partial_findings": "<any relevant context for Cap to use>"
}

Do NOT escalate to human directly (preserves Master Brain Protocol).
```

### In Captain America Agent (.claude/agents/captain-america.md)
Add new responsibility:

```markdown
## Fallback Brain (S2-01)
You are tier-2 brain when Nick Fury defers. Inputs:
- Original question
- Nick Fury partial findings (if any)
- Trigger reason

Process: same brain consultation as Nick Fury, but with fresh context window.
If you also cannot decide: escalate to human via 4-category protocol.
Log to .aegis/brain/logs/captain-fallback.log.
```

### Hook (Optional, future)
A SessionStart hook can monitor:
- Nick Fury response time over rolling window
- Defer rate (defer/total decisions)
- Alert if defer rate > 20% (suggests Nick Fury knowledge gap)

## Confidence Threshold (Loki Counter-recommendation)

Per Loki review: "If Nick Fury answers from judgment (lvl-8 fallback) >3 times per session, auto-escalate."

Track in `.aegis/brain/metrics/judgment-fallback-counter.json`:
```json
{
  "session_id": "2026-04-19-001",
  "judgment_count": 0,
  "threshold": 3,
  "auto_escalate_on_threshold": true
}
```

When threshold crossed, Nick Fury's next defer goes directly to Captain America (skip own judgment retry).

## Testing

Acceptance criteria (S2-01):
- [ ] Captain America resolves at least 1 simulated Nick Fury timeout
- [ ] Defer log written correctly
- [ ] Confidence counter increments + triggers at threshold
- [ ] No regression in existing Master Brain Protocol routing

## Known Limitations

- Both agents may have same blind spots (same training data)
- True diversity requires different model (e.g., Captain America on Sonnet vs Nick Fury on Opus -- but both currently opus per agents/CLAUDE_agents.md)
- Future: consider having Loki as tier-3 (adversarial) before human escalation
