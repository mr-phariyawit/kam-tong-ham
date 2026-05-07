/**
 * game.js -- Spy (สายลับ) client
 *
 * Connects to Colyseus SpyRoom via WebSocket.
 * Manages all game screens: home, nickname, lobby, role reveal, discussion, voting, spy guess, game over.
 */
(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────
  var SERVER_URL = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
  var ROOM_NAME = 'spy';
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
  var pendingAction = null;
  var joinCode = '';
  var reconnectToken = null;

  // Game state
  var isSpy = false;
  var myRole = '';
  var myLocation = null;
  var locationList = [];
  var currentPhase = '';
  var selectedGuessId = null;

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
  function showToast(msg, duration, isError) {
    duration = duration || 2500;
    var container = $('toastContainer');
    var toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function () { toast.remove(); }, duration);
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
      joinOrCreate(action, code);
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://unpkg.com/colyseus.js@0.15/dist/colyseus.js';
    script.onload = function () {
      client = new Colyseus.Client(SERVER_URL);
      joinOrCreate(action, code);
    };
    script.onerror = function () {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 3000, true);
    };
    document.head.appendChild(script);
  }

  function joinOrCreate(action, code) {
    if (action === 'create') {
      fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'spy' }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data.success) {
            showToast(data.error || 'ไม่สามารถสร้างห้องได้', 3000, true);
            return;
          }
          joinRoomByCode(data.roomCode);
        })
        .catch(function () {
          showToast('ไม่สามารถสร้างห้องได้', 3000, true);
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
      if (typeof Onboarding !== 'undefined') Onboarding.tryShow('spy');
      updateLobby();
    }).catch(function (err) {
      showToast('ไม่สามารถเข้าร่วมห้องได้: ' + (err.message || ''), 3000, true);
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

    room.onMessage('ROLE_DATA', function (msg) {
      isSpy = msg.isSpy;
      myLocation = msg.location;
      myRole = msg.role || '';
      renderRoleReveal();
    });

    room.onMessage('PHASE_CHANGE', function (msg) {
      if (msg.phase === 'DISCUSSION') {
        showScreen('game');
      } else if (msg.phase === 'SPY_GUESS') {
        if (isSpy) {
          renderSpyGuessScreen();
          showScreen('spyGuess');
        } else {
          showToast('เวลาหมด! รอสายลับเดาสถานที่...');
        }
      }
    });

    room.onMessage('ACCUSATION_STARTED', function (msg) {
      renderVotingScreen(msg);
      showScreen('voting');
    });

    room.onMessage('VOTE_CAST', function (msg) {
      $('voteTally').textContent = 'โหวตแล้ว ' + msg.totalVotesCast + '/' + msg.totalVotersExpected;
    });

    room.onMessage('VOTE_RESULT', function (msg) {
      if (msg.isGuilty) {
        showToast(msg.accusedNickname + ' ถูกโหวตว่าเป็นสายลับ!');
      } else {
        showToast(msg.accusedNickname + ' รอดไป!');
        showScreen('game');
      }
    });

    room.onMessage('GAME_OVER', function (msg) {
      renderGameOver(msg);
      showScreen('gameover');
    });

    room.onMessage('ERROR', function (msg) {
      showToast(msg.message || 'เกิดข้อผิดพลาด', 3000, true);
    });

    room.onMessage('HOST_TRANSFERRED', function (msg) {
      showToast(msg.newHostNickname + ' เป็นเจ้าของห้องใหม่');
    });

    room.onMessage('KICKED', function () {
      showToast('คุณถูกเตะออกจากห้อง', 3000, true);
      showScreen('home');
      room = null;
    });

    room.onMessage('ROOM_EXPIRED', function () {
      showToast('ห้องหมดเวลา', 3000, true);
      showScreen('home');
      room = null;
    });

    room.onMessage('PLAYER_RECONNECTED', function (msg) {
      showToast(msg.nickname + ' กลับเข้ามาแล้ว');
    });

    room.onLeave(function () {
      if (currentPhase !== 'GAME_OVER') {
        showToast('ตัดการเชื่อมต่อ');
        showScreen('home');
      }
      room = null;
    });

    room.onError(function (code, message) {
      showToast('ข้อผิดพลาด: ' + (message || code), 3000, true);
    });
  }

  // ─── State Update ─────────────────────────────────────────────
  function onStateUpdate(state) {
    var prevPhase = currentPhase;
    currentPhase = state.phase;

    // Update host status
    var me = null;
    state.players.forEach(function (p) {
      if (p.id === mySessionId) me = p;
    });
    isHost = me ? me.isHost : false;

    // Phase transitions
    if (currentPhase === 'LOBBY') {
      updateLobby();
    } else if (currentPhase === 'ROLE_REVEAL' && prevPhase !== 'ROLE_REVEAL') {
      showScreen('roleReveal');
    } else if (currentPhase === 'DISCUSSION') {
      updateGameScreen(state);
    } else if (currentPhase === 'VOTING') {
      updateVotingTally(state);
    } else if (currentPhase === 'GAME_OVER') {
      // handled by GAME_OVER message
    }

    // Cache location list
    if (state.locationList && state.locationList.length > 0) {
      locationList = [];
      state.locationList.forEach(function (loc) {
        locationList.push({ id: loc.id, name: loc.name, icon: loc.icon });
      });
    }
  }

  // ─── Lobby ────────────────────────────────────────────────────
  function updateLobby() {
    if (!room || !room.state) return;
    var state = room.state;

    // Use shared lobby component
    if (typeof window.renderLobby === 'function') {
      window.renderLobby($('lobbyContainer'), {
        roomCode: state.roomCode,
        players: state.players,
        mySessionId: mySessionId,
        isHost: isHost,
        gameType: 'spy',
        gameName: 'สายลับ',
        gameIcon: '🕵️',
        minPlayers: 3,
        maxPlayers: 8,
        onStart: function () { room.send('START_GAME'); },
        onKick: function (playerId) { room.send('KICK_PLAYER', { targetPlayerId: playerId }); },
        onTransfer: function (playerId) { room.send('TRANSFER_HOST', { targetPlayerId: playerId }); },
        configHtml: renderConfigPanel(),
        onConfigChange: function (key, value) {
          if (key === 'timer') {
            room.send('UPDATE_CONFIG', { timerSetting: parseInt(value) });
          }
        },
      });
    }

    if (currentPhase === 'LOBBY') {
      showScreen('lobby');
    }
  }

  function renderConfigPanel() {
    if (!isHost) return '';
    var timerSetting = room && room.state ? room.state.timerSetting : 480;

    return '<div style="margin-top:12px;text-align:center;">' +
      '<label style="font-size:13px;color:var(--spy-text-secondary);">เวลาเกม</label><br>' +
      '<select id="configTimer" style="margin-top:4px;padding:6px 12px;border-radius:8px;border:none;background:var(--spy-surface-light,#2A3E2C);color:var(--spy-text,#E8F5E9);font-size:14px;font-family:Sarabun,sans-serif;">' +
      '<option value="300"' + (timerSetting === 300 ? ' selected' : '') + '>5 นาที</option>' +
      '<option value="360"' + (timerSetting === 360 ? ' selected' : '') + '>6 นาที</option>' +
      '<option value="420"' + (timerSetting === 420 ? ' selected' : '') + '>7 นาที</option>' +
      '<option value="480"' + (timerSetting === 480 ? ' selected' : '') + '>8 นาที</option>' +
      '</select></div>';
  }

  // ─── Role Reveal ──────────────────────────────────────────────
  function renderRoleReveal() {
    if (isSpy) {
      $('roleRevealIcon').textContent = '🕵️';
      $('roleRevealTitle').textContent = 'คุณคือสายลับ!';
      $('roleRevealTitle').style.color = 'var(--spy-danger)';
      $('roleRevealSubtitle').textContent = 'คุณไม่รู้สถานที่ ต้องแกล้งทำเป็นรู้!';
      $('roleRevealLocation').textContent = '???';
      $('roleRevealLocation').style.color = 'var(--spy-danger)';
      $('roleRevealRole').textContent = 'ฟังคำถามดีๆ แล้วเดาสถานที่';
    } else {
      $('roleRevealIcon').textContent = myLocation ? myLocation.icon : '📍';
      $('roleRevealTitle').textContent = 'บทบาทของคุณ';
      $('roleRevealTitle').style.color = '';
      $('roleRevealSubtitle').textContent = 'คุณรู้สถานที่! หาสายลับให้เจอ';
      $('roleRevealLocation').textContent = myLocation ? myLocation.name : '';
      $('roleRevealLocation').style.color = '';
      $('roleRevealRole').textContent = 'ตำแหน่ง: ' + myRole;
    }
    showScreen('roleReveal');
  }

  // ─── Game Screen ──────────────────────────────────────────────
  function updateGameScreen(state) {
    // Timer
    var timer = state.timer || 0;
    var min = Math.floor(timer / 60);
    var sec = timer % 60;
    var timerBadge = $('timerBadge');
    timerBadge.textContent = min + ':' + (sec < 10 ? '0' : '') + sec;
    timerBadge.className = 'timer-badge' + (timer <= 60 ? ' warning' : '');

    // Your role
    var roleBadge = $('yourRoleBadge');
    var roleName = $('yourRoleName');
    if (isSpy) {
      roleBadge.className = 'your-role-badge is-spy';
      roleName.textContent = '🕵️ สายลับ';
    } else {
      roleBadge.className = 'your-role-badge';
      roleName.textContent = (myLocation ? myLocation.icon + ' ' : '') + myRole;
    }

    // Spy guess button
    var btnSpyGuess = $('btnSpyGuess');
    if (isSpy && state.phase === 'DISCUSSION') {
      btnSpyGuess.style.display = '';
    } else {
      btnSpyGuess.style.display = 'none';
    }

    // Location list
    renderLocationGrid();

    // Player list
    renderPlayerList(state);

    if (currentPhase === 'DISCUSSION') {
      showScreen('game');
    }
  }

  function renderLocationGrid() {
    var grid = $('locationGrid');
    grid.innerHTML = '';

    for (var i = 0; i < locationList.length; i++) {
      var loc = locationList[i];
      var card = document.createElement('div');
      card.className = 'location-card';
      if (myLocation && myLocation.id === loc.id) {
        card.className += ' highlight';
      }
      card.innerHTML = '<span class="loc-icon">' + loc.icon + '</span><span class="loc-name">' + loc.name + '</span>';
      grid.appendChild(card);
    }
  }

  function renderPlayerList(state) {
    var list = $('playerList');
    list.innerHTML = '';

    state.players.forEach(function (p) {
      if (!p.isConnected || p.id === mySessionId) return;

      var chip = document.createElement('div');
      chip.className = 'player-chip accusable';
      chip.innerHTML = '<span class="chip-avatar">' + p.avatar + '</span>' + p.nickname;
      chip.addEventListener('click', function () {
        if (state.phase === 'DISCUSSION') {
          if (confirm('กล่าวหาว่า ' + p.nickname + ' เป็นสายลับ?')) {
            room.send('ACCUSE', { targetPlayerId: p.id });
          }
        }
      });
      list.appendChild(chip);
    });
  }

  // ─── Voting Screen ────────────────────────────────────────────
  function renderVotingScreen(msg) {
    $('voteTitle').textContent = msg.accuserNickname + ' กล่าวหาว่า...';
    $('voteTarget').textContent = msg.targetNickname + ' เป็นสายลับ!';
    $('voteTally').textContent = 'โหวตแล้ว 0/' + (room.state.totalVotersExpected || '?');

    var btnGuilty = $('btnVoteGuilty');
    var btnInnocent = $('btnVoteInnocent');
    var voteButtons = $('voteButtons');

    // If I'm the accused, I can't vote
    if (mySessionId === msg.targetId) {
      voteButtons.innerHTML = '<p style="color:var(--spy-text-secondary);">คุณถูกกล่าวหา รอผลโหวต...</p>';
    } else {
      btnGuilty.disabled = false;
      btnInnocent.disabled = false;
      voteButtons.innerHTML = '';
      voteButtons.appendChild(btnGuilty);
      voteButtons.appendChild(btnInnocent);
    }
  }

  function updateVotingTally(state) {
    $('voteTally').textContent = 'โหวตแล้ว ' + state.totalVotesCast + '/' + state.totalVotersExpected;
  }

  // ─── Spy Guess Screen ─────────────────────────────────────────
  function renderSpyGuessScreen() {
    selectedGuessId = null;
    var grid = $('spyGuessGrid');
    grid.innerHTML = '';

    var confirmBtn = $('btnConfirmGuess');
    confirmBtn.disabled = true;

    if (!isSpy) {
      $('spyGuessSubtitle').textContent = 'รอสายลับเดาสถานที่...';
      return;
    }

    $('spyGuessSubtitle').textContent = 'เลือกสถานที่ที่คุณคิดว่าถูก';

    for (var i = 0; i < locationList.length; i++) {
      var loc = locationList[i];
      var card = document.createElement('div');
      card.className = 'location-card';
      card.dataset.id = loc.id;
      card.innerHTML = '<span class="loc-icon">' + loc.icon + '</span><span class="loc-name">' + loc.name + '</span>';
      (function (locId, cardEl) {
        cardEl.addEventListener('click', function () {
          selectedGuessId = locId;
          var allCards = grid.querySelectorAll('.location-card');
          for (var j = 0; j < allCards.length; j++) {
            allCards[j].classList.remove('selected');
          }
          cardEl.classList.add('selected');
          confirmBtn.disabled = false;
        });
      })(loc.id, card);
      grid.appendChild(card);
    }
  }

  // ─── Game Over ────────────────────────────────────────────────
  function renderGameOver(msg) {
    var isSpyWin = msg.winner === 'spy';
    $('gameoverIcon').textContent = isSpyWin ? '🕵️' : '🎉';

    if (isSpyWin) {
      $('gameoverTitle').textContent = 'สายลับชนะ!';
      $('gameoverTitle').style.color = 'var(--spy-danger)';
    } else {
      $('gameoverTitle').textContent = 'จับสายลับได้!';
      $('gameoverTitle').style.color = 'var(--spy-accent)';
    }

    // Reason
    var reasons = {
      'caught': 'โหวตจับสายลับสำเร็จ',
      'caught_unanimous': 'โหวตจับสายลับเป็นเอกฉันท์!',
      'wrong_accusation': 'กล่าวหาผิดคน! สายลับรอดไป',
      'correct_guess': 'สายลับเดาสถานที่ถูกต้อง!',
      'wrong_guess': 'สายลับเดาสถานที่ผิด!',
      'time_expired': 'หมดเวลา! สายลับรอดไป',
      'spy_disconnected': 'สายลับหลุดออกจากเกม',
    };
    $('gameoverReason').textContent = reasons[msg.reason] || msg.reason;

    // Location reveal
    $('gameoverLocation').textContent = msg.location ? (msg.location.icon + ' ' + msg.location.name) : '';
    $('gameoverSpy').textContent = 'สายลับ: ' + msg.spyNickname;

    // Spy guess
    if (msg.spyGuess) {
      var guessLoc = locationList.find(function (l) { return l.id === msg.spyGuess; });
      if (guessLoc) {
        $('gameoverReason').textContent += ' (เดา: ' + guessLoc.name + ')';
      }
    }

    // Roles
    var rolesDiv = $('gameoverRoles');
    rolesDiv.innerHTML = '';
    if (msg.roles) {
      msg.roles.forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'gameover-role-row' + (r.isSpy ? ' is-spy' : '');
        row.innerHTML =
          '<span class="gameover-role-name">' + r.nickname + '</span>' +
          '<span class="gameover-role-role">' + (r.isSpy ? '🕵️ สายลับ' : r.role) + '</span>';
        rolesDiv.appendChild(row);
      });
    }
  }

  // ─── Format Timer ─────────────────────────────────────────────
  function formatTimer(secs) {
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ─── Event Handlers ───────────────────────────────────────────
  function init() {
    renderAvatarPicker();

    // Home buttons
    $('btnCreate').addEventListener('click', function () {
      pendingAction = 'create';
      $('joinCodeGroup').style.display = 'none';
      showScreen('nickname');
    });

    $('btnJoin').addEventListener('click', function () {
      pendingAction = 'join';
      $('joinCodeGroup').style.display = '';
      showScreen('nickname');
    });

    $('btnBackHome').addEventListener('click', function () {
      showScreen('home');
    });

    // Connect
    $('btnConnect').addEventListener('click', function () {
      nickname = $('nicknameInput').value.trim() || 'ผู้เล่น';
      if (pendingAction === 'join') {
        joinCode = $('joinCodeInput').value.trim().toUpperCase();
        if (joinCode.length !== 4) {
          showToast('กรุณาใส่รหัสห้อง 4 ตัวอักษร', 2000, true);
          return;
        }
      }
      connectToRoom(pendingAction, joinCode);
    });

    // Leave game
    $('btnLeaveGame').addEventListener('click', function () {
      if (room) room.leave();
      showScreen('home');
    });

    // Spy guess button (during discussion)
    $('btnSpyGuess').addEventListener('click', function () {
      renderSpyGuessScreen();
      showScreen('spyGuess');
    });

    // Confirm spy guess
    $('btnConfirmGuess').addEventListener('click', function () {
      if (selectedGuessId && room) {
        room.send('SPY_GUESS', { locationId: selectedGuessId });
      }
    });

    // Vote buttons
    $('btnVoteGuilty').addEventListener('click', function () {
      if (room) {
        room.send('VOTE', { vote: 'guilty' });
        $('btnVoteGuilty').disabled = true;
        $('btnVoteInnocent').disabled = true;
      }
    });

    $('btnVoteInnocent').addEventListener('click', function () {
      if (room) {
        room.send('VOTE', { vote: 'innocent' });
        $('btnVoteGuilty').disabled = true;
        $('btnVoteInnocent').disabled = true;
      }
    });

    // Play again
    $('btnPlayAgain').addEventListener('click', function () {
      if (room) {
        room.send('START_GAME');
      }
    });

    // Back to home from game over
    $('btnBackToHome').addEventListener('click', function () {
      if (room) room.leave();
      showScreen('home');
    });

    // Config change listener (delegated)
    document.addEventListener('change', function (e) {
      if (e.target.id === 'configTimer' && room) {
        room.send('UPDATE_CONFIG', { timerSetting: parseInt(e.target.value) });
      }
    });
  }

  // ─── Boot ─────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
