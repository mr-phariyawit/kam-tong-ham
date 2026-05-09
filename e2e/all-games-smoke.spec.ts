/**
 * All-games smoke test — covers the two bug classes from PR #28 + PR #33:
 *
 *   PR #28 — colyseus.js@0.15.28 Buffer ReferenceError on UMD load.
 *     Caught by: asserting window.Colyseus.Client is a function AFTER the
 *     create-room flow (the SDK is loaded lazily for most games).
 *
 *   PR #33 — Draw & Guess shipped with roomCode="" (lobby showed "----" forever)
 *     AND updateGameUI undefined.
 *     Caught by: asserting the room-code element renders a 4-letter A-Z code
 *     (not "----", not empty) after create-room completes.
 *
 * One test per game (6 total). Each test:
 *   a) Loads the game page.
 *   b) Drives the create-room flow (click create, fill nick, pick avatar, confirm).
 *   c) Waits for #screen-lobby.active.
 *   d) Asserts window.Colyseus.Client is a function.
 *   e) Asserts window.ColyseusGuard is defined.
 *   f) Asserts the room-code element shows a 4-letter A-Z code (not "----") —
 *      EXCEPT knights, which uses the Colyseus room ID (not a 4-letter code);
 *      for knights we assert the lobby rendered (player list populated).
 *   g) Asserts player count is 1 (host alone in lobby).
 *   h) Asserts no fatal console errors (favicon 404 allowed).
 *
 * Game-specific DOM notes:
 *   forbidden-word  static <script src> Colyseus, modal flow (#btnCreateRoom),
 *                   room code in #roomCodeDisplay, player count in #playerCountLabel
 *   werewolf        lazy Colyseus, screen-nickname (#btnCreate/#btnConnect),
 *                   room code in .lobby-room-code strong, count in .lobby-player-count
 *   spy             lazy Colyseus, screen-nickname (#btnCreate/#btnConnect),
 *                   room code in .room-code-value (SharedLobby), count in .player-count
 *   knights         lazy Colyseus, screen-nickname (#btnCreate/#btnConnect),
 *                   no 4-letter code (uses Colyseus room ID for join), count in .lobby-count
 *   word-link       lazy Colyseus, screen-nickname (#btnCreate/#btnConnect),
 *                   room code in .room-code-value (SharedLobby), count in .player-count
 *   draw-guess      lazy Colyseus, screen-nickname (#btnCreate/#btnGo "เข้าสู่เกม"),
 *                   room code in #roomCodeDisplay, count via #playerList .player-row
 *
 * Run against the LOCAL dev server. DO NOT hardcode the prod URL here —
 * that is the concern of tools/prod-smoke.sh.
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { getBaseURL } from "./fixtures/multi-page";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LOCAL_SDK_PATH = path.resolve(__dirname, "fixtures/colyseus-browser.js");
const localSdkBody = fs.readFileSync(LOCAL_SDK_PATH, "utf-8");

/**
 * Create an isolated browser context with:
 * - CDN intercept: unpkg.com/colyseus.js requests are served from the local
 *   pre-bundled browser-compatible SDK (guards PR #28 CDN drift bugs).
 * - Onboarding localStorage pre-set so tutorial overlays don't block the flow.
 */
async function makeSmokeContext(
  browser: import("@playwright/test").Browser
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();

  await context.route("**/unpkg.com/colyseus.js**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: localSdkBody,
    });
  });

  await context.addInitScript(() => {
    for (const gt of [
      "forbidden-word",
      "word-link",
      "spy",
      "werewolf",
      "knights",
      "draw-guess",
    ]) {
      try {
        localStorage.setItem(`onboarding_seen_${gt}`, "true");
      } catch {
        // May not be available in init script
      }
    }
  });

  const page = await context.newPage();
  return { context, page };
}

/** Collect fatal console errors, ignoring favicon 404s. */
function collectConsoleErrors(page: Page): { get: () => string[] } {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (text.includes("favicon") || text.includes("favicon.ico")) return;
      errors.push(text);
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  return { get: () => errors };
}

// ---------------------------------------------------------------------------
// Per-game helpers
// ---------------------------------------------------------------------------

