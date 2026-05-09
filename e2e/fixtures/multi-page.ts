/**
 * Multi-page fixture: spawn N browser pages, each representing a different player.
 *
 * Each page navigates to a game URL, enters a nickname, and joins a room.
 * Provides coordination helpers for timing-sensitive multi-player scenarios.
 */
import { type Browser, type Page, type BrowserContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/** Read the E2E port from the file written by globalSetup. */
export function getServerPort(): number {
  const portFile = path.resolve(__dirname, "../.e2e-port");
  if (fs.existsSync(portFile)) {
    return parseInt(fs.readFileSync(portFile, "utf-8").trim(), 10);
  }
  return parseInt(process.env.E2E_PORT || "2567", 10);
}

export function getBaseURL(): string {
  return `http://localhost:${getServerPort()}`;
}

export interface PlayerPage {
  page: Page;
  context: BrowserContext;
  nickname: string;
  index: number;
}

/**
 * Path to the locally bundled browser-compatible Colyseus SDK.
 *
 * The client HTML loads `colyseus.js@0.15` from unpkg CDN, but that version's
 * UMD bundle requires Node.js polyfills (Buffer, process, stream, etc.) that
 * don't exist in a clean Chromium browser. We pre-bundle colyseus.js 0.15
 * with esbuild (platform=browser) which resolves all Node.js imports at build
 * time, producing a self-contained browser bundle.
 *
 * Build command: npx esbuild e2e/fixtures/_bundle-entry.mjs --bundle --format=iife --platform=browser --target=chrome100 --outfile=e2e/fixtures/colyseus-browser.js
 *
 * The bundle is committed to the repo so CI doesn't need to rebuild it.
 */
const LOCAL_SDK_PATH = path.resolve(__dirname, "colyseus-browser.js");

/**
 * Create N browser pages, each in its own context (isolated cookies/storage).
 * Intercepts the Colyseus CDN request to serve the local browser-compatible SDK.
 * Does NOT navigate or join any game — caller handles that.
 */
export async function createPlayerPages(
  browser: Browser,
  count: number,
  namePrefix = "Player"
): Promise<PlayerPage[]> {
  const players: PlayerPage[] = [];

  // Read the local SDK once
  const localSdkBody = fs.readFileSync(LOCAL_SDK_PATH, "utf-8");

  for (let i = 0; i < count; i++) {
    const context = await browser.newContext();

    // Intercept unpkg CDN requests for colyseus.js and serve local SDK
    await context.route("**/unpkg.com/colyseus.js**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: localSdkBody,
      });
    });

    // Dismiss onboarding overlays by pre-setting localStorage
    // The onboarding component checks `onboarding_seen_<gameType>` in localStorage
    await context.addInitScript(() => {
      const gameTypes = [
        "forbidden-word",
        "word-link",
        "spy",
        "werewolf",
        "knights",
        "draw-guess",
      ];
      for (const gt of gameTypes) {
        try {
          localStorage.setItem(`onboarding_seen_${gt}`, "true");
        } catch {
          // localStorage may not be available yet
        }
      }
    });

    const page = await context.newPage();
    players.push({
      page,
      context,
      nickname: `${namePrefix}${i + 1}`,
      index: i,
    });
  }

  return players;
}

/**
 * Close all player pages and their contexts.
 */
export async function closeAllPlayers(players: PlayerPage[]): Promise<void> {
  for (const player of players) {
    try {
      await player.context.close();
    } catch {
      // Context may already be closed
    }
  }
}

/**
 * Options for createRoom / joinRoom to handle per-game UX differences.
 *
 * UX patterns:
 *  - screen-nickname (default): #btnCreate → #screen-nickname → fill nick +
 *    pick avatar → click confirm → #screen-lobby.
 *    confirmText defaults to 'เข้าร่วม' (button #btnConnect).
 *    draw-guess uses confirmText: 'เข้าสู่เกม' (button #btnGo).
 *
 *  - modal-based (forbidden-word): #btnCreateRoom → #nicknameModal opens →
 *    fill nick + pick emoji → #btnConfirmNickname → #screen-lobby.
 *    Join flow: #btnJoinRoom → #nicknameModal → confirm → #joinModal →
 *    fill code → #btnConfirmJoin → #screen-lobby.
 *    Set modalBased: true for this game.
 */
export interface RoomOpts {
  /**
   * Text on the confirm button (used to locate it).
   * Default: 'เข้าร่วม' (maps to #btnConnect on screen-nickname games).
   * Use 'เข้าสู่เกม' for draw-guess (#btnGo).
   * Ignored when modalBased: true (forbidden-word uses #btnConfirmNickname directly).
   */
  confirmText?: string;
  /**
   * When true, use the modal-based flow (forbidden-word).
   * Default: false (screen-nickname flow).
   */
  modalBased?: boolean;
}

