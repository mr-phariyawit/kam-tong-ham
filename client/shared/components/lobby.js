/**
 * Shared Lobby Components for Party Games Platform
 *
 * Generic, game-agnostic lobby UI components that can be reused
 * by any game on the platform. All text is Thai-native.
 *
 * Usage:
 *   <script src="/shared/components/lobby.js"></script>
 *   const lobby = new SharedLobby({ container: document.getElementById('lobby') });
 *   lobby.updatePlayers(playersArray);
 *   lobby.setRoomCode('ABCD');
 *
 * Components:
 *   - SharedLobby: Full lobby container (room code + player list + host controls)
 *   - PlayerList: Standalone player list with host badges
 *   - RoomCodeDisplay: Room code with copy-to-clipboard
 *   - KickButton: Host-only kick button per player
 *   - HostBadge: Visual host indicator
 *
 * @module shared/lobby
 */

// ─── HostBadge ──────────────────────────────────────────────────
/**
 * Renders a host badge indicator.
 * @param {boolean} isHost - Whether the player is the host
 * @returns {string} HTML string for the badge
 */
function HostBadge(isHost) {
  if (!isHost) return '';
  return '<span class="host-badge" title="เจ้าของห้อง">&#x1f451;</span>';
}

// ─── KickButton ─────────────────────────────────────────────────
/**
 * Renders a kick button (only visible to host, for non-host players).
 * @param {Object} options
 * @param {string} options.playerId - Target player's session ID
 * @param {boolean} options.showKick - Whether the current user is host
 * @param {boolean} options.isSelf - Whether this is the current user's row
 * @param {Function} options.onKick - Callback when kick is clicked
 * @returns {HTMLElement|null} Button element or null
 */
function KickButton(options) {
  if (!options.showKick || options.isSelf) return null;

  var btn = document.createElement('button');
  btn.className = 'kick-btn';
  btn.textContent = '❌'; // x mark
  btn.title = 'เตะออก';
  btn.setAttribute('aria-label', 'เตะผู้เล่นนี้ออก');
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (typeof options.onKick === 'function') {
      options.onKick(options.playerId);
    }
  });
  return btn;
}

// ─── RoomCodeDisplay ────────────────────────────────────────────
/**
 * Creates a room code display with copy-to-clipboard functionality.
 *
 * @param {Object} options
 * @param {HTMLElement} options.container - Container element
 * @param {string} [options.code='----'] - Initial room code
 * @returns {Object} API: { setCode(code), getCode() }
 */
function RoomCodeDisplay(options) {
  var container = options.container;
  var currentCode = options.code || '----';

  container.innerHTML = '';
  container.className = 'shared-room-code';

  var label = document.createElement('div');
  label.className = 'room-code-label';
  label.textContent = '\u{1f3e0} รหัสห้อง';

  var display = document.createElement('div');
  display.className = 'room-code-value';
  display.textContent = currentCode;
  display.title = 'แตะเพื่อคัดลอก';

  var copied = document.createElement('div');
  copied.className = 'room-code-copied';
  copied.textContent = 'คัดลอกแล้ว!';

  display.addEventListener('click', function () {
    if (currentCode && currentCode !== '----') {
      var shareUrl = window.location.origin + '?join=' + currentCode;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(function () {
          copied.classList.add('show');
          setTimeout(function () { copied.classList.remove('show'); }, 1500);
        });
      }
    }
  });

  container.appendChild(label);
  container.appendChild(display);
  container.appendChild(copied);

  return {
    setCode: function (code) {
      currentCode = code;
      display.textContent = code;
    },
    getCode: function () {
      return currentCode;
    },
  };
}

// ─── PlayerList ─────────────────────────────────────────────────
/**
 * Creates a player list with avatars, nicknames, host badges, and kick buttons.
 *
 * @param {Object} options
 * @param {HTMLElement} options.container - Container element
 * @param {number} [options.maxPlayers=8] - Maximum players for the counter
 * @param {boolean} [options.showKick=false] - Whether to show kick buttons
 * @param {Function} [options.onKick] - Callback when a player is kicked
 * @returns {Object} API: { update(players, mySessionId, isHost), clear() }
 */
