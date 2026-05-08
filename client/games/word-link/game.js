/**
 * game.js -- Word Link (คำเชื่อม) client
 *
 * Connects to Colyseus WordLinkRoom via WebSocket.
 * Manages all game screens: home, nickname, lobby, team reveal, game, game over.
 */
(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────
  var SERVER_URL = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
  var ROOM_NAME = 'word_link';
  var AVATARS = [
    '😀','😎','🤩','😈','🐱','🐶','🦊','🐸',
    '🐵','🦁','🐼','🐨','🐯','🐰','🐷','🐮',
    '🐔','🐙','👻','🤖','👽','🎃','💀','🧠',
    '🔥','⭐','💎','🌈',
  ];

  // ─── State ────────────────────────────────────────────────────
  var client = null;
  var room = null;
  var mySessionId = null;
  var isHost = false;
  var nickname = '';
  var avatar = '😀';
  var pendingAction = null; // 'create' | 'join'
  var joinCode = '';
  var reconnectToken = null;

  // Game state
  var myTeam = '';
  var myRole = '';
  var colorKey = {}; // index -> color (spymaster only)
  var currentPhase = '';

  // ─── DOM ──────────────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };

  // ─── Screens ──────────────────────────────────────────────────
  function showScreen(screenId) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active');
    }
    var target = $('screen-' + screenId);
    if (target) target.classList.add('active');
  }

  // ─── Toast ────────────────────────────────────────────────────
  function showToast(msg, duration) {
    duration = duration || 2500;
    var container = $('toastContainer');
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function () {
      toast.remove();
    }, duration);
  }

  // ─── Avatar Picker ────────────────────────────────────────────
  function renderAvatarPicker() {
    var picker = $('avatarPicker');
    picker.innerHTML = '';
    AVATARS.forEach(function (a) {
      var btn = document.createElement('div');
      btn.className = 'avatar-option' + (a === avatar ? ' selected' : '');
      btn.textContent = a;
      btn.addEventListener('click', function () {
        avatar = a;
        renderAvatarPicker();
      });
      picker.appendChild(btn);
    });
  }

  // ─── Connection ───────────────────────────────────────────────
  function connectToRoom(action, code) {
    if (client) {
      // Already have a client, just join
      joinOrCreate(action, code);
      return;
    }

    // Dynamic import of Colyseus
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/colyseus.js@0.15.17/dist/colyseus.js';
    script.onload = function () {
      client = new Colyseus.Client(SERVER_URL);
      joinOrCreate(action, code);
    };
    script.onerror = function () {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    };
    document.head.appendChild(script);
  }

  function joinOrCreate(action, code) {
    if (action === 'create') {
      // Create a room via REST API first
      fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'word-link' }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data.success) {
            showToast(data.error || 'ไม่สามารถสร้างห้องได้');
            return;
          }
          joinRoomByCode(data.roomCode);
        })
        .catch(function () {
          showToast('ไม่สามารถสร้างห้องได้');
        });
    } else {
      joinRoomByCode(code);
    }
  }

  function joinRoomByCode(code) {
    client.joinById(code, {
      nickname: nickname,
      avatar: avatar,
      roomCode: code,
    }).catch(function () {
      // Fallback: try joining by room code via matchmaking
      return client.joinOrCreate(ROOM_NAME, {
        nickname: nickname,
        avatar: avatar,
        roomCode: code,
      });
    }).then(function (r) {
      room = r;
      mySessionId = r.sessionId;
      setupRoomListeners();
      showScreen('lobby');
      if (typeof Onboarding !== 'undefined') Onboarding.tryShow('word-link');
      updateLobby();
    }).catch(function (err) {
      showToast('ไม่สามารถเข้าร่วมห้องได้: ' + (err.message || ''));
      showScreen('home');
    });
  }

  // ─── Room Listeners ───────────────────────────────────────────
  function setupRoomListeners() {
    room.onStateChange(function (state) {
      onStateUpdate(state);
    });

    room.onMessage('ROOM_TOKEN', function (msg) {
      reconnectToken = msg.token;
    });

    room.onMessage('COLOR_KEY', function (msg) {
      // Spymaster receives the color key
      colorKey = {};
      msg.cards.forEach(function (c) {
        colorKey[c.index] = c.color;
      });
      renderGrid();
    });

    room.onMessage('CLUE_GIVEN', function (msg) {
      showToast(msg.team === 'red' ? '🔴' : '🔵' + ' ใบ้: ' + msg.word + ' (' + msg.number + ')');
    });

    room.onMessage('CARD_REVEALED', function (msg) {
      // Card reveal animation handled by state change
    });

    room.onMessage('TURN_ENDED', function (msg) {
      var reason = msg.reason === 'timer' ? 'หมดเวลา!' : 'จบตา';
      showToast(reason);
    });

    room.onMessage('TURN_SWITCH', function () {
      // Handled by state change
    });

    room.onMessage('PHASE_CHANGE', function () {
      // Handled by state change
    });

    room.onMessage('GAME_OVER', function (msg) {
      var winnerLabel = msg.winner === 'red' ? 'ทีมแดง' : 'ทีมน้ำเงิน';
      var reason = msg.reason === 'assassin' ? 'เปิดการ์ดสายลับ!' : 'เปิดครบทุกคำ!';
      showToast(winnerLabel + ' ชนะ! ' + reason, 4000);
    });

    room.onMessage('ERROR', function (msg) {
      showToast(msg.message || 'เกิดข้อผิดพลาด');
    });

    room.onMessage('KICKED', function () {
      showToast('คุณถูกเตะออกจากห้อง');
      room = null;
      showScreen('home');
    });

    room.onMessage('HOST_TRANSFERRED', function () {
      // Handled by state change
    });

    room.onLeave(function () {
      room = null;
      showScreen('home');
    });
  }

  // ─── State Updates ────────────────────────────────────────────
  function onStateUpdate(state) {
    var phase = state.phase;

    // Update my player info
    var myPlayer = null;
    state.players.forEach(function (p) {
      if (p.id === mySessionId) {
        myPlayer = p;
        isHost = p.isHost;
        myTeam = p.team || '';
        myRole = p.role || '';
      }
    });

    if (phase !== currentPhase) {
      currentPhase = phase;
      onPhaseChange(phase, state);
    }

    // Update screen content based on current phase
    if (phase === 'LOBBY') {
      updateLobby();
    } else if (phase === 'CLUE_GIVING' || phase === 'GUESSING') {
      updateGameScreen(state);
    } else if (phase === 'GAME_OVER') {
      updateGameOver(state);
    }
  }

  function onPhaseChange(phase, state) {
    if (phase === 'LOBBY') {
      showScreen('lobby');
    } else if (phase === 'TEAM_REVEAL') {
      showScreen('teamReveal');
      updateTeamReveal();
    } else if (phase === 'CLUE_GIVING' || phase === 'GUESSING') {
      showScreen('game');
      updateGameScreen(state);
    } else if (phase === 'GAME_OVER') {
      showScreen('gameover');
      updateGameOver(state);
    }
  }

  // ─── Lobby ────────────────────────────────────────────────────
  var lobbyComponent = null;

  function updateLobby() {
    if (!room) return;
    var state = room.state;

    if (!lobbyComponent) {
      lobbyComponent = window.SharedLobby({
        container: $('lobbyContainer'),
        gameName: 'คำเชื่อม',
        maxPlayers: 10,
        onKick: function (playerId) {
          room.send('KICK_PLAYER', { targetPlayerId: playerId });
        },
        onStart: function () {
          room.send('START_GAME');
        },
        onLeave: function () {
          room.leave();
          room = null;
          showScreen('home');
        },
      });
    }

    lobbyComponent.setRoomCode(state.roomCode);

    // Inject share button if not already added
    if (!$('btnShareRoom') && window.RoomShare) {
      var roomCodeSection = $('lobbyContainer').querySelector('.shared-room-code');
      if (roomCodeSection) {
        var shareBtn = document.createElement('button');
        shareBtn.id = 'btnShareRoom';
        shareBtn.className = 'btn-share-room';
        shareBtn.textContent = '\u{1f4f1} แชร์ห้อง / Share'; // 📱 แชร์ห้อง / Share
        shareBtn.addEventListener('click', function () {
          var code = state.roomCode || '';
          if (code) window.RoomShare.showShareModal(code);
        });
        roomCodeSection.appendChild(shareBtn);
      }
    }

    var players = [];
    state.players.forEach(function (p) {
      players.push({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        isHost: p.isHost,
        isConnected: p.isConnected,
      });
    });

    lobbyComponent.updatePlayers(players, mySessionId, isHost);

    if (isHost && players.length >= 4) {
      lobbyComponent.enableStart();
    } else {
      lobbyComponent.disableStart();
    }
  }

  // ─── Team Reveal ──────────────────────────────────────────────
  function updateTeamReveal() {
    var roleIcon = myRole === 'spymaster' ? '🧠' : '🎯';
    var roleLabel = myRole === 'spymaster' ? 'หัวหน้าทีม (Spymaster)' : 'ผู้ทาย (Guesser)';

    $('teamRevealRole').textContent = roleIcon;
    $('teamRevealLabel').textContent = roleLabel;

    var teamEl = $('teamRevealTeam');
    teamEl.textContent = myTeam === 'red' ? 'ทีมแดง' : 'ทีมน้ำเงิน';
    teamEl.className = 'team-reveal-team ' + myTeam;

    var descText = myRole === 'spymaster'
      ? 'คุณจะเห็นสีของทุกการ์ด ใบ้คำให้ทีมทาย!'
      : 'ทายการ์ดตามคำใบ้ของหัวหน้าทีม!';
    $('teamRevealDesc').textContent = descText;
  }

  // ─── Game Screen ──────────────────────────────────────────────
  function updateGameScreen(state) {
    if (!state) return;

    // Score badges
    $('redScore').textContent = '🔴 ' + (9 - state.redRemaining) + '/9';
    $('blueScore').textContent = '🔵 ' + (8 - state.blueRemaining) + '/8';

    // Turn indicator
    var turnEl = $('turnIndicator');
    var teamLabel = state.currentTeam === 'red' ? 'ทีมแดง' : 'ทีมน้ำเงิน';

    if (state.phase === 'CLUE_GIVING') {
      turnEl.textContent = teamLabel + ' — กำลังใบ้คำ...';
    } else if (state.phase === 'GUESSING') {
      turnEl.textContent = teamLabel + ' — กำลังทาย...';
    }
    turnEl.className = 'turn-indicator ' + state.currentTeam + '-turn';

    // Timer
    var timerEl = $('timerBadge');
    if (state.turnTimer > 0) {
      timerEl.textContent = '⏱ ' + state.turnTimer + 's';
      timerEl.style.display = '';
    } else {
      timerEl.style.display = 'none';
    }

    // Clue display
    updateClueDisplay(state);

    // Grid
    renderGrid();

    // Clue input (spymaster on their turn)
    updateClueInput(state);

    // End turn button
    updateEndTurnButton(state);
  }

  function updateClueDisplay(state) {
    var container = $('clueDisplay');
    if (state.currentClue) {
      container.innerHTML =
        '<span class="clue-word">' + escapeHtml(state.currentClue.word) + '</span>' +
        '<span class="clue-number">' + state.currentClue.number + '</span>' +
        '<span class="clue-status">(' + state.currentClue.guessesUsed + '/' + state.currentClue.maxGuesses + ')</span>';
    } else if (state.phase === 'CLUE_GIVING') {
      var label = state.currentTeam === 'red' ? 'ทีมแดง' : 'ทีมน้ำเงิน';
      container.innerHTML = '<span class="clue-status">รอหัวหน้า' + label + 'ใบ้คำ...</span>';
    } else {
      container.innerHTML = '';
    }
  }

  function renderGrid() {
    if (!room) return;
    var grid = $('wordGrid');
    var state = room.state;

    grid.innerHTML = '';

    var isMyTurn = state.currentTeam === myTeam;
    var canGuess = isMyTurn && myRole === 'guesser' && state.phase === 'GUESSING';

    for (var i = 0; i < state.grid.length; i++) {
      var card = state.grid[i];
      var el = document.createElement('div');
      el.className = 'word-card';
      el.textContent = card.word;
      el.dataset.index = i;

      if (card.revealed) {
        el.classList.add('revealed');
        el.classList.add('color-' + card.revealedColor);
      } else {
        // Spymaster sees color borders
        if (myRole === 'spymaster' && colorKey[i]) {
          el.classList.add('sm-' + colorKey[i]);
        }

        if (canGuess) {
          el.addEventListener('click', onCardClick);
        } else {
          el.classList.add('disabled');
        }
      }

      grid.appendChild(el);
    }
  }

  function onCardClick(e) {
    var index = parseInt(e.currentTarget.dataset.index, 10);
    if (isNaN(index)) return;
    room.send('GUESS_CARD', { index: index });
  }

  function updateClueInput(state) {
    var section = $('clueInputSection');
    var isMyCluePhase = state.phase === 'CLUE_GIVING' &&
                        myRole === 'spymaster' &&
                        state.currentTeam === myTeam;

    if (isMyCluePhase) {
      section.classList.add('active');
    } else {
      section.classList.remove('active');
    }
  }

  function updateEndTurnButton(state) {
    var btn = $('endTurnBtn');
    var canEnd = state.phase === 'GUESSING' && state.currentTeam === myTeam;
    btn.disabled = !canEnd;
    btn.style.display = (state.phase === 'GUESSING') ? '' : 'none';
  }

  function submitClue() {
    var wordInput = $('clueWordInput');
    var numberInput = $('clueNumberInput');

    var word = (wordInput.value || '').trim();
    var num = parseInt(numberInput.value, 10) || 0;

    if (!word) {
      showToast('กรุณาใส่คำใบ้');
      return;
    }

    room.send('GIVE_CLUE', { word: word, number: num });
    wordInput.value = '';
    numberInput.value = '';
  }

  // ─── Game Over ────────────────────────────────────────────────
  function updateGameOver(state) {
    if (!state) return;

    var isWinner = state.winner === myTeam;
    $('gameoverIcon').textContent = isWinner ? '🎉' : '😢';
    $('gameoverTitle').textContent = (state.winner === 'red' ? 'ทีมแดง' : 'ทีมน้ำเงิน') + ' ชนะ!';

    var reason = state.winReason === 'assassin'
      ? 'เปิดการ์ดสายลับ — แพ้ทันที!'
      : 'เปิดครบทุกคำ!';
    $('gameoverReason').textContent = reason;

    // Render revealed grid
    var gridEl = $('gameoverGrid');
    gridEl.innerHTML = '';

    for (var i = 0; i < state.grid.length; i++) {
      var card = state.grid[i];
      var el = document.createElement('div');
      el.className = 'gameover-card color-' + card.revealedColor;
      el.textContent = card.word;
      gridEl.appendChild(el);
    }
  }

  // ─── Utilities ────────────────────────────────────────────────
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Event Bindings ───────────────────────────────────────────
  function init() {
    // Home screen
    $('btnCreate').addEventListener('click', function () {
      pendingAction = 'create';
      showScreen('nickname');
      renderAvatarPicker();
    });

    $('btnJoin').addEventListener('click', function () {
      pendingAction = 'join';
      showScreen('nickname');
      renderAvatarPicker();
      $('joinCodeGroup').style.display = 'block';
    });

    $('btnBackHome').addEventListener('click', function () {
      showScreen('home');
      $('joinCodeGroup').style.display = 'none';
    });

    // Nickname screen
    $('btnConnect').addEventListener('click', function () {
      nickname = ($('nicknameInput').value || '').trim().slice(0, 15) || 'ผู้เล่น';
      joinCode = ($('joinCodeInput').value || '').trim().toUpperCase();

      if (pendingAction === 'join' && !joinCode) {
        showToast('กรุณาใส่รหัสห้อง');
        return;
      }

      connectToRoom(pendingAction, joinCode);
    });

    // Clue submission
    $('clueSubmitBtn').addEventListener('click', submitClue);
    $('clueWordInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitClue();
    });

    // End turn
    $('endTurnBtn').addEventListener('click', function () {
      if (room) room.send('END_TURN');
    });

    // Game over buttons
    $('btnPlayAgain').addEventListener('click', function () {
      if (room) {
        room.send('START_GAME');
      }
    });

    $('btnBackToHome').addEventListener('click', function () {
      if (room) room.leave();
      window.location.href = '/';
    });

    // Back to home from game (header)
    $('btnLeaveGame').addEventListener('click', function () {
      if (room) room.leave();
      room = null;
      showScreen('home');
    });

    // Check for join code in URL
    var params = new URLSearchParams(window.location.search);
    var urlCode = params.get('join');
    if (urlCode) {
      pendingAction = 'join';
      joinCode = urlCode.toUpperCase();
      showScreen('nickname');
      renderAvatarPicker();
      $('joinCodeGroup').style.display = 'block';
      $('joinCodeInput').value = joinCode;
    }
  }

  // ─── Start ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
