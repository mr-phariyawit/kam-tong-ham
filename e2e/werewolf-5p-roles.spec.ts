/**
 * KTH-T-110: 5-player Werewolf role distribution (real browser)
 *
 * 5 browser tabs, Werewolf game starts.
 * Each tab observes its own role-reveal screen.
 * Assert: role distribution at 5 players matches spec table:
 *   1 werewolf + 1 seer + 0 doctor + 3 villagers
 *   No duplicates, no missing roles.
 *
 * This uses REAL browser pages observing REAL DOM role-reveal elements.
 */
import { test, expect } from "@playwright/test";
import {
  createPlayerPages,
  closeAllPlayers,
  createRoom,
  joinRoom,
  startGame,
  type PlayerPage,
} from "./fixtures/multi-page";

const WW_PATH = "/games/werewolf/index.html";

// Expected role distribution at 5 players per WerewolfState.ts ROLE_TABLE
const EXPECTED_5P = {
  werewolves: 1,
  seer: 1,
  doctor: 0,
  villagers: 3,
};

test.describe("Werewolf 5-player role distribution (real browser)", () => {
  let players: PlayerPage[] = [];

  test.afterEach(async () => {
    await closeAllPlayers(players);
    players = [];
  });

  test("5 players see correct role distribution on role reveal", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    // Create 5 player pages
    players = await createPlayerPages(browser, 5, "RoleP");

    // Player 1 creates the room
    const roomCode = await createRoom(players[0], WW_PATH);
    expect(roomCode).toBeTruthy();

    // Players 2-5 join
    for (let i = 1; i < 5; i++) {
      await joinRoom(players[i], WW_PATH, roomCode);
    }

    // Wait for all 5 in lobby (Werewolf uses .lobby-player-count, not .player-count)
    for (const p of players) {
      await p.page.waitForFunction(
        () => {
          const pc = document.querySelector(".player-count");
          if (pc && pc.textContent && pc.textContent.includes("5/")) return true;
          const lpc = document.querySelector(".lobby-player-count");
          if (lpc && lpc.textContent && lpc.textContent.includes("5/")) return true;
          return false;
        },
        { timeout: 15_000 }
      );
    }

    // Host starts the game
    await startGame(players[0].page);

    // Wait for role reveal screen on all players
    for (const p of players) {
      await expect(p.page.locator("#screen-roleReveal")).toHaveClass(/active/, {
        timeout: 10_000,
      });
    }

    // Read each player's role from the role reveal screen
    // The role reveal shows:
    //   #roleRevealIcon — role icon
    //   #roleRevealTitle — "บทบาทของคุณ"
    //   #roleRevealName — role name in Thai (e.g. "หมาป่า", "หมอดู", "ชาวบ้าน")
    //   #roleRevealInfo — role description
    const observedRoles: string[] = [];

    for (const p of players) {
      // Wait for the role name to be populated
      await expect(p.page.locator("#roleRevealName")).not.toBeEmpty({
        timeout: 10_000,
      });

      const roleName = await p.page.textContent("#roleRevealName");
      expect(roleName).toBeTruthy();
      observedRoles.push(roleName!.trim());
    }

    // Map Thai role names to English keys
    const roleMap: Record<string, string> = {
      "หมาป่า": "werewolf",
      "หมอดู": "seer",
      "หมอ": "doctor",
      "ชาวบ้าน": "villager",
    };

    // Also check for the icon-prefixed format (the role name may include icon)
    const normalizeRole = (text: string): string => {
      // Strip any emoji/icon prefix
      const cleaned = text.replace(/^[\s\p{Emoji}\p{So}]+/u, "").trim();
      return roleMap[cleaned] || cleaned;
    };

    const roles = observedRoles.map(normalizeRole);

    // Count each role
    const roleCounts: Record<string, number> = {};
    for (const role of roles) {
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    }

    // Assert exact distribution matches the 5-player table
    expect(roleCounts["werewolf"] || 0).toBe(EXPECTED_5P.werewolves);
    expect(roleCounts["seer"] || 0).toBe(EXPECTED_5P.seer);
    expect(roleCounts["doctor"] || 0).toBe(EXPECTED_5P.doctor);
    expect(roleCounts["villager"] || 0).toBe(EXPECTED_5P.villagers);

    // Total should be exactly 5
    const totalRoles = Object.values(roleCounts).reduce((a, b) => a + b, 0);
    expect(totalRoles).toBe(5);

    // No unknown roles
    const knownRoles = new Set(["werewolf", "seer", "doctor", "villager"]);
    for (const role of roles) {
      expect(knownRoles.has(role)).toBe(true);
    }
  });
});
