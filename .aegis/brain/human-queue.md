# Human Action Queue

Items that require human action (credentials, access, decisions).

---

## HQ-001: Deploy to Render.com (External Access)

**Category:** External access (human holds credentials)
**Priority:** P0 -- blocking public URL
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
