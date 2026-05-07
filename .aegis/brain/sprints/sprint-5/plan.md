# Sprint 5 Plan: Werewolf (หมาป่า)

> Created: 2026-05-07
> Epic: KTH-E-004 (Werewolf)
> Estimated: 18 pts
> Target: Ship game #4 -- social deduction with night/day phase cycle

## Objective

Implement Werewolf (หมาป่า) as the fourth playable game on the platform.
This is the most complex game on the roadmap: multi-phase loop (night/day),
private actions (wolf vote, seer peek, doctor save), role secrecy, and
win-condition checks that depend on faction parity.

## Spec Reference

PLATFORM_SPEC_v2.md sections WW-001 through WW-004.

## Risk Register (Sprint-Specific)

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Phase machine has dead-end states | Loki pre-review; exhaustive test of all transitions |
| R2 | Information leak via reconnect | Defer reconnect-during-night if leak-proof is hard |
| R3 | Wolf vote timing reveals identity | All night actions resolve at end-of-night, no early reveals |
| R4 | Win condition parity edge case | Explicit test for simultaneous last-wolf/last-villager |
| R5 | 5-player minimum means smaller test matrix | Test both 5p and 10p games explicitly |

## Tasks

| ID | Title | Pts | Dependencies | Wave |
|----|-------|-----|-------------|------|
| KTH-T-026 | WerewolfState schema + WerewolfPlayer | 2 | none | A |
| KTH-T-027 | WerewolfRoom -- phase machine + role assignment | 3 | T-026 | A |
| KTH-T-028 | Night phase -- wolf vote, seer peek, doctor save | 3 | T-027 | A |
| KTH-T-029 | Day phase -- discussion, nomination, elimination vote | 2 | T-028 | B |
| KTH-T-030 | Win condition resolver + game-over flow | 2 | T-029 | B |
| KTH-T-031 | Reconnect handling (no info leak) | 1 | T-028 | C |
| KTH-T-032 | Client UI (role reveal, night/day, voting) | 3 | T-030 | C |
| KTH-T-033 | Werewolf test suite (target 50+ tests) | 2 | T-030 | D |

**Total: 18 pts** (8 tasks)

## Wave Execution Order

- **Wave A** (8 pts): T-026 -> T-027 -> T-028 (foundation + night phase)
- **Wave B** (4 pts): T-029 -> T-030 (day phase + win conditions)
- **Wave C** (4 pts): T-031 + T-032 (parallel: reconnect + client UI)
- **Wave D** (2 pts): T-033 (comprehensive test suite)

## Loki Pre-Review

Before any implementation begins, Loki reviews the Werewolf design for:
1. Phase machine correctness (cycle integrity, resolution order)
2. Information-leak surfaces (reconnect, timing, message ordering)
3. Role-distribution edge cases (minimum player count, role assignment)
4. Win-condition parity edge cases
5. Anti-cheat surface (timing attacks)
6. Spec gaps in WW-001..WW-004

Output: .aegis/brain/issues/sprint-5-loki-review.md

## Definition of Done

- [ ] WerewolfRoom extends BaseRoom, follows SpyRoom/WordLinkRoom patterns
- [ ] Full night/day cycle works for 5-15 players
- [ ] 50+ tests passing, zero regression on existing 311
- [ ] Black Panther code review: no info leaks
- [ ] Client UI renders all phases
- [ ] Werewolf flipped to comingSoon=false in gameRegistry
- [ ] ISO docs updated (PM-01, SI-01, SI-02)
- [ ] PR merged to main
