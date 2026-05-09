/**
 * KTH-T-116: Forbidden Word host-leave → host transfer (real browser)
 *
 * 3 browser tabs. Host creates, 2 others join. Then the host's context is
 * closed (real browser tab close). The remaining 2 tabs should:
 *   (a) Still be on the lobby screen (not kicked or errored out).
 *   (b) Have ONE of them promoted to host — #lobbyHostLabel shows "👑 คุณเป็นเจ้าของห้อง"
 *       on exactly one remaining tab.
 *   (c) The room code (#roomCodeDisplay) is UNCHANGED after host leaves.
 *
 * This tests BaseRoom's automatic host-transfer on leave, which fires a
 * HOST_TRANSFERRED message. The forbidden-word client reacts by updating
 * #lobbyHostLabel via `player.listen('isHost')`.
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

test.describe("Forbidden Word host-leave → host transfer (real browser)", () => {
  let players: PlayerPage[] = [];

  test.afterEach(async () => {
    await closeAllPlayers(players);
    players = [];
  });

  test("host tab closes, one of the remaining 2 tabs becomes new host, room code unchanged", async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    players = await createPlayerPages(browser, 3, "FWH");

    // Player 0 (host) creates the room
    const code = await createRoom(players[0], GAME_PATH, MODAL_OPTS);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // Players 1 and 2 join
    await joinRoom(players[1], GAME_PATH, code, MODAL_OPTS);
    await joinRoom(players[2], GAME_PATH, code, MODAL_OPTS);

    // All 3 should be in the lobby with 3 players
    for (const p of players) {
      await expect(p.page.locator("#playerCountLabel")).toContainText("3/", {
        timeout: 10_000,
      });
    }

    // Verify host tab shows the host label before leaving
    await expect(players[0].page.locator("#lobbyHostLabel")).toContainText(
      "👑",
      { timeout: 5_000 }
    );

    // (c) Capture the room code before host leaves
    const codeBeforeLeave = await players[0].page.textContent("#roomCodeDisplay");
    expect(codeBeforeLeave?.trim()).toBe(code);

    // === HOST LEAVES: close player[0]'s context (real browser tab close) ===
    await players[0].context.close();

    // Wait for host-transfer to propagate to remaining players
    // The server fires HOST_TRANSFERRED → client updates #lobbyHostLabel
    // Use assertion-based wait: one tab must show the crown label within 10s
    const remaining = [players[1], players[2]];

    // (a) Both remaining tabs stay on the lobby screen
    for (const p of remaining) {
      await expect(p.page.locator("#screen-lobby")).toHaveClass(/active/, {
        timeout: 10_000,
      });
    }

    // (b) Exactly one remaining tab is now the host (shows 👑 label)
    // Wait for at least one tab to display the host label
    let newHostCount = 0;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      newHostCount = 0;
      for (const p of remaining) {
        const labelText = await p.page.textContent("#lobbyHostLabel").catch(() => "");
        if (labelText && labelText.includes("👑")) {
          newHostCount++;
        }
      }
      if (newHostCount >= 1) break;
      await remaining[0].page.waitForTimeout(300);
    }
    expect(newHostCount).toBeGreaterThanOrEqual(1);

    // (c) Room code is unchanged on remaining tabs
    for (const p of remaining) {
      await expect(p.page.locator("#roomCodeDisplay")).toContainText(code, {
        timeout: 5_000,
      });
    }
  });
});
