---
name: aegis-issue-thread
description: "Persistent issue/task threads as YAML files, integrated with sprint-tracker. Use this skill whenever the user wants to create an issue, update an issue, comment on a ticket, list open work, or link a file/PR/URL to a ticket. Triggers on 'create issue', 'open ticket', 'list issues', 'comment on issue', 'close issue', 'link to issue', 'สร้าง issue', 'ปิด issue', 'ดู issue ทั้งหมด', 'คอมเมนต์ issue'."
profile: standard
triggers:
  en: ["create issue", "open ticket", "track this work", "list issues", "show my issues", "comment on issue", "close issue", "link to issue"]
  th: ["สร้าง issue", "ปิด issue", "ดู issue ทั้งหมด", "คอมเมนต์ issue", "เปิดทิกเก็ต"]
---

## Quick Reference

`aegis-issue-thread` ships sprint v11-03's persistent ticket layer: one YAML file per issue under `.aegis/brain/issues/`, an `_index.yaml` lookup, and a configurable prefix in `_config.yaml` (default `KTH`).

- **CLI**: `tools/aegis-issue-thread/issue.mjs` with subcommands `create | update | comment | link | list | show`
- **Storage**: `.aegis/brain/issues/<PREFIX>-<N>.yaml` (one per issue) + `_index.yaml`
- **Status enum**: `todo | in_progress | blocked | review | done | cancelled`

## When to invoke

- "create issue …" / "สร้าง issue …"
- "comment on KTH-42" / "ปิด issue KTH-42"
- "list open issues" / "ดู issue ทั้งหมด"
- Linking a PR or file to an existing issue: "link issue KTH-42 to pull/123"

## Subcommand quick map

```bash
node tools/aegis-issue-thread/issue.mjs create  --title "Add forbidden-word validator" --assignee spider-man
node tools/aegis-issue-thread/issue.mjs update  KTH-42 --status in_progress
node tools/aegis-issue-thread/issue.mjs comment KTH-42 --by spider-man --body "Tests passing, awaiting review"
node tools/aegis-issue-thread/issue.mjs link    KTH-42 --type pr   --value https://github.com/.../pull/12
node tools/aegis-issue-thread/issue.mjs list    --status in_progress
node tools/aegis-issue-thread/issue.mjs show    KTH-42
```

## Issue YAML schema (one file per issue)

```yaml
id: KTH-42
title: "Add forbidden-word validator to wordPool"
status: in_progress
assignee: spider-man
created: 2026-05-04T10:00:00Z
updated: 2026-05-04T11:30:00Z
parent: KTH-40
children:
  - KTH-43
comments:
  - by: sage
    ts: 2026-05-04T10:15:00Z
    body: |
        Spec drafted in SPEC.md§3.2
links:
  - type: pr
    value: https://github.com/.../pull/12
```

## Design notes

- **Single CLI**: plan §6.3 listed 5 separate `.mjs` files (create / update / comment / list / link). Sprint v11-03 collapsed these to one `issue.mjs` with subcommands — same surface area, less boilerplate, easier discoverability.
- **Auto-increment**: `_index.yaml` carries `last_n` + the ordered `ids` list. `create` increments and appends.
- **Persona attribution**: if `--assignee` / `--by` not provided, falls back to `$AEGIS_PERSONA`.
- **Live-tail integration**: every create/update/comment is observable via the v11-01 PostToolUse hook (Bash subcommand fires emit.mjs).
- **No external YAML dep**: ships a small emitter + parser scoped to this schema. Comment bodies use YAML literal-block scalars (`|`) so multi-line / special-char content survives round-trip.

## Status enum

| Status | Meaning |
|---|---|
| `todo` | not started |
| `in_progress` | actively being worked |
| `blocked` | waiting on external |
| `review` | code/spec under review |
| `done` | completed (archived but kept on disk) |
| `cancelled` | scope-dropped |

## Tests

```bash
bash tests/aegis-issue-thread-test.sh
```

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §6.3
- `.aegis/brain/sprints/sprint-v11-03/plan.md`
