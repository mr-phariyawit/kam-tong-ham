import http from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { KhamTongHamRoom } from "./rooms/KhamTongHamRoom";
import { createApp } from "./app";

const PORT = parseInt(process.env.PORT || "2567", 10);
const app = createApp();

// Create HTTP server
const httpServer = http.createServer(app);

// Create Colyseus game server
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Define the room
gameServer.define("kham_tong_ham", KhamTongHamRoom)
  .filterBy(["roomCode"])
  .enableRealtimeListing();

// ─── START SERVER ─────────────────────────────────────────────

gameServer.listen(PORT).then(() => {
  console.log(`🎭 คำต้องห้าม server listening on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   HTTP API:  http://localhost:${PORT}/api`);
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
