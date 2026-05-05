# Reviewer-Disagreement Adjudication Protocol

> **Purpose**: formalize what the main agent does when two reviewers (Black
> Panther + Loki, or any reviewer pair) return contradictory findings on the
> same file/line/claim. The wrong default is "trust the louder one" or "split
> the difference"; the right default is "verify with filesystem evidence."

> **Source**: dogfood observation #1 from the 2026-04-20 retros. During the
> v9-04 close-out session, Black Panther claimed a hook path was broken
> while Loki claimed it was correct. A `ls -la .claude/hooks/` confirmed
> Loki. The time spent reading both reviews and re-arguing the claim would
> have been saved by running the filesystem probe first.

## Trigger

This protocol activates when **≥2 reviewers** disagree on a finding that is
**verifiable from the filesystem** (file existence, line content, command
output, test result). Examples:

- "This import is broken / this import is fine"
- "This hook is wired / this hook is orphaned"
- "This test covers case X / case X is uncovered"
- "This config contradicts the spec / it matches the spec"

It does NOT activate on taste disagreements (naming, style, "should this be
refactored?") -- those have no filesystem ground truth.

## Protocol

### Step 1 -- name the disagreement

Main agent restates the contradiction in one sentence, citing both sides:

```
DISAGREEMENT: <reviewer-A> says <claim-A> [ref]. <reviewer-B> says
<claim-B> [ref]. These are mutually exclusive.
```

Do NOT continue until the disagreement is stated in this form. If it can't
be stated, the "disagreement" was actually two different concerns.

### Step 2 -- identify the probe

Turn the contradiction into a one-shot command that will return yes/no:

| Claim type | Probe |
|-----------|-------|
| "File X exists / doesn't exist" | `ls -la <X>` |
| "Hook X is wired / orphaned" | `grep -n "<X>" .claude/settings.json` + `ls -la <X>` |
| "Function X is called / unused" | `grep -rn "<X>" --include='*.sh' --include='*.py'` |
| "Test covers / doesn't cover" | run the test with coverage OR grep assertions |
| "Config key X supported / not" | check docs + test: `jq '.<X>' <config>` |

Prefer one deterministic command. If you need three, name them all up front
and run them together, not iteratively.

### Step 3 -- run the probe and cite the output

Execute the probe. Paste raw output verbatim (or truncated tail) into the
adjudication log. The output IS the evidence -- don't paraphrase.

### Step 4 -- adjudicate and log

Pick the reviewer whose claim matches the probe. Annotate briefly:

```
ADJUDICATED: <reviewer-X> was correct. Evidence:
  $ <probe-command>
  <output>
OTHER REVIEWER: <reviewer-Y> is wrong because <one-line>.
```

Write the adjudication to `.aegis/brain/logs/adjudication.log` (append-only,
one record per disagreement):

```
[YYYY-MM-DDTHH:MM:SSZ] adjudicated: <reviewer-A> vs <reviewer-B> re: <claim> -- <A|B> correct per <probe>
```

If a log entry reveals a reviewer has been consistently wrong on a category
of claim, update that reviewer's agent definition (e.g. "before claiming X,
run probe Y") or demote their review weight for that category.

### Step 5 -- proceed with the winning claim, but check for the deeper reason

A disagreement often hides a third issue that neither reviewer surfaced. Ask
one follow-up: "Why did the losing reviewer think what they thought?" Common
answers:

- Stale context (they were looking at a cached / earlier state)
- Wrong file (they confused two similar paths)
- Missing env (the claim is true only in a specific mode)

If the reason matters, note it in the adjudication. If not, move on.

## Anti-patterns

- **"Trust the senior reviewer"**: Black Panther and Loki both have strong
  opinions. Seniority isn't a probe.
- **"Split the difference"**: if claims are mutually exclusive, splitting
  produces a wrong merged claim.
- **"Ask the human"**: only after a probe is impossible or ambiguous.
  Humans have the same verification cost; defer to the filesystem first.
- **"Re-run both reviewers with more context"**: expensive and often loops.
  A probe is <1s; another review pass is minutes.

## Integration points

- `/aegis-team-review` should call this protocol when findings conflict.
  Add a pre-gate check: "any contradictions in the review outputs?" If yes,
  run this protocol before gating.
- `.claude/agents/black-panther.md` + `.claude/agents/loki.md` should cite
  this doc in their "how to handle a disagreement" section (future prompt
  edit -- not in-scope for this spec).
- `.claude/commands/aegis-team-review.md` should include a line about the
  adjudication log in its verification output.

## Audit questions (for retrospectives)

- How many adjudications happened this sprint?
- Did any reviewer "win" <50% of the time across their disagreements? (If
  yes, their agent prompt needs a probe-first instruction.)
- Were any adjudications ambiguous (probe inconclusive)? What would have
  made them conclusive?

## Acceptance Criteria

- [x] Protocol doc exists (this file)
- [x] Trigger condition stated
- [x] 5-step protocol specified
- [x] Anti-patterns listed
- [x] black-panther.md + loki.md agent-prompt references (additive
  @references entry added in each, with the citations-over-claims hint)
- [x] `/aegis-team-review` integration (Step 7.3 added in
  `.claude/commands/aegis-team-review.md`: scans findings for
  contradictions, runs probe, appends decision to
  `.aegis/brain/logs/adjudication.log`, proceeds with winning claim)
- [ ] First real adjudication logged (happens naturally on the next
  review cycle where reviewers actually disagree; not a task to
  schedule)
