/**
 * Unit tests for BaseRoom and BaseState.
 *
 * Tests BaseRoom's shared lifecycle by directly calling the Room methods
 * (onJoin, message handlers) without going through Colyseus matchMaker
 * for multi-player scenarios. Uses _onJoin for single-player tests.
 *
 * NOTE: "host" is a reserved name in BaseRoom. Test nicknames must avoid
 * reserved names: admin, host, system, ผู้ดูแล.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type } from "@colyseus/schema";
import { matchMaker, LocalDriver, LocalPresence } from "@colyseus/core";
import { BaseRoom, GameRoomConfig } from "../rooms/BaseRoom";
import { BaseState, BasePlayer } from "../schemas/BaseState";
import { EventEmitter } from "events";

// ─── Mock client ──────────────────────────────────────────────

let clientCounter = 0;

function makeClient(prefix = "br"): any {
  const id = `${prefix}_${++clientCounter}`;
  const ee = new EventEmitter();
  return {
    sessionId: id,
    id,
    readyState: 1,
    state: 0,
    ref: ee,
    _reconnectionToken: "",
    _afterNextPatchQueue: [],
    sends: [] as Array<{ type: string; msg: any }>,
    send(t: string, msg?: any) { this.sends.push({ type: t, msg }); },
    raw() {},
    enqueueRaw(data: any) {
      try {
        const { unpackMultiple } = require("msgpackr");
        const bytes = Buffer.from(data);
        const decoded: any[] = unpackMultiple(bytes.slice(1));
        if (decoded.length >= 1) {
          const [msgType, msgPayload] = decoded;
          this.sends.push({ type: msgType, msg: msgPayload });
        }
      } catch { /* ignore */ }
    },
    sendBytes() {},
    leave() { ee.emit("close"); },
    close() { ee.emit("close"); },
    error() {},
    auth: undefined,
    userData: undefined,
    pingCount: 0,
  };
}

// ─── Concrete test subclass ───────────────────────────────────

class TestState extends BaseState {
  @type("number") testCounter: number = 0;
}

class TestRoom extends BaseRoom<TestState> {
  public gameStartCalled = false;
  public lastStartClient: any = null;

  protected createState(): TestState {
    return new TestState();
  }

  protected createPlayer(): BasePlayer {
    return new BasePlayer();
  }

  protected getGameConfig(): GameRoomConfig {
    return { minPlayers: 2, maxPlayers: 6 };
  }

  protected onGameStart(client: any): void {
    this.gameStartCalled = true;
    this.lastStartClient = client;
    this.state.phase = "PLAYING";
  }

  protected registerMessageHandlers(): void {
    this.onMessage("TEST_MSG", (_client, data) => {
      this.state.testCounter = data?.value ?? 0;
    });
  }

  protected onGameDispose(): void {
    // no-op for tests
  }
}

// ─── Test setup ───────────────────────────────────────────────

let setupDone = false;

async function setup() {
  if (!setupDone) {
    await matchMaker.setup(new LocalPresence(), new LocalDriver());
    matchMaker.defineRoomType("base_test_room", TestRoom);
    setupDone = true;
  }
}

let roomCounter = 0;

async function createTestRoom() {
  const code = `BR${++roomCounter}`;
  const listing = await matchMaker.createRoom("base_test_room", { roomCode: code });
  const room = matchMaker.getRoomById(listing.roomId) as unknown as TestRoom;
  return room;
}

function directJoin(room: TestRoom, client: any, opts: { nickname: string; avatar: string }) {
  (room as any).onJoin(client, opts);
}

function sendMessage(room: any, client: any, msgType: string, data?: any) {
  const handler = room.onMessageHandlers[msgType];
  if (!handler) throw new Error(`No handler for message type: ${msgType}`);
  handler(client, data);
}

// ─── Tests ────────────────────────────────────────────────────

