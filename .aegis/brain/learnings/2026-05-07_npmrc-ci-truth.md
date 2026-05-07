---
date: 2026-05-07
category: tooling
confidence: high
---
# CI is the truth-teller for npm peer-dep mixes

## Context

`kam-tong-ham/package.json` intentionally mixes `colyseus@^0.15` (server stable) with
`@colyseus/sdk@^0.17.36` and `@colyseus/testing@^0.17.11` (client SDK + test utilities, fresh).
Local `npm install` had been silently tolerating the peer conflict for weeks because of npm's
fallback behavior in non-strict mode.

The first GitHub Actions CI run on Sprint 5's PR #4 ran `npm ci` (strict) and failed with
ERESOLVE on the colyseus 0.15 / sdk 0.17 peer conflict. The fix was a one-line `.npmrc`:
`legacy-peer-deps=true`. After committing it, CI passed in ~30 seconds and remained reliable
for Sprints 6, 7, and 8.

## Lesson

Local `npm install` is permissive; CI `npm ci` is strict. A long-standing local-tolerated
peer-dep conflict can sit dormant for weeks until you add CI. When CI is added mid-project,
expect to discover and pin one or more "we've been getting away with this" issues.

## Application

When introducing CI to an existing JavaScript project:
1. The first PR's CI run is informational — it WILL surface peer-dep, lockfile, and
   environment differences that local installs glossed over.
2. Resolve via `.npmrc` (most surgical) > workflow flag (least surgical, diverges local/CI).
3. Document the *intent* of any version pinning that looks suspicious — future contributors
   will read `.npmrc` and wonder why.
4. Consider running `npm ci` locally periodically as a sanity check, not just `npm install`.

Counter-example: do NOT use `--legacy-peer-deps` as a generic workaround. The `.npmrc` flag is
fine for *known* intentional mixes (like server vs SDK version pinning). For *new* peer
conflicts that surface later, investigate root cause first.
