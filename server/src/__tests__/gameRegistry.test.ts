/**
 * Game Registry unit tests -- KTH-T-007
 *
 * Validates:
 * - Registration and retrieval of games
 * - Duplicate prevention
 * - Public API shape (roomClass omitted)
 * - registerDefaultGames wiring
 */
import { describe, it, expect, beforeEach } from "vitest";
import { gameRegistry, registerDefaultGames, type GameDefinition } from "../utils/gameRegistry";

// Fake Room class for testing
class FakeRoom {}

beforeEach(() => {
  gameRegistry.clear();
});

describe("GameRegistry", () => {
  it("REG-01: register and retrieve a game by id", () => {
    gameRegistry.register({
      id: "test-game",
      displayName: "Test Game",
      displayNameTh: "เกมทดสอบ",
      minPlayers: 2,
      maxPlayers: 8,
      roomClass: FakeRoom as any,
      comingSoon: false,
      mechanic: "testing",
      description: "A test game",
      icon: "🧪",
    });

    const game = gameRegistry.get("test-game");
    expect(game).toBeDefined();
    expect(game!.id).toBe("test-game");
    expect(game!.displayNameTh).toBe("เกมทดสอบ");
    expect(game!.roomClass).toBe(FakeRoom);
  });

  it("REG-02: throws on duplicate registration", () => {
    const def: GameDefinition = {
      id: "dup-game",
      displayName: "Dup",
      displayNameTh: "ซ้ำ",
      minPlayers: 2,
      maxPlayers: 4,
      roomClass: null,
      comingSoon: true,
      mechanic: "test",
      description: "dup",
      icon: "🔁",
    };

    gameRegistry.register(def);
    expect(() => gameRegistry.register(def)).toThrow('Game "dup-game" is already registered');
  });

  it("REG-03: getAll returns public GameInfo without roomClass", () => {
    gameRegistry.register({
      id: "pub-game",
      displayName: "Public Game",
      displayNameTh: "เกมสาธารณะ",
      minPlayers: 3,
      maxPlayers: 6,
      roomClass: FakeRoom as any,
      comingSoon: false,
      mechanic: "public",
      description: "desc",
      icon: "📢",
    });

    const all = gameRegistry.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).not.toHaveProperty("roomClass");
    expect(all[0].id).toBe("pub-game");
    expect(all[0].displayName).toBe("Public Game");
  });

  it("REG-04: getPlayable filters out comingSoon games", () => {
    gameRegistry.register({
      id: "active",
      displayName: "Active",
      displayNameTh: "เปิดแล้ว",
      minPlayers: 2,
      maxPlayers: 8,
      roomClass: FakeRoom as any,
      comingSoon: false,
      mechanic: "active",
      description: "active",
      icon: "✅",
    });
    gameRegistry.register({
      id: "soon",
      displayName: "Soon",
      displayNameTh: "เร็วๆ นี้",
      minPlayers: 5,
      maxPlayers: 10,
      roomClass: null,
      comingSoon: true,
      mechanic: "soon",
      description: "soon",
      icon: "⏳",
    });

    const playable = gameRegistry.getPlayable();
    expect(playable).toHaveLength(1);
    expect(playable[0].id).toBe("active");
  });

  it("REG-05: has() returns true for registered and false for unknown", () => {
    gameRegistry.register({
      id: "exists",
      displayName: "Exists",
      displayNameTh: "มี",
      minPlayers: 2,
      maxPlayers: 4,
      roomClass: null,
      comingSoon: false,
      mechanic: "test",
      description: "test",
      icon: "✓",
    });

    expect(gameRegistry.has("exists")).toBe(true);
    expect(gameRegistry.has("nope")).toBe(false);
  });

  it("REG-06: size reflects the number of registered games", () => {
    expect(gameRegistry.size).toBe(0);

    gameRegistry.register({
      id: "one",
      displayName: "One",
      displayNameTh: "หนึ่ง",
      minPlayers: 2,
      maxPlayers: 4,
      roomClass: null,
      comingSoon: false,
      mechanic: "test",
      description: "test",
      icon: "1️⃣",
    });

    expect(gameRegistry.size).toBe(1);
  });

  it("REG-07: clear removes all registrations", () => {
    gameRegistry.register({
      id: "temp",
      displayName: "Temp",
      displayNameTh: "ชั่วคราว",
      minPlayers: 2,
      maxPlayers: 4,
      roomClass: null,
      comingSoon: false,
      mechanic: "test",
      description: "test",
      icon: "🗑️",
    });

    expect(gameRegistry.size).toBe(1);
    gameRegistry.clear();
    expect(gameRegistry.size).toBe(0);
  });
});

describe("registerDefaultGames", () => {
  it("REG-08: registers all 6 games with correct ids", () => {
    registerDefaultGames({ "forbidden-word": FakeRoom as any });

    expect(gameRegistry.size).toBe(6);
    expect(gameRegistry.has("forbidden-word")).toBe(true);
    expect(gameRegistry.has("werewolf")).toBe(true);
    expect(gameRegistry.has("spy")).toBe(true);
    expect(gameRegistry.has("knights")).toBe(true);
    expect(gameRegistry.has("word-link")).toBe(true);
    expect(gameRegistry.has("draw-guess")).toBe(true);
  });

  it("REG-09: forbidden-word and word-link are the active (non-comingSoon) games", () => {
    registerDefaultGames({ "forbidden-word": FakeRoom as any, "word-link": FakeRoom as any });

    const playable = gameRegistry.getPlayable();
    expect(playable).toHaveLength(2);
    const ids = playable.map((g) => g.id);
    expect(ids).toContain("forbidden-word");
    expect(ids).toContain("word-link");
  });

  it("REG-10: forbidden-word gets the provided roomClass", () => {
    registerDefaultGames({ "forbidden-word": FakeRoom as any });

    const fw = gameRegistry.get("forbidden-word");
    expect(fw!.roomClass).toBe(FakeRoom);
  });

  it("REG-11: coming-soon games have roomClass=null", () => {
    registerDefaultGames({ "forbidden-word": FakeRoom as any });

    const ww = gameRegistry.get("werewolf");
    expect(ww!.roomClass).toBeNull();
    expect(ww!.comingSoon).toBe(true);
  });

  it("REG-12: all games have Thai display names", () => {
    registerDefaultGames({ "forbidden-word": FakeRoom as any });

    const all = gameRegistry.getAll();
    for (const game of all) {
      expect(game.displayNameTh.length).toBeGreaterThan(0);
      // Thai characters should be present
      expect(/[฀-๿]/.test(game.displayNameTh)).toBe(true);
    }
  });

  it("REG-13: all games have valid player count ranges", () => {
    registerDefaultGames({ "forbidden-word": FakeRoom as any });

    const all = gameRegistry.getAll();
    for (const game of all) {
      expect(game.minPlayers).toBeGreaterThanOrEqual(2);
      expect(game.maxPlayers).toBeGreaterThan(game.minPlayers);
      expect(game.maxPlayers).toBeLessThanOrEqual(15);
    }
  });
});
