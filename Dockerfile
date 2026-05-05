FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY server/dist/ ./server/dist/
COPY server/src/data/ ./server/dist/data/
COPY client/ ./client/

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server/dist/index.js"]