/** Poll a page.evaluate until it returns a truthy value or the timeout expires. */
async function pollEval<T>(
  page: Page,
  evaluator: () => Promise<T | null>,
  timeoutMs = 5000,
  intervalMs = 200
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await evaluator();
    if (val) return val;
    await page.waitForTimeout(intervalMs);
  }
  return null;
}

/** Screen-nickname create flow shared by spy, werewolf, knights, word-link. */
async function triggerScreenNicknameCreate(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.getElementById("btnCreate") as HTMLButtonElement | null)?.click();
  });
  await page.waitForSelector("#screen-nickname.active", { timeout: 5000 });
  await page.evaluate(() => {
    const input = document.getElementById("nicknameInput") as HTMLInputElement | null;
    if (input) {
      input.value = "PWBot";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    (document.querySelector(".avatar-option") as HTMLButtonElement | null)?.click();
  });
  await page.evaluate(() => {
    (document.getElementById("btnConnect") as HTMLButtonElement | null)?.click();
  });
}

// ---------------------------------------------------------------------------
// Game definitions
// ---------------------------------------------------------------------------

interface GameDef {
  name: string;
  path: string;
  triggerCreate: (page: Page) => Promise<void>;
  /**
   * Read the room code from the lobby screen. Returns the code string or null
   * if not yet rendered. For games without a 4-letter code system, returns a
   * special sentinel — the test skips the /^[A-Z]{4}$/ assertion in that case.
   */
  getRoomCode: (page: Page) => Promise<string | null>;
  /**
   * Whether to assert the room code matches /^[A-Z]{4}$/. Set false for games
   * that use a different room ID system (e.g. knights uses the Colyseus room ID).
   */
  assertRoomCodePattern: boolean;
  getPlayerCount: (page: Page) => Promise<number>;
}

