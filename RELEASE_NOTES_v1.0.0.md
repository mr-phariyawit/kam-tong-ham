# v1.0.0 -- kam-tong-ham Party Games Platform

Thai party game platform with 6 real-time multiplayer games over WebSocket.

## Games

| Game | Thai Name | Players | Mechanic |
|------|-----------|---------|----------|
| Forbidden Word | คำต้องห้าม | 2-8 | Word survival + social deduction |
| Word Link | คำเชื่อม | 4-10 | Team word association (Codenames-style) |
| Spy | สายลับ | 3-8 | Location deduction (Spyfall-style) |
| Werewolf | หมาป่า | 5-15 | Classic social deduction with night/day phases |
| Knights | อัศวิน | 5-10 | Hidden role + team missions (Avalon-style) |
| Draw & Guess | วาดทาย | 3-8 | Drawing + guessing (Pictionary-style) |

## Highlights

- **Real-time multiplayer** via Colyseus WebSocket server
- **Mobile-first** vanilla HTML/CSS/JS client (PWA-ready)
- **Thai-first UI** with original Thai game names and content
- **Anti-cheat design**: all secret state (roles, words, spy identity) stored server-side only; private messages used for sensitive data; no synced-state leaks
- **Cross-game reconnection**: 5-minute reconnect window with game-specific state restoration
- **514 automated tests** covering all 6 games, integration scenarios, and security audits
- **IP-safe**: all games use generic mechanics with original Thai naming (no trademarked game names in UI)

## Architecture

- Server: Node.js 20 + TypeScript + Colyseus 0.15 + Express
- Client: Vanilla HTML/CSS/JS (no framework -- fast, lightweight)
- Shared: BaseRoom/BaseState abstraction pattern validated across 6 game types
- CI: GitHub Actions (typecheck + build + vitest + smoke playthroughs)

## Sprint History

| Sprint | Scope | Points |
|--------|-------|--------|
| S0 | Project bootstrap | 5 |
| S1 | Test stabilization + wordpacks | 7 |
| S2 | Multi-game platform foundation | 18 |
| S3 | Word Link | 17 |
| S4 | Spy | 11 |
| S5 | Werewolf | 18 |
| S6 | Knights | 15 |
| S7 | Draw & Guess | 13 |
| S8 | Polish + security audit | 5 |
| **Total** | | **109 pts** |

## Known Limitations

- No deployment yet (server + client in repo, not hosted)
- No persistent game state (in-memory Colyseus rooms)
- No user accounts or authentication (anonymous play)
- No telemetry or analytics
- Advanced Werewolf roles (Hunter, Witch, Cupid) deferred to future sprint
