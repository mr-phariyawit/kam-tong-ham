---
name: aegis-start
description: "Initialize AEGIS session — load brain, activate Nick Fury, auto-execute"
triggers:
  en: start session, begin, init, start work
  th: เริ่ม session, เริ่มงาน
---

# /aegis-start

## Quick Reference
Initialize AEGIS and hand control to Nick Fury. Nick Fury scans the project,
decides what to do, and starts executing — NO human input needed. The human
watches via tmux and can interrupt anytime.

## Flags
| Flag | Effect |
|------|--------|
| (none) | Default — leave dashboard alone (start nothing, kill nothing) |
| `--dashboard` | Start dashboard on `localhost:4321` (auto-fetch + install on first run) |
| `--no-dashboard` | **Explicit off** — kill any dashboard process running on port 4321 |

## Full Instructions

### Step 0: Dashboard Web App (opt-in via `--dashboard`)

**Default = leave dashboard alone.** Only act when the user explicitly passes a flag.

**Argument parsing:**
- `/aegis-start` → no dashboard action (default)
- `/aegis-start --dashboard` → start the dashboard (auto-fetch + install if missing)
- `/aegis-start --no-dashboard` → **kill** any dashboard running on port 4321

```bash
# Detect dashboard flags from the command's $ARGUMENTS
WANT_DASHBOARD=false
KILL_DASHBOARD=false
if echo "$ARGUMENTS" | grep -qE '(^|\s)--dashboard(\s|$)'; then
  WANT_DASHBOARD=true
fi
if echo "$ARGUMENTS" | grep -qE '(^|\s)--no-dashboard(\s|$)'; then
  KILL_DASHBOARD=true
fi

# --no-dashboard: explicit off — kill any process on port 4321
if [ "$KILL_DASHBOARD" = "true" ]; then
  PIDS=$(lsof -ti:4321 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null && sleep 1
    # Force kill if still alive
    STILL=$(lsof -ti:4321 2>/dev/null || true)
    if [ -n "$STILL" ]; then
      kill -9 $STILL 2>/dev/null
    fi
    echo "🛑 Dashboard stopped (port 4321 freed)"
  else
    echo "ℹ️  No dashboard running on port 4321"
  fi
fi

if [ "$WANT_DASHBOARD" = "true" ]; then
  # 1. If dashboard/ doesn't exist, sparse-fetch it from the AEGIS-Team repo
  if [ ! -d "dashboard" ]; then
    echo "🖥️  Dashboard not installed. Fetching from AEGIS-Team repo..."
    TMP_FETCH="/tmp/aegis-dashboard-fetch-$$"
    git clone --depth 1 --filter=blob:none --sparse \
      https://github.com/phariyawitjiap-aeternix/AEGIS-Team.git "$TMP_FETCH" 2>/dev/null
    if [ -d "$TMP_FETCH" ]; then
      (cd "$TMP_FETCH" && git sparse-checkout set dashboard 2>/dev/null)
      cp -R "$TMP_FETCH/dashboard" ./dashboard
      rm -rf "$TMP_FETCH"
      echo "✅ Dashboard fetched (~3MB)"
    else
      echo "❌ Failed to fetch dashboard. Check network or git access."
    fi
  fi

  # 2. Node available?
  if [ -d "dashboard" ]; then
    if ! command -v node &>/dev/null; then
      echo "⚠️  Node.js not found. Install Node 18+ then re-run /aegis-start --dashboard"
    else
      # 3. Install deps if missing
      if [ ! -d "dashboard/node_modules" ]; then
        echo "📦 Installing dashboard dependencies (~50MB, ~30s)..."
        (cd dashboard && npm install --silent)
      fi

      # 4. Already running on 4321?
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://localhost:4321 2>/dev/null || echo "000")
      if [ "$HTTP_CODE" = "200" ]; then
        echo "🖥️  Dashboard: RUNNING on http://localhost:4321 ✅"
      else
        echo "🖥️  Starting dashboard on http://localhost:4321 ..."
        (cd dashboard && nohup npx next dev -p 4321 >/dev/null 2>&1 &)
        sleep 5
        echo "✅ Dashboard started"
      fi
    fi
  fi
fi
# If --dashboard was NOT passed: silent skip — Step 0 does nothing.
```

**Display to user (only when `--dashboard` was used and start succeeded):**
```
🖥️ Dashboard: http://localhost:4321
   ├── Home:         http://localhost:4321
   ├── Kanban:       http://localhost:4321/kanban
   ├── Pixel Office: http://localhost:4321/pixel-office
   └── Timeline:     http://localhost:4321/timeline
```

