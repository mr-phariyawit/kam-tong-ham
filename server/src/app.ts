import express from "express";
import cors from "cors";
import path from "path";
import * as matchMaker from "@colyseus/core/build/MatchMaker";
import type { RoomListingData } from "@colyseus/core/build/matchmaker/driver";
import { generateRoomCode } from "./utils/roomCode";
import { getAvailableCategories, loadWordPack } from "./utils/wordPicker";
import { activeRoomCodes } from "./utils/roomRegistry";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Serve static files (for PWA / Construct 3 export)
  app.use(express.static(path.join(__dirname, "..", "..", "client")));

  /**
   * POST /api/rooms/create
   * Create a new room and return the room code.
   */
  app.post("/api/rooms/create", async (_req, res) => {
    try {
      const roomCode = generateRoomCode(activeRoomCodes);
      activeRoomCodes.add(roomCode);

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

  return app;
}
