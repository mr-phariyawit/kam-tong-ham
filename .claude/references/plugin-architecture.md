# AEGIS Claude Code Plugin Architecture (Sprints v9-10, v9-11)

> **Purpose**: Distribute AEGIS as a Claude Code Plugin (mandatory, primary distribution per ADR-001).
> Replace `bash <(curl ...)` installer with `claude plugin install aegis`.

## Sprint 10 First Task: MCP-Only Spike (S10-00)

**Before committing to Plugin architecture**, validate MCP-only alternative.

### Spike Plan (2-day timebox)

```bash
# Day 1: Build prototype MCP server
mkdir -p tools/mcp-spike
# Implement minimal MCP server that exposes:
#   - spawn_agent (calls Claude Agent tool)
#   - register_hook (intercepts Bash/Edit/Write)
#   - inject_framework_rules (prepends CLAUDE.md content)

# Day 2: Test against 3 representative AEGIS workflows
# Workflow 1: /aegis-start (load brain, spawn Nick Fury)
# Workflow 2: /aegis-team-build (Iron Man → Spider-Man → Black Panther)
# Workflow 3: /aegis-retro (gather lessons, write to brain)
```

### Decision Gate

Coverage matrix output → `.aegis/output/specs/S10-00-mcp-spike-report.md`

| Feature | MCP Coverage |
|---------|--------------|
| Agent spawning | ? |
| Hook registration | ? |
| Framework rule injection | ? |
| `.aegis/` folder init | ? |
| Permission model | ? |
| Session lifecycle | ? |
| Brain read/write | ? |

**Decision**:
- ≥ 90% coverage → escalate to Nick Fury for Plugin-vs-MCP-only re-evaluation
- < 90% coverage → proceed with Plugin (MCP as optional add-on per ADR-001)

## Plugin Package Structure (S10-03)

Assuming Plugin proceeds (most likely):

```
aegis-plugin/
├── plugin.json                    # Plugin manifest
├── package.json                   # NPM package (if Node-based)
├── README.md
├── LICENSE
├── src/
│   ├── index.ts                   # Plugin entry point
│   ├── adapter/
│   │   ├── IPluginAdapter.ts      # Abstraction interface (S10-01b)
│   │   └── ClaudeCodeAdapter.ts   # Implementation for Claude Code Plugin API
│   ├── agents/
│   │   ├── nick-fury.md           # All 10 agent definitions
│   │   ├── captain-america.md
│   │   └── ...
│   ├── commands/
│   │   ├── aegis-start.md         # All 12 core commands
│   │   ├── aegis-retro.md
│   │   └── ...
│   ├── references/
│   │   └── *.md                   # All reference docs
│   ├── hooks/
│   │   ├── guard-bash.sh
│   │   ├── guard-write.sh
│   │   └── aegis-version-check.sh
│   ├── skills/
│   │   └── *.md                   # 12 core skills (post-consolidation)
│   ├── templates/
│   │   ├── tier1-defaults/        # Default .aegis/brain/ structure
│   │   ├── tier2-defaults/        # Default ~/.claude/aegis-brain/
│   │   └── config.yaml.template   # Default aegis.config.yaml
│   └── lifecycle/
│       ├── on-install.ts          # Run when plugin installed
│       ├── on-init.ts             # Run when `aegis init` invoked
│       └── on-session-start.ts    # Run when Claude Code session starts
└── tests/
    ├── unit/
    └── integration/
```

## Plugin Manifest (plugin.json)

```json
{
  "name": "aegis",
  "version": "9.0.0",
  "description": "AEGIS — Agent Team Framework for Claude Code",
  "author": "AEGIS Team",
  "license": "MIT",
  "claude_code": {
    "min_version": "4.7.0",
    "tested_against": ["4.7", "4.7.1"]
  },
  "permissions_required": [
    "Agent",
    "TeamCreate",
    "Bash",
    "Edit",
    "Write"
  ],
  "commands": [
    "aegis-start",
    "aegis-retro",
    "aegis-status",
    "aegis-mode",
    "aegis-team-build",
    "aegis-team-review",
    "aegis-team-debate",
    "aegis-sprint",
    "aegis-kanban",
    "aegis-memory",
    "aegis-doctor",
    "aegis-context"
  ],
  "agents": [
    "nick-fury", "captain-america", "iron-man", "spider-man",
    "black-panther", "loki", "beast", "thor", "war-machine", "coulson"
  ],
  "hooks": {
    "PreToolUse": ["guard-bash", "guard-write"],
    "PostToolUse": ["post-edit-accumulate", "post-tool-use"],
    "Stop": ["on-stop"],
    "SessionStart": ["aegis-version-check"]
  }
}
```

## IPluginAdapter Interface (S10-01b)

