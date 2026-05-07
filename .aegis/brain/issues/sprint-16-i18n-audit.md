# Sprint 16 -- i18n Audit: English-Only User-Facing Strings

**Date:** 2026-05-07
**Auditor:** Beast (via Nick Fury)
**Scope:** All 6 game flows + shared components + home page + error paths
**Method:** Manual grep + full file read of all client/ HTML + JS

## Legend
- **HIGH** = String is visible to users during normal gameplay, English-only with no Thai equivalent present
- **MED** = String is bilingual (Thai/English) but English portion is unnecessary or could be Thai-only
- **LOW** = String is in metadata/debug/title-tag (less user-visible), intentionally bilingual, or a technical term

---

## Findings

| # | File:Line | English String | Suggested Thai | Severity |
|---|-----------|---------------|----------------|----------|
| 1 | `client/shared/components/onboarding.js:39` | `subtitle: 'Forbidden Word -- guess your own word!'` | `'คำต้องห้าม -- เดาคำของตัวเอง!'` | HIGH |
| 2 | `client/shared/components/onboarding.js:53` | `subtitle: 'Word Link -- connect clues to your team\'s words'` | `'คำเชื่อม -- เชื่อมคำใบ้ไปยังคำของทีม!'` | HIGH |
| 3 | `client/shared/components/onboarding.js:67` | `subtitle: 'Spy -- find the spy among you!'` | `'สายลับ -- หาตัวสายลับในกลุ่ม!'` | HIGH |
| 4 | `client/shared/components/onboarding.js:81` | `subtitle: 'Werewolf -- survive the night!'` | `'หมาป่า -- รอดชีวิตข้ามคืน!'` | HIGH |
| 5 | `client/shared/components/onboarding.js:95` | `subtitle: 'Knights -- hidden roles & team missions'` | `'อัศวิน -- บทบาทลับ และภารกิจทีม!'` | HIGH |
| 6 | `client/shared/components/onboarding.js:109` | `subtitle: 'Draw & Guess -- draw it, guess it!'` | `'วาดทาย -- วาดให้ทาย!'` | HIGH |
| 7 | `client/shared/components/onboarding.js:190` | `'... / Example:'` (in example label) | `'... / ตัวอย่าง:'` | MED |
| 8 | `client/shared/components/onboarding.js:211` | `"(Don't show again)"` | `'(ไม่ต้องแสดงอีก)'` | MED |
| 9 | `client/shared/components/onboarding.js:44` | `'(accuse)'` in rules text | `'(กล่าวหา)'` | LOW |
| 10 | `client/shared/components/onboarding.js:55` | `'(Spymaster)'` in rules text | `Already bilingual; keep as-is (game term)` | LOW |
| 11 | `client/shared/components/offline.js:39` | `'Connection failed'` (subtitle) | `'การเชื่อมต่อล้มเหลว'` | HIGH |
| 12 | `client/shared/components/roomShare.js:36` | `'... / Share Room'` in share modal title | `'แชร์ห้อง'` (drop EN) | MED |
| 13 | `client/shared/components/roomShare.js:43` | `'... / Copy Link'` in copy button | `'คัดลอกลิงก์'` (drop EN) | MED |
| 14 | `client/shared/components/roomShare.js:90` | `'[QR library not loaded]'` | `'[โหลด QR ไม่ได้]'` | LOW |
| 15 | `client/shared/components/roomShare.js:114` | `'[QR error]'` | `'[QR ผิดพลาด]'` | LOW |
| 16 | `client/shared/components/offline.js:42` | `'ลองใหม่ / Retry'` | `'ลองใหม่'` (drop EN) | MED |
| 17 | `client/shared/components/offline.js:45` | `'กลับหน้าหลัก / Back to Home'` | `'กลับหน้าหลัก'` (drop EN) | MED |
| 18 | `client/games/knights/game.js:279` | `'HOST'` badge text | `'เจ้าของห้อง'` or just use crown emoji | HIGH |
| 19 | `client/games/knights/game.js:280` | `'OFFLINE'` badge text | `'ออฟไลน์'` | HIGH |
| 20 | `client/games/word-link/game.js:327` | `'หัวหน้าทีม (Spymaster)'` / `'ผู้ทาย (Guesser)'` | Keep bilingual (game term) | LOW |
| 21 | `client/games/word-link/index.html:71` | `'หัวหน้าทีม (Spymaster)'` | Keep bilingual (game term) | LOW |
| 22 | `client/games/spy/game.js:338` | `'แชร์ห้อง / Share'` | `'แชร์ห้อง'` (drop EN) | MED |
| 23 | `client/games/word-link/game.js:295` | `'แชร์ห้อง / Share'` | `'แชร์ห้อง'` (drop EN) | MED |
| 24 | `client/games/forbidden-word/index.html:122` | `'แชร์ห้อง / Share'` | `'แชร์ห้อง'` (drop EN) | MED |
| 25 | `client/games/draw-guess/index.html:67` | `'แชร์ห้อง / Share'` | `'แชร์ห้อง'` (drop EN) | MED |
| 26 | `client/games/knights/game.js:270` | `'แชร์ห้อง / Share'` | `'แชร์ห้อง'` (drop EN) | MED |
| 27 | `client/games/werewolf/game.js:290` | `'แชร์ห้อง / Share'` | `'แชร์ห้อง'` (drop EN) | MED |
| 28 | `client/index.html:280` | `'Party Games TH v1.1'` | `'เกมปาร์ตี้ เวอร์ชัน 1.1'` | LOW |
| 29 | `client/index.html:283` | `'Report a bug / แจ้งปัญหา'` | `'แจ้งปัญหา'` (drop EN) | MED |
| 30 | `client/index.html:9` | `meta apple-web-app-title: 'Party Games TH'` | `'เกมปาร์ตี้'` | LOW |
| 31 | `client/index.html:11` | `<title>เกมปาร์ตี้ | Party Games TH</title>` | Title is intentionally bilingual for SEO | LOW |

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH | 8 |
| MED | 11 |
| LOW | 12 |
| **Total** | **31** |

### HIGH severity items (8):
1. **Onboarding subtitles** (6 items, #1-#6): All 6 game onboarding subtitles are English-only. These are visible on first-time game join.
2. **Offline screen** (1 item, #11): "Connection failed" subtitle is English-only.
3. **Knights lobby badges** (1 item split, #18-#19): "HOST" and "OFFLINE" badges are English-only text.

### Decision: HIGH count = 8 (< 10)
Per sprint rules: **inline-fix these 8 HIGH-severity items in this sprint.**

### MED severity items (11):
All bilingual strings with `/ English` suffix -- Thai + English coexist. These are intentional for bilingual UX. Recommend deferring to a dedicated i18n sweep when we introduce a locale toggle.

### LOW severity items (12):
Game terms (Spymaster, Guesser), metadata tags, debug messages, intentionally bilingual titles. No action needed.
