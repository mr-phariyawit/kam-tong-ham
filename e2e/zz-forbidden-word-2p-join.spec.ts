/**
 * KTH-T-112: Forbidden Word 2-player join (real browser)
 *
 * 2 browser tabs. Host creates a room; joiner joins the same room.
 * Both tabs should see player count = 2 in the lobby.
 *
 * forbidden-word uses a modal-based UX (not the screen-nickname pattern):
 *   #btnCreateRoom → #nicknameModal → fill nick + pick emoji → #btnConfirmNickname → lobby
 *   #btnJoinRoom  → #nicknameModal → fill nick + pick emoji → #btnConfirmNickname →
 *                   #joinModal → fill code → #btnConfirmJoin → lobby
 *
 * Player count selector: #playerCountLabel "ผู้เล่น N/8"
 */
import { test, expect } from "@playwright/test";
import {
  createPlayerPages,
  closeAllPlayers,
  createRoom,
  joinRoom,
  type PlayerPage,
} from "./fixtures/multi-page";

const GAME_PATH = "/games/forbidden-word/index.html";
const MODAL_OPTS = { modalBased: true } as const;

test.describe("Forbidden Word 2-player join (real browser)", () => {
  let players: PlayerPage[] = [];

  test.afterEach(async () => {
    await closeAllPlayers(players);
    players = [];
  });

  test("host + joiner end up in same room, both see 2 players", async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    players = await createPlayerPages(browser, 2, "FW");

    const code = await createRoom(players[0], GAME_PATH, MODAL_OPTS);
    expect(code).toMatch(/^[A-Z]{4}$/);

    await joinRoom(players[1], GAME_PATH, code, MODAL_OPTS);

    // Both tabs should see "ผู้เล่น 2/8" in #playerCountLabel
    for (const p of players) {
      await expect(p.page.locator("#playerCountLabel")).toContainText("2/", {
        timeout: 10_000,
      });
    }
  });
});