const DEFAULT_OPTS: Required<RoomOpts> = {
  confirmText: "เข้าร่วม",
  modalBased: false,
};

/**
 * Navigate a page to a game, enter nickname, and create a room.
 * Returns the room code displayed in the lobby.
 *
 * Handles three UX patterns:
 * - screen-nickname (default): werewolf, spy, knights, word-link
 *   #btnCreate → #screen-nickname → fill nick + pick avatar → #btnConnect → lobby
 * - screen-nickname with custom confirm (draw-guess):
 *   same but confirm is #btnGo ("เข้าสู่เกม") — pass confirmText: 'เข้าสู่เกม'
 * - modal-based (forbidden-word): pass modalBased: true
 *   #btnCreateRoom → #nicknameModal → fill nick + pick .emoji-option →
 *   #btnConfirmNickname ("ยืนยัน") → lobby
 *
 * Lobby code selectors (auto-detected):
 * - SharedLobby: .room-code-value
 * - Werewolf: .lobby-room-code strong
 * - forbidden-word / draw-guess: #roomCodeDisplay
 * - knights: lobby-rendered sentinel (no 4-letter code)
 */
export async function createRoom(
  player: PlayerPage,
  gamePath: string,
  opts?: RoomOpts
): Promise<string> {
  const { confirmText, modalBased } = { ...DEFAULT_OPTS, ...opts };
  const baseURL = getBaseURL();
  await player.page.goto(`${baseURL}${gamePath}`);

  if (modalBased) {
    // ── forbidden-word modal flow ───────────────────────────────────────────
    await player.page.click("#btnCreateRoom");
    await player.page.waitForSelector(
      "#nicknameModal:not(.hidden), .modal-overlay:not(.hidden)",
      { timeout: 5_000 }
    );
    await player.page.fill("#nicknameInput", player.nickname);
    // Pick first available emoji/avatar option
    const emojiOption = player.page.locator(".emoji-option, .avatar-option").first();
    await emojiOption.click();
    await player.page.waitForTimeout(150);
    await player.page.click("#btnConfirmNickname");
  } else {
    // ── screen-nickname flow (spy, werewolf, knights, word-link, draw-guess) ─
    await player.page.click("#btnCreate");
    await player.page.waitForSelector("#screen-nickname.active", { timeout: 5_000 });
    await player.page.fill("#nicknameInput", player.nickname);
    // Pick first avatar — use evaluate to avoid an extra Playwright round-trip
    await player.page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>(
        ".avatar-option, #avatarPicker .avatar-option"
      );
      if (btn) btn.click();
    });
    // Locate confirm button by its text content
    if (confirmText === "เข้าสู่เกม") {
      await player.page.click("#btnGo");
    } else {
      await player.page.click("#btnConnect");
    }
  }

  // Wait for lobby screen to become active.
  // 30s timeout — sequential 20-test suites accumulate server load; spy-8p
  // (8 WebSocket connections) before werewolf tests can leave Colyseus briefly
  // busy with room disposal, slowing the next WebSocket handshake.
  await player.page.waitForSelector("#screen-lobby.active", { timeout: 30_000 });

  // Extract room code using evaluate (works for all lobby implementations)
  const roomCode = await player.page.evaluate(() => {
    // SharedLobby: .room-code-value element
    const rv = document.querySelector(".room-code-value");
    if (rv && rv.textContent && rv.textContent.trim() !== "----") {
      return rv.textContent.trim();
    }
    // Custom lobby (Werewolf): .lobby-room-code strong element
    const strong = document.querySelector(".lobby-room-code strong");
    if (strong && strong.textContent) {
      return strong.textContent.trim();
    }
    // forbidden-word / draw-guess: #roomCodeDisplay
    const rcd = document.getElementById("roomCodeDisplay");
    if (rcd && rcd.textContent && rcd.textContent.trim() !== "----") {
      return rcd.textContent.trim();
    }
    // Knights: .lobby-code contains the Colyseus room ID used for joinById
    const lc = document.querySelector(".lobby-code");
    if (lc && lc.textContent && lc.textContent.trim()) {
      return lc.textContent.trim();
    }
    // Last resort: find any 4-char uppercase string in the lobby
    const lobby = document.querySelector("#screen-lobby");
    if (lobby) {
      const text = lobby.textContent || "";
      const match = text.match(/\b([A-Z]{4})\b/);
      if (match) return match[1];
    }
    return null;
  });

  if (!roomCode) {
    throw new Error("Could not extract room code from lobby");
  }

  return roomCode;
}

