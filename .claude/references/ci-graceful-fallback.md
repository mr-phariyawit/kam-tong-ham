# CI-graceful-fallback pattern

> **When a test depends on accumulated runtime state that doesn't exist in a CI fresh checkout, gracefully degrade — don't fail.**

Sprint v13-02 AI-4 (codified from v13-01 retro).

## Problem

Several AEGIS tests assume the local repo has accumulated runtime artifacts:

| Artifact | Tests that assume it | What CI gets |
|----------|---------------------|--------------|
| `.aegis/brain/logs/decision-audit.log` (Nick Fury writes) | `aegis-pattern-mine-test` T11 | Empty / missing |
| `.aegis/brain/logs/maintainer-mode.log` (`aegis-maintainer-grant.sh` writes) | `aegis-maintainer-test` T10 | Empty / missing |
| Compiled FTS5 index in `.aegis/brain/index.db` | `aegis-brain-search-test` (and FTS5 itself on macOS-latest CI) | Missing / FTS5 unavailable |
| Global git config (user.name + user.email) | Any test that does `git init && git commit` | Unset on GitHub-hosted runners |
| `claude` CLI on PATH | `aegis-install-v11-delivery-test` (runs install.sh) | Not installed on runners |

These tests pass locally because the dev machine has accumulated state. CI fresh checkouts fail. Sprint v13-01 chunk-3 / Phase E hit each of these.

## Pattern

**Two-tier graceful fallback:**

1. **Test the local-dev assertion first.** When the runtime artifact is present and the assertion logically holds, run the assertion as-written. Local dev catches real regressions.

2. **Fall back to the weakest meaningful check in CI.** When `${CI:-}=true` is set (GitHub Actions sets it automatically), gracefully reduce the assertion to "the system is structurally healthy on a clean checkout":
   - If a log is empty in CI, "log can be read with 0 entries" is still a valid pass.
   - If accumulated state doesn't exist, an explicit log message ("CI fresh checkout — no runtime history") records the skip rationale.
   - Optionally pre-seed minimal fixture state in the test's setup function instead of asserting accumulated state.

The pattern is **not "skip in CI"** — that erases coverage. It is **"reduce the assertion to what is meaningful with no history"**.

## Canonical examples (from sprint-v13-01)

### Pattern A: log-existence becomes "log readable" in CI

```bash
# tests/aegis-pattern-mine-test.sh T11
LIVE_AUDIT=$(echo "$OUT" | jq '.audit_lines_total')
if [[ $LIVE_AUDIT -gt 0 ]]; then
    pass "live mine reads decision-audit.log ($LIVE_AUDIT lines)"
elif [[ "${CI:-}" = "true" ]]; then
    # CI fresh checkout has no accumulated decision-audit history.
    # Mine reads the (empty) log successfully — that's still "reads
    # decision-audit.log", just zero entries to mine.
    pass "live mine reads decision-audit.log (0 lines — CI fresh checkout)"
else
    fail "live mine reads decision-audit.log" "audit_lines=$LIVE_AUDIT"
fi
```

### Pattern B: gated capability check + graceful skip

```bash
# tests/aegis-brain-search-test.sh — sqlite3 FTS5 availability
if ! echo 'CREATE VIRTUAL TABLE t USING fts5(x);' | sqlite3 ":memory:" 2>/dev/null; then
  echo "SKIP: sqlite3 on this platform lacks FTS5 support — test environment limitation."
  echo "  (Real meta-repo uses sqlite3 with FTS5; this is only a CI runner gap.)"
  echo "=== Results: 0/0 passed, 0 failed (skipped — no FTS5) ==="
  exit 0
fi
```

This is `exit 0` not `exit 1` — the test couldn't run, but it didn't fail. The CI suite stays green. Local dev (with FTS5) runs the full assertions.

### Pattern C: pre-seed minimal fixture state

```bash
# tests/aegis-install-v11-delivery-test.sh — set repo-local git user
(
  cd "$PILOT" \
    && git init -q \
    && git config user.email "test@aegis.local" \
    && git config user.name "AEGIS Test" \
    && git commit -q --allow-empty -m "init"
) || { echo "FATAL: cannot init test repo at $PILOT" >&2; exit 2; }
```

When the missing artifact is small and creatable in fixture setup, just create it. No need for a CI branch.

### Pattern D: env-var bypass for hard dependencies

```bash
# install.sh — claude CLI check
if ! command -v claude &>/dev/null; then
    if [[ "${AEGIS_INSTALL_SKIP_CLAUDE_CHECK:-}" = "1" ]]; then
        warn "claude CLI check skipped (AEGIS_INSTALL_SKIP_CLAUDE_CHECK=1, CI/test mode)"
    else
        error "Claude Code CLI is REQUIRED but not found."
        exit 1
    fi
fi
```

Real users still hit the hard error. Test fixtures pass the env var explicitly. The bypass is documented inline.

## When to apply

Apply **before** declaring a test "CI-flaky" or "needs fixture isolation":

1. Run the test on a fresh checkout (no `.aegis/brain/logs/*`, no global git config, no installed CLI).
2. If the test fails, identify the missing runtime artifact.
3. Pick the lightest-weight pattern (A → B → C → D) that keeps the local-dev assertion intact and CI green.
4. Add an inline comment naming the sprint and the artifact.

## When NOT to apply

- The artifact represents the actual feature under test (e.g. testing the audit log writer itself — DON'T fall back to "no log" because that's the bug you're trying to detect).
- The artifact should be in git (e.g. golden fixture file). If it's missing in CI, fix the source tree, not the test.
- The "missing artifact" is a real regression caused by recent code changes, not an accumulated-state difference.

## Relationship to SPRINT_RULES Rule 3

Rule 3 (Deep test, not surface assertion) requires integration + adversarial + real-tree smoke tests. CI-graceful-fallback is **not** a way to evade Rule 3 — it's a portability technique for tests that are already deep. The local-dev assertion stays as deep as it was; CI just gets a structural check.

## Cross-references

- [SPRINT_RULES.md](../../SPRINT_RULES.md) Rule 3 (deep test) and Rule 6 (graduate-by-running)
- [DoD.md](../../DoD.md) §5 (test coverage)
- v13-01 close docs: [B/c2](.aegis/brain/sprints/sprint-v13-01-refactor/close-phase-b-chunk2.md), [B/c3](.aegis/brain/sprints/sprint-v13-01-refactor/close-phase-b-chunk3.md) — the canonical applications of the pattern

## When to update this file

- A new artifact-shape emerges (e.g. a new compiled cache that some test depends on) → add a row to the Problem table and a Pattern variant if needed.
- A test ships using this pattern → optionally cite it as a canonical example.
- A test breaks because the pattern was misapplied → add a "When NOT to apply" row.
