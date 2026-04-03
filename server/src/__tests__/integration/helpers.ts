/**
 * Test helpers for Colyseus 0.15.x in-process integration tests.
 * Uses matchMaker with LocalDriver/LocalPresence to run rooms without a real WebSocket server.
 */
import { matchMaker, LocalDriver, LocalPresence } from "@colyseus/core";
import { EventEmitter } from "events";
import { KhamTongHamRoom } from "../../rooms/KhamTongHamRoom";

export type MockClient = {
  sessionId: string;
  id: string;
  readyState: number;
  state: number;
  ref: EventEmitter;
  _reconnectionToken: string;
  _afterNextPatchQueue: any[];
  sends: Array<{ type: string; msg: any }>;
  send: (type: string, msg?: any) => void;
  raw: () => void;
  enqueueRaw: (data: any) => void;
  sendBytes: () => void;
  leave: () => void;
  close: () => void;
  error: () => void;
  auth: any;
  userData: any;
  pingCount: number;
};

export function makeMockClient(sessionId: string): MockClient {
  const ee = new EventEmitter();
  const client: MockClient = {
    sessionId,
    id: sessionId,
    readyState: 1, // ws.OPEN
    state: 0,      // ClientState.JOINING
    ref: ee,
    _reconnectionToken: "",
    _afterNextPatchQueue: [],
    sends: [],
    send(type: string, msg?: any) { this.sends.push({ type, msg }); },
    raw() {},
    // Capture broadcasts (enqueueRaw is called by room.broadcast())
    // Decodes the msgpackr-encoded broadcast and pushes to sends
    enqueueRaw(data: any) {
      try {
        const { unpackMultiple } = require("msgpackr");
        const bytes = Buffer.from(data);
        // First byte is Protocol.ROOM_DATA, skip it
        const decoded: any[] = unpackMultiple(bytes.slice(1));
        if (decoded.length >= 1) {
          const [msgType, msgPayload] = decoded;
          client.sends.push({ type: msgType, msg: msgPayload });
        }
      } catch {
        // Ignore decode errors (e.g., state patches)
      }
    },
    sendBytes() {},
    leave() { ee.emit("close"); },
    close() { ee.emit("close"); },
    error() {},
    auth: undefined,
    userData: undefined,
    pingCount: 0,
  };
  return client;
}

let setupDone = false;

export async function setupMatchMaker() {
  if (!setupDone) {
    await matchMaker.setup(new LocalPresence(), new LocalDriver());
    matchMaker.defineRoomType("kham_tong_ham", KhamTongHamRoom);
    setupDone = true;
  }
}

export async function createRoom(roomCode = "TEST") {
  const listing = await matchMaker.createRoom("kham_tong_ham", { roomCode });
  return matchMaker.getRoomById(listing.roomId) as any;
}

export async function joinRoom(
  room: any,
  client: MockClient,
  options: { nickname: string; avatar: string }
) {
  await (room as any)["_reserveSeat"](client.sessionId, options, undefined);
  await (room as any)["_onJoin"](client);
}

export function sendMessage(room: any, client: MockClient, type: string, data?: any) {
  const handler = (room as any).onMessageHandlers[type];
  if (!handler) throw new Error(`No handler for message type: ${type}`);
  handler(client, data);
}

/**
 * Advance the room's ClockTimer by tickMs milliseconds.
 * Since broadcastPatch() resets clock.currentTime to Date.now() in the background,
 * we directly tick the delayed items instead.
 */
export function advanceClock(room: any, totalMs: number, stepMs = 1000) {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(remaining, stepMs);
    // Tick all active delayed items with the step
    const delayedList = room.clock.delayed as any[];
    for (let i = delayedList.length - 1; i >= 0; i--) {
      const d = delayedList[i];
      if (d.active) {
        d.tick(step);
      } else {
        delayedList.splice(i, 1);
      }
    }
    remaining -= step;
  }
}

/** Skip countdown and start playing directly */
export function startPlaying(room: any) {
  (room as any)["startPlaying"]();
}

/** Trigger end of round (as if timer expired) */
export function endRound(room: any, reason: "timer" | "last_survivor" = "timer") {
  (room as any)["endRound"](reason);
}

/** Trigger vote resolution (as if timer expired) */
export function resolveVote(room: any) {
  (room as any)["resolveVote"]();
}

export async function teardownMatchMaker() {
  await matchMaker.gracefullyShutdown();
  setupDone = false;
}
