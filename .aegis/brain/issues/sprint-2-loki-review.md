# Loki Adversarial Review -- PLATFORM_SPEC_v2.md

> Reviewer: Loki (adversarial)
> Date: 2026-05-07
> Spec: _aegis-output/specs/PLATFORM_SPEC_v2.md (28KB)
> Verdict: CONDITIONAL APPROVE -- 0 BLOCKER, 2 HIGH, 4 MEDIUM, 2 LOW

---

## 1. Game Selection Challenge

**Directive:** "Famous WORLDWIDE board games"

**Current 5:** Werewolf, Spyfall, Avalon, Codenames, Pictionary

**Analysis:**

The current 5 are all excellent choices for a MOBILE PARTY GAME platform. The key
criterion is not "most globally famous board game" but "best fit for real-time
multiplayer on phones in a Thai friend-group setting." By that lens:

- Chess/Go/Carcassonne/Catan are TURN-BASED STRATEGY games -- fundamentally wrong
  for a party game platform targeting quick social sessions.
- The selected 5 are all SOCIAL/PARTY games with real-time interaction, laughter,
  and group dynamics. They work brilliantly on phones in 5-15 minute sessions.
- All 5 are globally known and have proven Thai adaptations (Werewolf is huge in
  Thai party culture via LINE/social media).

**Verdict: CURRENT 5 DEFENDED.** No swaps recommended. The human said "board games"
but the product context is "party game platform" -- the spec correctly interpreted
the spirit (not the letter) of the request.

**Severity: N/A (no issue)**

---

## 2. IP Risk Audit

| Game | Thai Name | IP Risk | Assessment |
|------|-----------|---------|------------|
| Werewolf | หมาป่า | NONE | "Werewolf" / "Mafia" is a public domain party game. No trademark on the mechanic. Thai name is original. |
| Spy | สายลับ | LOW | "Spyfall" is trademarked by Cryptozoic. The spec uses the generic term "Spy" and original Thai name. Mechanic (location deduction) is not copyrightable. SAFE as long as we never use the word "Spyfall" in UI/marketing. |
| Knights | อัศวิน | **MEDIUM** | "Avalon" and "The Resistance" are trademarks of Indie Boards & Cards. The spec uses "Knights" / "อัศวิน" (generic). However: role names "Merlin", "Assassin", "Percival", "Morgana" are from Arthurian legend (public domain), BUT their specific combination in a team-mission game is closely associated with Avalon. **Recommendation: Use fully Thai role names (e.g., "ผู้รู้" for Merlin, "มือสังหาร" for Assassin) to distance from the Avalon brand.** |
| Word Link | คำเชื่อม | LOW | "Codenames" is trademarked by Czech Games Edition. The spec uses "Word Link" / "คำเชื่อม" (generic). The 5x5 word grid + spymaster mechanic is widely cloned (dozens of free versions exist). SAFE with generic naming. |
| Draw & Guess | วาดทาย | NONE | "Pictionary" is trademarked by Hasbro. The spec uses "Draw & Guess" / "วาดทาย" (generic). Drawing + guessing is a public domain mechanic. |

**Severity: MEDIUM (Knights role naming)**
**Remediation:** Replace Arthurian role names with Thai originals throughout spec and implementation. Add to spec Section KN-001 a table of Thai role names.

---

## 3. Mechanic Diversity Assessment

| Game | Primary Mechanic | Secondary Mechanic |
|------|-----------------|-------------------|
| Forbidden Word | Word survival | Voting / social deduction |
| Werewolf | Social deduction | Night/day phase voting |
| Spy | Social deduction | Location knowledge / Q&A |
| Knights | Social deduction | Team missions / voting |
| Word Link | Word association | Team competition |
| Draw & Guess | Drawing / guessing | Speed competition |

**Concern:** 4 of 6 games lean heavily on social deduction (Forbidden Word, Werewolf,
Spy, Knights). This clusters the portfolio.

**Counter-argument:** Social deduction IS the dominant genre for Thai party games.
The Thai market (Line groups, office parties, university events) gravitates toward
"who's the liar?" mechanics. Word Link and Draw & Guess provide sufficient variety
for groups that want non-deduction options.

**Verdict:** The mechanic mix is ACCEPTABLE for the Thai market. If the platform
expands later, consider a pure trivia game or a physical-action game as game 7-8.

**Severity: LOW**
**Remediation:** No immediate action. Note in roadmap that Sprint 8 (Polish) could
include a "Game 7 research" task to survey Thai user demand for non-deduction games.

---

## 4. NFR Feasibility (PNFR-1 through PNFR-10)

| NFR | Feasibility | Concern |
|-----|-------------|---------|
| PNFR-1 (2s home screen load) | FEASIBLE | Vanilla JS + static HTML. Easy. |
| PNFR-2 (lazy-load per game) | FEASIBLE | Game assets are small (JS + CSS). Standard dynamic import. |
| PNFR-3 (WebSocket RTT <100ms) | **CONCERN** | Depends entirely on server location. Thai users on a Bangkok-hosted server: 10-30ms. Thai users on a US-hosted server: 200-300ms. **Spec must specify deployment region.** |
| PNFR-4 (drawing strokes <50ms) | FEASIBLE | Delta-based stroke send is standard. 50ms render is generous. |
| PNFR-5 (200 concurrent rooms) | FEASIBLE | Single Colyseus server handles 200 rooms easily (each room is lightweight). |
| PNFR-6 (graceful restart) | **CONCERN** | Colyseus 0.15 does NOT have built-in state persistence across restarts. This requires Redis/external store. Marked "Should" in spec, which is appropriate -- do not promote to "Must" for MVP. |
| PNFR-7 (browser compat) | FEASIBLE | Vanilla JS avoids framework compat issues. |
| PNFR-8 (single PWA) | FEASIBLE | Already a PWA. Game views are just different HTML pages. |
| PNFR-9 (no PII) | FEASIBLE | Existing arch has no auth, no storage. |
| PNFR-10 (Thai i18n) | FEASIBLE | Already all-Thai. |

