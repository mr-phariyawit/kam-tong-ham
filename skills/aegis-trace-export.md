---
name: aegis-trace-export
description: "Export activity-log traces with PII / secret redaction for safe sharing. Use this skill whenever the user wants to anonymize a session, export a redacted trace, share a debug log without leaking secrets, or audit redaction patterns. Triggers on 'export trace', 'anonymize log', 'share session', 'redact PII', 'export feedback', 'ส่งออก trace', 'redact log'."
profile: standard
triggers:
  en: ["export trace", "anonymize log", "share session", "redact PII", "export feedback", "redact log"]
  th: ["ส่งออก trace", "ปกปิด PII", "redact log", "เซ็นเซอร์ log"]
reads: [".aegis/brain/redaction/patterns.yaml", ".aegis/brain/runs/"]
writes: [".aegis/brain/exports/"]
wires: []
tests: ["tests/aegis-trace-export-test.sh"]
supersedes: []
---

## Quick Reference

`aegis-trace-export` reads `.aegis/brain/activity/*.jsonl`, applies redaction patterns from `.aegis/brain/redaction/patterns.yaml`, writes to `.aegis/brain/exports/<DATE>-<TOPIC>.jsonl`, then **validates** that no pattern still matches in the output. Closes G8.

- **Export CLI**: `tools/aegis-trace-export/export.mjs` — driven by `--since`, `--topic`
- **Validate CLI**: `tools/aegis-trace-export/validate.mjs` — scan any file for PII matches
- **Patterns**: `.aegis/brain/redaction/patterns.yaml`

## When to invoke

- Sharing a debug trace with a teammate / vendor / public issue
- Exporting last-week's activity for an offline analysis
- Adding a new redaction pattern after a confirmed leak (Mega Plan R9)

## Default patterns

| Label | Catches |
|---|---|
| `username` | "phariyawit", "mr.phariyawit", "mr-phariyawit" |
| `email` | RFC-5322-ish email addresses |
| `api-key-anthropic` | `sk-…32+` |
| `api-key-github` | `ghp_…36` |
| `api-key-openai` | `sk-proj-…40+` |
| `home-path` | `/Users/<name>/…` (replaced with `/Users/[USER]`) |
| `aws-access-key` | `AKIA…16` |

Each pattern has an optional `replacement`; default is `[REDACTED-{label}]`.

## Workflow

```bash
# Export the last 7 days, validate as you go
node tools/aegis-trace-export/export.mjs --since 7d --topic kam-tong-ham

# Custom date range
node tools/aegis-trace-export/export.mjs --since 2026-05-01 --topic refactor

# Custom output path
node tools/aegis-trace-export/export.mjs --since 7d --topic share \
    --out /tmp/share-this.jsonl

# Spot-check any file
node tools/aegis-trace-export/validate.mjs /tmp/share-this.jsonl
# → ✓ clean — no PII pattern matches

# Pipe through validate
cat some-old-log.txt | node tools/aegis-trace-export/validate.mjs
```

## Acceptance contract

`export.mjs` always validates by default. **Exit code is non-zero if any pattern still matches in the output.** That's the G8 zero-leak guarantee. Pass `--no-validate` to skip the check (rarely needed).

## Pattern file schema

```yaml
patterns:
  - label: username
    regex: '\b(phariyawit|mr\.phariyawit)\b'
  - label: email
    regex: '[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}'
  - label: home-path
    regex: '/Users/[^/\s]+'
    replacement: '/Users/[USER]'
```

Add a new pattern any time a real leak is observed — that's the explicit Mega Plan R9 mitigation.

## Tests

```bash
bash tests/aegis-trace-export-test.sh
```

## References

- `~/Documents/AEGIS-PLUS-MEGA-PLAN.md` §7.4 + §15 B
- `.aegis/brain/sprints/sprint-v11-08/plan.md`
- `.aegis/brain/redaction/patterns.yaml`
