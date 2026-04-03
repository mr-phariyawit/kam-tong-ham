import express from "express";
import cors from "cors";
import path from "path";
import http from "http";
import { Server } from "colyseus";
import * as matchMaker from "@colyseus/core/build/MatchMaker";
import type { RoomListingData } from "@colyseus/core/build/matchmaker/driver";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { KhamTongHamRoom } from "./rooms/KhamTongHamRoom";
import { generateRoomCode } from "./utils/roomCode";
import { getAvailableCategories, loadWordPack } from "./utils/wordPicker";
import { activeRoomCodes } from "./utils/roomRegistry";

const PORT = parseInt(process.env.PORT || "2567", 10);
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (for PWA / Construct 3 export)
app.use(express.static(path.join(__dirname, "..", "..", "client")));

// Create HTTP server
const httpServer = http.createServer(app);

// Create Colyseus game server
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Define the room
gameServer.define("kham_tong_ham", KhamTongHamRoom).enableRealtimeListing();

// ─── REST API ENDPOINTS ───────────────────────────────────────

/**
 * POST /api/rooms/create
 * Create a new room and return the room code.
 */
app.post("/api/rooms/create", async (_req, res) => {
  try {
    const roomCode = generateRoomCode(activeRoomCodes);
    activeRoomCodes.add(roomCode);

    // The room will be created when the first player joins via Colyseus client
    // We just reserve the code here
    res.json({
      success: true,
      roomCode,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ไม่สามารถสร้างห้องได้",
    });
  }
});

/**
 * GET /api/rooms/:roomCode
 * Check if a room exists and is joinable.
 */
app.get("/api/rooms/:roomCode", async (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();

  try {
    const rooms = await matchMaker.query({ name: "kham_tong_ham" });
    const room = rooms.find(
      (r: RoomListingData) => r.metadata?.roomCode === roomCode && !r.locked
    );

    if (room) {
      res.json({
        success: true,
        roomCode,
        playerCount: room.clients,
        maxPlayers: 8,
        joinable: room.clients < 8,
      });
    } else {
      res.status(404).json({
        success: false,
        error: "ไม่พบห้อง",
        code: "ROOM_NOT_FOUND",
      });
    }
  } catch {
    res.status(500).json({
      success: false,
      error: "เกิดข้อผิดพลาด",
    });
  }
});

/**
 * GET /api/categories
 * Return list of available word categories.
 */
app.get("/api/categories", (_req, res) => {
  try {
    const categoryIds = getAvailableCategories();
    const categories = categoryIds.map((id) => {
      const pack = loadWordPack(id);
      return {
        id: pack.id,
        category: pack.category,
        icon: pack.icon,
        difficulty: pack.difficulty,
        wordCount: pack.words.length,
      };
    });

    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ไม่สามารถโหลดหมวดคำได้",
    });
  }
});

/**
 * Health check endpoint
 */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    rooms: activeRoomCodes.size,
  });
});

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
