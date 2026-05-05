# PROJECT INDEX -- AEGIS v9.0 AI Agent Team Framework

> Single canonical cross-reference wiki for the entire project.
> Every document, requirement, module, function, task, spec, and sprint is reachable from here.
> Last updated: 2026-04-24 (sprint-v10-01-D)

---

## 1. Project Identity

AEGIS v9.0 is an AI Agent Team Framework for Claude Code. It provides 11 agent personas,
30 canonical commands, 61 operational tools, and a persistent brain directory -- all
implemented as markdown and bash with zero external runtime dependencies.

Full identity: [`.aegis/brain/resonance/project-identity.md`](.aegis/brain/resonance/project-identity.md)

---

## 2. Documents (ISO 29110 Basic Profile)

12 work products following ISO 29110 Basic Profile. Tracked in [`_aegis-output/iso-docs/doc-registry.json`](_aegis-output/iso-docs/doc-registry.json).

| Doc ID | Title | Path | Status |
|--------|-------|------|--------|
| PM.01 | Project Plan | [`_aegis-output/iso-docs/PM-01-project-plan/current.md`](_aegis-output/iso-docs/PM-01-project-plan/current.md) | Approved |
| PM.02 | Progress Status Report | [`_aegis-output/iso-docs/PM-02-progress-status/current.md`](_aegis-output/iso-docs/PM-02-progress-status/current.md) | Approved |
| PM.03 | Change Requests Log | [`_aegis-output/iso-docs/PM-03-change-requests/current.md`](_aegis-output/iso-docs/PM-03-change-requests/current.md) | Approved |
| PM.04 | Meeting Records | [`_aegis-output/iso-docs/PM-04-meeting-records/current.md`](_aegis-output/iso-docs/PM-04-meeting-records/current.md) | Approved |
| PM.05 | Correction Register | [`_aegis-output/iso-docs/PM-05-correction-register/current.md`](_aegis-output/iso-docs/PM-05-correction-register/current.md) | Draft |
| PM.06 | Acceptance Record | [`_aegis-output/iso-docs/PM-06-acceptance-record/current.md`](_aegis-output/iso-docs/PM-06-acceptance-record/current.md) | Approved |
| SI.01 | Requirements Specification | [`_aegis-output/iso-docs/SI-01-requirements-spec/current.md`](_aegis-output/iso-docs/SI-01-requirements-spec/current.md) | Approved |
| SI.02 | Traceability Matrix | [`_aegis-output/iso-docs/SI-02-traceability-matrix/current.md`](_aegis-output/iso-docs/SI-02-traceability-matrix/current.md) | Approved (v2) |
| SI.03 | Design Document | [`_aegis-output/iso-docs/SI-03-design-doc/current.md`](_aegis-output/iso-docs/SI-03-design-doc/current.md) | Approved (v2) |
| SI.04 | Test Cases and Procedures | [`_aegis-output/iso-docs/SI-04-test-cases/current.md`](_aegis-output/iso-docs/SI-04-test-cases/current.md) | Approved |
| SI.05 | Test Report | [`_aegis-output/iso-docs/SI-05-test-report/current.md`](_aegis-output/iso-docs/SI-05-test-report/current.md) | Approved |
| SI.06 | Software Configuration (Delivery) | [`_aegis-output/iso-docs/SI-06-delivery/current.md`](_aegis-output/iso-docs/SI-06-delivery/current.md) | Approved |

---

## 3. Requirements

### 3.1 Functional Requirements (FR-01 through FR-21)

| Req ID | Requirement | Sprint |
|--------|-------------|--------|
| FR-01 | Agent roster and routing (11 agents) | v7.1 |
| FR-02 | Command system (30 canonical commands) | v7.1, updated v9-06 |
| FR-03 | Session lifecycle (start/work/retro) | v7.1 |
| FR-04 | Persistent memory (`.aegis/brain/`) | v7.1, migrated v9-01 |
| FR-05 | Five-gate quality system (Gate 0-5) | v7.1, expanded v9-01 |
| FR-06 | PM State Machine (planning/in-process/review/retro) | v7.1 |
| FR-07 | ISO 29110 compliance docs (12 documents) | v7.1 |
| FR-08 | Autonomy levels (L1/L2/L3) | v7.1 |
| FR-09 | Nick Fury orchestration (Decision Matrix P0-P10) | v7.1 |
| FR-10 | In-process agent execution | v7.1, tmux deprecated v9-01 |
| FR-11 | Post-install verification (/aegis-doctor) | v8.0 |
| FR-12 | Master Brain Protocol (MBP) | v9-01 |
| FR-13 | BLOCK 0 pre-work documentation gate (0A-0E) | v9-01 |
| FR-14 | Enforcement hooks (guard-bash, guard-write, guard-ui-edit) | v9-01 |
| FR-15 | Decision audit logging | v9-02 |
| FR-16 | Captain America fallback (judgment threshold) | v9-02 |
| FR-17 | Visual design layer (DESIGN.md, BLOCK 0F) | v9-03 |
| FR-18 | Sprint lifecycle (/aegis-sprint plan/close/status) | v9-01 |
| FR-19 | Policy-without-test audit | v9-06 |
| FR-20 | Hook governance (ADR-005) | v9-06 |
| FR-21 | Application playbook (framework adoption guide) | v9-06 |

