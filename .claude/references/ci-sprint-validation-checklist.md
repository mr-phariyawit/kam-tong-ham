# CI sprint — empty-cache validation checklist

> **Before declaring a CI sprint "done", validate the workflow against an empty-cache runner that mirrors a fresh GitHub Actions checkout.**

Sprint v13-02 AI-6 (codified from v13-01 retro). Phase D shipped CI infrastructure but the `find -perm +111` bug was hidden until the next sprint pushed against Linux for real.

## Why this matters

The v13-01 Phase D PR claimed "CI matrix shipped" but:
- macOS-CI passed because the maintainer's local macOS shares behavior with GitHub macOS-latest
- Ubuntu CI ran but `find -perm +111` (BSD-only syntax) silently returned no test files
- The bug surfaced 1 sprint later (PR #141) when the next push noticed "0 tests found in tests/"

Phase D had a clean macOS pass and assumed Ubuntu would behave the same. It didn't.

## The checklist

For any sprint that touches CI workflows (`.github/workflows/*.yml`) or shell scripts that CI invokes (`tests/run-all.sh`, hooks called from CI, install.sh, etc.):

### Pre-merge validation

- [ ] **Run the canonical CI command in a fresh clone.** Not `tests/run-all.sh` from your working tree — clone the branch into `/tmp/aegis-ci-validate-$$` and run there. Catches "passes on dev box because of accumulated state" bugs.

- [ ] **Validate on the second platform.** If you developed on macOS, spin up an Ubuntu runner (Docker, Codespace, or a fresh GitHub Actions PR push) and confirm the workflow passes there. macOS BSD utilities ≠ Linux GNU utilities.

- [ ] **Strip the runner of accumulated state.** Specifically, before validation, ensure the test environment has:
  - No global `git config user.{name,email}` set
  - No `.aegis/brain/logs/*` files (or empty)
  - No `claude` CLI on PATH (since GitHub-hosted runners don't have it)
  - No FTS5-enabled sqlite3 (macOS-latest CI doesn't ship one)
  - No accumulated `_aegis-output/` content
  - No tmpfs caches that the test reads

- [ ] **Confirm the workflow file's `runs-on` matches your validation target.** A workflow that says `runs-on: ubuntu-latest` should be validated on actual Ubuntu, not "Linux-like dev container."

- [ ] **Look for BSD vs GNU divergences in shell code added or touched.** Run `tools/aegis-shell-footgun-scan.sh` (sprint-v13-02 AI-2) — exits 0 if clean.

### Post-merge validation

- [ ] **Watch the first 3 PRs after the CI sprint merges.** If any of them surface a new failure mode that the sprint should have caught, treat it as quality debt (Rule 4) and open a fixup sprint.

- [ ] **Update this checklist if a new failure mode emerges.** The list grew from 4 items to 5+ over v13-01 — keep it accurate.

## Known failure modes the checklist should catch

| # | Mode | First seen | Fix landed |
|---|------|------------|-----------|
| 1 | `find -perm +111` returns nothing on GNU find | sprint-v13-01 chunk-2 | `find ... \| while [[ -x ]]` (PR #142) |
| 2 | `sed -i ''` silently no-ops on GNU sed | sprint-v13-01 chunk-3 | `sed -i.bak ... && rm file.bak` (PR #143) |
| 3 | `git init && commit --allow-empty` fails without user config | sprint-v13-01 chunk-3 | repo-local `git config user.{name,email}` (PR #143) |
| 4 | `claude` CLI hard-required by install.sh | sprint-v13-01 chunk-3 | `AEGIS_INSTALL_SKIP_CLAUDE_CHECK=1` env var (PR #143) |
| 5 | `sqlite3` lacks FTS5 on macOS-latest CI runner | sprint-v13-01 chunk-3 | `:memory:` capability probe + clean exit 0 (PR #143) |
| 6 | `LC_COLLATE` divergence in bash glob ordering | sprint-v13-01 chunk-3 | `LC_ALL=C` wrapping + CI-mode advisory (PR #143) |

If a new mode appears, add a row + a checklist item.

## Quick fresh-clone validation script

For convenience, a minimal "would this CI workflow pass on a fresh clone" probe:

```bash
TMPDIR_VALIDATE=$(mktemp -d "${TMPDIR:-/tmp}/aegis-ci-validate-XXXXXX")
trap 'rm -rf "$TMPDIR_VALIDATE"' EXIT
git clone --depth 1 -b "$(git branch --show-current)" "$(git remote get-url origin)" "$TMPDIR_VALIDATE"
cd "$TMPDIR_VALIDATE"

# Wipe accumulated state so this matches a fresh CI runner
rm -rf .aegis/brain/logs/* .aegis/brain/state/* _aegis-output/sessions/* 2>/dev/null
unset $(env | grep -E '^AEGIS_|^CLAUDE_' | cut -d= -f1) 2>/dev/null

# Run CI's canonical entrypoint
CI=true bash tests/run-all.sh --continue
```

(Save as `tools/aegis-ci-fresh-clone-validate.sh` if/when this becomes a recurring pattern. For now it's a one-shot.)

## Cross-references

- [`SPRINT_RULES.md`](../../SPRINT_RULES.md) Rule 3 (deep test) and Rule 6 (graduate-by-running)
- [`DoD.md`](../../DoD.md) §5.1 (runtime budget) and §5.2 (CI-graceful fallbacks)
- [`ci-graceful-fallback.md`](ci-graceful-fallback.md) — the pattern this checklist enforces in shell code
- v13-01 Phase D close: [`close-phase-d.md`](.aegis/brain/sprints/sprint-v13-01-refactor/close-phase-d.md) — the canonical "CI sprint that needed this checklist"
- v13-01 retro AI-6: this file closes that AI

## When to update this file

- A new "passes locally but fails CI" mode emerges → add a row to the failure-modes table.
- A workflow change is shipped that needs a different validation step → add a checklist item.
- The fresh-clone validation script gets formalized as a tool → update the "Quick fresh-clone" section to link to it.
