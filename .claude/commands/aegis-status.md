---
name: aegis-status
description: "Show team status dashboard — agents, tasks, progress, context, recent activity"
triggers:
  en: status, team status, what is happening, dashboard
  th: สถานะ, ตอนนี้ทำอะไรอยู่
---

# /aegis-status

## Modes

| Flag | Behavior | Source |
|------|----------|--------|
| (default) | Team status dashboard | existing |
| `--kanban` | Sprint kanban board | was /aegis-kanban |
| `--dashboard` | Sprint burndown + metrics | was /aegis-dashboard |
| `--context` | Context window budget | was /aegis-context |

## Quick Reference
Team status dashboard showing all active agents/teammates with their current task
and progress, overall pipeline progress, context budget summary, and last 5 actions
from activity.log. Formatted as a readable table. Use anytime to get a snapshot
of what AEGIS is doing.

## Full Instructions

### Step 1: Check Nick Fury Status (ADR-008)
- Nick Fury is a persona overlay, not a daemon. Status is determined by recent Agent dispatches.
- Check `.aegis/brain/logs/activity.log` for recent Agent dispatch entries.
- If dispatches exist in current session: **ACTIVE**
- If no dispatches yet this session: **STANDBY** (waiting for /aegis-start)

### Step 2: Check Active Agents
- Determine which agents/teammates are currently active in this session.
- Check for:
  - tmux sessions with AEGIS agent names
  - Subagent tasks in progress
  - The main orchestrator (Captain America) status
- For each agent, determine:
  - Name and role emoji
  - Current task (if any)
  - Status: idle / working / waiting / blocked / done
  - Last activity timestamp
  - Progress percentage (estimate based on task completion)

### Step 3: Display Agent Status Table
- Format as a table:
  ```
  ╔══════════════════════════════════════════════════════════════════╗
  ║  AEGIS Team Status                              v8.2.1         ║
  ╠══════════════════════════════════════════════════════════════════╣
  ║                                                                 ║
  ║  💓 Nick Fury: ALIVE (last pulse: 12s ago)                   ║
  ║     Cycle: #7 | Agents spawned: 3 | Tasks done: 2              ║
  ║                                                                 ║
  ║  Agent          Task                    Status      Progress    ║
  ║  ─────────────  ──────────────────────  ──────────  ────────    ║
  ║  🧭 Captain America        Orchestrating session   ✅ Active   —           ║
  ║  🔨 Beast       Scanning codebase       🔄 Working  60%         ║
  ║  📖 Iron Man        (idle)                  💤 Idle     —           ║
  ║  🛡️ Black Panther       (idle)                  💤 Idle     —           ║
  ║  🎨 Songbird        (idle)                  💤 Idle     —           ║
  ║  ⚡ Spider-Man        (idle)                  💤 Idle     —           ║
  ║  💥 Loki       (idle)                  💤 Idle     —           ║
  ║                                                                 ║
  ╚══════════════════════════════════════════════════════════════════╝
  ```
- Only show agents relevant to the current session/profile.
- If Nick Fury is OFFLINE, show warning:
  ```
  ⚠️ Nick Fury: OFFLINE — run /aegis-start to activate
  ```

### Step 3: Show Pipeline Progress
- If a pipeline is running (/aegis-pipeline, /aegis-flow, etc.):
  ```
  Pipeline: /aegis-pipeline — Phase 2 of 3 (Deep Analysis)
  ██████████████░░░░░░░░ 65%
  Gate 1: ✅ Passed | Gate 2: 🔄 Pending | Gate 3: ⬜ Not started
  ```
- If no pipeline is active:
  ```
  Pipeline: None active
  ```

### Step 3.5: Show Grand Total Progress

Run `bash tools/aegis-progress.sh --bar` and display the one-line result.
For fuller detail (`aegis-progress.sh` without flag), show the dashboard
boxed display. This tells the user where we are against ALL known scope,
not just the current sprint.

Source: `.aegis/brain/sprints/roadmap.md` — update that file on every
sprint open/close/rescope.

### Step 3.75: Show Team Chat Tail

Show last 5 inter-agent events from today's chat log at
`.aegis/brain/conversations/$(date -u +%Y-%m-%d)/chat.log`.
Format per-line: `ICON time from → to [TASK] TYPE: msg`.

If no chat log exists for today: skip silently (no bare-file noise).

### Step 4: Show Context Budget
- Quick context summary (abbreviated version of /aegis-context):
  ```
  Context: 45% used 🟡 | ~55% remaining
  ```

### Step 4.5: Show Human Queue Status

Read `.aegis/brain/human-queue.md` and count pending entries between the
`<!-- PENDING_START -->` / `<!-- PENDING_END -->` sentinels.

```
Human Queue: [N] pending / [N] รอ
```

If N > 0, list the first 3 titles bilingually:
```
Human Queue: 2 pending / 2 รอ
  [EXPLICIT] Approve prod deploy v2.3.0 / อนุมัติ deploy v2.3.0
  [EXTERNAL] Provide STAGING_API_KEY / ขอ key STAGING_API
```

If N == 0: `Human Queue: clean ✓ / ไม่มีคิวค้าง ✓`

Full queue: `.aegis/brain/human-queue.md`.

### Step 5: Show Recent Activity
- Read last 5 entries from `.aegis/brain/logs/activity.log`.
- Display:
  ```
  Recent Activity:
  [14:32] Beast scanned 47 files in src/
  [14:30] Session started at L2 autonomy
  [14:28] Loaded handoff from previous session
  [13:45] (previous session) Black Panther completed code review
  [13:30] (previous session) Session ended
  ```
- If activity.log doesn't exist or is empty: "No activity recorded yet."

### Step 6: Format Final Output
- Combine all sections into a single cohesive dashboard.
- Keep it compact but informative.
- End with available actions:
  ```
  Quick actions: /aegis-context (detailed) | /aegis-pipeline (start) | /aegis-retro (end)
  ```

---

## Continuation Protocol (MBP / Golden Rule #7)

When this command finishes, do NOT pause to ask the human "what next?" — follow the chain defined in [command-chain.md](../references/command-chain.md). Only stop for MBP escalation categories: **Identity** / **Irreversible scope** / **External access** / **Explicit approval gate**.

If Nick Fury is offline, apply the chain directly and log the decision. Never fall back to asking the human as a substitute for the chain.
