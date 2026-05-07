# ─── Stage 1: Build ───────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps

COPY tsconfig.json ./
COPY server/src/ ./server/src/

RUN npm run build

# ─── Stage 2: Production ─────────────────────────────────────
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy compiled server from builder
COPY --from=builder /app/server/dist/ ./server/dist/

# Copy data files (JSON wordpacks, locations, etc.)
COPY server/src/data/ ./server/dist/data/

# Copy static client files
COPY client/ ./client/

ENV NODE_ENV=production

# Render.com sets PORT automatically; fallback to 10000 (Render's default)
ENV PORT=10000
EXPOSE 10000

# Health check for Render
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://localhost:' + (process.env.PORT || 10000) + '/api/games', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(3000, () => process.exit(1));"

CMD ["node", "server/dist/index.js"]
