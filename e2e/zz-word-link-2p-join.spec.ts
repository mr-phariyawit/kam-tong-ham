/**
 * KTH-T-114: Word Link 2-player join (real browser)
 *
 * 2 browser tabs. Host creates a room; joiner joins the same room.
 * Both tabs should see player count = 2 in the lobby.
 *
 * word-link uses the screen-nickname pattern (#btnCreate / #btnConnect / "เข้าร่วม").
 * SharedLobby component — same selectors as spy:
 *   room code: .room-code-value
 *   player count: .player-count "N/M"
 */
import { test, expect } from "@playwright/test";
import {
  createPlayerPages,
  closeAllPlayers,
  createRoom,
  joinRoom,
  type PlayerPage,
} from "./fixtures/multi-page";

const GAME_PATH = "/games/word-link/index.html";

test.describe("Word Link 2-player join (real browser)", () => {
  let players: PlayerPage[] = [];

  test.afterEach(async () => {
    await closeAllPlayers(players);
    players = [];
  });

  test("host + joiner end up in same room, both see 2 players", async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    players = await createPlayerPages(browser, 2, "WL");

    const code = await createRoom(players[0], GAME_PATH);
    expect(code).toMatch(/^[A-Z]{4}$/);

    await joinRoom(players[1], GAME_PATH, code);

    // Both tabs should see "2/" in .player-count (SharedLobby)
    for (const p of players) {
      await expect(p.page.locator(".player-count")).toContainText("2/", {
        timeout: 10_000,
      });
    }
  });
});
