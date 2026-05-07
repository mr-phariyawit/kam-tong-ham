import express from "express";
import cors from "cors";
import path from "path";
import * as matchMaker from "@colyseus/core/build/MatchMaker";
import type { RoomListingData } from "@colyseus/core/build/matchmaker/driver";
import { generateRoomCode } from "./utils/roomCode";
import { getAvailableCategories, loadWordPack, saveWordPack, deleteWordPack, isCustomPack, getCustomDir } from "./utils/wordPicker";
import type { WordPack } from "./utils/wordPicker";
import { activeRoomCodes } from "./utils/roomRegistry";
import { gameRegistry } from "./utils/gameRegistry";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Serve static files (for PWA / Construct 3 export)
  // In Docker: /app/server/dist → ../../client = /app/client ✓
  // In dev:    /kam-tong-ham/server/dist → ../../client = /kam-tong-ham/client ✓
  app.use(express.static(path.join(__dirname, "..", "..", "client")));

  // ─── GAME REGISTRY API ─────────────────────────────────────────

  /**
   * GET /api/games
   * Return the list of all registered games with public metadata.
   * roomClass is omitted from the response (server-only).
   */
  app.get("/api/games", (_req, res) => {
    try {
      const games = gameRegistry.getAll();
      res.json({ success: true, games });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "ไม่สามารถโหลดรายการเกมได้",
      });
    }
  });

  // ─── ROOM API ──────────────────────────────────────────────────

  /**
   * POST /api/rooms/create
   * Create a new room and return the room code.
   * Accepts optional `gameType` in request body. Defaults to "forbidden-word".
   *
   * Room codes are globally unique across all game types (Loki F6a):
   * the shared activeRoomCodes set prevents collisions between different games.
   */
  app.post("/api/rooms/create", async (req, res) => {
    try {
      const gameType = req.body?.gameType || "forbidden-word";

      // Validate gameType exists in registry
      if (!gameRegistry.has(gameType)) {
        res.status(400).json({
          success: false,
          error: `ไม่พบเกม "${gameType}"`,
          code: "INVALID_GAME_TYPE",
        });
        return;
      }

      // Check if game is playable (not coming soon)
      const gameDef = gameRegistry.get(gameType);
      if (gameDef?.comingSoon) {
        res.status(400).json({
          success: false,
          error: `เกม "${gameDef.displayNameTh}" ยังไม่พร้อมให้เล่น`,
          code: "GAME_COMING_SOON",
        });
        return;
      }

      // Generate globally unique room code (shared across all game types)
      const roomCode = generateRoomCode(activeRoomCodes);
      activeRoomCodes.add(roomCode);

      res.json({
        success: true,
        roomCode,
        gameType,
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
      // Query all room types to find the room by code (codes are globally unique)
      const roomTypes = ["kham_tong_ham", "word_link", "spy", "werewolf", "knights"];
      let foundRoom: RoomListingData | undefined;

      for (const roomType of roomTypes) {
        const rooms = await matchMaker.query({ name: roomType });
        const match = rooms.find(
          (r: RoomListingData) => r.metadata?.roomCode === roomCode && !r.locked
        );
        if (match) {
          foundRoom = match;
          break;
        }
      }

      if (foundRoom) {
        res.json({
          success: true,
          roomCode,
          gameType: foundRoom.metadata?.gameType || "forbidden-word",
          playerCount: foundRoom.clients,
          maxPlayers: foundRoom.maxClients || 8,
          joinable: foundRoom.clients < (foundRoom.maxClients || 8),
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

  // ─── WORDPACK CRUD API ─────────────────────────────────────

  /**
   * GET /api/wordpacks/:id
   * Get full word pack with all words.
   */
  app.get("/api/wordpacks/:id", (req, res) => {
    try {
      const pack = loadWordPack(req.params.id);
      res.json({
        success: true,
        pack,
        isCustom: isCustomPack(req.params.id),
      });
    } catch {
      res.status(404).json({ success: false, error: "ไม่พบหมวดคำนี้" });
    }
  });

  /**
   * POST /api/wordpacks
   * Create a new word pack or overwrite an existing custom one.
   *
   * Body: { id, category, icon, difficulty, words: string[] }
   *
   * Example:
   *   curl -X POST /api/wordpacks \
   *     -H "Content-Type: application/json" \
   *     -d '{"id":"movies","category":"หนัง","icon":"🎬","difficulty":"easy","words":["มาร์เวล","ผีไทย","รอมคอม"]}'
   */
  app.post("/api/wordpacks", (req, res) => {
    try {
      const { id, category, icon, difficulty, words } = req.body;

      if (!id || !category || !words || !Array.isArray(words)) {
        res.status(400).json({
          success: false,
          error: "ต้องระบุ id, category, words (array)",
          example: {
            id: "movies",
            category: "หนัง/ซีรีส์",
            icon: "🎬",
            difficulty: "easy",
            words: ["มาร์เวล", "ผีไทย", "รอมคอม", "แอ็คชั่น"]
          }
        });
        return;
      }

      // Validate id: only allow alphanumeric + hyphen
      if (!/^[a-z0-9-]+$/.test(id)) {
        res.status(400).json({
          success: false,
          error: "id ต้องเป็นตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข และ - เท่านั้น",
        });
        return;
      }

      // Filter empty strings and duplicates
      const cleanWords = [...new Set(words.map((w: string) => w.trim()).filter(Boolean))];
      if (cleanWords.length < 2) {
        res.status(400).json({
          success: false,
          error: "ต้องมีอย่างน้อย 2 คำ (ไม่ซ้ำกัน)",
        });
        return;
      }

      const pack: WordPack = {
        id,
        category: category.trim(),
        icon: icon || "📝",
        difficulty: difficulty || "easy",
        words: cleanWords,
      };

      saveWordPack(pack);

      res.json({
        success: true,
        message: `สร้างหมวด "${pack.category}" สำเร็จ (${cleanWords.length} คำ)`,
        pack: {
          id: pack.id,
          category: pack.category,
          icon: pack.icon,
          difficulty: pack.difficulty,
          wordCount: cleanWords.length,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "ไม่สามารถบันทึกหมวดคำได้",
      });
    }
  });

  /**
   * PUT /api/wordpacks/:id/words
   * Add words to an existing pack (merge, no duplicates).
   *
   * Body: { words: string[] }
   */
  app.put("/api/wordpacks/:id/words", (req, res) => {
    try {
      const pack = loadWordPack(req.params.id);
      const newWords: string[] = req.body.words;

      if (!newWords || !Array.isArray(newWords)) {
        res.status(400).json({ success: false, error: "ต้องระบุ words (array)" });
        return;
      }

      const existing = new Set(pack.words);
      const added: string[] = [];
      for (const w of newWords) {
        const clean = w.trim();
        if (clean && !existing.has(clean)) {
          pack.words.push(clean);
          existing.add(clean);
          added.push(clean);
        }
      }

      saveWordPack(pack);

      res.json({
        success: true,
        message: `เพิ่ม ${added.length} คำใหม่ (รวม ${pack.words.length} คำ)`,
        added,
        totalWords: pack.words.length,
      });
    } catch {
      res.status(404).json({ success: false, error: "ไม่พบหมวดคำนี้" });
    }
  });

  /**
   * DELETE /api/wordpacks/:id
   * Delete a custom word pack. Cannot delete built-in packs.
   */
  app.delete("/api/wordpacks/:id", (req, res) => {
    const deleted = deleteWordPack(req.params.id);
    if (deleted) {
      res.json({ success: true, message: `ลบหมวด "${req.params.id}" แล้ว` });
    } else {
      res.status(400).json({
        success: false,
        error: "ไม่สามารถลบหมวดนี้ (อาจเป็นหมวดเริ่มต้นของระบบ)",
      });
    }
  });

  // ─── SYSTEM ─────────────────────────────────────────────────

  /**
   * Health check endpoint
   */
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: Date.now(),
      rooms: activeRoomCodes.size,
      customWordpackDir: getCustomDir(),
    });
  });

  return app;
}
