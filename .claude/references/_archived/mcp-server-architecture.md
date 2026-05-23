# AEGIS MCP Server Architecture (Sprints v9-12, v9-13)

> **Purpose**: Optional MCP server providing Tier 2/3 brain backends + cross-project memory.
> Per ADR-001: MCP = optional power-user add-on (10% of users), Plugin = primary (90%).

## Why MCP Server?

Plugin handles 90% of AEGIS:
- Agent definitions
- Slash commands
- Hooks + permissions
- Tier 1 brain (per-project)

MCP server adds:
- Tier 2 User Brain (cross-project memory)
- Tier 3 Team Brain (shared backend)
- Background daemons (auto-distill, sprint lifecycle)
- Cross-project queries ("what did I do similarly in project X?")

## Server Package Structure

```
aegis-mcp-server/
├── package.json
├── README.md
├── src/
│   ├── server.ts                  # MCP server entry point
│   ├── tools/                      # MCP tools exposed to Claude
│   │   ├── brain-query.ts         # Query across all 3 tiers
│   │   ├── brain-promote.ts       # Promote pattern up tiers
│   │   ├── brain-status.ts        # Show all tiers state
│   │   ├── brain-sync.ts          # Sync Tier 3 from backend
│   │   ├── brain-merge.ts         # Manual conflict resolution
│   │   └── cross-project.ts       # Query patterns across projects
│   ├── backends/                   # Tier 3 backends
│   │   ├── git-backend.ts
│   │   ├── s3-backend.ts
│   │   └── sqlite-backend.ts
│   ├── tier2/                      # Tier 2 User Brain logic
│   │   ├── store.ts
│   │   ├── promote.ts
│   │   └── privacy-guard.ts
│   ├── daemons/                    # Background workers
│   │   ├── auto-distill.ts        # Periodic pattern extraction
│   │   ├── sprint-lifecycle.ts    # Auto-close stale sprints
│   │   └── learning-scheduler.ts  # ScheduleWakeup-driven
│   └── audit/
│       └── audit-log.ts            # Cross-tier audit
└── tests/
```

## MCP Tools Exposed to Claude

```typescript
// Tools registered via MCP protocol

const tools = [
  {
    name: "aegis_brain_query",
    description: "Query AEGIS brain across all enabled tiers",
    parameters: {
      query: { type: "string", required: true },
      tier: { type: "string", enum: ["1", "2", "3", "all"], default: "all" },
      limit: { type: "number", default: 10 }
    }
  },
  {
    name: "aegis_brain_promote",
    description: "Promote pattern up the tier chain (Tier 1 → 2 → 3)",
    parameters: {
      pattern_id: { type: "string", required: true },
      target_tier: { type: "string", enum: ["2", "3"], required: true },
      reason: { type: "string", required: true }
    }
  },
  {
    name: "aegis_brain_status",
    description: "Show all 3 tiers state, data counts, last sync",
    parameters: {}
  },
  {
    name: "aegis_brain_sync",
    description: "Sync Tier 3 patterns from team backend",
    parameters: {
      force: { type: "boolean", default: false }
    }
  },
  {
    name: "aegis_brain_merge",
    description: "Resolve cross-tier conflicts manually",
    parameters: {
      conflict_id: { type: "string", required: true },
      resolution: { type: "string", enum: ["tier1", "tier2", "tier3", "merged"] }
    }
  },
  {
    name: "aegis_cross_project_query",
    description: "Find similar patterns across all your AEGIS projects",
    parameters: {
      pattern: { type: "string", required: true },
      similarity_threshold: { type: "number", default: 0.7 }
    }
  }
];
```

## Configuration

```json
// ~/.claude/mcp.json
{
  "mcpServers": {
    "aegis": {
      "command": "npx",
      "args": ["-y", "@aegis-team/mcp-server"],
      "env": {
        "AEGIS_TIER2_PATH": "~/.claude/aegis-brain",
        "AEGIS_TIER3_BACKEND": "git",
        "AEGIS_TIER3_GIT_REPO": "git@github.com:myorg/aegis-team-brain.git"
      }
    }
  }
}
```

## Sprint 12 Tasks (S12-01 to S12-08)

| ID | Task | Complexity |
|----|------|------------|
| S12-01 | MCP server scaffold (Node.js + @modelcontextprotocol/sdk) | M(3) |
| S12-02 | Implement Tier 2 store (file-based, ~/.claude/aegis-brain/) | M(3) |
| S12-03 | Implement Tier 3 git backend | L(8) |
| S12-04 | Implement aegis_brain_query tool | M(3) |
| S12-05 | Implement aegis_brain_promote tool with privacy guard | L(8) |
| S12-06 | Implement aegis_brain_status tool | S(1) |
| S12-07 | Implement auto-distill daemon (ScheduleWakeup-driven) | L(8) |
| S12-08 | E2E test: cross-project pattern sync via MCP | M(3) |

**Sprint 12 total**: 38 points

## Sprint 13: MCP Polish + Integration

| ID | Task |
|----|------|
| S13-01 | S3 backend implementation (alternative to git) |
| S13-02 | SQLite backend (small teams) |
| S13-03 | Sprint lifecycle daemon (auto-close stale sprints) |
| S13-04 | Cross-project query tool with similarity scoring |
| S13-05 | Plugin graceful degradation when MCP unavailable |
| S13-06 | MCP server install guide |

### Plugin Graceful Degradation (S13-05)

When MCP server is down/missing:
- Plugin still works for Tier 1 (Project Brain) — fully functional
- Tier 2/3 features become no-ops with clear error messages
- Nick Fury logs: "MCP unavailable, Tier 2/3 disabled this session"
- Recovery: when MCP comes back, sync resumes automatically

This prevents Plugin breaking when MCP optional add-on isn't running.

## Authentication & Security

### Tier 3 Backend Auth

| Backend | Auth Method |
|---------|-------------|
| git | SSH key (existing) or Personal Access Token |
| S3 | IAM role / access key |
| SQLite | Filesystem permission (single-user) |

### Privacy Boundary Enforcement

MCP server enforces:
- Tier 1 → Tier 2 promotion: privacy scrubber runs (per Sprint 7-05)
- Tier 2 → Tier 3 promotion: admin approval required
- NO downward auto-flow: Tier 3 patterns sync to Tier 1 read-only namespace

### Audit Log

All MCP operations log to `~/.claude/aegis-mcp-audit.log`:
```
[2026-04-20T10:30:00Z] PROMOTE pattern=P-042 from=tier1 to=tier2 user=jiap status=ok
[2026-04-20T11:15:00Z] PROMOTE pattern=P-043 from=tier2 to=tier3 user=jiap status=pending-approval
[2026-04-20T14:00:00Z] APPROVE pattern=P-043 admin=alice status=ok
```

## Acceptance Criteria

- [x] Server architecture documented
- [x] MCP tools API defined
- [x] Backend adapter pattern specified
- [x] Configuration schema designed
- [x] Sprint 12-13 task breakdown
- [ ] Actual MCP server implementation (deferred -- substantial Node.js project)
- [ ] Backend implementations (deferred -- requires real S3 / git infrastructure)
- [ ] Cross-project testing (deferred -- requires multiple AEGIS-enabled projects)

**Sprints 12-13 Status**: Comprehensive architecture complete. Implementation requires:
- Node.js + @modelcontextprotocol/sdk setup
- Real git/S3 backend infrastructure
- Multi-project test fixtures
- Coordination with team brain admins for governance design

Estimate: 3-5 weeks of real engineering work.
