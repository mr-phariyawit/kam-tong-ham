# Human Action Queue

Items that require human action (credentials, access, decisions).

---

## HQ-001: Deploy to Render.com (External Access) — ✅ RESOLVED 2026-05-08

**Category:** External access (human holds credentials)
**Priority:** P0 -- blocking public URL
**Resolved:** 2026-05-08 by user — Blueprint applied via Render dashboard, AEGIS_ADMIN_TOKEN set, deploy succeeded.
**Live URL:** https://kam-tong-ham.onrender.com
**Smoke verification (main session):**
- `GET /api/games` → 200 with 6-game registry
- `GET /api/admin/telemetry` → 401 (auth gate works)
- `GET /` → 200, 15.3KB home page
- `GET /api/health` → 200
- Issue #21 rate-limiter smoke: 200×10 + 429×2 (exact threshold, TRUST_PROXY confirmed)
**Sprint 14 production hardening verified live.**
**Created:** 2026-05-07

### EN
The app is ready to deploy. All config files are committed (`render.yaml`, `Dockerfile`, `DEPLOYMENT.md`). You need to:

1. Create a GitHub repo (or ensure `mr-phariyawit/kam-tong-ham` exists and is accessible)
2. Push the code to that repo
3. Go to [render.com](https://dashboard.render.com) and sign up (free, no credit card)
4. Connect your GitHub repo to Render
5. Render will auto-detect `render.yaml` and create the service
6. Wait ~2 min for build + deploy
7. Share the URL

**Alternative (Docker manual):**
```bash
docker build -t kam-tong-ham .
docker run -p 10000:10000 kam-tong-ham
# Then visit http://localhost:10000
```

### TH
แอปพร้อม deploy แล้ว ไฟล์ config ทั้งหมดอยู่ในโค้ด (`render.yaml`, `Dockerfile`, `DEPLOYMENT.md`)

ขั้นตอน:
1. สร้าง GitHub repo (หรือตรวจสอบว่า `mr-phariyawit/kam-tong-ham` มีอยู่และเข้าถึงได้)
2. Push โค้ดไปที่ repo
3. ไปที่ [render.com](https://dashboard.render.com) สมัคร (ฟรี ไม่ต้องใช้บัตรเครดิต)
4. เชื่อมต่อ GitHub repo กับ Render
5. Render จะตรวจจับ `render.yaml` อัตโนมัติและสร้าง service
6. รอ ~2 นาทีสำหรับ build + deploy
7. แชร์ URL ได้เลย

---

## HQ-002: Repository Visibility Decision (Identity)

**Category:** Identity / external access
**Priority:** P3 -- not blocking, but relevant before sharing
**Created:** 2026-05-07

### EN
The repo is currently PRIVATE. Before sharing with beta testers or accepting contributions:
- **Public**: allows bug reports, pull requests, easier sharing with friends
- **Private**: keeps code private, requires explicit collaborator invites

Do you want to make the repo public?

### TH
Repo ปัจจุบันเป็น PRIVATE ก่อนแชร์กับเพื่อนหรือรับ contribution:
- **Public**: รับ bug reports, pull requests, แชร์ง่าย
- **Private**: โค้ดเป็นส่วนตัว ต้องเชิญ collaborator เอง

ต้องการทำ repo เป็น public ไหม?

---

## HQ-003: Push v1.0.0 Tag to Remote (External Access) — ✅ RESOLVED 2026-05-07T10:23Z

**Category:** External access (requires remote repo)
**Priority:** P1 -- after HQ-001 is resolved
**Created:** 2026-05-07
**Resolved:** 2026-05-07T10:23Z by main session — `gh auth switch` to `mr-phariyawit`, `v1.0.0` tag pushed, GitHub Release created at https://github.com/mr-phariyawit/kam-tong-ham/releases/tag/v1.0.0

### EN
After the GitHub repo is set up and code is pushed, run:
```bash
git tag -a v1.0.0 -m "v1.0.0 -- kam-tong-ham Party Games Platform (6 games, 514 tests)"
git push origin v1.0.0
```

Optionally create a GitHub Release:
```bash
gh release create v1.0.0 --title "v1.0.0" --notes-file RELEASE_NOTES_v1.0.0.md
```

### TH
หลังจาก GitHub repo พร้อมแล้ว รัน:
```bash
git tag -a v1.0.0 -m "v1.0.0 -- kam-tong-ham Party Games Platform (6 games, 514 tests)"
git push origin v1.0.0
```

---

## Pending Items

<!-- PENDING_START -->

### [2026-05-08] EXPLICIT -- Merge PR #28 hotfix to main (bypass dead CI) / Merge PR #28 hotfix (CI ไม่ทำงาน) — ✅ RESOLVED 2026-05-08T09:17:55Z

- **EN**: APPROVED by user. Merged via rebase 2026-05-08T09:17:55Z as commit `6fb2cab` on main. Branch deleted. Render auto-deploy in flight.
- **TH**: ผู้ใช้อนุมัติ Merge เรียบร้อยตอน 09:17:55Z (commit 6fb2cab) Render กำลัง deploy
- **Category**: Explicit approval gate
- **Raised by**: captain-america
- **Resolved by**: user "approve" + bolt merged via gh CLI
- **Raised**: 2026-05-08
- **Resolved**: 2026-05-08T09:17:55Z

### [2026-05-08] EXTERNAL -- Purchase GitHub Actions minutes / ซื้อ credit GitHub Actions

- **EN**: GitHub Actions free-tier minutes exhausted. All PR checks (including PR #27 v12 upgrade) are blocked. Recommend purchasing Team plan ($4/mo for 3000 min) or pay-as-you-go ($0.008/min). Rewriting CI for another provider costs more than months of billing.
- **TH**: Credit GitHub Actions หมด PR ทุกตัวถูก block แนะนำซื้อ Team plan ($4/เดือน 3000 นาที) หรือจ่ายตามใช้ ($0.008/นาที) เปลี่ยน CI provider แพงกว่าค่า billing หลายเดือน
- **Category**: External access
- **Raised by**: captain-america
- **Blocks**: Phase 4 of rush-to-prod plan; all future PR CI checks
- **Raised**: 2026-05-08
- **Resolved**: _(pending)_

### [2026-05-08] EXTERNAL -- iOS Safari + Android Chrome real-device testing (Issue #19) / ทดสอบ iOS Safari + Android Chrome บนเครื่องจริง

- **EN**: Issue #19 requires testing all 6 games on real iOS Safari and Android Chrome. No simulator/emulator substitute -- PWA behavior differs on real devices (SW registration, add-to-homescreen, safe-area insets). Need human with actual devices to test and post screenshots.
- **TH**: Issue #19 ต้องทดสอบ 6 เกมบน iOS Safari และ Android Chrome จริง Simulator ทดแทนไม่ได้ (พฤติกรรม PWA ต่างกัน) ต้องการคนที่มีเครื่องจริงทดสอบและถ่ายภาพหน้าจอ
- **Category**: External access
- **Raised by**: captain-america
- **Blocks**: Phase 5.2; Issue #19 closure; "production-ready" SHOULD criterion #12
- **Raised**: 2026-05-08
- **Resolved**: _(pending)_

### [2026-05-08] EXPLICIT — Merge PR #29 (vendor colyseus + load guard) — same one-time CI-bypass exception as #28 / Merge PR #29 (vendor colyseus + load guard) — ข้อยกเว้น CI เหมือน #28

- **EN**: PR #29 verified locally: 621/621 vitest green, all 6 games on local vendored colyseus, SW cache v1->v2, ColyseusGuard active, /api/client-error endpoint + 7 tests, pre-commit hook blocks floating CDN tags. CI billing-blocked (same as #27, #28). GCP Cloud Run is ALREADY running this code (built from PR #29 HEAD). Merging keeps main in sync. Command: gh pr merge 29 --rebase --delete-branch
- **TH**: PR #29 ตรวจ local เรียบร้อย: 621/621 test ผ่าน, 6 เกมใช้ colyseus local, SW cache v2, ColyseusGuard ทำงาน, มี /api/client-error + test 7 ตัว, pre-commit hook กัน floating CDN. CI หมด credit (เหมือน #27, #28). GCP Cloud Run รันโค้ดนี้อยู่แล้ว merge เพื่อ sync main
- **Category**: Explicit approval gate
- **Raised by**: captain-america
- **Blocks**: main hygiene; future deploys built from main without vendoring
- **Raised**: 2026-05-08T10:03:26Z
- **Resolved**: _(pending)_

### [2026-05-08] IDENTITY — Cloud Run custom domain decision / ตัดสินใจเรื่อง custom domain ของ Cloud Run

- **EN**: GCP auto URL is https://kam-tong-ham-45962093401.asia-southeast1.run.app — works but ugly. Options: (a) keep auto URL, (b) buy/use domain + map via 'gcloud run domain-mappings create --service=kam-tong-ham --domain=YOUR_DOMAIN --region=asia-southeast1' + DNS CNAME. Affects: branding, shareability, what to put in README/social. No technical urgency — auto URL works fine for friends-and-family beta.
- **TH**: URL อัตโนมัติ GCP คือ https://kam-tong-ham-45962093401.asia-southeast1.run.app ใช้ได้แต่ไม่สวย ทางเลือก: (a) ใช้ URL อัตโนมัติ, (b) ซื้อ/ใช้ domain ของตัวเองแล้ว map ด้วย gcloud run domain-mappings ไม่เร่ง — URL อัตโนมัติเล่นได้ปกติ
- **Category**: Identity
- **Raised by**: captain-america
- **Blocks**: polished URL for sharing; nothing else technical
- **Raised**: 2026-05-08T10:03:35Z
- **Resolved**: _(pending)_

### [2026-05-08] EXTERNAL — Shut down Render service after GCP cutover validated / ปิด Render หลังตรวจ GCP เรียบร้อย

- **EN**: Render service at https://kam-tong-ham.onrender.com still active and serving the colyseus@0.15.17-pinned build (commit 6fb2cab). Recommended: keep warm 24h as fallback, then suspend (cheap reversible), then delete. Done via Render dashboard — destructive external action, cannot do via gcloud. Reason for shutdown: GCP Cloud Run is canonical, Singapore region gives 2-3x better Thailand RTT, single-instance config is cleaner for Colyseus state.
- **TH**: Service Render ที่ https://kam-tong-ham.onrender.com ยังทำงาน รัน build colyseus@0.15.17 (commit 6fb2cab) แนะนำ: เก็บไว้ 24 ชม. เป็น fallback แล้ว suspend (ย้อนได้) แล้วค่อยลบ ทำผ่าน Render dashboard — ทำ via gcloud ไม่ได้ เหตุผล: Cloud Run เป็นหลัก สิงคโปร์ latency ดีกว่า Render Oregon 2-3 เท่า
- **Category**: External access
- **Raised by**: captain-america
- **Blocks**: cost cleanup; cutover finalized
- **Raised**: 2026-05-08T10:03:43Z
- **Resolved**: _(pending)_
<!-- PENDING_END -->