Full details: [`_aegis-output/iso-docs/SI-01-requirements-spec/current.md`](_aegis-output/iso-docs/SI-01-requirements-spec/current.md)

### 3.2 Non-Functional Requirements (NFR-01 through NFR-08)

| Req ID | Requirement |
|--------|-------------|
| NFR-01 | Zero external runtime dependencies |
| NFR-02 | Token efficiency (model routing) |
| NFR-03 | Portability (plain files, no database) |
| NFR-04 | Graceful degradation |
| NFR-05 | Audit trail |
| NFR-06 | Bilingual operator interface (EN/TH) |
| NFR-07 | Version compatibility |
| NFR-08 | Test harness self-validation |

---

## 4. Modules (MOD-XX)

11 top-level modules defined in [`SI.03 S6`](_aegis-output/iso-docs/SI-03-design-doc/current.md).

| Module | Owner | Primary Path | Requirements |
|--------|-------|-------------|-------------|
| MOD-CORE | Nick Fury | `CLAUDE.md`, `CLAUDE_safety.md`, `CLAUDE_lessons.md` | FR-03, FR-08, FR-10, NFR-04, NFR-07 |
| MOD-AGENTS | Nick Fury | `.claude/agents/*.md` (11 files) | FR-01, FR-05, FR-09, FR-12, FR-16, FR-17, NFR-02 |
| MOD-COMMANDS | Iron Man | `.claude/commands/*.md` (30 files) | FR-02, FR-03, FR-06, FR-11, FR-18 |
| MOD-HOOKS | Black Panther | `.claude/hooks/*.sh` (11 files) | FR-12, FR-13, FR-14 |
| MOD-BRAIN | Nick Fury | `.aegis/brain/**` | FR-04, FR-06, FR-15, NFR-05 |
| MOD-TOOLS | Spider-Man | `tools/*.sh` (61 files) | FR-13, FR-15, FR-17, FR-19, NFR-08 |
| MOD-ISO | Coulson | `_aegis-output/iso-docs/**` (12 docs) | FR-07 |
| MOD-REFS | Iron Man | `.claude/references/*.md` (28 files) | FR-16, FR-20 |
| MOD-SPRINTS | Nick Fury | `.aegis/brain/sprints/**` | FR-18 |
| MOD-SPECS | Iron Man | `_aegis-output/specs/*.md` (15 files) | FR-05, FR-09 |
| MOD-PLAYBOOK | Nick Fury | `docs/AEGIS_APPLICATION_PLAYBOOK.md` | FR-21 |

---

## 5. Functions / Capabilities (FUNC-XX)

Auto-generated catalog: [`.aegis/brain/func-catalog.json`](.aegis/brain/func-catalog.json)

**421 entries** across 5 types:

| Type | Count | Source |
|------|-------|--------|
| bash | 62 | `tools/*.sh` (one per script) |
| bash-function | 173 | Named functions inside tool scripts |
| agent-capability | 145 | H2 sections in `.claude/agents/*.md` |
| command | 30 | `.claude/commands/*.md` entries |
| hook | 11 | `.claude/hooks/*.sh` entries |

**Sample entries:**

| FUNC ID | Name | Type | Module |
|---------|------|------|--------|
| FUNC-821FA1 | aegis-agent-tools-matrix | bash | MOD-TOOLS |
| FUNC-B057C5 | aegis-apply-mbp-guard | bash | MOD-TOOLS |
| FUNC-D06275 | beast::Capabilities | agent-capability | MOD-AGENTS |
| FUNC-F0E076 | /aegis-adr | command | MOD-COMMANDS |
| FUNC-038831 | /aegis-breakdown | command | MOD-COMMANDS |
| FUNC-900669 | aegis-version-check | hook | MOD-HOOKS |
| FUNC-4E699B | guard-ask-user | hook | MOD-HOOKS |
| FUNC-4B0F42 | FAIL | bash-function | MOD-TOOLS |
| FUNC-3CC618 | FAIL_FAST | bash-function | MOD-TOOLS |
| FUNC-18F0A9 | beast::Constraints | agent-capability | MOD-AGENTS |

Regenerate: `bash tools/aegis-func-catalog.sh`
Validate: `bash tools/aegis-func-catalog-test.sh`

---

## 6. Tasks and Stories

Task hierarchy in [`.aegis/brain/tasks/`](.aegis/brain/tasks/):

| Prefix | Type | Count |
|--------|------|-------|
| PROJ-J-XXX | Journey (epic group) | 4 |
| PROJ-E-XXX | Epic | 4 |
| PROJ-T-XXX | Task | 13 |
| PROJ-US-XXX | User Story | 1 |

**Total: 22 task items** with `meta.json` in each directory.

---

## 7. Specs