describe("BaseRoom", () => {
  beforeAll(setup);

  afterAll(async () => {
    try { await matchMaker.gracefullyShutdown(); } catch { /* ignore cleanup errors */ }
    setupDone = false;
  });

  describe("onCreate", () => {
    it("initializes state with roomCode and LOBBY phase", async () => {
      const room = await createTestRoom();
      expect(room.state.roomCode).toBeTruthy();
      expect(room.state.phase).toBe("LOBBY");
      expect(room.state.playerCount).toBe(0);
      expect(room.state.players.size).toBe(0);
    });
  });

  describe("onJoin (single player)", () => {
    it("adds player with correct fields and host=true", async () => {
      const room = await createTestRoom();
      const c = makeClient();
      directJoin(room, c, { nickname: "Alice", avatar: "X" });

      expect(room.state.players.size).toBe(1);
      expect(room.state.playerCount).toBe(1);

      const p = room.state.players.get(c.sessionId)!;
      expect(p.id).toBe(c.sessionId);
      expect(p.nickname).toBe("Alice");
      expect(p.avatar).toBe("X");
      expect(p.isHost).toBe(true);
      expect(p.isAlive).toBe(true);
      expect(p.isConnected).toBe(true);
      expect(p.score).toBe(0);
      expect(p.color).toBeTruthy();
    });

    it("issues ROOM_TOKEN to client", async () => {
      const room = await createTestRoom();
      const c = makeClient();
      directJoin(room, c, { nickname: "Alice", avatar: "A" });

      const tokenMsg = c.sends.find((s: any) => s.type === "ROOM_TOKEN");
      expect(tokenMsg).toBeDefined();
      expect(tokenMsg!.msg.token).toBeTruthy();
    });

    it("truncates nickname to 15 chars", async () => {
      const room = await createTestRoom();
      const c = makeClient();
      directJoin(room, c, { nickname: "ThisIsAVeryLongNickname", avatar: "A" });

      const p = room.state.players.get(c.sessionId);
      expect(p?.nickname.length).toBeLessThanOrEqual(15);
    });
  });

  describe("nickname rejection", () => {
    it("rejects reserved name 'admin'", async () => {
      const room = await createTestRoom();
      const c = makeClient();
      directJoin(room, c, { nickname: "admin", avatar: "A" });

      const err = c.sends.find((s: any) => s.type === "ERROR" && s.msg.code === "NICKNAME_REJECTED");
      expect(err).toBeDefined();
      expect(err!.msg.reason).toBe("RESERVED");
      expect(room.state.players.size).toBe(0); // player not added
    });

    it("rejects reserved name 'system'", async () => {
      const room = await createTestRoom();
      const c = makeClient();
      directJoin(room, c, { nickname: "system", avatar: "A" });

      const err = c.sends.find((s: any) => s.type === "ERROR" && s.msg.code === "NICKNAME_REJECTED");
      expect(err).toBeDefined();
      expect(err!.msg.reason).toBe("RESERVED");
    });

    it("rejects reserved name 'host' (case insensitive)", async () => {
      const room = await createTestRoom();
      const c = makeClient();
      directJoin(room, c, { nickname: "Host", avatar: "A" });

      const err = c.sends.find((s: any) => s.type === "ERROR" && s.msg.code === "NICKNAME_REJECTED");
      expect(err).toBeDefined();
      expect(err!.msg.reason).toBe("RESERVED");
    });
  });

  describe("multi-player", () => {
    it("first player is host, second is not", async () => {
      const room = await createTestRoom();
      const c1 = makeClient();
      const c2 = makeClient();
      directJoin(room, c1, { nickname: "Alpha", avatar: "A" });
      directJoin(room, c2, { nickname: "Beta", avatar: "B" });

      expect(room.state.players.size).toBe(2);
      expect(room.state.players.get(c1.sessionId)!.isHost).toBe(true);
      expect(room.state.players.get(c2.sessionId)!.isHost).toBe(false);
    });

    it("host can start game with 2+ players", async () => {
      const room = await createTestRoom();
      const c1 = makeClient();
      const c2 = makeClient();
      directJoin(room, c1, { nickname: "Alpha", avatar: "A" });
      directJoin(room, c2, { nickname: "Beta", avatar: "B" });

      sendMessage(room, c1, "START_GAME");

      expect(room.gameStartCalled).toBe(true);
      expect(room.state.phase).toBe("PLAYING");
    });

    it("non-host cannot start game", async () => {
      const room = await createTestRoom();
      const c1 = makeClient();
      const c2 = makeClient();
      directJoin(room, c1, { nickname: "Alpha", avatar: "A" });
      directJoin(room, c2, { nickname: "Beta", avatar: "B" });

      sendMessage(room, c2, "START_GAME");

      const err = c2.sends.find((s: any) => s.type === "ERROR" && s.msg.code === "NOT_HOST");
      expect(err).toBeDefined();
      expect(room.gameStartCalled).toBe(false);
    });

    it("requires minimum players to start", async () => {
      const room = await createTestRoom();
      const c1 = makeClient();
      directJoin(room, c1, { nickname: "Solo", avatar: "A" });

      sendMessage(room, c1, "START_GAME");

      const err = c1.sends.find((s: any) => s.type === "ERROR" && s.msg.code === "NOT_ENOUGH_PLAYERS");
      expect(err).toBeDefined();
      expect(room.gameStartCalled).toBe(false);
    });

    it("host can kick a player in LOBBY", async () => {
      const room = await createTestRoom();
      const c1 = makeClient();
      const c2 = makeClient();
      (room as any).clients = [c1, c2];
      directJoin(room, c1, { nickname: "Alpha", avatar: "A" });
      directJoin(room, c2, { nickname: "Gamma", avatar: "B" });

      expect(room.state.players.size).toBe(2);

      sendMessage(room, c1, "KICK_PLAYER", { targetPlayerId: c2.sessionId });

      expect(room.state.players.size).toBe(1);
      expect(room.state.players.has(c2.sessionId)).toBe(false);

      const kickMsg = c2.sends.find((s: any) => s.type === "KICKED");
      expect(kickMsg).toBeDefined();
    });

    it("cannot kick self", async () => {
      const room = await createTestRoom();
      const c1 = makeClient();
      (room as any).clients = [c1];
      directJoin(room, c1, { nickname: "Alpha", avatar: "A" });

      sendMessage(room, c1, "KICK_PLAYER", { targetPlayerId: c1.sessionId });

      const err = c1.sends.find((s: any) => s.type === "ERROR" && s.msg.code === "SELF_KICK");
      expect(err).toBeDefined();
    });

    it("non-host cannot kick", async () => {
      const room = await createTestRoom();
      const c1 = makeClient();
      const c2 = makeClient();
      (room as any).clients = [c1, c2];
      directJoin(room, c1, { nickname: "Alpha", avatar: "A" });
      directJoin(room, c2, { nickname: "Beta", avatar: "B" });

      sendMessage(room, c2, "KICK_PLAYER", { targetPlayerId: c1.sessionId });

      const err = c2.sends.find((s: any) => s.type === "ERROR" && s.msg.code === "NOT_HOST");
      expect(err).toBeDefined();
      expect(room.state.players.size).toBe(2);
    });

    it("host can transfer to another player", async () => {
      const room = await createTestRoom();
      const c1 = makeClient();
      const c2 = makeClient();
      directJoin(room, c1, { nickname: "Alpha", avatar: "A" });
      directJoin(room, c2, { nickname: "Beta", avatar: "B" });

      sendMessage(room, c1, "TRANSFER_HOST", { targetPlayerId: c2.sessionId });

      expect(room.state.players.get(c1.sessionId)!.isHost).toBe(false);
      expect(room.state.players.get(c2.sessionId)!.isHost).toBe(true);
    });
  });

  describe("custom message handlers", () => {
    it("subclass message handlers are registered", async () => {
      const room = await createTestRoom();
      const c1 = makeClient();
      directJoin(room, c1, { nickname: "Tester", avatar: "A" });

      sendMessage(room, c1, "TEST_MSG", { value: 42 });
      expect(room.state.testCounter).toBe(42);
    });
  });

  describe("player creation", () => {
    it("creates BasePlayer instance with shared fields", async () => {
      const room = await createTestRoom();
      const c = makeClient();
      directJoin(room, c, { nickname: "Tester", avatar: "A" });

      const p = room.state.players.get(c.sessionId)!;
      expect(p).toBeInstanceOf(BasePlayer);
      expect(p.id).toBe(c.sessionId);
      expect(p.nickname).toBe("Tester");
      expect(p.isHost).toBe(true);
    });
  });
});
