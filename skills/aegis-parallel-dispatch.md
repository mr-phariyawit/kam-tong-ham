---
name: aegis-parallel-dispatch
description: "Discipline + helper for fanning work out across multiple Agent subagents in a single message. Closes G4 from the AEGIS-Plus Mega Plan. Use this skill whenever the user wants to dispatch multiple agents concurrently, fan out work, run parallel reviews, run multi-agent analysis, or aggregate results across several subagents. Triggers on 'fan out', 'run in parallel', 'dispatch agents', 'parallel review', 'multi-agent review', 'concurrent subagents', 'ทำพร้อมกัน', 'กระจายงาน', 'รีวิวแบบขนาน'."
profile: standard
triggers:
  en: ["fan out", "run in parallel", "dispatch agents", "parallel review", "multi-agent review", "concurrent subagents"]
  th: ["ทำพร้อมกัน", "กระจายงาน", "รีวิวแบบขนาน", "ส่งงานพร้อมกัน"]
---

## Quick Reference

`aegis-parallel-dispatch` is **discipline + a helper**. The actual parallelism comes from Claude Code's native `Agent` tool — Claude can emit multiple `Agent({...})` calls in a single message and they run concurrently. This skill makes that pattern reliable.

- **Helper**: `tools/aegis-parallel-dispatch/dispatch.mjs` — manifest → markdown plan with N parallel Agent stubs
- **Hard cap**: 5 concurrent subagents (Claude Code limit). Helper rejects N>5 unless `--force`
- **Examples**: `tools/aegis-parallel-dispatch/examples/parallel-review.md`

## When to invoke

- Reviewing multiple PRs / files / codebases at once
- Running independent test suites concurrently
- Multi-persona review (Vigil + Bolt + Sage on the same code, in parallel)
- Cross-cutting investigation (security + perf + style on one diff)
- Anything where ≥2 tasks are **independent** (no shared state, no sequential dep)

## Workflow

1. **Define the manifest** (JSON):
   ```json
   {
     "topic": "review PR #142 from 3 angles",
     "agent_type": "code-reviewer",
     "tasks": [
       { "description": "security review", "prompt": "Look for OWASP-top-10..." },
       { "description": "perf review",     "prompt": "Look for N+1 / hot loops..." },
       { "description": "style review",    "prompt": "Style guide compliance..." }
     ]
   }
   ```

2. **Generate the plan**:
   ```bash
   node tools/aegis-parallel-dispatch/dispatch.mjs --file manifest.json
   ```

3. **Emit ALL Agent calls in ONE message** (this is the discipline part):
   - Read the plan
   - Issue all `Agent({...})` calls in a single response message
   - Wait for all subagent results to come back
   - Aggregate into the result table the plan provides

4. **Report aggregated results** — never dump raw subagent output, always summarize in the result table with one-line key finding per row.

## Discipline rules

| Rule | Why |
|---|---|
| One message, multiple Agent calls | Sequential dispatch wastes wall time and breaks parallelism |
| Hard cap = 5 | Claude Code's concurrent-subagent limit |
| Aggregate before reporting | Three raw responses ≠ a useful answer |
| Independent tasks only | If B depends on A, run sequentially |
| Always pass full context to each subagent | Subagents start cold — no shared session |

## Three worked examples

### 1. Parallel PR review (3 angles)

See [`tools/aegis-parallel-dispatch/examples/parallel-review.md`](../tools/aegis-parallel-dispatch/examples/parallel-review.md).

### 2. Parallel test runs across packages

```json
{
  "topic": "run jest in 4 packages concurrently",
  "agent_type": "general-purpose",
  "tasks": [
    {"description": "test packages/api",    "prompt": "Run npm test in packages/api and report results"},
    {"description": "test packages/web",    "prompt": "Run npm test in packages/web and report results"},
    {"description": "test packages/shared", "prompt": "Run npm test in packages/shared and report results"},
    {"description": "test packages/cli",    "prompt": "Run npm test in packages/cli and report results"}
  ]
}
```

### 3. Multi-persona spec review

```json
{
  "topic": "spec review by 3 personas",
  "tasks": [
    {"description": "Iron Man architecture review", "agent_type": "iron-man",      "prompt": "Review SPEC.md from architecture POV"},
    {"description": "Loki adversarial review",      "agent_type": "loki",          "prompt": "Find every weakness in SPEC.md"},
    {"description": "War Machine QA review",        "agent_type": "war-machine",   "prompt": "Identify untestable claims in SPEC.md"}
  ]
}
```

## Aggregation table (helper auto-generates)

| # | Task | Result | Key finding |
|---|------|--------|-------------|
| 1 | … | (fill in) | (fill in) |
| 2 | … | (fill in) | (fill in) |
| 3 | … | (fill in) | (fill in) |

## Tests

```bash
bash tests/aegis-parallel-dispatch-test.sh
```

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §6.4
- `superpowers:dispatching-parallel-agents` (existing complementary skill from superpowers plugin)