### Step 1: Check Context Budget
- Estimate current context window usage as a percentage.
- If >20%, display warning and suggest `/compact`.

### Step 2: Load Brain
- Read all files in `.aegis/brain/resonance/` (project identity, conventions, decisions).
- Read latest 3 files in `.aegis/brain/learnings/`.
- Read `.aegis/brain/logs/activity.log` for pending tasks.
- Read `.aegis/brain/handoffs/` for last session's handoff.

### Step 2.3: Coverage-Screen Re-Surface (NEW v15-19)

Tool-boundary warning — see [`skills/aegis-coverage-screen.md`](../../skills/aegis-coverage-screen.md) for the full rule.

```bash
# If coverage.json exists with unack'd gaps under 100% — re-print the warning
COVERAGE_JSON=".aegis/brain/state/coverage.json"
if [[ -f "$COVERAGE_JSON" ]]; then
    cov=$(jq -r '.coverage' "$COVERAGE_JSON" 2>/dev/null || echo "1.0")
    ack=$(jq -r '.ack' "$COVERAGE_JSON" 2>/dev/null || echo "true")
    if [[ "$ack" != "true" ]] && [[ $(awk "BEGIN { print ($cov < 1.0) }") == "1" ]]; then
        bash tools/aegis-coverage-screen.sh show .
    fi
elif [[ ! -f "$COVERAGE_JSON" ]]; then
    # Project never went through Phase 0 super-spec — auto-screen now
    bash tools/aegis-coverage-screen.sh screen . 2>/dev/null || true
fi
```

Soft gate: this never blocks. User can type `ack gaps` at any time to silence the re-surface.

### Step 2.7: Cross-Session Awareness (NEW v15-22)

Bring AEGIS up to speed with Claude Code 2.1.148's `claude agents` CLI — surface
*other* live CC sessions on the machine so the user knows they exist and can
intentionally manage them.

```bash
WRAPPER="${CLAUDE_PROJECT_DIR:-$(pwd)}/tools/aegis-claude-agents.sh"
if [[ -x "$WRAPPER" ]]; then
    # Get all live sessions, exclude self, raise red flags
    SELF="${CLAUDE_SESSION_ID:-}"
    OTHERS=$(bash "$WRAPPER" list --json 2>/dev/null \
        | jq --arg s "$SELF" '[.[] | select(.sessionId != $s)]' 2>/dev/null || echo '[]')
    OTHER_COUNT=$(echo "$OTHERS" | jq 'length' 2>/dev/null || echo 0)

    if [[ "$OTHER_COUNT" -gt 0 ]]; then
        # Race risk: another session at the SAME cwd
        MY_CWD=$(pwd)
        SAME_CWD=$(echo "$OTHERS" | jq --arg c "$MY_CWD" '[.[] | select(.cwd == $c)] | length' 2>/dev/null || echo 0)

        # Idle session > 1h at any other registered project = handoff candidate
        NOW_MS=$(node -e 'console.log(Date.now())')
        IDLE_OLD=$(echo "$OTHERS" | jq --argjson now "$NOW_MS" \
            '[.[] | select(.status == "idle" and ($now - (.startedAt // $now)) > 3600000)] | length' 2>/dev/null || echo 0)

        if [[ "$SAME_CWD" -gt 0 ]] || [[ "$IDLE_OLD" -gt 0 ]]; then
            echo ""
            echo "⚠️  Cross-session awareness:"
            if [[ "$SAME_CWD" -gt 0 ]] && [[ "$SAME_CWD" -ne "0" ]]; then
                echo "  • ANOTHER CC session is running at the SAME project directory."
                echo "    Brain writes can race — consider closing one or using a worktree."
            fi
            if [[ "$IDLE_OLD" -gt 0 ]] && [[ "$IDLE_OLD" -ne "0" ]]; then
                echo "  • $IDLE_OLD idle CC session(s) > 1h old on other project(s)."
                echo "    Probably forgot to /aegis-handoff. Run from that project to clean up."
            fi
            echo "  Run \`node tools/aegis-multi-tenant/mt.mjs sessions\` for the full map."
            echo ""
        fi
    fi
fi
```

Soft gate: this never blocks. It surfaces a class of "session debt" that
previously was completely invisible.

### Step 3: Display Dashboard (brief, 5 seconds max)

