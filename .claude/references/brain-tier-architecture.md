# 3-Tier Brain Architecture (Sprints v9-07, v9-08, v9-09)

> **Purpose**: Per-project + per-machine + per-team brain layers with explicit promotion + privacy guarantees.
> Source: AEGIS_v9_UPGRADE_PLAN.md ADR-006

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Tier 3: Team Brain (OPT-IN, org-level)                  │
│  → backend: git repo / S3 / SQLite                       │
│  → memory_20250818 type: "reference"                     │
│  → contains: team conventions, shared lessons             │
│  → access: read-only by default, admin-approved writes    │
├─────────────────────────────────────────────────────────┤
│  Tier 2: User Brain (OPT-IN, per-machine)                │
│  → location: ~/.claude/aegis-brain/                      │
│  → memory_20250818 types: "user", "feedback"             │
│  → contains: working style, preferences, reusable patterns │
│  → access: user only (chmod 700)                          │
├─────────────────────────────────────────────────────────┤
│  Tier 1: Project Brain (DEFAULT ON, per-repo)            │
│  → location: ./project/.aegis/brain/                     │
│  → memory_20250818 type: "project"                       │
│  → contains: sprints, ADRs, project-specific patterns     │
│  → access: per project; gitignore mode controls sharing  │
└─────────────────────────────────────────────────────────┘
```

## Default Configuration

```yaml
# .aegis/config.yaml
brain:
  tier1_project: true       # always on (default)
  tier2_user: false         # opt-in
  tier3_team: null          # opt-in, requires backend config

  # Per-tier settings
  tier1:
    gitignore_mode: shared  # shared | private | paranoid
    promotion_threshold: 3  # observations before promote to active

  tier2:
    location: ~/.claude/aegis-brain
    auto_load: true

  tier3:
    backend: null           # git | s3 | sqlite | null
    backend_config: {}      # backend-specific
    sync_on_session_start: true
    write_requires_approval: true
```

## Tier 2 Implementation (Sprint v9-07)

### Schema (S7-01)

```
~/.claude/aegis-brain/
├── MEMORY.md                    # auto-generated index
├── preferences/                  # user-level preferences
│   ├── autonomy-default.yaml    # preferred autonomy level
│   ├── agent-preferences.yaml   # which agents user trusts
│   ├── permission-overrides.yaml # personal allow/deny additions
│   └── editor-preferences.yaml  # editor/IDE quirks
├── patterns/                     # cross-project patterns
│   ├── learned/                  # auto-discovered
│   └── manual/                   # user-curated
└── feedback/                     # user feedback to AEGIS
    ├── corrections.log          # things AEGIS got wrong
    └── praises.log              # things AEGIS got right
```

### Init Command (S7-02)

```bash
aegis brain init --tier2
```

Behavior:
1. Check if `~/.claude/aegis-brain/` exists → if so, error "already initialized"
2. Create directory with permissions 700 (user only)
3. Seed with defaults from `tools/templates/tier2-defaults/`
4. Update `~/.claude/aegis-config.yaml` to enable Tier 2
5. Print success + next steps

### Promote Command (S7-03)

```bash
aegis brain promote --to-user <pattern-id>
```

Behavior:
1. Read pattern from Tier 1 (project brain)
2. Check it doesn't contain project-specific data (privacy guard)
3. Confirm with user (interactive, unless `--yes`)
4. Copy to Tier 2 (`~/.claude/aegis-brain/patterns/manual/`)
5. Log promotion to `.aegis/brain/logs/promotion.log`
6. Update Tier 2 MEMORY.md index

### Privacy Guard (S7-05)

Scrubbing rules before Tier 1 → Tier 2:
- ❌ Remove file paths starting with `/Users/<username>/` or `/home/<username>/`
- ❌ Remove email addresses (regex: `[\w.]+@[\w.]+`)
- ❌ Remove API keys (sk-, pk_, AKIA, ghp_, github_pat_)
- ❌ Remove project-specific identifiers (task IDs, PR numbers)
- ❌ Remove commit hashes (40-char hex)
- ❌ Remove URLs to private repos
- ✅ Keep general patterns ("use sentinel markers", "file as truth")
- ✅ Keep generic best practices
- ✅ Keep workflow improvements

Implementation: `tools/aegis-privacy-scrubber.sh` (regex pipeline)

### Adversarial Test (S7-06)

Loki spawns to attempt data exfiltration:

Test cases:
- [ ] Try to promote pattern containing `/Users/jiap/` → must be scrubbed
- [ ] Try to promote pattern with ghp_xxx token → must be scrubbed
- [ ] Try to promote pattern with task ID `PROJ-T-042` → must be scrubbed
- [ ] Try to promote pattern with private repo URL → must be scrubbed
- [ ] Verify scrubbed output is still useful (not over-aggressive)

## Tier 3 Implementation (Sprint v9-08)

### Backend Adapter Interface (S8-02)

```python
class TeamBrainBackend:
    def init(self, config: dict) -> None: ...
    def list_patterns(self, since: datetime) -> List[Pattern]: ...
    def get_pattern(self, id: str) -> Pattern: ...
    def submit_pattern(self, pattern: Pattern, author: str) -> str: ...
    def approve_pattern(self, id: str, approver: str) -> None: ...
    def sync_to_local(self, target: Path) -> SyncResult: ...