Design specifications in [`_aegis-output/specs/`](_aegis-output/specs/):

| Spec | Description |
|------|-------------|
| PROJ-T-001-spec.md | Task 001 specification |
| PROJ-T-002-spec.md | Task 002 specification |
| PROJ-T-003-aegis-doctor-spec.md | /aegis-doctor health check spec |
| PROJ-T-003-spec.md | Task 003 specification |
| PROJ-T-005-spec.md | Task 005 specification |
| PROJ-T-006-spec.md | Task 006 specification |
| PROJ-T-008-spec.md | Task 008 specification |
| PROJ-T-010-spec.md | Task 010 specification |
| PROJ-T-012-spec.md | Task 012 specification |
| S-V9-04-REMAINING-spec.md | v9-04 remaining work mega-spec |
| S2-03-spec.md | BLOCK 0 lite-mode specification |
| S2-04-spec.md | Loki counter specification |
| S3-06-spec.md | Wasp revival specification |
| S3-VISUAL-LAYER-spec.md | Visual design layer mega-spec |
| FINAL-PUSH-spec.md | v9-05 final push mega-spec |

**Total: 15 specs**

---

## 8. Sprints

Roadmap: [`.aegis/brain/sprints/roadmap.md`](.aegis/brain/sprints/roadmap.md)

| Sprint | Points | Status |
|--------|--------|--------|
| sprint-v9-01 (foundation) | 13/13 | CLOSED |
| sprint-v9-02 (follow-ups) | 11/11 | CLOSED |
| sprint-v9-03 (visual layer) | 11/11 | CLOSED |
| sprint-v9-04 (design gen + cleanup) | 14/10 | CLOSED (140%) |
| sprint-v9-05 (FINAL-PUSH) | 13/13 | CLOSED |
| sprint-v9-06 (operational debt) | 11/11 | CLOSED |
| **v9 total** | **73/69** | **100%** |
| sprint-v10-01 (traceability wiki) | 13 | ACTIVE |

Current sprint: [`.aegis/brain/sprints/current`](.aegis/brain/sprints/current) (symlink)

---

## 9. Cross-Reference Matrix

Quick-reference for "How to find X":

| I want to find... | Go to... |
|-------------------|----------|
| What agents exist | `.claude/agents/*.md` (11 files) |
| What commands are available | `.claude/commands/*.md` (30 files) |
| What tools exist | `tools/*.sh` (61 files) |
| A specific requirement | SI.01 `_aegis-output/iso-docs/SI-01-requirements-spec/current.md` |
| How requirement X is implemented | SI.02 `_aegis-output/iso-docs/SI-02-traceability-matrix/current.md` |
| Architecture and design | SI.03 `_aegis-output/iso-docs/SI-03-design-doc/current.md` |
| Module ownership | SI.03 S6 "Module Catalog (MOD-XX)" |
| A specific function/capability | `.aegis/brain/func-catalog.json` (FUNC-XX IDs) |
| Current sprint status | `.aegis/brain/sprints/current/kanban.md` |
| Overall project progress | `.aegis/brain/sprints/roadmap.md` |
| Task breakdown | `.aegis/brain/tasks/PROJ-*/meta.json` |
| Design specs for a task | `_aegis-output/specs/*-spec.md` |
| Past decisions | `.aegis/brain/logs/decision-audit.log` |
| Lessons learned | `.aegis/brain/learnings/` |
| Brain index (LLM wiki) | `.aegis/brain/index.md` |
| How to apply AEGIS to a project | `docs/AEGIS_APPLICATION_PLAYBOOK.md` |
| ISO docs registry | `_aegis-output/iso-docs/doc-registry.json` |
| Golden rules | `CLAUDE.md` S"Golden Rules" |
| Safety constraints | `CLAUDE_safety.md` |
| Enforcement hooks | `.claude/hooks/*.sh` |
| Reference protocols | `.claude/references/*.md` (28 files) |
| Traceability audit | `tools/aegis-trace-audit.sh` |
| FUNC catalog regeneration | `tools/aegis-func-catalog.sh` |

---

## Numbering Systems Summary

| System | Pattern | Count | Location |
|--------|---------|-------|----------|
| ISO Documents | PM.01-PM.06, SI.01-SI.06 | 12 | `_aegis-output/iso-docs/doc-registry.json` |
| Requirements | FR-01..FR-21, NFR-01..NFR-08 | 29 | SI.01 |
| Modules | MOD-CORE..MOD-PLAYBOOK | 11 | SI.03 S6 |
| Functions | FUNC-XXXXXX (hash-based) | 421 | `.aegis/brain/func-catalog.json` |
| Tasks | PROJ-J/E/T/US-XXX | 22 | `.aegis/brain/tasks/` |
| Test Cases | TC-01..TC-17, TC-001..TC-008 | 25 | SI.04 |
| Sprints | sprint-v9-01..v10-01 | 7 | `.aegis/brain/sprints/` |
| ADRs | ADR-001..ADR-006 | 6 | `_aegis-output/architecture/architecture-decisions.md` |
