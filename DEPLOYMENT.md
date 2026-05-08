# Deployment Guide -- kam-tong-ham Party Games Platform

## Architecture

```
Browser (client/) ──WebSocket──> Colyseus Server (server/dist/index.js)
                  ──HTTP GET───> Express static files (client/)
                  ──HTTP API───> Express REST (/api/games, /api/rooms/*)
```

Single container serves both the WebSocket game server and static client files.
No separate CDN or reverse proxy needed for beta.

## Canonical: GCP Cloud Run (asia-southeast1 / Singapore)

**Live URL:** https://kam-tong-ham-45962093401.asia-southeast1.run.app
**Project:** `game-board-online-th`
**Service:** `kam-tong-ham`
**Region:** `asia-southeast1` (Singapore — ~100ms RTT to Thailand vs ~280ms Render Oregon)

### Why Cloud Run for this stack
- Single container, autoscale-to-1 (Colyseus rooms are in-memory; multi-instance would split state).
- WebSocket support is GA, session-affinity flag pins long-lived connections to the same revision.
- Free tier covers a friend-group party platform; cost remains effectively zero at this scale.

### Deploy a new image

```bash
# Build + push to Artifact Registry (uses repo Dockerfile)
gcloud builds submit \
  --tag asia-southeast1-docker.pkg.dev/game-board-online-th/kam-tong-ham/server:<TAG>

# Deploy / update Cloud Run service
gcloud run deploy kam-tong-ham \
  --image=asia-southeast1-docker.pkg.dev/game-board-online-th/kam-tong-ham/server:<TAG> \
  --region=asia-southeast1 \
  --port=10000 \
  --memory=512Mi --cpu=1 \
  --min-instances=1 --max-instances=1 \
  --timeout=3600 --concurrency=250 \
  --session-affinity --allow-unauthenticated \
  --set-env-vars=NODE_ENV=production,TRUST_PROXY=1
```

### Add `AEGIS_ADMIN_TOKEN` (for /api/admin/telemetry)

```bash
echo -n "$TOKEN_VALUE" | gcloud secrets create aegis-admin-token --data-file=-
gcloud run services update kam-tong-ham \
  --update-secrets=AEGIS_ADMIN_TOKEN=aegis-admin-token:latest \
  --region=asia-southeast1
```

### Custom domain (optional)

```bash
gcloud run domain-mappings create \
  --service=kam-tong-ham \
  --domain=YOUR_DOMAIN \
  --region=asia-southeast1
# Then add the CNAME record shown in the command output to your DNS.
```

### Manual Docker (any host or local smoke)

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
| `PORT` | No | `10000` (Docker) / `2567` (dev) | Server port. Cloud Run injects this automatically. |
| `NODE_ENV` | No | `production` | Environment mode. Set to `production` in deploy. |
| `AEGIS_ADMIN_TOKEN` | **Recommended** | _(unset)_ | Bearer token for `/api/admin/*` endpoints (e.g. telemetry). **If unset, admin endpoints return 503 (fail closed).** Set via Cloud Run + Secret Manager (see Cloud Run section above). |
| `TRUST_PROXY` | No | _(unset)_ | Set to `1` to trust `X-Forwarded-For` headers for rate limiting. **Enable on Cloud Run** (Google front-end injects X-Forwarded-For). Without it, rate limiting falls back to socket IP. |

### Security notes (Sprint 14)

- **Admin endpoints** (`/api/admin/telemetry`): Protected by `AEGIS_ADMIN_TOKEN`.
  If the token is not set, the endpoint returns 503 -- it does not expose data.
  Store the token in Secret Manager and bind it via `--update-secrets` (see Cloud Run section).

- **Rate limiting**: `POST /api/rooms/create` is rate-limited to 10 requests per
  minute per IP. Exceeding the limit returns 429 with a `Retry-After` header.
  The rate limiter is in-memory and resets on server restart.

- **Telemetry log**: In-memory counters (rooms created, games started, peak players)
  reset on each deploy since the app is stateless. The JSONL telemetry.log file in
  `server/data/` also resets on container restart (see Sprint 10 notes).

## Health Check

```
GET /api/games
```

Returns 200 with the list of 6 registered games. Used by Cloud Run for health monitoring.

## Operational Notes (Cloud Run, single-instance config)

1. **No cold start in normal operation.** `--min-instances=1` keeps one instance
   warm at all times. CPU is request-allocated, so idle compute is free; only
   memory is held continuously.

2. **Memory:** 512Mi allocated. Sufficient for ~50 concurrent rooms (each room
   is lightweight, ~1KB state).

3. **Region:** `asia-southeast1` (Singapore). Thai users see ~100ms RTT.

4. **No persistence.** Colyseus rooms are in-memory. Deploying a new revision
   replaces the running instance and drops all active rooms. Acceptable for party
   games (sessions are 5-15 minutes); avoid mid-evening deploys when possible.

5. **WebSocket** is GA on Cloud Run. The `--session-affinity` flag pins each
   client connection to the same revision for the cookie TTL.

6. **Single-instance ceiling.** `--max-instances=1` is intentional: Colyseus
   state lives in process memory, so multi-instance would split rooms.
   Concurrency=250 is more than enough for the friend-group scale this product
   targets. If you ever need horizontal scale, add Redis pub/sub via
   `@colyseus/redis-driver` and `@colyseus/redis-presence` first.

## Local Development

```bash
npm install
npm run dev          # Starts dev server on port 2567
npm run build        # Compiles TypeScript
npm start            # Runs production build
npm test             # Runs 514+ unit tests
npm test -- --grep smoke  # Runs smoke tests only
```

## Performance Baseline (Sprint 15)

Pre-deploy performance measurements captured on 2026-05-07.

### Bundle Sizes

| Component | Size | Files |
|-----------|------|-------|
| Server dist (JS) | 292.5KB | 25 |
| Client JS | 269.5KB | 13 |
| Client CSS | 112.1KB | 11 |
| Client HTML | 70.0KB | 7 |
| **Client total** | **451.6KB** | **31** |

### Cold Start

Server cold start (`node server/dist/index.js` to first `/api/health` 200): **311ms**

### Load Smoke (synthetic)

10 rooms across 6 game types, 40 total players, 500 messages:

| Metric | Value |
|--------|-------|
| Rooms | 10 (2x forbidden-word, 2x word-link, 2x spy, 1x werewolf, 1x knights, 2x draw-guess) |
| Total players | 40 |
| Messages sent | 500 |
| Errors | 0 |
| Peak heap | 28.97MB |
| Elapsed | 52ms |

Run the benchmarks yourself:
```bash
node tools/perf-baseline.js   # Bundle sizes + cold start
node tools/load-smoke.js      # Multi-room load smoke
```

Results are saved to `.aegis/brain/metrics/perf-baseline-YYYY-MM-DD.json`.

## CI/CD

GitHub Actions runs on every push to `main` and on PRs:
- `test` job: install, typecheck, build, vitest (unit tests)
- `smoke` job: smoke playthroughs (6 games, end-to-end room lifecycle)

Render auto-deploys from `main` branch when connected to GitHub.