```typescript
// src/adapter/IPluginAdapter.ts
export interface IPluginAdapter {
  // Lifecycle
  onSessionStart(): Promise<void>;
  onSessionEnd(): Promise<void>;

  // Agent management
  registerAgent(name: string, definition: AgentDefinition): Promise<void>;
  spawnAgent(name: string, opts: SpawnOptions): Promise<AgentHandle>;

  // Hook management
  registerHook(event: HookEvent, command: string): Promise<void>;

  // Command management
  registerCommand(name: string, definition: CommandDefinition): Promise<void>;

  // Context injection
  injectFrameworkRules(content: string): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
}

// Versioned compat matrix
// v1: Claude Code Plugin API v1 (Claude 4.7)
// v2: Claude Code Plugin API v2 (hypothetical Claude 4.8+)
//     - if breaking changes occur, only adapter implementation changes
```

### Why IPluginAdapter?

Loki Critical: Plugin API may break in Claude 4.8+. AEGIS shouldn't have to refactor 50 files.

With adapter:
- AEGIS code calls `adapter.spawnAgent(...)` (stable interface)
- Adapter translates to underlying Plugin API
- API change → swap adapter implementation only
- AEGIS code untouched

## aegis.config.yaml Schema (S10-02)

Single config file inside `.aegis/` that replaces 150 scattered files in v8.x:

```yaml
# .aegis/config.yaml
version: 9.0
project_name: "My Project"

profile: full          # minimal | standard | full | custom

autonomy:
  level: L3            # L1 | L2 | L3 | L4
  default_mode: acceptEdits   # bypassPermissions | acceptEdits | default

brain:
  tier1_project: true
  tier2_user: false    # opt-in
  tier3_team: null     # opt-in
  gitignore_mode: shared   # shared | private | paranoid

agents:
  enabled:
    - nick-fury
    - captain-america
    - iron-man
    - spider-man
    - black-panther
    - loki
    - beast
    - war-machine
    - thor
    - coulson
  # disabled (formerly):
  # - vision (merged into war-machine)
  # - wasp (retired)
  # - songbird (retired)

skills:
  always_load:
    - aegis-start
    - aegis-retro
    - aegis-status
    - aegis-mode
    - aegis-team-build
    - aegis-team-review
    - aegis-context
  deferred:
    - aegis-deploy
    - aegis-compliance
    - aegis-launch
    - aegis-pipeline
    - aegis-evolve
    - aegis-distill
    - aegis-ingest
    - aegis-lint
    - aegis-flow

permissions:
  inherit_plugin_defaults: true   # use plugin's hardened settings
  user_additions:
    allow: []     # project-specific allows
    deny: []      # project-specific denies
```

## Install Flow

```bash
# v9 install (plugin)
claude plugin install aegis@9.0.0

# Then in any project:
aegis init                          # creates .aegis/config.yaml + .aegis/brain/
aegis init --profile full           # with profile preset
aegis init --gitignore-mode shared  # explicit gitignore mode

# Output:
# ✓ Created .aegis/ folder structure
# ✓ Wrote .aegis/config.yaml
# ✓ Initialized Tier 1 brain
# ✓ Updated .gitignore (sentinel block added)
# ✓ AEGIS v9 ready. Run /aegis-start to begin.
```

## Sprint 11: Plugin Polish + Skills Migration

### Task Map

| Task | Description |
|------|-------------|
| S11-01 | Plugin error handling + diagnostics |
| S11-02 | Plugin upgrade flow (v9.0 → v9.0.1) |
| S11-03 | Migrate skills to anthropic-skills format where overlap exists |
| S11-04 | Plugin telemetry (anonymous, opt-in) |
| S11-05 | Plugin marketplace listing |
| S11-06 | E2E install test on fresh project |
| S11-07 | Doc: plugin user guide |
| S11-08 | Doc: plugin developer guide (extending AEGIS) |

### Anthropic Skills Overlap

Per Q6 in plan, evaluate which AEGIS skills duplicate official anthropic-skills:
- AEGIS spec-kit-like → use `anthropic-skills:spec-kit`
- AEGIS autonomous-coding → use `anthropic-skills:autonomous-coding`
- Keep AEGIS-unique: aegis-team-build, aegis-team-review, aegis-team-debate, etc.

## Acceptance Criteria

- [x] Plugin package structure designed
- [x] Manifest schema defined
- [x] IPluginAdapter interface specified
- [x] aegis.config.yaml schema documented
- [x] Install flow + commands specified
- [x] Sprint 11 task map
- [ ] Actual plugin scaffold + builds (deferred -- requires Claude Code Plugin SDK)
- [ ] Marketplace publishing (deferred -- requires marketplace access)
- [ ] E2E install test (deferred -- requires Plugin runtime)

**Sprints 10-11 Status**: Comprehensive architecture spec complete. Implementation requires:
- Claude Code Plugin SDK (TypeScript/JavaScript)
- Marketplace publishing infrastructure
- Real cross-machine testing
- Coordination with Anthropic for plugin review

Estimate: 4-6 weeks of real engineering work.
