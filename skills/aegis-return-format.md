---
name: aegis-return-format
description: "Sub-agent return format — every non-trivial claim must be tagged [VERIFIED: <command>] (backed by executed command) or [PRODUCED: unverified] (artifact exists but not executed). Closes Contra-Thai F-C: returns conflate produced and verified, main agent inherits paper claims."
profile: minimal|standard|full
triggers:
  en: ["return format", "verified vs produced", "tag claims", "sub-agent return"]
  th: ["รูปแบบ return", "verified vs produced", "ติด tag"]
reads: []
writes: []
wires:
  - "tools/aegis-return-validator.sh"
tests:
  - "tests/aegis-return-format-test.sh"
supersedes: []
---

## Why this exists

From the Contra-Thai post-mortem (2026-05-20):

> When Spider-Man returns: "Closes S02-02. 28 EditMode tests added. All quality bar checks pass." — main agent has three options: trust verbatim, spot-check, or run. Option 3 doesn't scale. Option 1 produces **inherited paper claims** — claims technically not lies (Spider-Man wrote 28 test methods) but not what they sound like ("tests pass" was Spider-Man's reading of `dotnet build`-equivalent, not `dotnet test`).

This is a **format problem**, not a dishonesty problem. The rule: make the distinction visible per claim.

## The rule

Every non-trivial claim in a sub-agent return MUST carry one of two tags:

- **`[VERIFIED: <command>]`** — backed by an executed command. Cite the exact command that produced the result.
- **`[PRODUCED: unverified]`** — artifact exists but was not executed/run against ground truth.

What counts as "non-trivial"? Anything quantitative or status-bearing:

- Counts: "28 tests added", "13 findings", "3 stories closed", "0 errors"
- Boolean status: "all tests pass", "build succeeded", "no warnings"
- Closure: "Closes S03-02", "Resolves issue #182"
- Done declarations: "DONE", "✓", "complete", "shipped"

What doesn't need tagging: narrative prose, opinion, recommendations, design notes.

## Examples

### ❌ Bad (the Contra-Thai pattern)

```text
Closes S02-02. Added PlayerShooter.cs (180 LOC) with projectile pool
and 28 EditMode unit tests. All quality checks pass. Loki review found
2 MED findings, both fixed.
```

Reader assumes the tests ran and passed. They didn't — Spider-Man only verified the C# compiled. Main agent inherits this as "tests pass" in close.md.

### ✅ Good

```text
Closes S02-02. [PRODUCED: unverified] Added PlayerShooter.cs (180 LOC)
with projectile pool and 28 EditMode unit tests. [VERIFIED: dotnet build
Assembly-CSharp.csproj — exit 0] C# compiles. [PRODUCED: unverified]
Tests added but NOT executed — Unity Editor required to run NUnit;
agent cannot drive Unity. [VERIFIED: bash tools/aegis-loki-scan.sh] Loki
review found 2 MED findings, both fixed.
```

Reader sees clearly: compile is verified, tests are produced-but-unverified.
Main agent does not inherit a false "tests pass" claim.

### ✅ Good (web/CLI project — full verification possible)

```text
Closes S04-01. [VERIFIED: npm test — 47 pass, 0 fail] Test suite green.
[VERIFIED: npm run build — exit 0, dist/ produced] Build succeeded.
[VERIFIED: curl -I http://localhost:3000/api/health — 200 OK] Endpoint
responds. [PRODUCED: unverified] OpenAPI doc generated; not validated
against running spec yet.
```

## How main agent should consume tagged returns

1. **Trust `[VERIFIED]` claims** at face value if the cited command is reasonable. Spot-check the command output if the claim affects downstream decisions.
2. **Treat `[PRODUCED]` claims as work-in-progress, not done.** They become DONE when verification fires — usually at sprint close.
3. **Treat untagged claims as `[PRODUCED]` by default.** The validator tool surfaces these; ratio > 30% in a return = retry the dispatch with the tagging rule reinforced.

## Validator helper

`tools/aegis-return-validator.sh` scans a return text and reports the ratio:

```bash
bash tools/aegis-return-validator.sh check <file-or-stdin>
bash tools/aegis-return-validator.sh summary <file-or-stdin>
```

Soft gate — always exits 0. Designed for review, not block. Main agent
can pipe sub-agent returns through it: high untagged ratio = re-prompt.

## When this applies

- **Every sub-agent return** to main agent
- **Every commit message** that claims "tests pass" / "feature complete"
- **Every sprint close.md** in the "Demo / Acceptance" table
- **Every persona's status report** when summarizing other-persona work

## When this doesn't apply

- Plain conversation between user and main agent (the tagging is overhead for natural dialogue)
- Sub-agent internal reasoning / thinking (only the final return matters)
- Trivial acknowledgments ("ok, done.")

## Linked memory + skills

- [[aegis-coverage-contract]] — the parent contract: 100% autonomy except requirements + credentials
- [[policy-without-test]] — bug class this skill closes (rule had no enforcement before v15-20)
- Contra-Thai research report 2026-05-20 — F-C origin