/**
 * Navigate a page to a game and join an existing room by code.
 *
 * Handles three UX patterns (same opts as createRoom):
 * - screen-nickname (default): #btnJoin → #screen-nickname (with joinCodeInput shown) →
 *   fill nick + pick avatar + fill code → #btnConnect → lobby
 * - screen-nickname with custom confirm (draw-guess): same but confirm is #btnGo
 * - modal-based (forbidden-word): #btnJoinRoom → #nicknameModal → fill nick + pick emoji →
 *   #btnConfirmNickname → #joinModal opens → fill code → #btnConfirmJoin → lobby
 */
export async function joinRoom(
  player: PlayerPage,
  gamePath: string,
  roomCode: string,
  opts?: RoomOpts
): Promise<void> {
  const { confirmText, modalBased } = { ...DEFAULT_OPTS, ...opts };
  const baseURL = getBaseURL();
  await player.page.goto(`${baseURL}${gamePath}`);

  if (modalBased) {
    // ── forbidden-word modal flow ───────────────────────────────────────────
    // Step 1: open nickname modal via "Join Room" button
    await player.page.click("#btnJoinRoom");
    await player.page.waitForSelector(
      "#nicknameModal:not(.hidden), .modal-overlay:not(.hidden)",
      { timeout: 5_000 }
    );
    await player.page.fill("#nicknameInput", player.nickname);
    const emojiOption = player.page.locator(".emoji-option, .avatar-option").first();
    await emojiOption.click();
    await player.page.waitForTimeout(150);
    // Step 2: confirm nick → join modal opens
    await player.page.click("#btnConfirmNickname");
    // Step 3: fill room code in join modal
    await player.page.waitForSelector(
      "#joinModal:not(.hidden), #joinCodeInput",
      { timeout: 5_000 }
    );
    await player.page.fill("#joinCodeInput", roomCode);
    await player.page.click("#btnConfirmJoin");
  } else {
    // ── screen-nickname flow ───────────────────────────────────────────────
    await player.page.click("#btnJoin");
    await player.page.waitForSelector("#screen-nickname.active", { timeout: 5_000 });
    await player.page.fill("#nicknameInput", player.nickname);
    // Pick first avatar — use evaluate to avoid an extra Playwright round-trip
    await player.page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>(
        ".avatar-option, #avatarPicker .avatar-option"
      );
      if (btn) btn.click();
    });
    // Fill room code (shown in join flow via joinCodeGroup)
    await player.page.fill("#joinCodeInput", roomCode);
    // Confirm
    if (confirmText === "เข้าสู่เกม") {
      await player.page.click("#btnGo");
    } else {
      await player.page.click("#btnConnect");
    }
  }

  // Wait for lobby to appear (either SharedLobby or custom lobby)
  await player.page.waitForSelector(
    ".shared-lobby, .lobby-header, #screen-lobby.active",
    { timeout: 15_000 }
  );
}

/**
 * As host, click the "Start Game" button.
 * Handles both SharedLobby (.lobby-start-btn) and custom lobby (#btnStartGame).
 */
export async function startGame(hostPage: Page): Promise<void> {
  // Try SharedLobby button first, then custom lobby button
  const sharedBtn = hostPage.locator(".lobby-start-btn");
  const customBtn = hostPage.locator("#btnStartGame");

  if (await sharedBtn.isVisible().catch(() => false)) {
    await sharedBtn.click();
  } else if (await customBtn.isVisible().catch(() => false)) {
    await customBtn.click();
  } else {
    // Fallback: try either
    await hostPage.click(".lobby-start-btn, #btnStartGame");
  }
}

/**
 * Wait for all player pages to reach a specific screen (by screen ID).
 */
export async function waitForScreen(
  players: PlayerPage[],
  screenId: string,
  timeout = 15_000
): Promise<void> {
  await Promise.all(
    players.map((p) =>
      p.page.waitForSelector(`#screen-${screenId}.active`, { timeout })
    )
  );
}

/**
 * Wait for a specific phase by observing the screen change.
 * Returns when the screen becomes active.
 */
export async function waitForPhaseScreen(
  page: Page,
  screenId: string,
  timeout = 30_000
): Promise<void> {
  await page.waitForSelector(`#screen-${screenId}.active`, { timeout });
}

/**
 * Run actions on all pages in parallel within a tight timing window.
 * Useful for simulating simultaneous user actions (e.g., vote race).
 */
export async function simultaneousActions(
  actions: Array<() => Promise<void>>
): Promise<void> {
  await Promise.all(actions.map((action) => action()));
}

/**
 * Get the count of connected players shown in the lobby.
 */
export async function getLobbyPlayerCount(page: Page): Promise<number> {
  const countText = await page.textContent(".player-count");
  if (!countText) return 0;
  const match = countText.match(/(\d+)\//);
  return match ? parseInt(match[1], 10) : 0;
}