class GitBackend(TeamBrainBackend):
    """Git repo as backend. Each pattern = file in patterns/ dir."""

class S3Backend(TeamBrainBackend):
    """S3 bucket as backend. Pattern = JSON object."""

class SQLiteBackend(TeamBrainBackend):
    """Local SQLite for small teams. Pattern = row."""
```

### Backend Choice Criteria (S8-01 ADR)

| Backend | Best For | Pros | Cons |
|---------|----------|------|------|
| **git** | OSS teams, GitHub orgs | Free, audit trail, PR workflow | Latency, requires git knowledge |
| **S3** | Enterprise, large teams | Scalable, fast, role-based | Cost, AWS dependency |
| **SQLite** | Small teams (< 5), local | Zero infra, simple | Single point of failure |

### Promote Command (S8-03)

```bash
aegis brain promote --to-team <pattern-id>
```

Two-step flow:
1. **User submits**: `aegis brain promote --to-team <id>` → creates draft in Tier 3 backend
2. **Admin approves**: `aegis brain admin approve <id>` → marks for sync
3. Approved patterns sync to all team members on next session start

### Auto-Sync (S8-04)

On `/aegis-start`:
1. Read Tier 3 last_sync timestamp from local `.aegis/brain/.tier3-sync`
2. Fetch new approved patterns from backend
3. Merge into Tier 1 read-only namespace (`.aegis/brain/team-conventions/`)
4. NEVER write back from Tier 1 (one-way: Team → Project)

### Status Command (S8-05)

```bash
aegis brain status
```

Output:
```
AEGIS Brain Status
===================
Tier 1 (Project)  : ✅ enabled at .aegis/brain/
                    13 instincts, 10 patterns, 3 ADRs
                    last write: 2026-04-20 10:30

Tier 2 (User)     : ❌ disabled (run: aegis brain init --tier2)

Tier 3 (Team)     : ❌ disabled (configure backend in ~/.claude/aegis-config.yaml)
```

### Security Audit (S8-06)

Tier 3 backend requirements:
- [ ] Encryption at rest (S3 SSE / git-crypt / SQLite encrypted)
- [ ] Encryption in transit (HTTPS / SSH)
- [ ] Auth: backend-specific (IAM, SSH keys, password)
- [ ] Access control: read = all team, write = approver role
- [ ] Audit log: who promoted what, when, approved by whom

## Brain Integration Testing (Sprint v9-09)

### E2E Test (S9-01)

Test flow:
1. Project A: discover pattern in Tier 1
2. Promote to Tier 2 (`aegis brain promote --to-user`)
3. Submit to Tier 3 (`aegis brain promote --to-team`)
4. Admin approves
5. Project B (different repo): `/aegis-start` syncs pattern
6. Project B's Nick Fury uses pattern in decision

### Migration (S9-02)

`aegis migrate brain` extends to support v8.x → Tier 1:
- Detect v8.x flat brain (`_aegis-brain/`)
- Map files to Tier 1 schema
- Use brain_write() helper (file + cache)

### Conflict Resolution (S9-03)

Per ADR-003: Tier 1 > Tier 3 > Tier 2

Implementation:
- Conflict detected when same pattern key in 2+ tiers with different values
- Nick Fury picks winner via priority
- Logs to `.aegis/logs/conflict-resolution.log`
- `aegis brain conflicts --recent` shows last 10
- Edge cases (semantic conflict, not just value): escalate to human

### Performance (S9-04)

Target: < 2s session start overhead with all 3 tiers

Bottlenecks to optimize:
- Tier 3 sync (network call) → cache aggressively, async if possible
- Tier 2 read (local file) → memory-map large files
- Tier 1 cache populate → use eager-load for promoted only

### Config Schema (S9-05)

Already documented above (`.aegis/config.yaml`).

### User Guide (S9-06)

`docs/v9/brain-tier-guide.md` (TBD):
- When to use each tier
- Promotion workflows with examples
- Privacy guarantees explained
- Common questions

## Acceptance Criteria

- [x] 3-tier architecture documented
- [x] Schema for each tier
- [x] Promotion flow specified
- [x] Privacy guard rules
- [x] Backend adapter interface
- [x] Conflict resolution rule (per ADR-003)
- [x] Status + migration commands designed
- [ ] Implementation (deferred -- requires backend infrastructure setup, real testing across multiple machines)

**Sprints 7-9 Status**: Comprehensive design + spec complete. Implementation requires:
- Real S3/git backend setup
- Multi-machine testing
- Adversarial security review (Loki)
- Performance benchmarking infrastructure
