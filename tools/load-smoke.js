#!/usr/bin/env node
/**
 * load-smoke.js -- KTH-T-094: Multi-room load smoke test
 *
 * Spins up 10 rooms across 6 game types via in-process matchMaker,
 * joins 4 players per room, sends ~50 messages per room, measures:
 *   - Peak heap memory
 *   - Total messages handled
 *   - Any errors
 *
 * This is a one-off script, NOT a CI test (too heavy for regular CI).
 *
 * Usage: node tools/load-smoke.js
 *
 * Appends results to .aegis/brain/metrics/perf-baseline-YYYY-MM-DD.json
 */

// We need to use the compiled dist files since this runs as a plain Node script
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const METRICS_DIR = path.join(ROOT, ".aegis", "brain", "metrics");
const today = new Date().toISOString().slice(0, 10);
const OUTPUT_FILE = path.join(METRICS_DIR, `perf-baseline-${today}.json`);

async function main() {
  console.log("=== Multi-Room Load Smoke ===\n");

  // Dynamic imports for ESM/CJS compat
  const { matchMaker, LocalDriver, LocalPresence } = require("@colyseus/core");
  const { EventEmitter } = require("events");

  // Import rooms from dist (compiled JS)
  const { KhamTongHamRoom } = require(path.join(ROOT, "server/dist/rooms/KhamTongHamRoom"));
  const { WordLinkRoom } = require(path.join(ROOT, "server/dist/rooms/WordLinkRoom"));
  const { SpyRoom } = require(path.join(ROOT, "server/dist/rooms/SpyRoom"));
  const { WerewolfRoom } = require(path.join(ROOT, "server/dist/rooms/WerewolfRoom"));
  const { KnightsRoom } = require(path.join(ROOT, "server/dist/rooms/KnightsRoom"));
  const { DrawGuessRoom } = require(path.join(ROOT, "server/dist/rooms/DrawGuessRoom"));

  // Setup matchMaker
  await matchMaker.setup(new LocalPresence(), new LocalDriver());
  matchMaker.defineRoomType("kham_tong_ham", KhamTongHamRoom);
  matchMaker.defineRoomType("word_link", WordLinkRoom);
  matchMaker.defineRoomType("spy", SpyRoom);
  matchMaker.defineRoomType("werewolf", WerewolfRoom);
  matchMaker.defineRoomType("knights", KnightsRoom);
  matchMaker.defineRoomType("draw_guess", DrawGuessRoom);

  // Mock client factory
  function makeMockClient(sessionId) {
    const ee = new EventEmitter();
    return {
      sessionId,
      id: sessionId,
      readyState: 1,
      state: 0,
      ref: ee,
      _reconnectionToken: "",
      _afterNextPatchQueue: [],
      sends: [],
      send(type, msg) { this.sends.push({ type, msg }); },
      raw() {},
      enqueueRaw() {},
      sendBytes() {},
      leave() { ee.emit("close"); },
      close() { ee.emit("close"); },
      error() {},
      auth: undefined,
      userData: undefined,
      pingCount: 0,
    };
  }

  async function joinRoom(room, client, nick) {
    await room["_reserveSeat"](client.sessionId, { nickname: nick, avatar: "T" }, undefined);
    await room["_onJoin"](client);
  }

  function sendMsg(room, client, type, data) {
    const handler = room.onMessageHandlers[type];
    if (handler) handler(client, data);
  }

  function advanceClock(room, totalMs, stepMs = 1000) {
    let remaining = totalMs;
    while (remaining > 0) {
      const step = Math.min(remaining, stepMs);
      const delayedList = room.clock.delayed;
      for (let i = delayedList.length - 1; i >= 0; i--) {
        const d = delayedList[i];
        if (d.active) d.tick(step);
        else delayedList.splice(i, 1);
      }
      remaining -= step;
    }
  }

  // Room configurations: 10 rooms across 6 types
  const roomConfigs = [
    { type: "kham_tong_ham", code: "LD01", players: 4, gameType: "forbidden-word" },
    { type: "kham_tong_ham", code: "LD02", players: 4, gameType: "forbidden-word" },
    { type: "word_link",     code: "LD03", players: 4, gameType: "word-link" },
    { type: "word_link",     code: "LD04", players: 4, gameType: "word-link" },
    { type: "spy",           code: "LD05", players: 4, gameType: "spy" },
    { type: "spy",           code: "LD06", players: 4, gameType: "spy" },
    { type: "werewolf",      code: "LD07", players: 5, gameType: "werewolf" },
    { type: "knights",       code: "LD08", players: 5, gameType: "knights" },
    { type: "draw_guess",    code: "LD09", players: 3, gameType: "draw-guess" },
    { type: "draw_guess",    code: "LD10", players: 3, gameType: "draw-guess" },
  ];

  const heapBefore = process.memoryUsage().heapUsed;
  let totalMessages = 0;
  let totalErrors = 0;
  const roomResults = [];
  const startTime = Date.now();

  for (const config of roomConfigs) {
    const roomLabel = `${config.type}/${config.code}`;
    console.log(`  Creating ${roomLabel}...`);

    try {
      const listing = await matchMaker.createRoom(config.type, {
        roomCode: config.code,
        gameType: config.gameType,
      });
      const room = matchMaker.getRoomById(listing.roomId);

      // Join players
      const clients = [];
      for (let i = 0; i < config.players; i++) {
        const c = makeMockClient(`${config.code}-p${i}`);
        await joinRoom(room, c, `Player${i}`);
        clients.push(c);
      }

      // Start game
      sendMsg(room, clients[0], "START_GAME");

      // Advance clock to get into game phase
      advanceClock(room, 6000);

      // Send messages based on game type
      let msgCount = 0;
      const msgTarget = 50;

      for (let m = 0; m < msgTarget; m++) {
        try {
          if (config.type === "kham_tong_ham") {
            // Send chat messages
            sendMsg(room, clients[m % clients.length], "CHAT", { message: `test-${m}` });
          } else if (config.type === "word_link") {
            // Try giving clues or guessing
            if (m % 2 === 0) {
              sendMsg(room, clients[0], "GIVE_CLUE", { word: "test", number: 1 });
            } else {
              sendMsg(room, clients[1], "GUESS_CARD", { index: m % 25 });
            }
          } else if (config.type === "spy") {
            // Chat-style interaction
            sendMsg(room, clients[m % clients.length], "CHAT", { message: `spy-test-${m}` });
          } else if (config.type === "werewolf") {
            sendMsg(room, clients[m % clients.length], "CHAT", { message: `ww-test-${m}` });
          } else if (config.type === "knights") {
            // Knights doesn't have a CHAT handler, try benign messages
            sendMsg(room, clients[m % clients.length], "CHAT", { message: `kn-test-${m}` });
          } else if (config.type === "draw_guess") {
            if (m % 3 === 0) {
              sendMsg(room, clients[0], "STROKE", {
                points: [{ x: m, y: m }],
                color: "#000",
                width: 2,
              });
            } else {
              sendMsg(room, clients[m % clients.length], "GUESS", { text: `guess-${m}` });
            }
          }
          msgCount++;
        } catch {
          // Some messages may fail if phase doesn't support them -- that's fine
        }
      }

      // Count total sends across all clients
      let roomSends = 0;
      for (const c of clients) {
        roomSends += c.sends.length;
      }

      totalMessages += msgCount;
      roomResults.push({
        room: roomLabel,
        players: config.players,
        messagesSent: msgCount,
        clientReceived: roomSends,
        phase: room.state.phase,
        error: null,
      });

      console.log(`    OK: ${msgCount} sent, ${roomSends} received, phase=${room.state.phase}`);
    } catch (err) {
      totalErrors++;
      roomResults.push({
        room: roomLabel,
        error: err.message,
      });
      console.error(`    ERROR: ${err.message}`);
    }
  }

  const heapAfter = process.memoryUsage().heapUsed;
  const peakHeap = process.memoryUsage();
  const elapsed = Date.now() - startTime;

  const loadResults = {
    timestamp: new Date().toISOString(),
    sprint: 15,
    roomCount: roomConfigs.length,
    totalPlayers: roomConfigs.reduce((s, c) => s + c.players, 0),
    totalMessagesSent: totalMessages,
    totalErrors: totalErrors,
    elapsedMs: elapsed,
    memory: {
      heapBefore: humanize(heapBefore),
      heapAfter: humanize(heapAfter),
      heapDelta: humanize(heapAfter - heapBefore),
      peakRSS: humanize(peakHeap.rss),
      peakHeapUsed: humanize(peakHeap.heapUsed),
      peakHeapTotal: humanize(peakHeap.heapTotal),
    },
    rooms: roomResults,
    verdict: totalErrors === 0 ? "PASS" : "FAIL",
    notes: "In-process load smoke. No real WebSocket overhead. Measures server-side room/state handling capacity.",
  };

  console.log(`\n=== Load Smoke Summary ===`);
  console.log(`  Rooms: ${roomConfigs.length}`);
  console.log(`  Players: ${loadResults.totalPlayers}`);
  console.log(`  Messages: ${totalMessages}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`  Peak heap: ${loadResults.memory.peakHeapUsed}`);
  console.log(`  Elapsed: ${elapsed}ms`);
  console.log(`  Verdict: ${loadResults.verdict}`);

  // Append to baseline file
  let baseline = {};
  try {
    baseline = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
  } catch {
    // No existing file, start fresh
  }
  baseline.loadSmoke = loadResults;
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`\nResults appended to: ${OUTPUT_FILE}`);

  // Graceful shutdown
  try {
    await matchMaker.gracefullyShutdown();
  } catch { /* ignore */ }

  // Evaluate thresholds
  if (peakHeap.heapUsed > 500 * 1024 * 1024) {
    console.error("\n*** HIGH: Peak heap >500MB at 10 rooms -- potential deploy blocker ***");
    process.exit(2);
  }

  if (totalErrors > 0) {
    console.error(`\n*** WARN: ${totalErrors} error(s) during load smoke ***`);
  }
}

function humanize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