function PlayerList(options) {
  var container = options.container;
  var maxPlayers = options.maxPlayers || 8;

  container.innerHTML = '';
  container.className = 'shared-player-list';

  var counter = document.createElement('div');
  counter.className = 'player-count';
  counter.textContent = '\u{1f465} 0/' + maxPlayers + ' คน';

  var list = document.createElement('div');
  list.className = 'player-list-items';

  container.appendChild(counter);
  container.appendChild(list);

  return {
    update: function (players, mySessionId, isHost) {
      counter.textContent = '\u{1f465} ' + players.length + '/' + maxPlayers + ' คน';
      list.innerHTML = '';

      players.forEach(function (player) {
        var row = document.createElement('div');
        row.className = 'player-row';
        if (player.id === mySessionId) row.classList.add('is-me');
        if (!player.isConnected) row.classList.add('disconnected');

        var avatar = document.createElement('span');
        avatar.className = 'player-avatar';
        avatar.textContent = player.avatar || '\u{1f600}';

        var name = document.createElement('span');
        name.className = 'player-name';
        name.textContent = player.nickname;
        if (player.id === mySessionId) name.textContent += ' (คุณ)';

        var badges = document.createElement('span');
        badges.className = 'player-badges';
        badges.innerHTML = HostBadge(player.isHost);

        if (!player.isConnected) {
          var offBadge = document.createElement('span');
          offBadge.className = 'offline-badge';
          offBadge.textContent = '\u{1f4f4}'; // mobile phone off
          badges.appendChild(offBadge);
        }

        row.appendChild(avatar);
        row.appendChild(name);
        row.appendChild(badges);

        var kickBtn = KickButton({
          playerId: player.id,
          showKick: isHost,
          isSelf: player.id === mySessionId,
          onKick: options.onKick,
        });
        if (kickBtn) row.appendChild(kickBtn);

        list.appendChild(row);
      });
    },
    setMaxPlayers: function (max) {
      maxPlayers = max;
    },
    clear: function () {
      list.innerHTML = '';
      counter.textContent = '\u{1f465} 0/' + maxPlayers + ' คน';
    },
  };
}

// ─── SharedLobby ────────────────────────────────────────────────
/**
 * Full lobby container combining RoomCodeDisplay + PlayerList + host controls.
 *
 * @param {Object} options
 * @param {HTMLElement} options.container - Container element
 * @param {string} [options.gameName=''] - Game name for the header
 * @param {number} [options.maxPlayers=8] - Max player count
 * @param {Function} [options.onKick] - Kick callback
 * @param {Function} [options.onTransferHost] - Transfer host callback
 * @param {Function} [options.onStart] - Start game callback
 * @param {Function} [options.onLeave] - Leave room callback
 * @returns {Object} API: { setRoomCode, updatePlayers, setHost, enable/disableStart }
 */
