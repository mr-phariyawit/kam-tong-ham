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
 * Navigate a page to a game, enter nickname, and create a room.
 * Returns the room code displayed in the lobby.
 *
 * Handles two lobby implementations:
 * - SharedLobby (Spy, etc.): `.room-code-value` element
 * - Custom lobby (Werewolf): `.lobby-room-code` element with "ห้อง: CODE"
 */
export async function createRoom(
  player: PlayerPage,
  gamePath: string // e.g. "/games/spy/index.html"
): Promise<string> {
  const baseURL = getBaseURL();
  await player.page.goto(`${baseURL}${gamePath}`);

  // Click "Create Room" button
  await player.page.click("#btnCreate");

  // Enter nickname
  await player.page.fill("#nicknameInput", player.nickname);

  // Click connect/join button
  await player.page.click("#btnConnect");

  // Wait for lobby screen to become active
  await player.page.waitForSelector("#screen-lobby.active", { timeout: 15_000 });

  // Extract room code using evaluate (works for both lobby implementations)
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
 * Handles both SharedLobby and custom lobby implementations.
 */
export async function joinRoom(
  player: PlayerPage,
  gamePath: string,
  roomCode: string
): Promise<void> {
  const baseURL = getBaseURL();
  await player.page.goto(`${baseURL}${gamePath}`);

  // Click "Join Room" button
  await player.page.click("#btnJoin");

  // Enter nickname
  await player.page.fill("#nicknameInput", player.nickname);

  // Enter room code
  await player.page.fill("#joinCodeInput", roomCode);

  // Click connect
  await player.page.click("#btnConnect");

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
