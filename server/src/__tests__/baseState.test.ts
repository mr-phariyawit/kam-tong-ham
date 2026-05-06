import { describe, it, expect } from "vitest";
import { BaseState, BasePlayer, PLAYER_COLORS } from "../schemas/BaseState";
import { MapSchema } from "@colyseus/schema";

describe("BaseState", () => {
  it("initializes with default values", () => {
    const state = new BaseState();
    expect(state.roomCode).toBe("");
    expect(state.phase).toBe("LOBBY");
    expect(state.gameType).toBe("");
    expect(state.playerCount).toBe(0);
    expect(state.createdAt).toBeGreaterThan(0);
    expect(state.players).toBeInstanceOf(MapSchema);
    expect(state.players.size).toBe(0);
  });

  it("can set room code and phase", () => {
    const state = new BaseState();
    state.roomCode = "ABCD";
    state.phase = "PLAYING";
    state.gameType = "werewolf";
    expect(state.roomCode).toBe("ABCD");
    expect(state.phase).toBe("PLAYING");
    expect(state.gameType).toBe("werewolf");
  });

  it("can add players to the map", () => {
    const state = new BaseState();
    const player = new BasePlayer();
    player.id = "session-1";
    player.nickname = "TestPlayer";
    player.avatar = "🐱";
    state.players.set("session-1", player);
    state.playerCount = state.players.size;

    expect(state.players.size).toBe(1);
    expect(state.playerCount).toBe(1);
    expect(state.players.get("session-1")?.nickname).toBe("TestPlayer");
  });
});

describe("BasePlayer", () => {
  it("initializes with default values", () => {
    const player = new BasePlayer();
    expect(player.id).toBe("");
    expect(player.nickname).toBe("");
    expect(player.avatar).toBe("");
    expect(player.isHost).toBe(false);
    expect(player.isAlive).toBe(true);
    expect(player.isConnected).toBe(true);
    expect(player.score).toBe(0);
    expect(player.color).toBe("");
  });

  it("can set all fields", () => {
    const player = new BasePlayer();
    player.id = "p1";
    player.nickname = "Nick";
    player.avatar = "😎";
    player.isHost = true;
    player.isAlive = false;
    player.isConnected = false;
    player.score = 42;
    player.color = "#FF0000";

    expect(player.id).toBe("p1");
    expect(player.nickname).toBe("Nick");
    expect(player.avatar).toBe("😎");
    expect(player.isHost).toBe(true);
    expect(player.isAlive).toBe(false);
    expect(player.isConnected).toBe(false);
    expect(player.score).toBe(42);
    expect(player.color).toBe("#FF0000");
  });
});

describe("PLAYER_COLORS", () => {
  it("has 8 colors", () => {
    expect(PLAYER_COLORS).toHaveLength(8);
  });

  it("all colors are valid hex", () => {
    PLAYER_COLORS.forEach((color) => {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it("matches the same palette as GameState.PLAYER_COLORS", () => {
    // Verify the BaseState colors are exactly the same as the original
    const expected = [
      "#1E90FF", "#9C59D1", "#FF6B35", "#1ABC9C",
      "#FF6B9D", "#FFC312", "#E84393", "#574BC8",
    ];
    expect(PLAYER_COLORS).toEqual(expected);
  });
});
