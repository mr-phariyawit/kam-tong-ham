import http from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { KhamTongHamRoom } from "./rooms/KhamTongHamRoom";
import { WordLinkRoom } from "./rooms/WordLinkRoom";
import { SpyRoom } from "./rooms/SpyRoom";
import { createApp } from "./app";
import { registerDefaultGames } from "./utils/gameRegistry";

const PORT = parseInt(process.env.PORT || "2567", 10);

// ─── Register all games in the registry ───────────────────────────────────────
// Active games get their Room class; coming-soon games get null.
// The registry is the single source of truth for GET /api/games and room creation.
registerDefaultGames({
  "forbidden-word": KhamTongHamRoom,
  "word-link": WordLinkRoom,
  "spy": SpyRoom,
});

const app = createApp();

// Create HTTP server
const httpServer = http.createServer(app);

// Create Colyseus game server
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Define rooms
// Note: "kham_tong_ham" is the Colyseus room name for backward compatibility.
// The gameType field in room options determines which game logic runs.
gameServer.define("kham_tong_ham", KhamTongHamRoom)
  .filterBy(["roomCode"])
  .enableRealtimeListing();

gameServer.define("word_link", WordLinkRoom)
  .filterBy(["roomCode"])
  .enableRealtimeListing();

gameServer.define("spy", SpyRoom)
  .filterBy(["roomCode"])
  .enableRealtimeListing();

// ─── START SERVER ─────────────────────────────────────────────

gameServer.listen(PORT).then(() => {
  console.log(`🎭 Party Games TH server listening on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   HTTP API:  http://localhost:${PORT}/api`);
  console.log(`   Games:     GET http://localhost:${PORT}/api/games`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  gameServer.gracefullyShutdown().then(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\nShutting down gracefully...");
  gameServer.gracefullyShutdown().then(() => {
    process.exit(0);
  });
});
