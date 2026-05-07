import { Room, Client, Delayed } from "colyseus";
import * as crypto from "crypto";
import { BaseState, BasePlayer, PLAYER_COLORS } from "../schemas/BaseState";
import { activeRoomCodes } from "../utils/roomRegistry";
import { isBlockedNickname } from "../utils/nicknameFilter";
import { recordGameStarted, updatePlayerCount } from "../utils/telemetry";

const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const RECONNECT_TIMEOUT_SECS = 300; // 5 minutes -- generous for mobile party games

export interface BaseJoinOptions {
  nickname: string;
  avatar: string;
  roomCode?: string;
  /** Rejoin token issued on first join; prevents kicked players from re-entering. */
  roomToken?: string;
}

/** Server-side rejoin token record. */
interface RejoinTokenRecord {
  playerId: string;
  nickname: string;
  avatar: string;
  revoked: boolean;
}

/**
 * Game configuration interface. Each game subclass defines its own config shape.
 */
export interface GameRoomConfig {
  /** Minimum players required to start the game. */
  minPlayers: number;
  /** Maximum players allowed in the room. */
  maxPlayers: number;
}

/**
 * BaseRoom -- shared room logic for all party games.
 *
 * Handles:
 * - Room lifecycle (onCreate, onJoin, onLeave, onDispose)
 * - Player management (join, leave, reconnect)
 * - Host management (auto-assign, transfer, kick)
 * - Rejoin token system (anti-abuse)
 * - Inactivity timeout
 * - Message routing (subclasses register game-specific handlers)
 *
 * Subclasses MUST override:
 * - createState() -- return game-specific state instance
 * - createPlayer() -- return game-specific player instance (BasePlayer subclass)
 * - getGameConfig() -- return min/max player counts
 * - onGameStart(client) -- game start logic
 *
 * Subclasses CAN override:
 * - registerMessageHandlers() -- register game-specific message handlers
 * - onPlayerReconnected(client, player) -- re-send game data on reconnect
 * - onPlayerDisconnectedDuringGame(player) -- handle disconnect during game
 * - onGameDispose() -- clean up game-specific resources
 *
 * @template S - State type extending BaseState
 */
export abstract class BaseRoom<S extends BaseState = BaseState> extends Room<S> {
  private inactivityTimeout: Delayed | null = null;
  protected colorIndex: number = 0;

  // --- Rejoin tokens ---
  private rejoinTokens: Map<string, RejoinTokenRecord> = new Map();
  private playerTokens: Map<string, string> = new Map(); // sessionId -> token
  private kickedNicknames: Set<string> = new Set();

  // --- Reconnection tracking ---
  private reconnectDeferreds: Map<string, { reject: Function }> = new Map();

  // --- Dispose listeners (for test observability, AEG-51) ---
  private _disposeListeners: Array<() => void> = [];

  /** Reserved system names that may not be used as player nicknames. */
  private static readonly RESERVED_NAMES = new Set([
    "admin",
    "host",
    "system",
    "ผู้ดูแล", // ผู้ดูแล
  ]);

  // ─── Abstract methods subclasses MUST implement ─────────────

  /** Create and return the game-specific state instance. */
  protected abstract createState(): S;

  /** Create and return a new player instance for this game type. */
  protected abstract createPlayer(): BasePlayer;

  /** Return game configuration (min/max players). */
  protected abstract getGameConfig(): GameRoomConfig;

  /**
   * Called when the host triggers START_GAME and validation passes.
   * Subclass implements actual game start logic (assign roles, words, etc.).
   */
  protected abstract onGameStart(client: Client): void;

  // ─── Optional hooks subclasses CAN override ─────────────────

  /**
   * Called when a player successfully reconnects during a game.
   * Override to re-send game-specific data (e.g., secret words, roles).
   */
  protected onPlayerReconnected(_client: Client, _player: BasePlayer): void {
    // Default: no-op. Subclass overrides as needed.
  }

  /**
   * Called when a player disconnects during a game and reconnection times out.
   * Override for game-specific disconnect handling (e.g., mark as surrendered).
   */
  protected onPlayerDisconnectedDuringGame(_player: BasePlayer): void {
    // Default: no-op. Subclass overrides as needed.
  }

  /**
   * Register game-specific message handlers.
   * Called during onCreate after base handlers are registered.
   */
  protected registerMessageHandlers(): void {
    // Default: no-op. Subclass registers its game-specific handlers.
  }

