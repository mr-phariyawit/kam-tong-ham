/**
 * AEG-34: Per-room rejoin token system.
 * AEG-35: Server-side nickname filter.
 * AEG-36: HOST_TRANSFERRED event on host disconnect.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupMatchMaker, teardownMatchMaker, createRoom, joinRoom,
  sendMessage, makeMockClient, startPlaying, MockClient,
} from "./helpers";

beforeAll(setupMatchMaker);
afterAll(teardownMatchMaker);

function simulateLeave(room: any, client: MockClient, consented = false) {
  (room as any)["_onLeave"](client, consented);
}

/**
 * Colyseus throws "early_leave" when client.leave() is called inside onJoin.
 * Tests that expect rejection must swallow this error and inspect client.sends.
 */
async function tryJoinExpectingRejection(room: any, client: MockClient, options: any) {
  try {
    await joinRoom(room, client, options);
  } catch (e: any) {
    // "early_leave" is expected when the server rejects the join
    if (e?.message !== "early_leave") throw e;
  }
}

// ─── AEG-35: Nickname filter ─────────────────────────────────────────────────

describe("AEG-35: Nickname Filter", () => {
  it("NF-01: clean nickname is accepted", async () => {
    const room = await createRoom("NF01");
    const p1 = makeMockClient("p1_nf01");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    // no ERROR, player is in room
    const errMsg = p1.sends.find((s) => s.type === "ERROR");
    expect(errMsg).toBeUndefined();
    expect(room.state.players.has("p1_nf01")).toBe(true);
  });

  it("NF-02: offensive Thai nickname triggers BLOCKED_NICKNAME error", async () => {
    const room = await createRoom("NF02");
    const p1 = makeMockClient("p1_nf02");
    await tryJoinExpectingRejection(room, p1, { nickname: "ไอ้สัตว์", avatar: "😀" });
    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("BLOCKED_NICKNAME");
  });

  it("NF-03: offensive English nickname triggers BLOCKED_NICKNAME error", async () => {
    const room = await createRoom("NF03");
    const p1 = makeMockClient("p1_nf03");
    await tryJoinExpectingRejection(room, p1, { nickname: "fuckme", avatar: "😀" });
    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("BLOCKED_NICKNAME");
  });

  it("NF-04: case-insensitive — FUCK also blocked", async () => {
    const room = await createRoom("NF04");
    const p1 = makeMockClient("p1_nf04");
    await tryJoinExpectingRejection(room, p1, { nickname: "FUCK", avatar: "😀" });
    const err = p1.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("BLOCKED_NICKNAME");
  });
});

// ─── AEG-34: Rejoin token system ─────────────────────────────────────────────