**Severity: HIGH (PNFR-3)**
**Remediation:** Add to spec: "Server MUST be deployed in Asia-Pacific region
(e.g., Bangkok, Singapore, Tokyo) to meet PNFR-3 for Thai users." If currently
deployed on Render/Railway/Fly.io US, migration to Asia region is a Sprint 8 task.

**Severity: LOW (PNFR-6)**
**Remediation:** Keep as "Should". Do not block MVP on this. Add note that Redis
integration is a post-launch enhancement.

---

## 5. Sprint 2 Vertical-Slice Critique

**Concern:** Sprint 2 is 18 pts of pure infrastructure (BaseRoom, BaseState, home
screen, registry, refactor, client migration) with ZERO new game playable at the end.
The first new game (Werewolf) ships in Sprint 3. This means:

- 5 days of work with no user-facing new value
- Risk of over-engineering the platform layer before validating with a real second game
- If BaseRoom abstractions are wrong, refactoring is harder after Sprint 3

**Counter-argument:**
- The platform foundation IS the critical path. Every game depends on BaseRoom.
- The existing ForbiddenWord game continues to work throughout (zero regression).
- Sprint 2's home screen IS user-facing value (users see the game grid, even if
  5 of 6 are "coming soon").
- Shipping a game in parallel with foundation creates merge conflicts and doubles testing.

**Verdict:** The current approach (foundation first, games after) is the CORRECT
engineering decision for a 1-developer team. Parallel game development only makes
sense with 2+ developers.

**Recommendation (MEDIUM):** Add a "Coming Soon" badge to unimplemented game cards
on the home screen. This gives Sprint 2 user-visible output and creates anticipation.
The spec should clarify this in PFR-001.

**Severity: MEDIUM**
**Remediation:** Add PFR-001.6: "Unimplemented game cards show 'Coming Soon' badge
and are non-tappable (greyed out)."

---

## 6. Additional Findings

### 6a. Missing: Room Code Collision Across Games (HIGH)

The spec says "Room code is unique across ALL games" (PBR-3). The current
`generateRoomCode(activeRoomCodes)` generates codes from a single shared Set.
But the room creation API (`POST /api/rooms/create`) creates the code WITHOUT
specifying the game type. When the client then joins with a specific game type,
the room is created as a specific Room subclass (e.g., WerewolfRoom).

**The gap:** Two users could:
1. User A creates room code ABCD for Werewolf
2. User B tries to join ABCD for Spy
3. The matchmaker query searches by game type -- User B gets "room not found"
4. But if User B tries to create a new room, ABCD is taken in the activeRoomCodes set

This is a UX confusion bug, not a security bug. But it violates PBR-3's spirit.

**Severity: HIGH**
**Remediation:** The room creation API must accept a `gameType` parameter. The room
code + game type pair must be validated at join time. The existing `POST /api/rooms/create`
needs `{ gameType: string }` in the request body. The room lookup endpoint needs to
return the game type so the client can validate before joining.

### 6b. Missing: WebSocket Game-Type Routing (MEDIUM)

PFR-003.5 says "WebSocket: game-type field in room creation message." The current
Colyseus setup in `app.ts` only defines one room type: `kham_tong_ham`. For multi-game,
the server needs to define multiple room types OR use a single room type with a
factory pattern.

**Recommendation:** Use Colyseus `defineRoomType` per game. The game registry maps
game IDs to room class names. Room creation uses the game type as the Colyseus room
name.

**Severity: MEDIUM (covered by KTH-T-007)**

### 6c. Spec says 78 pts total but roadmap says 91 pts (LOW)

The PBI epic table (Part 4) sums to 78 pts. The roadmap (Part 6) sums to 91 pts.
The discrepancy is 13 pts -- likely the Sprint 3 Werewolf was estimated at 13 in
epics but 18 in the roadmap (Sprint 3 says 18 pts). This is a spec consistency bug.

**Severity: LOW**
**Remediation:** Reconcile point totals. The roadmap should match the PBI breakdown.

---

## Summary Table

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F1 | Game selection (5 games) | N/A | Defended |
| F2 | IP risk: Knights role names | MEDIUM | Use Thai role names |
| F3 | Mechanic diversity | LOW | Acceptable for Thai market |
| F4a | PNFR-3 server region | HIGH | Specify Asia-Pacific deployment |
| F4b | PNFR-6 graceful restart | LOW | Keep as Should, post-launch |
| F5 | Sprint 2 no user-facing game | MEDIUM | Add "Coming Soon" badges |
| F6a | Room code collision across games | HIGH | gameType in room creation API |
| F6b | WebSocket game-type routing | MEDIUM | Covered by KTH-T-007 |
| F6c | Point total discrepancy (78 vs 91) | LOW | Reconcile spec |

**BLOCKER count: 0**
**Verdict: CONDITIONAL APPROVE -- proceed with Sprint 2, address HIGH items (F4a, F6a) before Sprint 3.**