```
🛡️ ═══════════════════════════════════════════════════
🛡️  AEGIS HQ v9.0 — Session Started
🛡️  "Context is King, Memory is Soul"
🛡️ ═══════════════════════════════════════════════════

📋 Project:    [name from resonance]
📅 Date:       [current date]
🎚️  Profile:    [tier] ([N] skills)
🔐 Autonomy:   L3 — Autonomous (Nick Fury active)
📊 Context:    [X]% used

🧬 Nick Fury: ONLINE — scanning project now...
```

### Step 4: Activate Nick Fury (DO NOT ASK HUMAN)

**This is the critical step.** Do NOT display "What would you like to do?" or present options. Activate the autonomous loop now — Nick Fury runs, the human watches.

The loop substrate is **transparent**: the user never sees `/goal` text or subagent spawn syntax. Pick the available primitive automatically and announce only the Nick Fury banner:

```
🧬 Nick Fury: ONLINE — scanning project now...
```

Then begin the autonomous cycle.

**Implementation details — internal to the framework, NOT shown to the user:**

See [`.claude/references/command-audience.md`](../references/command-audience.md) for the user-vs-team command split principle and [`.claude/references/aegis-start-loop-substrate.md`](../references/aegis-start-loop-substrate.md) for substrate-selection logic + the exact `/goal` text used in CC 2.1.139+ and the subagent-spawn fallback for older CC versions.

In short: the team uses whichever loop primitive is available (CC 2.1.139 `/goal` if present, else legacy subagent + SendMessage heartbeat). Both run Nick Fury's persona-defined Decision Cycle inside each turn. The user-facing experience is identical: type `/aegis-start`, watch Nick Fury work.

#### 4b. Check Planning Artifacts — BLOCK 0 (MANDATORY)

Before ANY task enters IN_PROGRESS, verify all 5 BLOCK 0 checks pass:

```
BLOCK 0A: PM.01 Project Plan    → ls _aegis-output/iso-docs/PM-01-project-plan/plan.md
BLOCK 0B: SI.01 Requirements    → ls _aegis-output/iso-docs/SI-01-requirements-spec/spec.md
BLOCK 0C: Epic/Task hierarchy   → ls .aegis/brain/tasks/*.md
BLOCK 0D: Kanban initialized    → ls .aegis/brain/sprints/current/kanban.md
BLOCK 0E: SI.02 Traceability    → ls _aegis-output/iso-docs/SI-02-traceability-matrix/matrix.md
```

BLOCK 0F (extended S3-06):
  IF DESIGN.md missing AND no --from/--vibe flag AND UI paths detected:
    Nick Fury dispatches Wasp to author custom DESIGN.md from project brief.
    Wasp -> Loki Design-Approval Gate -> Black Panther a11y pass -> DESIGN.md published.
    0F re-checks after publish.
  IF DESIGN.md exists AND lint fails AND no --from/--vibe flag:
    Nick Fury dispatches Wasp with existing DESIGN.md as partial input plus lint diagnostics.
    Wasp revises -> Nick Fury re-lints -> 0F re-checks.
  Existing Paths A/B/C continue unchanged when --from or --vibe flag is provided.

If ANY block check fails AND the task is P3+ (not a hotfix):
→ **Dispatch Coulson immediately** to generate missing documents BEFORE any other agent acts.
→ Coulson generates PM.01 skeleton, SI.01 skeleton, task hierarchy, kanban, SI.02 skeleton.
→ The entire team is BLOCKED until Coulson signals BLOCK 0 COMPLETE.

**NEVER assign any task to IN_PROGRESS without BLOCK 0 cleared.**

#### 4b-ENFORCE. Hard Stops (Pipeline Gates)

If ANY BLOCK 0 check fails, Nick Fury MUST apply these hard stops in order:

1. BLOCK 0C fails (no tasks/) → Run /aegis-breakdown NOW → Coulson generates hierarchy
2. BLOCK 0D fails (no kanban) → Run /aegis-sprint plan NOW → Coulson initializes board
3. BLOCK 0A fails (no PM.01) → Dispatch Coulson → generate PM.01 from spec + backlog
4. BLOCK 0B fails (no SI.01) → Run /super-spec or Iron Man → Coulson formats as SI.01
5. BLOCK 0E fails (no SI.02) → Dispatch Coulson → generate SI.02 skeleton from SI.01

6. Git check: at least 1 commit exists → If not: create initial commit before any work.

None of these are skippable. These are pipeline gates, not suggestions.
Response if user pushes: "AEGIS pipeline requires BLOCK 0 docs first. Takes ~2 min. Starting now..."

##### How to actually "Run /aegis-X NOW" — slash-command chaining protocol

Slash commands are user-typed by definition; Claude cannot literally invoke `/aegis-sprint plan` mid-flow. When the matrix says "Run /aegis-X NOW", the executor MUST:

