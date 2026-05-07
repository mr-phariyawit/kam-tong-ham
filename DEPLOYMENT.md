# Deployment Guide -- kam-tong-ham Party Games Platform

## Architecture

```
Browser (client/) ──WebSocket──> Colyseus Server (server/dist/index.js)
                  ──HTTP GET───> Express static files (client/)
                  ──HTTP API───> Express REST (/api/games, /api/rooms/*)
```

Single container serves both the WebSocket game server and static client files.
No separate CDN or reverse proxy needed for beta.

## Quick Start (Render.com -- recommended)

### Option A: Blueprint (automatic)

1. Push this repo to a GitHub repository you own
2. Go to [render.com/select-repo?type=blueprint](https://dashboard.render.com/select-repo?type=blueprint)
3. Select your repo -- Render detects `render.yaml` automatically
4. Click **Apply** to create the service
5. Wait ~2 minutes for Docker build + deploy
6. Your app is live at `https://kam-tong-ham.onrender.com` (or custom name)

### Option B: Manual Web Service

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New** > **Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Name:** `kam-tong-ham` (or your choice)
   - **Region:** Oregon (free) or Singapore (paid, lower latency for Thai users)
   - **Runtime:** Docker
   - **Dockerfile Path:** `./Dockerfile`
   - **Plan:** Free
   - **Health Check Path:** `/api/games`
5. Click **Create Web Service**
6. Wait for build + deploy

### Option C: Manual Docker (any host)

```bash
# Build
docker build -t kam-tong-ham .

# Run (PORT is configurable, default 10000)
docker run -p 10000:10000 -e PORT=10000 -e NODE_ENV=production kam-tong-ham

# Verify
curl http://localhost:10000/api/games
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `10000` (Docker) / `2567` (dev) | Server port. Render sets this automatically. |
| `NODE_ENV` | No | `production` | Environment mode. Set to `production` in deploy. |

No secrets, API keys, or database connections are required.
The app is fully stateless (in-memory Colyseus rooms).

## Health Check

```
GET /api/games
```

Returns 200 with the list of 6 registered games. Used by Render for health monitoring.

## Known Limitations (Free Tier)

1. **Cold start:** Render free tier spins down after 15 minutes of inactivity.
   First request after spin-down takes ~30 seconds. Active rooms keep the server awake.

2. **Memory:** 512MB RAM on free tier. Sufficient for ~50 concurrent rooms
   (each room is lightweight, ~1KB state).

3. **Region:** Free tier is US West (Oregon). Thai users experience ~200ms RTT.
   Upgrade to Paid tier ($7/mo) for Singapore region (~30ms RTT for Thai users).
   This addresses Loki review S2 F4a (APAC <100ms RTT target).

4. **No persistence:** Colyseus rooms are in-memory. Server restart = all active
   rooms lost. Acceptable for party games (sessions are 5-15 minutes).

5. **WebSocket:** Render free tier supports WebSocket natively. No special config needed.

## Upgrading to Singapore Region

When user base justifies the cost ($7/mo Starter plan):

1. Go to Render dashboard > your service > Settings
2. Change Region to `Singapore`
3. Redeploy
4. RTT for Thai users drops from ~200ms to ~30ms

## Local Development

```bash
npm install
npm run dev          # Starts dev server on port 2567
npm run build        # Compiles TypeScript
npm start            # Runs production build
npm test             # Runs 514+ unit tests
npm test -- --grep smoke  # Runs smoke tests only
```

## CI/CD

GitHub Actions runs on every push to `main` and on PRs:
- `test` job: install, typecheck, build, vitest (unit tests)
- `smoke` job: smoke playthroughs (6 games, end-to-end room lifecycle)

Render auto-deploys from `main` branch when connected to GitHub.