const GAMES: GameDef[] = [
  // ── forbidden-word ────────────────────────────────────────────────────────
  // Static <script src> Colyseus (available at networkidle).
  // Modal: #btnCreateRoom → #nicknameModal → .emoji-option → #btnConfirmNickname.
  // Room code in #roomCodeDisplay. Player count in #playerCountLabel "ผู้เล่น N/8".
  {
    name: "forbidden-word",
    path: "/games/forbidden-word/index.html",
    assertRoomCodePattern: true,
    triggerCreate: async (page) => {
      await page.evaluate(() => {
        (document.getElementById("btnCreateRoom") as HTMLButtonElement | null)?.click();
      });
      await page.waitForSelector("#nicknameModal:not(.hidden)", { timeout: 5000 });
      await page.evaluate(() => {
        const input = document.getElementById("nicknameInput") as HTMLInputElement | null;
        if (input) {
          input.value = "PWBot";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        (document.querySelector(".emoji-option") as HTMLButtonElement | null)?.click();
      });
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        (document.getElementById("btnConfirmNickname") as HTMLButtonElement | null)?.click();
      });
    },
    getRoomCode: async (page) => {
      return pollEval(page, async () => {
        return page.evaluate(() => {
          const el = document.getElementById("roomCodeDisplay");
          const text = (el?.textContent || "").trim();
          return /^[A-Z]{4}$/.test(text) ? text : null;
        });
      });
    },
    getPlayerCount: async (page) => {
      return page.evaluate(() => {
        const el = document.getElementById("playerCountLabel");
        const m = (el?.textContent || "").match(/(\d+)\//);
        return m ? parseInt(m[1], 10) : 0;
      });
    },
  },

  // ── werewolf ─────────────────────────────────────────────────────────────
  // Lazy Colyseus. Screen-nickname (#btnConnect). Custom lobby in #lobbyContainer.
  // Room code in .lobby-room-code > strong. Count in .lobby-player-count "ผู้เล่น: N/15".
  {
    name: "werewolf",
    path: "/games/werewolf/index.html",
    assertRoomCodePattern: true,
    triggerCreate: triggerScreenNicknameCreate,
    getRoomCode: async (page) => {
      return pollEval(page, async () => {
        return page.evaluate(() => {
          const el = document.querySelector(".lobby-room-code strong");
          const text = (el?.textContent || "").trim();
          return /^[A-Z]{4}$/.test(text) ? text : null;
        });
      });
    },
    getPlayerCount: async (page) => {
      return page.evaluate(() => {
        const el = document.querySelector(".lobby-player-count");
        const m = (el?.textContent || "").match(/(\d+)\//);
        return m ? parseInt(m[1], 10) : 0;
      });
    },
  },

  // ── spy ───────────────────────────────────────────────────────────────────
  // Lazy Colyseus. Screen-nickname (#btnConnect). SharedLobby component.
  // Room code in .room-code-value. Count in .player-count "👥 N/M คน".
  {
    name: "spy",
    path: "/games/spy/index.html",
    assertRoomCodePattern: true,
    triggerCreate: triggerScreenNicknameCreate,
    getRoomCode: async (page) => {
      return pollEval(page, async () => {
        return page.evaluate(() => {
          const el = document.querySelector(".room-code-value");
          const text = (el?.textContent || "").trim();
          return /^[A-Z]{4}$/.test(text) ? text : null;
        });
      });
    },
    getPlayerCount: async (page) => {
      return page.evaluate(() => {
        const el = document.querySelector(".player-count");
        const m = (el?.textContent || "").match(/(\d+)\//);
        return m ? parseInt(m[1], 10) : 0;
      });
    },
  },

  // ── knights ───────────────────────────────────────────────────────────────
  // Lazy Colyseus. Screen-nickname (#btnConnect). Custom lobby in #lobbyContainer.
  //
  // Knights uses client.create() WITHOUT pre-reserving a 4-letter code via
  // /api/rooms/create. The server sets state.roomCode = "" (no code assigned).
  // The lobby displays the player list but no visible room code. Players join
  // by Colyseus room ID, not a custom code. assertRoomCodePattern = false.
  //
  // Regression coverage: full create→lobby roundtrip is verified (Colyseus OK,
  // lobby rendered, player count = 1). If knights ever migrates to the 4-letter
  // code system, add assertRoomCodePattern = true and a .lobby-code selector.
  {
    name: "knights",
    path: "/games/knights/index.html",
    assertRoomCodePattern: false,
    triggerCreate: triggerScreenNicknameCreate,
    getRoomCode: async (page) => {
      // Wait until the lobby container innerHTML is populated
      return pollEval(page, async () => {
        return page.evaluate(() => {
          const c = document.getElementById("lobbyContainer");
          return c && c.innerHTML.trim() ? "lobby-rendered" : null;
        });
      });
    },
    getPlayerCount: async (page) => {
      return page.evaluate(() => {
        // "N ผู้เล่น (ต้องมีอย่างน้อย 5 คน)" in .lobby-count
        const el = document.querySelector(".lobby-count");
        const m = (el?.textContent || "").match(/^(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      });
    },
  },

  // ── word-link ─────────────────────────────────────────────────────────────
  // Lazy Colyseus. Screen-nickname (#btnConnect). SharedLobby component.
  // Same selectors as spy.
  {
    name: "word-link",
    path: "/games/word-link/index.html",
    assertRoomCodePattern: true,
    triggerCreate: triggerScreenNicknameCreate,
    getRoomCode: async (page) => {
      return pollEval(page, async () => {
        return page.evaluate(() => {
          const el = document.querySelector(".room-code-value");
          const text = (el?.textContent || "").trim();
          return /^[A-Z]{4}$/.test(text) ? text : null;
        });
      });
    },
    getPlayerCount: async (page) => {
      return page.evaluate(() => {
        const el = document.querySelector(".player-count");
        const m = (el?.textContent || "").match(/(\d+)\//);
        return m ? parseInt(m[1], 10) : 0;
      });
    },
  },

  // ── draw-guess ────────────────────────────────────────────────────────────
  // Lazy Colyseus. Screen-nickname BUT confirm is #btnGo ("เข้าสู่เกม"), not
  // #btnConnect. Room code in #roomCodeDisplay. Count via #playerList .player-row.
  {
    name: "draw-guess",
    path: "/games/draw-guess/index.html",
    assertRoomCodePattern: true,
    triggerCreate: async (page) => {
      await page.evaluate(() => {
        (document.getElementById("btnCreate") as HTMLButtonElement | null)?.click();
      });
      await page.waitForSelector("#screen-nickname.active", { timeout: 5000 });
      await page.evaluate(() => {
        const input = document.getElementById("nicknameInput") as HTMLInputElement | null;
        if (input) {
          input.value = "PWBot";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        // draw-guess avatar picker uses #avatarPicker with .avatar-option buttons
        (document.querySelector("#avatarPicker .avatar-option") as HTMLButtonElement | null)?.click();
      });
      // "เข้าสู่เกม" — different label from other games (PR #33 discovery)
      await page.evaluate(() => {
        (document.getElementById("btnGo") as HTMLButtonElement | null)?.click();
      });
    },
    getRoomCode: async (page) => {
      return pollEval(page, async () => {
        return page.evaluate(() => {
          const el = document.getElementById("roomCodeDisplay");
          const text = (el?.textContent || "").trim();
          return /^[A-Z]{4}$/.test(text) ? text : null;
        });
      });
    },
    getPlayerCount: async (page) => {
      return page.evaluate(() => {
        return document.querySelectorAll("#playerList .player-row").length;
      });
    },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("All-games room-code smoke", () => {
  for (const game of GAMES) {
    test(`${game.name}: page loads + Colyseus OK + create-room shows valid code`, async ({
      browser,
    }) => {
      test.setTimeout(30_000);

      const { context, page } = await makeSmokeContext(browser);
      const consoleErrors = collectConsoleErrors(page);

      try {
        const baseURL = getBaseURL();

        // ── (a) Load the game page ──────────────────────────────────────────
        await page.goto(`${baseURL}${game.path}`);
        await page.waitForLoadState("networkidle", { timeout: 10_000 });

        // ── (b) Drive the create-room flow ─────────────────────────────────
        // For lazy-loading games, this is where Colyseus is fetched and loaded.
        await game.triggerCreate(page);

        // ── (c) Wait for the lobby screen ─────────────────────────────────
        await page.waitForSelector("#screen-lobby.active", { timeout: 15_000 });

        // ── (d) window.Colyseus.Client is a function ───────────────────────
        // By the time the lobby is active, the dynamic Colyseus <script> has
        // finished loading (it's a prerequisite for the room join).
        // PR #28 regression: a Buffer ReferenceError in the UMD bundle leaves
        // window.Colyseus undefined.
        const colyseusOK = await page.evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          const colyseus = w["Colyseus"] as Record<string, unknown> | undefined;
          return (
            colyseus !== undefined &&
            colyseus !== null &&
            typeof colyseus["Client"] === "function"
          );
        });
        expect(
          colyseusOK,
          `${game.name}: window.Colyseus.Client must be a function (PR #28 regression guard)`
        ).toBe(true);

        // ── (e) window.ColyseusGuard is defined ────────────────────────────
        const guardOK = await page.evaluate(() => {
          const g = (window as unknown as Record<string, unknown>)["ColyseusGuard"];
          return g !== undefined && g !== null && typeof g === "object";
        });
        expect(
          guardOK,
          `${game.name}: window.ColyseusGuard must be defined (colyseusGuard.js must load)`
        ).toBe(true);

        // ── (f) Room code ─────────────────────────────────────────────────
        // PR #33 regression: Draw & Guess shipped with state.roomCode="" so
        // the display element stayed "----" forever.
        // knights does not use the 4-letter code system, so the pattern
        // assertion is skipped for it (assertRoomCodePattern = false).
        const roomCode = await game.getRoomCode(page);

        if (game.assertRoomCodePattern) {
          expect(
            roomCode,
            `${game.name}: room-code must be a 4-letter A-Z code, not "----" or empty ` +
              `(PR #33 regression guard)`
          ).toMatch(/^[A-Z]{4}$/);
        } else {
          // For knights: assert the lobby container was rendered (create flow completed)
          expect(
            roomCode,
            `${game.name}: lobby container must be rendered after create-room`
          ).not.toBeNull();
        }

        // ── (g) Player count is 1 (host alone in lobby) ───────────────────
        let playerCount = 0;
        const countDeadline = Date.now() + 5_000;
        while (Date.now() < countDeadline) {
          playerCount = await game.getPlayerCount(page);
          if (playerCount > 0) break;
          await page.waitForTimeout(200);
        }
        expect(
          playerCount,
          `${game.name}: player count in lobby must be 1 (host alone)`
        ).toBe(1);

        // ── (h) No fatal console errors ────────────────────────────────────
        const errors = consoleErrors.get();
        expect(
          errors,
          `${game.name}: no fatal console errors (favicon 404 excluded). ` +
            `Errors: ${errors.join(" | ")}`
        ).toHaveLength(0);
      } finally {
        await context.close();
      }
    });
  }
});
