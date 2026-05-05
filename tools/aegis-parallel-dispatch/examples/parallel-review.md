# Example: Parallel PR review

Spawn three reviewers concurrently — one for security, one for performance, one for code style — then aggregate.

## Manifest (parallel-review.json)

```json
{
  "topic": "review PR #142 from three angles",
  "agent_type": "code-reviewer",
  "model": "sonnet",
  "tasks": [
    {
      "description": "security review of PR #142",
      "prompt": "Review the diff in PR #142 for OWASP top-10 issues. Report HIGH/MED/LOW with line refs."
    },
    {
      "description": "performance review of PR #142",
      "prompt": "Review the diff in PR #142 for N+1 queries, hot loops, and unnecessary allocations. Report findings with line refs."
    },
    {
      "description": "code-style review of PR #142",
      "prompt": "Review the diff in PR #142 against this repo's style guide (CLAUDE.md). Report nits + violations."
    }
  ]
}
```

## Generate the plan

```bash
node tools/aegis-parallel-dispatch/dispatch.mjs --file parallel-review.json
```

This prints a markdown plan with three `Agent({...})` blocks. Claude reads the plan, then emits all three Agent tool calls **in one message** so they run concurrently.

## Discipline rules

1. **One message, multiple Agent calls.** The whole point of this skill is parallelism. Sequential dispatch wastes wall time.
2. **Hard cap = 5.** Claude Code limits concurrent subagents. The helper rejects manifests with N>5 unless `--force`.
3. **Aggregate before reporting.** Don't dump three raw subagent responses on the user. Combine into the markdown summary table the helper gives you, with a one-line key finding per row.
4. **Independent tasks only.** Parallel dispatch is for tasks with no shared state. If task B depends on task A's output, run sequentially.
