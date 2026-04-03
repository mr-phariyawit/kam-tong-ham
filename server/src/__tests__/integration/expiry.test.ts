/**
 * Scenario 4.5: Room Expiry After 2 Hours
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupMatchMaker, teardownMatchMaker, createRoom, joinRoom,
  makeMockClient, advanceClock,
} from "./helpers";

beforeAll(setupMatchMaker);
afterAll(teardownMatchMaker);

describe("Scenario 4.5: Room Expiry (2-hour inactivity timeout)", () => {
  it("ROOM_EXPIRED broadcast sent to all clients after 2 hours of inactivity", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc45a");
    const p2 = makeMockClient("p2_sc45a");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    // Advance inactivity timeout (7,200,000ms = 2 hours + 1 second)
    advanceClock(room, 7_201_000);

    const p1Expired = p1.sends.find((s) => s.type === "ROOM_EXPIRED");
    const p2Expired = p2.sends.find((s) => s.type === "ROOM_EXPIRED");
    expect(p1Expired).toBeDefined();
    expect(p2Expired).toBeDefined();
  });

  it("inactivity timer resets on new player join; does not expire early", async () => {
    const room = await createRoom();
    const p1 = makeMockClient("p1_sc45b");
    const p2 = makeMockClient("p2_sc45b");
    await joinRoom(room, p1, { nickname: "Alice", avatar: "😀" });
    await joinRoom(room, p2, { nickname: "Bob", avatar: "😎" });

    // Advance 1.5 hours (not yet expired)
    advanceClock(room, 1.5 * 60 * 60 * 1000);

    // A new player joins → resets inactivity timer
    const p3 = makeMockClient("p3_sc45b");
    await joinRoom(room, p3, { nickname: "Dave", avatar: "🚀" });

    // Advance another 1.5 hours from the reset point (total 3h, but timer was reset at 1.5h)
    advanceClock(room, 1.5 * 60 * 60 * 1000);

    // Should NOT have expired yet (only 1.5h since last reset)
    const p1Expired = p1.sends.find((s) => s.type === "ROOM_EXPIRED");
    expect(p1Expired).toBeUndefined();

    // Now advance the final 30 minutes to complete 2h from last reset
    advanceClock(room, 0.6 * 60 * 60 * 1000);
    const p1ExpiredNow = p1.sends.find((s) => s.type === "ROOM_EXPIRED");
    expect(p1ExpiredNow).toBeDefined();
  });
});
