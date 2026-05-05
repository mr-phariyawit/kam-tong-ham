# Command Chain — No-Pause Protocol for AEGIS Commands

> "After a command finishes, the next action comes from the chain, not from the human."

This reference is the single source of truth for what happens **after** each `/aegis-*` command completes. It is part of the Master Brain Protocol (MBP) enforcement layer (Golden Rule #7).

## The rule

When a command's steps complete, the orchestrator has three — and only three — legal next moves:

1. **Chain**: invoke the next command in the defined chain for this one (see below).
2. **Return to Nick Fury**: hand control back to Nick Fury's scan-decide-execute loop.
3. **End naturally**: if the session is genuinely done (retro saved, handoff saved, all agents finished), stop. No banner or option menu.

**Illegal**: presenting an option menu to the human ("run retro? handoff? start?"). That is the `Options: A / B / C` anti-pattern Rule #7 bans.

## The 4 allowed exceptions (MBP escalation categories)

The command MAY pause for the human **only** when one of these is true:

| Category | Example |
|----------|---------|
| **Identity** (P10 empty-repo only) | "What is this project?" on a brand-new empty repo |
| **Irreversible scope** | "Delete the legacy module permanently?" |
| **External access** | "Provide API keys / credentials" |
| **Explicit approval gate** | "Production deploy approved?" |

Everything else routes through Nick Fury via `QUESTION_TO_BRAIN`, or picks a sensible default and proceeds.

## The chain — what follows what

### Session lifecycle

| Command | Default next action |
|---|---|
| `/aegis-start` | Nick Fury scan-decide-execute loop until context ≥ 80% or all tasks done → auto-chain to `/aegis-retro` |
| `/aegis-retro` | Save lessons + retro file → auto-chain to `/aegis-handoff` |
| `/aegis-handoff` | Save handoff file → session ends naturally (no further prompt) |

### Pipeline commands

| Command | Default next action |
|---|---|
| `/aegis-pipeline` | Phases execute with gates → reports → apply Decision Matrix → chain to next command per priority |
| `/aegis-flow` | Run declared flow steps → ends when flow done → return to Nick Fury |
| `/aegis-deploy --launch` | Verify + release checklist → if GREEN: auto-chain to `/aegis-deploy`; if RED: log + fix loop (Spider-Man) |
| `/aegis-deploy` | Build + deploy + health check + 5-min monitor → on success: ends; on rollback: Correction Register + return to Nick Fury |

### Planning commands

| Command | Default next action |
|---|---|
| `/super-spec` | Spec written → auto-chain to `/aegis-breakdown` |
| `/aegis-breakdown` | Tasks generated → auto-chain to `/aegis-sprint plan` |
| `/aegis-sprint plan` | Sprint loaded → return to Nick Fury for task assignment |
| `/aegis-sprint standup` | Standup recorded → return to Nick Fury |
| `/aegis-sprint close` | Sprint closed → auto-chain to `/aegis-retro` |

### Build / review / QA

| Command | Default next action |
|---|---|
| `/aegis-team build` | Spec → build → review → test → on PASS: return to Nick Fury; on FAIL: fix loop |
| `/aegis-team review` | Multi-agent review → consolidated report → return to Nick Fury |
| `/aegis-team debate` | Debate output → decision logged → return to Nick Fury |
| `/aegis-pipeline --qa` | Test plan → execution → verdict → on PASS: return to Nick Fury; on FAIL: Spider-Man fix loop |
| `/aegis-verify` | Verification report → return to Nick Fury |

### Read-only / information commands

These return to the caller (the user's prompt). They don't chain because they have no next phase.

- `/aegis-status`, `/aegis-status --context`, `/aegis-status --dashboard`, `/aegis-status --kanban`, `/aegis-verify --doctor`
- `/aegis-memory` (status/recall modes), `/aegis-memory --instinct` (list mode), `/aegis-memory --adr` (list mode)
- `/aegis-memory --lint`

These commands output their report and return. They do **not** present "what next?" menus.

### Maintenance commands

| Command | Default next action |
|---|---|
| `/aegis-memory --distill` | Distillation done → return to Nick Fury |
| `/aegis-memory --evolve` | Cluster + merge → return to Nick Fury |
| `/aegis-memory --ingest` | Research ingested → return to Nick Fury |
| `/aegis-mode` | Mode switched → return to Nick Fury |
| `/aegis-memory --iso` | Compliance audit → report → return to Nick Fury |
### Deprecated Commands (removed v10-05)

The 17 legacy shim files were removed in sprint v10-05. Only the 12 canonical
commands listed above remain. If a user types an old name, Claude Code will
not find a matching command file -- the user should use the canonical form.

## Fallback rules

**If Nick Fury is offline** (no recent Agent dispatch in session):
- Apply the chain-defined next action directly
- Log the decision to `.aegis/brain/logs/activity.log`
- Do NOT fall back to asking the human as a substitute

**If the chain-defined next action is unclear or contentious**:
- Pick the most conservative default (usually: return to Nick Fury; if Nick Fury offline, end naturally)
- Log the choice with rationale
- Do NOT pause to ask

**If a gate fails**:
- The command is authorized to loop back to the previous step (e.g., Loki REJECT → Iron Man revise)
- Bounded at 2 rounds to prevent infinite loops
- After 2 failures: log + return to Nick Fury (who may escalate via MBP)

## Enforcement surfaces

- **Prompt level**: every command file has a "Continuation Protocol" footer pointing here
- **Tool level**: `guard-ask-user.sh` blocks `AskUserQuestion` from non-Nick-Fury callers
- **Session-end level**: `on-stop.sh` scans the last response for option-menu patterns and logs violations
- **Self-enforcement**: Loki auto-REJECTs specs/responses that violate this protocol

## Rationale

The v9 autonomy design (L3 default) assumes the team runs with minimal human intervention — Nick Fury decides, agents execute, human watches. Pausing after every command for "what next?" breaks that design:

1. It burns the human's attention on routine decisions they already delegated
2. It turns every session into a series of pseudo-approvals instead of actual work
3. It signals that the model hasn't internalized the autonomy contract

This protocol restores the contract. The chain is deterministic; only genuine unknowns (the 4 MBP categories) surface to the human.

## Related

- [context-rules.md](context-rules.md) §Master Brain Protocol — the broader MBP spec
- [autonomy-levels.md](autonomy-levels.md) — L1/L2/L3 definitions (this chain is L3 default)
- [CLAUDE.md](../../CLAUDE.md) Golden Rule #7 — the governing principle