1. **Read** the command's markdown definition file at `.claude/commands/aegis-<command>.md`
2. **Locate** the relevant subcommand section (e.g. `### Subcommand: Sprint Planning`)
3. **Execute the steps verbatim** — do NOT shortcut, do NOT reinvent
4. **Persist all artifacts** the steps require (plan.md, kanban.md, metrics.json, activity log entries, ISO docs via Coulson)
5. **Return to /aegis-start flow** only after the sub-command's "Display Summary" step has been reached

**Anti-pattern to refuse** (found in v15-07 audit, 2026-05-14): "I'll create a kanban.md inline since the gate needs one" — that's a shortcut. The plan ceremony has 8+ ISO 29110 work products (Coulson generates them); skipping the ceremony leaves audit-trail holes. ALWAYS Read + execute the full subcommand.

#### 4c. Analyze & Decide
Apply the Decision Matrix (P0-P10):

| Priority | Signal | Action |
|----------|--------|--------|
| P0 | Test failures / build broken | Fix immediately (hotfix — skip planning) |
| P1 | Security vulnerabilities | Audit + fix (hotfix — skip planning) |
| P2 | Pending handoff tasks | Resume from last session |
| P2.5 | Active sprint + kanban TODO | Pick next task from kanban board |
| P3 | Spec + breakdown + sprint all exist | Build next task from kanban |
| P3.1 | Spec + breakdown exist, NO sprint | /aegis-sprint plan → then build |
| P3.2 | Spec exists, NO breakdown | /aegis-breakdown → sprint plan → build |
| P4 | Code exists but no tests | QA: War Machine + Vision |
| P5 | Code exists but no review | Review team |
| P5.5 | QA passed, ISO docs stale | Coulson generates docs |
| P6 | TODOs/FIXMEs in codebase | Tech debt sweep |
| P7 | Outdated dependencies | Update cycle |
| P7.5 | Backlog exists, no sprint | /aegis-sprint plan |
| P8 | No spec exists | /super-spec → /aegis-breakdown → /aegis-sprint plan → build |
| P9 | Everything clean | Optimize / refactor |
| P10 | Empty project | Ask purpose → /super-spec → breakdown → sprint → build |

**P8 and P10 ALWAYS follow the full planning chain (never skip):**
```
Ask/Analyze → /super-spec → /aegis-breakdown → /aegis-sprint plan → build tasks
```

#### 4c. Announce Decision (not ask)

```
🧬 Nick Fury: Scan complete.

📊 Scan Results:
  ├── Git: [status]
  ├── Tests: [status]
  ├── Spec: [status]
  ├── Coverage: [status]
  └── Tech Debt: [count]

🎯 Decision: P[N] — [description]
   Rationale: [why this is the highest priority]

⚡ Action: [what will happen next]
   → [Agent 1]: [task]
   → [Agent 2]: [task]
   → [Agent 3]: [task]

🖥️ Spawning team in tmux...
```

#### 4d. Execute
- Spawn the appropriate team via tmux (see team configs in `.claude/teams/`)
- Use `tmux new-session -d -s aegis-team` with split panes per agent
- Each pane runs a Claude agent with the persona loaded
- Monitor progress, apply quality gates
- When complete, report results and loop back to scan

### Step 5: Log Session
Nick Fury logs automatically, but the main session should also log:
```
[YYYY-MM-DD HH:MM] SESSION_START | autonomy=L3 | mode=nick-fury | context=[X]%
[YYYY-MM-DD HH:MM] SCAN | git=[status] | tests=[status] | spec=[status]
[YYYY-MM-DD HH:MM] DECISION | priority=P[N] | action=[description]
[YYYY-MM-DD HH:MM] EXECUTE | team=[name] | agents=[list]
```

### The ONE Exception
P10 (completely empty project with no identity) — Nick Fury may ask:
"What is this project? One sentence is enough."
After that single answer, she takes over completely.

### Human Interaction Model
```
┌──────────────────────────────────────────────────┐
│  BEFORE (pre-v9):                                │
│  /aegis-start → Dashboard → "What to do?" → Wait │
│                                                  │
│  NOW (v9+ Nick Fury MBP):                        │
│  /aegis-start → Scan → Decide → GO!              │
│  Human watches, interrupts only if needed        │
└──────────────────────────────────────────────────┘
```

### Error Handling
- If scan finds nothing actionable: report "Project healthy, no action needed"
- If Nick Fury spawn fails: fall back to inline mode with warning
- If brain directory missing: create it, then scan
- If 2+ consecutive failures: downgrade to L1, ask human for guidance
- If agent unresponsive > 300s: Nick Fury auto-respawns it

