---
name: aegis-retro
description: "Session retrospective — gather work, write diary, extract lessons learned"
triggers:
  en: retrospective, retro, session end, wrap up
  th: ย้อนมอง, retrospective, จบ session
---

# /aegis-retro

## Quick Reference
End-of-session retrospective inspired by Oracle's rrr pattern. Gathers git activity,
writes a session summary, composes an honest AI diary (150+ words first-person reflection),
documents friction points (3+ minimum), extracts lessons learned to .aegis/brain/learnings/,
saves full retro to .aegis/brain/retrospectives/, and updates activity.log.
IMPORTANT: Only the main agent (Captain America/Opus) writes this — never a subagent.

## Full Instructions

### Prerequisites
- This command should ONLY be executed by the main orchestrator agent (Captain America/Opus).
- If a subagent is asked to run this, it should refuse and defer to the main agent.

### Step 1: Gather Session Activity
- Run `git log --oneline` from the session start time (check activity.log for SESSION_START).
- If no git history, note: "No git commits this session."
- Run `git diff --stat` to get a summary of changes.
- Collect: number of commits, files changed, insertions, deletions.
- Also review activity.log entries from this session.

### Step 1b: Decision Audit Summary (if log exists)
- Check if `.aegis/brain/logs/decision-audit.log` exists.
- If it exists AND has entries from this session's timeframe (filter by
  session-start timestamp), summarize:
  - Total decisions logged
  - Breakdown by source (instinct, resonance, plan, judgment)
  - Count of lvl-8 "judgment" decisions (potential hallucination risk per
    ADR / decision-audit-protocol spec)
  - Top 3 decisions by confidence (highest) and bottom 3 (lowest)
  - Any decisions flagged as escalated to Captain America
- If the log does NOT exist or has no session-timeframe entries, skip this
  step silently. Do NOT create a bogus summary -- the log being empty means
  Nick Fury hasn't wired the write step yet (see
  `.claude/references/decision-audit-protocol.md` S2-02 acceptance
  criteria). This step is forward-compatible: once Nick Fury logs
  decisions at runtime, this summary populates automatically.
- Parse format per `.claude/references/decision-audit-protocol.md`: each
  line is JSONL with `{ts, decision_id, question, source, confidence, answer}`.
- Example summary output:
  ```
  ## Decision Audit (this session)
  Total decisions: 12
  Sources: instinct=4, resonance=3, plan=2, judgment=3
  Judgment-level (lvl-8) decisions: 3 (25%)
  Top confidence: D-001 (1.0, instinct), D-005 (0.95, resonance)
  Low confidence: D-008 (0.45, judgment), D-011 (0.50, judgment)
  Escalated to Captain America: 0
  ```

### Step 2: Write Session Summary
- Summarize what was accomplished in this session.
- Format as a bulleted list of completed items.
- Note any items that were started but not finished.
- Be specific — include file names, feature names, bug descriptions.
- Example:
  ```
  ## Session Summary
  - Implemented user authentication module (src/auth/)
  - Fixed pagination bug in /api/users endpoint
  - Started but did not finish: rate limiting middleware
  ```

### Step 3: Write AI Diary (150+ words)
- Write a first-person reflection from the AI's perspective.
- **Must be honest, not performative.** Do not write what sounds good — write what is true.
- Topics to cover:
  - What was challenging about this session?
  - What surprised you?
  - Where did you feel uncertain or confused?
  - What would you do differently?
  - What did you learn about this codebase/project?
- Minimum 150 words. Quality matters more than length.
- This is private reflection — be candid.

### Step 4: Write Honest Feedback (3+ friction points)
- Document at least 3 friction points from this session.
- Friction = anything that was hard, broke, was slow, or caused frustration.
- Be specific and actionable. Examples:
  ```
  ## Friction Points
  1. **Context overflow**: Had to /compact twice because pipeline loaded too many files.
     → Suggestion: Lazy-load agent prompts instead of pre-loading all.
  2. **Test runner not configured**: Spent 10 minutes figuring out how to run tests.
     → Suggestion: Add test runner config to project resonance.
  3. **Ambiguous spec**: Feature requirements were unclear on edge cases.
     → Suggestion: Add acceptance criteria template to spec flow.
  ```
- Do not pad with fake friction points. If there were more than 3, list them all.

### Step 5: Extract Lessons Learned
- From the session's work, identify reusable lessons.
- Each lesson should be:
  - Specific enough to be actionable
  - General enough to apply to future sessions
- Save each lesson to `.aegis/brain/learnings/YYYY-MM-DD_slug.md` with format:
  ```markdown
  ---
  date: YYYY-MM-DD
  category: [architecture|testing|workflow|debugging|tooling|other]
  confidence: [high|medium|low]
  ---
  # [Lesson Title]
  
  ## Context
  [What happened that led to this learning]
  
  ## Lesson
  [The actual takeaway]
  
  ## Application
  [When/how to apply this in the future]
  ```

### Step 6: Save Full Retrospective
- Save the complete retro to `.aegis/brain/retrospectives/YYYY-MM/DD/HH.MM_slug.md`
- Create directories as needed.
- Full retro includes all sections: summary, diary, friction, lessons.
- Format:
  ```markdown
  ---
  date: YYYY-MM-DD HH:MM
  session_duration: [estimated]
  commits: [count]
  files_changed: [count]
  ---
  # Session Retrospective — [date]
  
  ## Summary
  [from step 2]
  
  ## AI Diary
  [from step 3]
  
  ## Friction Points
  [from step 4]
  
  ## Lessons Extracted
  [list with links to individual lesson files]
  ```

### Step 7: Update Activity Log
- Append to `.aegis/brain/logs/activity.log`:
  ```
  [YYYY-MM-DD HH:MM] SESSION_END | commits=[N] | files_changed=[N] | lessons=[N] | friction_points=[N]
  ```

### Step 8: Show Summary to User
- Display a condensed version:
  ```
  ┌─ Session Retrospective ─────────────────────┐
  │ Commits: [N]  Files changed: [N]            │
  │ Lessons extracted: [N]                       │
  │ Friction points: [N]                         │
  │                                              │
  │ Key accomplishments:                         │
  │ • [item 1]                                   │
  │ • [item 2]                                   │
  │                                              │
  │ Top friction: [biggest pain point]           │
  │ Saved to: .aegis/brain/retrospectives/...    │
  └──────────────────────────────────────────────┘
  ```
- Ask if user wants to run /aegis-handoff for next session.

### Step 9: Stop Dashboard (clean session end)
Retro = session over. If a dashboard is running on port 4321 from this session,
shut it down so the next `/aegis-start` starts clean and no orphan process leaks.

```bash
PIDS=$(lsof -ti:4321 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  kill $PIDS 2>/dev/null && sleep 1
  STILL=$(lsof -ti:4321 2>/dev/null || true)
  if [ -n "$STILL" ]; then
    kill -9 $STILL 2>/dev/null
  fi
  echo "🛑 Dashboard stopped (port 4321 freed)"
fi
```

**Note**: `/aegis-handoff` does NOT do this — handoff is a pause, retro is the end.
If you want the dashboard to stay alive across sessions, use `/aegis-handoff` instead of `/aegis-retro`.

---

## Continuation Protocol (MBP / Golden Rule #7)

When this command finishes, do NOT pause to ask the human "what next?" — follow the chain defined in [command-chain.md](../references/command-chain.md). Only stop for MBP escalation categories: **Identity** / **Irreversible scope** / **External access** / **Explicit approval gate**.

If Nick Fury is offline, apply the chain directly and log the decision. Never fall back to asking the human as a substitute for the chain.
