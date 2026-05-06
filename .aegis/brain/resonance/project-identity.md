# Project Identity -- Party Games TH

## One-Line
Thai party game platform -- 6 real-time multiplayer board games playable on phones, zero accounts, instant fun.

## Core Identity
- **Name**: Party Games TH (เกมปาร์ตี้)
- **Origin**: Started as คำต้องห้าม (Kham Tong Ham), a forbidden-word party game
- **Evolution**: Expanding to multi-game platform with 6 games (Sprint 2+)
- **Audience**: Thai friend groups (16-25), families, office parties
- **Tech Stack**: Node.js + Colyseus (WebSocket) + HTML5 PWA + TypeScript + Vitest
- **Architecture**: Room-based multiplayer (BaseRoom pattern), vanilla JS client
- **Data**: JSON-based content (wordpacks, locations, roles)

## Design Principles
1. Zero friction -- no accounts, no downloads, play in browser
2. Thai-first -- all UI in Thai, culturally relevant content
3. Mobile-first -- portrait mode, touch-friendly, works on mid-range Android
4. Party-first -- games are social, fun, fast-starting
5. Modular -- each game is a separate Room class extending BaseRoom

## Games
1. คำต้องห้าม (Forbidden Word) -- word survival + voting, 2-8 players [SHIPPED]
2. หมาป่า (Werewolf) -- social deduction, night/day cycle, 5-15 players [PLANNED]
3. สายลับ (Spy) -- location deduction, 3-8 players [PLANNED]
4. อัศวิน (Knights) -- hidden role team missions, 5-10 players [PLANNED]
5. คำเชื่อม (Word Link) -- team word association, 4-10 players [PLANNED]
6. วาดทาย (Draw & Guess) -- drawing + guessing, 3-8 players [PLANNED]

## Key Decisions
- IP safety: all games use original Thai names and branding, generic mechanics
- Social deduction emphasis: 3 of 6 games are social deduction (most popular genre in Thai board game cafes)
- Word Link reuses existing 19 wordpacks from kam-tong-ham
- Draw & Guess uses HTML5 Canvas with touch support
- All games share BaseRoom for lobby, players, host transfer, timer

## Quality Standards
- 172+ tests (growing per game)
- ISO docs maintained (PM.01, SI.01, SI.02)
- AEGIS v11.0 framework with v12 hooks