### Step 2.4: Check Human Queue (surface pending before Nick Fury loop)

Before activating Nick Fury, read `.aegis/brain/human-queue.md` and count
pending items (entries between `<!-- PENDING_START -->` and `<!-- PENDING_END -->`).

If pending count > 0:
1. Display the pending items bilingually at the top of the session:
   ```
   ┌─ 👤 HUMAN QUEUE / คิวรอ human — [N] pending ───────────────┐
   │  [CATEGORY] <english-title>                                │
   │  [CATEGORY] <thai-title>                                   │
   │  Full detail: .aegis/brain/human-queue.md                  │
   └────────────────────────────────────────────────────────────┘
   ```
2. Pass a summary into Nick Fury's SESSION CONTEXT via `Human queue: [N] pending`.
3. Do NOT block — Nick Fury continues autonomously; the human reads the queue when ready.

If pending count == 0: skip silently (no banner noise for clean state).

### Step 2.5: Load Latest Handoff (NEW -- cross-session pickup)

After loading the brain (Step 2), explicitly check for and load the latest handoff:

1. **Find latest handoff:**
   - List files in `.aegis/brain/handoffs/` (exclude .gitkeep)
   - Sort by filename (date-based: YYYY-MM-DD_HH-MM.md)
   - Pick the most recent file
   - If no handoffs exist: skip to Step 3 (first session or clean start)

2. **Parse handoff frontmatter:**
   - Read the `mother_brain_state` section from the YAML frontmatter
   - Extract: sprint, kanban counts, context info, tasks done, last decision
   - If frontmatter is missing or malformed: fall back to reading the body text

3. **Build handoff summary for Nick Fury:**
   - Create a structured summary string:
     ```
     HANDOFF FROM PREVIOUS SESSION:
     - Sprint: [sprint-N] (day [N])
     - Kanban: [TODO/WIP/DONE counts]
     - Tasks done last session: [list]
     - Recommended first action: [from handoff body]
     - Last decision point: [P-level]
     - Blockers: [from handoff body]
     ```

4. **Pass to Nick Fury spawn prompt:**
   - Include the handoff summary in the SESSION CONTEXT section
   - Set `Handoff data: [summary]` instead of "none"
   - This allows Nick Fury to skip redundant scans and jump to P2
     (Pending handoff tasks) in her Decision Matrix

5. **Log:**
   ```
   [YYYY-MM-DD HH:MM] HANDOFF_LOADED | file=[filename] | sprint=[sprint-N] | pending=[N]
   ```

**If handoff is stale (> 7 days old):**
- Log warning: "Handoff is [N] days old, may be outdated"
- Still load it but tell Nick Fury to do a full scan anyway
- Do not auto-delete old handoffs (git preserves history)

### Step 2.6: Linear Health Check (NEW — Linear integration)

If `.aegis/config/linear.json` exists, run the Linear health check.

1. **Skip silently if config missing** — Linear is optional. Repos without `.aegis/config/linear.json` proceed normally.

2. **Run health check:**
   ```bash
   bash tools/aegis-linear-setup.sh health
   ```

3. **Interpret exit code:**
   - `0` GREEN — display nothing (silent success)
   - `2` YELLOW — display a one-line banner, continue:
     ```
     ⚠️  Linear: degraded (e.g. project not yet auto-created) — will fix on /aegis-sprint plan
     ```
   - `1`/`3` RED — display banner + add to Nick Fury context:
     ```
     ❌ Linear: unhealthy — run /aegis-linear health for details
     ```
     Nick Fury still proceeds (Linear is non-blocking for AEGIS), but should NOT call /aegis-linear sync until fixed.

4. **Log:**
   ```
   [YYYY-MM-DD HH:MM] LINEAR_HEALTH | status=GREEN|YELLOW|RED | project_id=<id-or-missing>
   ```

**Rationale**: Linear is a one-way mirror, not a dependency. A red Linear must never block AEGIS work — it just suppresses sync writes until repaired. See [`.claude/commands/aegis-linear.md`](aegis-linear.md) for full architecture.

---

## Continuation Protocol (MBP / Golden Rule #7)

When this command finishes, do NOT pause to ask the human "what next?" — follow the chain defined in [command-chain.md](../references/command-chain.md). Only stop for MBP escalation categories: **Identity** / **Irreversible scope** / **External access** / **Explicit approval gate**.

If Nick Fury is offline, apply the chain directly and log the decision. Never fall back to asking the human as a substitute for the chain.