function SharedLobby(options) {
  var container = options.container;
  container.innerHTML = '';
  container.className = 'shared-lobby';

  // Back button
  var header = document.createElement('div');
  header.className = 'lobby-header';

  var backBtn = document.createElement('button');
  backBtn.className = 'lobby-back-btn';
  backBtn.textContent = '← ออก';
  backBtn.addEventListener('click', function () {
    if (typeof options.onLeave === 'function') options.onLeave();
  });

  var gameLabel = document.createElement('span');
  gameLabel.className = 'lobby-game-label';
  gameLabel.textContent = options.gameName || '';

  header.appendChild(backBtn);
  header.appendChild(gameLabel);

  // Room code section
  var roomCodeContainer = document.createElement('div');
  var roomCode = RoomCodeDisplay({ container: roomCodeContainer });

  // Player list section
  var playerListContainer = document.createElement('div');
  var playerList = PlayerList({
    container: playerListContainer,
    maxPlayers: options.maxPlayers || 8,
    onKick: options.onKick,
  });

  // Host actions
  var hostActions = document.createElement('div');
  hostActions.className = 'lobby-host-actions hidden';

  var transferBtn = document.createElement('button');
  transferBtn.className = 'lobby-transfer-btn';
  transferBtn.textContent = '\u{1f511} โอนตำแหน่งโฮสต์';
  transferBtn.addEventListener('click', function () {
    if (typeof options.onTransferHost === 'function') options.onTransferHost();
  });
  hostActions.appendChild(transferBtn);

  // Start button
  var bottomSection = document.createElement('div');
  bottomSection.className = 'lobby-bottom';

  var startBtn = document.createElement('button');
  startBtn.className = 'lobby-start-btn';
  startBtn.textContent = 'เริ่มเกม';
  startBtn.disabled = true;
  startBtn.addEventListener('click', function () {
    if (typeof options.onStart === 'function') options.onStart();
  });
  bottomSection.appendChild(startBtn);

  // Assemble
  container.appendChild(header);
  container.appendChild(roomCodeContainer);
  container.appendChild(playerListContainer);
  container.appendChild(hostActions);
  container.appendChild(bottomSection);

  return {
    setRoomCode: function (code) {
      roomCode.setCode(code);
    },
    updatePlayers: function (players, mySessionId, isHost) {
      playerList.update(players, mySessionId, isHost);
      hostActions.classList.toggle('hidden', !isHost);
    },
    enableStart: function () {
      startBtn.disabled = false;
    },
    disableStart: function () {
      startBtn.disabled = true;
    },
    setHost: function (isHost) {
      hostActions.classList.toggle('hidden', !isHost);
    },
    setGameName: function (name) {
      gameLabel.textContent = name;
    },
  };
}

// ─── renderLobby compatibility shim (Sprint 13 — Issue #13) ─────
// Spy and any callers using the function-form `renderLobby(container, options)`
// API expect a stateless render call. SharedLobby is constructor-based, so we
// memoize one instance per container and translate field-by-field.
//
// Supported options: { roomCode, players, mySessionId, isHost, gameName,
//   maxPlayers, onStart, onKick, onLeave, configHtml }
// Silently ignored: onTransfer, gameType, gameIcon, minPlayers, onConfigChange.
function renderLobby(container, options) {
  options = options || {};
  if (!container) return;

  var instance = container.__sharedLobbyInstance;
  if (!instance) {
    instance = SharedLobby({
      container: container,
      gameName: options.gameName,
      maxPlayers: options.maxPlayers,
      onStart: options.onStart,
      onKick: options.onKick,
      onLeave: options.onLeave,
    });
    container.__sharedLobbyInstance = instance;
  }

  if (typeof options.roomCode !== 'undefined') instance.setRoomCode(options.roomCode);
  if (options.players) instance.updatePlayers(options.players, options.mySessionId, !!options.isHost);
  if (typeof options.isHost === 'boolean') instance.setHost(options.isHost);

  // configHtml: game-specific configuration block injected once after the
  // shared lobby renders. Caller owns the markup; we just place it.
  if (options.configHtml && !container.__configHtmlInjected) {
    var configWrap = document.createElement('div');
    configWrap.className = 'shared-lobby-config';
    configWrap.innerHTML = options.configHtml;
    container.appendChild(configWrap);
    container.__configHtmlInjected = true;
  }
}

// ─── Export for use via script tag ──────────────────────────────
if (typeof window !== 'undefined') {
  window.SharedLobby = SharedLobby;
  window.PlayerList = PlayerList;
  window.RoomCodeDisplay = RoomCodeDisplay;
  window.KickButton = KickButton;
  window.HostBadge = HostBadge;
  window.renderLobby = renderLobby;
}