  /**
   * Clean up game-specific resources on dispose.
   * Called during onDispose after base cleanup.
   */
  protected onGameDispose(): void {
    // Default: no-op. Subclass cleans up game-specific resources.
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  onCreate(options: { roomCode: string; gameType?: string }) {
    const state = this.createState();
    this.setState(state);

    this.state.roomCode = options.roomCode || "";
    this.state.phase = "LOBBY";
    this.state.createdAt = Date.now();
    if (options.gameType) {
      this.state.gameType = options.gameType;
    }

    const config = this.getGameConfig();
    this.maxClients = config.maxPlayers;
    this.autoDispose = true;

    // Set metadata for Colyseus matchmaking (filterBy roomCode)
    this.setMetadata({ roomCode: this.state.roomCode, gameType: options.gameType || "" });

    // Register base message handlers
    this.onMessage("PING", () => {}); // keepalive -- no-op
    this.onMessage("START_GAME", (client) => this.handleStartGame(client));
    this.onMessage("KICK_PLAYER", (client, data: { targetPlayerId: string }) =>
      this.handleKickPlayer(client, data.targetPlayerId),
    );
    this.onMessage("TRANSFER_HOST", (client, data: { targetPlayerId: string }) =>
      this.handleTransferHost(client, data.targetPlayerId),
    );

    // Let subclass register game-specific handlers
    this.registerMessageHandlers();

    this.resetInactivityTimer();
  }

  onJoin(client: Client, options: BaseJoinOptions) {
    // --- Nickname validation ---
    const rawNickname = (options.nickname || "ผู้เล่น").slice(0, 15); // ผู้เล่น
    if (isBlockedNickname(rawNickname)) {
      client.send("ERROR", {
        code: "NICKNAME_REJECTED",
        reason: "OFFENSIVE",
        message: "ชื่อผู้เล่นไม่เหมาะสม กรุณาใช้ชื่ออื่น", // ชื่อผู้เล่นไม่เหมาะสม กรุณาใช้ชื่ออื่น
      });
      client.leave();
      return;
    }
    if (BaseRoom.RESERVED_NAMES.has(rawNickname.toLowerCase())) {
      client.send("ERROR", {
        code: "NICKNAME_REJECTED",
        reason: "RESERVED",
        message: "ชื่อนี้ถูกสงวนไว้ กรุณาใช้ชื่ออื่น", // ชื่อนี้ถูกสงวนไว้ กรุณาใช้ชื่ออื่น
      });
      client.leave();
      return;
    }

    // --- Rejoin token validation ---
    if (options.roomToken) {
      const record = this.rejoinTokens.get(options.roomToken);
      if (
        !record ||
        record.revoked ||
        rawNickname.toLowerCase() !== record.nickname.toLowerCase()
      ) {
        client.send("ERROR", {
          code: "KICKED",
          message: "คุณถูกเตะออกจากห้องนี้แล้ว", // คุณถูกเตะออกจากห้องนี้แล้ว
        });
        client.leave();
        return;
      }
    } else if (this.kickedNicknames.has(rawNickname.toLowerCase())) {
      client.send("ERROR", {
        code: "KICKED",
        message: "คุณถูกเตะออกจากห้องนี้แล้ว", // คุณถูกเตะออกจากห้องนี้แล้ว
      });
      client.leave();
      return;
    }

    // --- Create player ---
    const player = this.createPlayer();
    player.id = client.sessionId;
    player.nickname = rawNickname;
    player.avatar = options.avatar || "\u{1f600}"; // 😀
    player.isHost = this.state.players.size === 0;
    player.isAlive = true;
    player.isConnected = true;
    player.score = 0;
    player.color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
    this.colorIndex++;

    this.state.players.set(client.sessionId, player);
    this.state.playerCount = this.state.players.size;

    // Telemetry: update player count for peak tracking
    updatePlayerCount(this.state.gameType || "unknown", this.getConnectedPlayers().length);

    // Issue rejoin token and send to client
    const token = crypto.randomBytes(16).toString("hex");
    this.rejoinTokens.set(token, {
      playerId: client.sessionId,
      nickname: player.nickname,
      avatar: player.avatar,
      revoked: false,
    });
    this.playerTokens.set(client.sessionId, token);
    client.send("ROOM_TOKEN", { token });

    this.resetInactivityTimer();
  }

  async onLeave(client: Client, _consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Mark player as disconnected immediately
    player.isConnected = false;

    // Temporary host transfer while disconnected
    if (player.isHost) {
      const hasOtherConnected = this.getConnectedPlayers().some(
        (p) => p.id !== client.sessionId,
      );
      if (hasOtherConnected) {
        player.isHost = false;
        this.transferHost();
      }
    }

    this.state.playerCount = this.state.players.size;
    this.resetInactivityTimer();

    // Leave in LOBBY -- remove immediately (no reconnection window needed)
    if (this.state.phase === "LOBBY") {
      const wasHost = player.isHost;
      this.state.players.delete(client.sessionId);
      this.state.playerCount = this.state.players.size;
      this.playerTokens.delete(client.sessionId);
      if (wasHost && this.state.players.size > 0) {
        this.transferHost();
      }
      this.checkAllDisconnectedCleanup();
      return;
    }

    // Allow reconnection (5 minutes)
    try {
      const reconnectDeferred = this.allowReconnection(client, RECONNECT_TIMEOUT_SECS);
      this.reconnectDeferreds.set(client.sessionId, reconnectDeferred);

      const reconnectedClient = await reconnectDeferred;

      // CLIENT RECONNECTED SUCCESSFULLY
      this.reconnectDeferreds.delete(client.sessionId);
      player.isConnected = true;

      // Restore host if no one else has it
      const currentHost = this.getHostPlayer();
      if (!currentHost) {
        player.isHost = true;
        this.broadcast("HOST_TRANSFERRED", {
          newHostId: player.id,
          newHostNickname: player.nickname,
        });
      }

      this.state.playerCount = this.state.players.size;

      // Re-send ROOM_TOKEN so client can update localStorage
      const existingToken = this.playerTokens.get(client.sessionId);
      if (existingToken) {
        reconnectedClient.send("ROOM_TOKEN", { token: existingToken });
      }

      // Let subclass re-send game-specific data
      this.onPlayerReconnected(reconnectedClient, player);

      // Notify all clients about reconnection
      this.broadcast("PLAYER_RECONNECTED", {
        playerId: player.id,
        nickname: player.nickname,
      });
    } catch (_) {
      // RECONNECTION TIMED OUT -- truly remove player
      this.reconnectDeferreds.delete(client.sessionId);

      if (this.state.phase !== "LOBBY") {
        this.onPlayerDisconnectedDuringGame(player);
      }

      // Transfer host if they held it
      if (player.isHost) {
        player.isHost = false;
        this.transferHost();
      }

      // In LOBBY, remove player entirely; during game, keep for score display
      if (this.state.phase === "LOBBY") {
        this.state.players.delete(client.sessionId);
      }

      this.state.playerCount = this.state.players.size;
      this.playerTokens.delete(client.sessionId);
    }

    this.checkAllDisconnectedCleanup();
  }

  // @ts-ignore -- overloaded: called by framework with no args (cleanup) or by tests with a callback
  onDispose(cb?: () => void) {
    if (cb) {
      this._disposeListeners.push(cb);
      return;
    }

    if (this.inactivityTimeout) {
      this.inactivityTimeout.clear();
    }

    if (this.state.roomCode) {
      activeRoomCodes.delete(this.state.roomCode);
    }

    this.rejoinTokens.clear();
    this.playerTokens.clear();

    // Reject all pending reconnection deferreds
    this.reconnectDeferreds.forEach((deferred) => {
      try {
        deferred.reject(false);
      } catch (_) {
        /* already resolved/rejected */
      }
    });
    this.reconnectDeferreds.clear();

    // Let subclass clean up game-specific resources
    this.onGameDispose();

    this._disposeListeners.forEach((listener) => listener());
    this._disposeListeners = [];
  }

  // ─── Base message handlers ──────────────────────────────────

  protected handleStartGame(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(
        client,
        "NOT_HOST",
        "เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้", // เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้
      );
      return;
    }

    const config = this.getGameConfig();
    const connectedCount = this.getConnectedPlayers().length;
    if (connectedCount < config.minPlayers) {
      this.sendError(
        client,
        "NOT_ENOUGH_PLAYERS",
        `ต้องมีผู้เล่นอย่างน้อย ${config.minPlayers} คน`, // ต้องมีผู้เล่นอย่างน้อย N คน
      );
      return;
    }

    if (this.state.phase !== "LOBBY" && this.state.phase !== "SCOREBOARD" && this.state.phase !== "GAME_OVER") {
      this.sendError(
        client,
        "INVALID_PHASE",
        "ไม่สามารถเริ่มเกมได้ในขณะนี้", // ไม่สามารถเริ่มเกมได้ในขณะนี้
      );
      return;
    }

    // Telemetry: record game start
    const gameType = this.state.gameType || "unknown";
    recordGameStarted(gameType, connectedCount);

    this.onGameStart(client);
  }