describe("AEG-34: Rejoin Token System", () => {
  it("RT-01: server sends ROOM_TOKEN to player on join", async () => {
    const room = await createRoom("RT01");
    const p1 = makeMockClient("p1_rt01");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    const tokenMsg = p1.sends.find((s) => s.type === "ROOM_TOKEN");
    expect(tokenMsg).toBeDefined();
    expect(typeof tokenMsg?.msg?.token).toBe("string");
    expect(tokenMsg?.msg?.token.length).toBeGreaterThan(10);
  });

  it("RT-02: each player gets a unique token", async () => {
    const room = await createRoom("RT02");
    const p1 = makeMockClient("p1_rt02");
    const p2 = makeMockClient("p2_rt02");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    const t1 = p1.sends.find((s) => s.type === "ROOM_TOKEN")?.msg?.token;
    const t2 = p2.sends.find((s) => s.type === "ROOM_TOKEN")?.msg?.token;
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    expect(t1).not.toBe(t2);
  });

  it("RT-03: kicked player token is revoked — rejoin with revoked token is rejected", async () => {
    const room = await createRoom("RT03");
    const p1 = makeMockClient("p1_rt03");
    const p2 = makeMockClient("p2_rt03");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    // Get P2's token before kick
    const p2Token = p2.sends.find((s) => s.type === "ROOM_TOKEN")?.msg?.token;
    expect(p2Token).toBeDefined();

    // P1 (host) kicks P2
    sendMessage(room, p1, "KICK_PLAYER", { targetPlayerId: "p2_rt03" });

    // P2 tries to rejoin with their revoked token (Colyseus throws early_leave on rejection)
    const p2b = makeMockClient("p2b_rt03");
    await tryJoinExpectingRejection(room, p2b, { nickname: "Bob", avatar: "😎", roomToken: p2Token });
    const err = p2b.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("KICKED");
  });

  it("RT-04: kicked player nickname is blocked even without a token (fresh join attempt)", async () => {
    const room = await createRoom("RT04");
    const p1 = makeMockClient("p1_rt04");
    const p2 = makeMockClient("p2_rt04");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    sendMessage(room, p1, "KICK_PLAYER", { targetPlayerId: "p2_rt04" });

    // P2 tries to rejoin without token (simulates cleared sessionStorage)
    const p2c = makeMockClient("p2c_rt04");
    await tryJoinExpectingRejection(room, p2c, { nickname: "Bob", avatar: "😎" });
    const err = p2c.sends.find((s) => s.type === "ERROR");
    expect(err?.msg?.code).toBe("KICKED");
  });

  it("RT-05: valid token allows reconnection", async () => {
    const room = await createRoom("RT05");
    const p1 = makeMockClient("p1_rt05");
    const p2 = makeMockClient("p2_rt05");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    const p2Token = p2.sends.find((s) => s.type === "ROOM_TOKEN")?.msg?.token;

    // P2 leaves voluntarily
    simulateLeave(room, p2, true);

    // P2 rejoins with valid token — should succeed (no KICKED error)
    const p2b = makeMockClient("p2b_rt05");
    await joinRoom(room, p2b, { nickname: "Bob", avatar: "😎", roomToken: p2Token });
    const err = p2b.sends.find((s) => s.type === "ERROR" && s.msg?.code === "KICKED");
    expect(err).toBeUndefined();
    expect(room.state.players.has("p2b_rt05")).toBe(true);
  });
});

// ─── AEG-36: HOST_TRANSFERRED event ─────────────────────────────────────────

describe("AEG-36: HOST_TRANSFERRED broadcast", () => {
  it("HT-01: host disconnect during PLAYING emits HOST_TRANSFERRED to remaining players", async () => {
    const room = await createRoom("HT01");
    const p1 = makeMockClient("p1_ht01");
    const p2 = makeMockClient("p2_ht01");
    const p3 = makeMockClient("p3_ht01");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    p2.sends = [];
    p3.sends = [];
    simulateLeave(room, p1, false); // host disconnects

    // P2 or P3 should receive HOST_TRANSFERRED
    const p2Transfer = p2.sends.find((s) => s.type === "HOST_TRANSFERRED");
    const p3Transfer = p3.sends.find((s) => s.type === "HOST_TRANSFERRED");
    expect(p2Transfer || p3Transfer).toBeTruthy();

    const transfer = (p2Transfer || p3Transfer)!;
    expect(transfer.msg.newHostId).toBeDefined();
    expect(transfer.msg.newHostNickname).toBeDefined();
  });

  it("HT-02: new host isHost=true after HOST_TRANSFERRED", async () => {
    const room = await createRoom("HT02");
    const p1 = makeMockClient("p1_ht02");
    const p2 = makeMockClient("p2_ht02");
    const p3 = makeMockClient("p3_ht02");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });
    sendMessage(room, p1, "START_GAME");
    startPlaying(room);

    simulateLeave(room, p1, false);

    const p2Host = room.state.players.get("p2_ht02").isHost;
    const p3Host = room.state.players.get("p3_ht02")?.isHost ?? false;
    expect(p2Host || p3Host).toBe(true);
  });

  it("HT-03: LOBBY host leave also triggers HOST_TRANSFERRED", async () => {
    const room = await createRoom("HT03");
    const p1 = makeMockClient("p1_ht03");
    const p2 = makeMockClient("p2_ht03");
    const p3 = makeMockClient("p3_ht03");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });
    await joinRoom(room, p3, { nickname: "Carol", avatar: "🎉" });

    p2.sends = [];
    simulateLeave(room, p1, true);

    const transfer = p2.sends.find((s) => s.type === "HOST_TRANSFERRED");
    expect(transfer).toBeDefined();
  });
});
