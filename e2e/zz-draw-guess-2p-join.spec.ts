/**
 * KTH-T-115: Draw & Guess 2-player join (real browser)
 *
 * 2 browser tabs. Host creates a room; joiner joins the same room.
 *
 * Regression test for PR #33: Draw & Guess shipped with roomCode="" — the
 * lobby displayed "----" forever. This test asserts:
 *   (a) Host's #roomCodeDisplay is NOT "----" and matches /^[A-Z]{4}$/
 *   (b) Joiner lands in the SAME room (roomCode shown == host's code)
 *   (c) #playerList has 2 .player-row entries on BOTH pages
 *
 * draw-guess uses the screen-nickname pattern but with a different confirm button:
 *   #btnCreate → #screen-nickname → fill nick + pick avatar → #btnGo ("เข้าสู่เกม") → lobby
 *   #btnJoin   → #screen-nickname (joinCodeGroup shown) → fill nick + code → #btnGo → lobby
 *
 * Lobby selectors:
 *   room code: #roomCodeDisplay
 *   player list: #playerList .player-row
 */
import { test, expect } from "@playwright/test";
import {
  createPlayerPages,
  closeAllPlayers,
  createRoom,
  joinRoom,
  type PlayerPage,
} from "./fixtures/multi-page";

const GAME_PATH = "/games/draw-guess/index.html";
const DG_OPTS = { confirmText: "เข้าสู่เกม" } as const;

test.describe("Draw & Guess 2-player join (real browser)", () => {
  let players: PlayerPage[] = [];

  test.afterEach(async () => {
    await closeAllPlayers(players);
    players = [];
  });

  test("host roomCode is NOT '----', joiner sees same code, both have 2 players (PR #33 regression)", async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    players = await createPlayerPages(browser, 2, "DG");

    // (a) Host creates — createRoom already polls until code is not "----"
    const code = await createRoom(players[0], GAME_PATH, DG_OPTS);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // Assert directly on the DOM element too (belt-and-suspenders for PR #33 regression)
    await expect(players[0].page.locator("#roomCodeDisplay")).not.toContainText(
      "----",
      { timeout: 5_000 }
    );
    await expect(players[0].page.locator("#roomCodeDisplay")).toContainText(
      code,
      { timeout: 5_000 }
    );

    // (b) Joiner joins the room using the extracted code
    await joinRoom(players[1], GAME_PATH, code, DG_OPTS);

    // Joiner should see the same room code
    await expect(players[1].page.locator("#roomCodeDisplay")).toContainText(
      code,
      { timeout: 10_000 }
    );

    // (c) Both pages should have 2 .player-row entries in #playerList
    for (const p of players) {
      await expect(p.page.locator("#playerList .player-row")).toHaveCount(2, {
        timeout: 10_000,
      });
    }
  });
});
