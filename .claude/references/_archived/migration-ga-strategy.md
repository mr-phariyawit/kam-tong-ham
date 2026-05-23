# Migration + GA Strategy (Sprints v9-14, v9-15)

> **Purpose**: Migrate v8.x users to v9 + ship GA + sunset curl|bash within 6 months.
> Source: ADR-001 (Plugin + 6mo bridge)

## Sprint 14: Migration Tooling + Beta Release

### Migration Path

v8.x project → v9 project requires 4 transformations:

1. **Folder consolidation** (S2-07 dogfood, already proven)
   - `_aegis-brain/` → `.aegis/brain/`
   - Stale references updated

2. **CLAUDE_*.md lift** (S14-04, was S14-NEW from ADR-007)
   - Detect v8.x root files (CLAUDE.md, CLAUDE_safety.md, etc.)
   - Diff against framework defaults
   - Backup customizations
   - Lift framework defaults to plugin
   - Restore customizations to single project CLAUDE.md

3. **Settings hardening** (S14-05)
   - Replace `bypassPermissions` with `acceptEdits`
   - Apply v9 allow/deny lists from `tools/v9-proposed-settings.json`

4. **Plugin install** (S14-06)
   - `claude plugin install aegis@9.0`
   - Migrate from curl|bash distribution

### Migration Command

```bash
# Comprehensive migration
aegis migrate v9

# Dry-run (default)
aegis migrate v9 --dry-run

# Apply
aegis migrate v9 --apply

# Apply with custom options
aegis migrate v9 --apply \
    --gitignore-mode shared \
    --tier1-only \
    --backup-dir .aegis-backup/v8-to-v9

# Rollback
aegis migrate v9 --rollback
```

### Rollback Plan

Migration writes manifest to `.aegis-backup/v8-to-v9/manifest.json`:

```json
{
  "from_version": "8.4",
  "to_version": "9.0",
  "migration_date": "...",
  "steps_completed": ["consolidate", "claude-md-lift", "settings", "plugin-install"],
  "backups": {
    "brain": ".aegis-backup/v8-to-v9/_aegis-brain/",
    "claude_md": ".aegis-backup/v8-to-v9/CLAUDE_files/",
    "settings": ".aegis-backup/v8-to-v9/settings.json"
  },
  "rollback_available": true
}
```

`aegis migrate v9 --rollback` reverses all steps using manifest.

### Beta Release Tasks (S14-01 to S14-07)

| ID | Task | Pts |
|----|------|-----|
| S14-01 | General migration tool (umbrella `aegis migrate` command) | L(8) |
| S14-02 | Brain consolidation step (extends POC) | M(3) |
| S14-03 | Settings migration step | M(3) |
| S14-04 | CLAUDE_*.md lift step | M(3) |
| S14-05 | Plugin install step (calls `claude plugin install`) | M(3) |
| S14-06 | Migration manifest + rollback | L(8) |
| S14-07 | Beta release docs + announcement | M(3) |
| S14-08 | E2E test on 3 v8.x test repos | L(8) |

**Sprint 14 total**: 39 pts (revised from 57; some tasks moved to S15)

### Beta Distribution

```bash
# Beta-only install
claude plugin install aegis@9.0.0-beta.1

# Beta tag bumps
9.0.0-beta.1  → initial beta
9.0.0-beta.2  → bug fixes from beta-1 feedback
...
9.0.0-rc.1    → release candidate
9.0.0         → GA
```

Beta period: 4 weeks
Goal: 5+ external testers, 0 critical bugs before GA

## Sprint 15: Deprecation + GA

### GA Release (S15-01)

```bash
# GA install
claude plugin install aegis@9.0.0
```

GA criteria (must all pass):
- [ ] Beta period ≥ 4 weeks
- [ ] All Sprint 1-13 features complete OR explicitly deferred
- [ ] Migration tested on 3+ v8.x repos
- [ ] Documentation complete (user guide, dev guide, ADRs published)
- [ ] No CRITICAL bugs in beta tracker
- [ ] Loki adversarial review passed
- [ ] Black Panther final security audit passed

### Deprecation Timeline (S15-02 to S15-04)

Per ADR-001 (Nick Fury revised to 6 months):

```
GA (T0):
  - install-remote.sh shows DEPRECATION WARNING banner
  - "AEGIS v9 plugin available. curl|bash will be removed in 6 months."
  - Logs warning to Anthropic telemetry (anonymous count)

GA + 3 months (T0+3mo):
  - install-remote.sh shows ERROR + auto-suggests migration
  - "AEGIS curl|bash installer is deprecated. Run: claude plugin install aegis"
  - Still functional but loud warning

GA + 6 months (T0+6mo):
  - install-remote.sh REMOVED from main branch
  - Repo keeps file as `install-remote-legacy.sh` for offline emergency
  - Final commit message: "deprecate: remove curl|bash installer per ADR-001"
```

### Deprecation Tasks

| ID | Task |
|----|------|
| S15-01 | GA release (publish v9.0.0 to plugin marketplace) |
| S15-02 | Add deprecation warning to install-remote.sh (T0) |
| S15-03 | Bump warning to error (T0+3mo) |
| S15-04 | Remove curl|bash installer (T0+6mo) |
| S15-05 | Single-folder layout final verification (`.aegis/` everywhere) |
| S15-06 | Post-GA retrospective + plan v10 starts |

## Bridge Period UX

### v8.x User Experience During Bridge

**T0 (GA day):**
```bash
$ bash <(curl -sL ...) --upgrade
⚠️  DEPRECATION NOTICE:
   AEGIS v9 is now available as a Claude Code Plugin.
   curl|bash installer will be removed on YYYY-MM-DD (6 months).

   To migrate: claude plugin install aegis
   Or run: aegis migrate v9 --apply
```

**T0+3mo:**
```bash
$ bash <(curl -sL ...) --upgrade
❌ ERROR: AEGIS curl|bash installer is deprecated.

   Migrate now: claude plugin install aegis
   Then: aegis migrate v9 --apply

   Force-continue (not recommended): add --force flag
```

**T0+6mo:**
```bash
$ bash <(curl -sL ...) --upgrade
❌ ERROR: install-remote.sh removed (per ADR-001).

   Use plugin: claude plugin install aegis

   Emergency offline fallback:
     wget https://github.com/.../install-remote-legacy.sh
     bash install-remote-legacy.sh
```

## Acceptance Criteria

- [x] Migration command spec
- [x] Rollback plan with manifest
- [x] Beta release process
- [x] GA criteria checklist
- [x] Deprecation timeline (T0 → T0+3 → T0+6)
- [x] Bridge UX scripts
- [ ] Implementation (deferred -- requires real plugin marketplace, beta testers, time-based deprecation triggers)

**Sprints 14-15 Status**: Strategy complete. Execution requires:
- 4-week beta period (real users)
- Plugin marketplace publishing access
- Time-based deprecation enforcement (cron/scheduled)
- Real v8.x user repos for migration testing
- Marketing/comms for deprecation announcements

Estimate: 6 months calendar time (Beta + GA + 6mo bridge).