  private handleKickPlayer(client: Client, targetPlayerId: string) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(client, "NOT_HOST", "เฉพาะเจ้าของห้องเท่านั้น"); // เฉพาะเจ้าของห้องเท่านั้น
      return;
    }

    if (this.state.phase !== "LOBBY") {
      this.sendError(client, "INVALID_PHASE", "ไม่สามารถเตะผู้เล่นได้ในขณะนี้"); // ไม่สามารถเตะผู้เล่นได้ในขณะนี้
      return;
    }

    if (targetPlayerId === client.sessionId) {
      this.sendError(client, "SELF_KICK", "ไม่สามารถเตะตัวเองได้"); // ไม่สามารถเตะตัวเองได้
      return;
    }

    const target = this.state.players.get(targetPlayerId);
    if (!target) return;

    // Revoke the kicked player's rejoin token
    const existingToken = this.playerTokens.get(targetPlayerId);
    if (existingToken) {
      const record = this.rejoinTokens.get(existingToken);
      if (record) record.revoked = true;
    }
    this.kickedNicknames.add(target.nickname.toLowerCase());

    // Cancel any pending reconnection
    const pendingReconnect = this.reconnectDeferreds.get(targetPlayerId);
    if (pendingReconnect) {
      try {
        pendingReconnect.reject(false);
      } catch (_) {
        /* already resolved */
      }
      this.reconnectDeferreds.delete(targetPlayerId);
    }

    // Notify kicked player
    const targetClient = this.clients.find((c) => c.sessionId === targetPlayerId);
    if (targetClient) {
      targetClient.send("KICKED", { message: "คุณถูกเตะออกจากห้อง" }); // คุณถูกเตะออกจากห้อง
      targetClient.leave();
    }

    this.state.players.delete(targetPlayerId);
    this.state.playerCount = this.state.players.size;
    this.playerTokens.delete(targetPlayerId);
  }

  private handleTransferHost(client: Client, targetPlayerId: string) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isHost) {
      this.sendError(client, "NOT_HOST", "เฉพาะเจ้าของห้องเท่านั้น"); // เฉพาะเจ้าของห้องเท่านั้น
      return;
    }

    const target = this.state.players.get(targetPlayerId);
    if (!target || !target.isConnected) {
      this.sendError(client, "PLAYER_NOT_FOUND", "ไม่พบผู้เล่น"); // ไม่พบผู้เล่น
      return;
    }

    player.isHost = false;
    target.isHost = true;
    this.broadcast("HOST_TRANSFERRED", {
      newHostId: target.id,
      newHostNickname: target.nickname,
    });
  }

  // ─── Protected helper methods (available to subclasses) ─────

  /** Send an error message to a specific client. */
  protected sendError(client: Client, code: string, message: string) {
    client.send("ERROR", { code, message });
  }

  /** Get all currently connected players. */
  protected getConnectedPlayers(): BasePlayer[] {
    const connected: BasePlayer[] = [];
    this.state.players.forEach((p) => {
      if (p.isConnected) connected.push(p);
    });
    return connected;
  }

  /** Get all alive and connected players. */
  protected getAlivePlayers(): BasePlayer[] {
    const alive: BasePlayer[] = [];
    this.state.players.forEach((p) => {
      if (p.isAlive && p.isConnected) alive.push(p);
    });
    return alive;
  }

  /** Get the current host player, or null if none. */
  protected getHostPlayer(): BasePlayer | null {
    let host: BasePlayer | null = null;
    this.state.players.forEach((p) => {
      if (p.isHost && p.isConnected) host = p;
    });
    return host;
  }

  /** Transfer host to the next connected player and broadcast. */
  protected transferHost() {
    let newHost: BasePlayer | null = null;
    this.state.players.forEach((p) => {
      if (p.isConnected && !newHost) {
        newHost = p;
      }
    });
    if (newHost) {
      (newHost as BasePlayer).isHost = true;
      this.broadcast("HOST_TRANSFERRED", {
        newHostId: (newHost as BasePlayer).id,
        newHostNickname: (newHost as BasePlayer).nickname,
      });
    }
  }

  /** Reset the inactivity timer. Call after any activity. */
  protected resetInactivityTimer() {
    if (this.inactivityTimeout) {
      this.inactivityTimeout.clear();
    }
    this.inactivityTimeout = this.clock.setTimeout(() => {
      this.broadcast("ROOM_EXPIRED", {
        message: "ห้องหมดเวลาเนื่องจากไม่มีกิจกรรม", // ห้องหมดเวลาเนื่องจากไม่มีกิจกรรม
      });
      this.disconnect();
    }, INACTIVITY_TIMEOUT_MS);
  }

  /** Check if all players are disconnected and schedule cleanup. */
  private allDisconnected(): boolean {
    let allDisc = true;
    this.state.players.forEach((p) => {
      if (p.isConnected) allDisc = false;
    });
    return allDisc;
  }

  private checkAllDisconnectedCleanup() {
    if (this.state.players.size === 0 || this.allDisconnected()) {
      this.clock.setTimeout(() => {
        if (this.allDisconnected()) {
          this.disconnect();
        }
      }, 5 * 60 * 1000); // 5 minutes
    }
  }
}
