---
name: aegis-multi-tenant
description: "Manage multiple AEGIS projects on one machine — register, list, jump-to, and aggregate activity / issues across them. Use this skill whenever the user has 3+ AEGIS projects and needs cross-project visibility (which projects are tracked, where each lives, what changed across all of them today). Triggers on 'list projects', 'register project', 'where is project', 'activity across projects', 'all my AEGIS', 'cross-project', 'multi-project', 'multi-tenant', 'รวมโปรเจกต์', 'ดูทุกโปรเจกต์'."
profile: standard
triggers:
  en: ["list projects", "register project", "where is project", "activity across projects", "all my AEGIS", "cross-project", "multi-project", "multi-tenant"]
  th: ["รวมโปรเจกต์", "ดูทุกโปรเจกต์", "หาโปรเจกต์", "ลงทะเบียนโปรเจกต์"]
reads: []
writes: []
wires: []
tests: ["tests/aegis-multi-tenant-test.sh"]
supersedes: []
---

## Quick Reference

`aegis-multi-tenant` ships sprint v11-09 (Phase-3, triggered when the user has ≥3 AEGIS projects on one machine). Maintains a single registry at `~/.aegis-plus/projects.yaml` and adds 5 cross-project subcommands.

- **CLI**: `tools/aegis-multi-tenant/mt.mjs`
- **Registry**: `~/.aegis-plus/projects.yaml`

## When to invoke

- Onboarding a new AEGIS project on this machine — register it
- "Where is the kam-tong-ham project?" — `where`
- "What changed across all my projects today?" — `activity --all-projects --since 1d`
- "Show me every open issue across all projects" — `issues --all-projects --status in_progress`

## Subcommand quick map

```bash
# Register the projects you actually have
node tools/aegis-multi-tenant/mt.mjs register --path ~/Documents/AEGIS-Team   --name AEGIS-Team   --role meta
node tools/aegis-multi-tenant/mt.mjs register --path ~/Documents/kam-tong-ham --name kam-tong-ham --role pilot
node tools/aegis-multi-tenant/mt.mjs register --path ~/Documents/RizzLab     --name RizzLab      --role production

# List everything
node tools/aegis-multi-tenant/mt.mjs list

# Jump to one
cd "$(node tools/aegis-multi-tenant/mt.mjs where kam-tong-ham)"

# Last-7-day activity across every registered project
node tools/aegis-multi-tenant/mt.mjs activity --all-projects --since 7d --limit 100

# All open issues across projects
node tools/aegis-multi-tenant/mt.mjs issues --all-projects --status in_progress
```

## Registry schema

```yaml
projects:
  - name: AEGIS-Team
    path: /Users/phariyawit.jiap/Documents/AEGIS-Team
    role: meta
  - name: kam-tong-ham
    path: /Users/phariyawit.jiap/Documents/kam-tong-ham
    role: pilot
  - name: RizzLab
    path: /Users/phariyawit.jiap/Documents/RizzLab
    role: production
```

Roles are free-form strings (e.g. `meta`, `pilot`, `production`, `experimental`). Used for filtering and human readability.

## Design notes

- **User-level state, not per-project** — registry lives in `~/.aegis-plus/`, NOT in any single project's `.aegis/brain/`. That's the only AEGIS state outside a project root.
- **Path-as-existence-check** — `list` flags projects whose path no longer exists (don't crash, just show `EXISTS no`).
- **No cloning helpers** — out of scope for this sprint; multi-tenant is read/aggregate, not write/sync.
- **No auto-discovery** — registration is explicit. Avoids accidentally tracking nested or test directories.

## Tests

```bash
bash tests/aegis-multi-tenant-test.sh
```

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §8.2
- `.aegis/brain/sprints/sprint-v11-09/plan.md`
