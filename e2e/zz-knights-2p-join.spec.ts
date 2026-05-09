/**
 * KTH-T-113: Knights lobby coverage (real browser)
 *
 * ARCHITECTURAL NOTE: Knights does not use the 4-letter room-code system.
 * The game calls client.create() without pre-reserving a code via
 * /api/rooms/create, so state.roomCode = "" and the lobby shows an empty
 * .lobby-code element. Joiners must know the Colyseus room ID (opaque server
 * ID not surfaced in the UI) to call joinById(). There is no UI mechanism
 * for the host to share the room ID in the current design.
 *
 * CONSEQUENCE: A real-browser 2-player join test for knights is BLOCKED by
 * the game's current architecture — the joiner cannot discover the room ID
 * through the UI without an app code change. See plan item #3 comment in
 * .aegis/brain/plans/2026-05-09_multi-tab-test-plan.md.
 *
 * WHAT THIS SPEC COVERS instead:
 *   Host creates a room → #screen-lobby renders → .lobby-count shows "1 ผู้เล่น"
 *   → #btnStartGame exists (host control) → no console errors.
 * This validates the create+lobby flow end-to-end without a multi-player join.
 *
 * When knights migrates to the 4-letter code system (or exposes a join code
 * in the lobby UI), replace this test with the full 2-player join template.
 */
import { test, expect } from "@playwright/test";
import {
  createPlayerPages,
  closeAllPlayers,
  type PlayerPage,
} from "./fixtures/multi-page";
import { getBaseURL } from "./fixtures/multi-page";
import * as fs from "fs";
import * as path from "path";

const GAME_PATH = "/games/knights/index.html";
const LOCAL_SDK_PATH = path.resolve(__dirname, "fixtures/colyseus-browser.js");

test.describe("Knights lobby create (real browser)", () => {
  let players: PlayerPage[] = [];

  test.afterEach(async () => {
    await closeAllPlayers(players);
    players = [];
  });

  test("host creates room, lobby renders with 1 player (full join blocked — no room code in UI)", async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    players = await createPlayerPages(browser, 1, "KN");

    // Navigate and create room
    const baseURL = getBaseURL();
    await players[0].page.goto(`${baseURL}${GAME_PATH}`);

    // Screen-nickname flow
    await players[0].page.click("#btnCreate");
    await players[0].page.waitForSelector("#screen-nickname.active", {
      timeout: 5_000,
    });
    await players[0].page.fill("#nicknameInput", players[0].nickname);
    const avatarOption = players[0].page.locator(".avatar-option").first();
    if ((await avatarOption.count()) > 0) {
      await avatarOption.click();
    }
    await players[0].page.click("#btnConnect");

    // Wait for lobby
    await players[0].page.waitForSelector("#screen-lobby.active", {
      timeout: 15_000,
    });

    // Assert lobby rendered with player count
    await expect(players[0].page.locator(".lobby-count")).toContainText(
      "1 ผู้เล่น",
      { timeout: 10_000 }
    );

    // Host should see Start Game button
    await expect(
      players[0].page.locator("#lobbyContainer #btnStartGame, #btnStartGame")
    ).toBeVisible({ timeout: 5_000 });
  });
});
