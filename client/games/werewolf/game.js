/**
 * game.js -- Werewolf (หมาป่า) client
 *
 * Connects to Colyseus WerewolfRoom via WebSocket.
 * Manages all game screens: home, nickname, lobby, role reveal,
 * night (wolf/seer/doctor/villager), day announce, discussion, vote, game over.
 */
(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────
  var SERVER_URL = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
  var ROOM_NAME = 'werewolf';
  var AVATARS = [
    '\u{1F600}','\u{1F60E}','\u{1F929}','\u{1F608}','\u{1F431}','\u{1F436}','\u{1F98A}','\u{1F438}',
    '\u{1F435}','\u{1F981}','\u{1F43C}','\u{1F428}','\u{1F42F}','\u{1F430}','\u{1F437}','\u{1F42E}',
    '\u{1F414}','\u{1F419}','\u{1F47B}','\u{1F916}','\u{1F47D}','\u{1F383}','\u{1F480}','\u{1F9E0}',
    '\u{1F525}','\u{2B50}','\u{1F48E}','\u{1F308}',
  ];

  var ROLE_DESCRIPTIONS = {
    werewolf: 'คุณเป็นหมาป่า! ร่วมมือกับหมาป่าตัวอื่นเพื่อกินชาวบ้านทุกคืน',
    seer: 'คุณเป็นหมอดู! ทุกคืนคุณสามารถดูบทบาทของผู้เล่นคนหนึ่งได้',
    doctor: 'คุณเป็นหมอ! ทุกคืนคุณสามารถเลือกรักษาผู้เล่นคนหนึ่งได้',
    villager: 'คุณเป็นชาวบ้าน! ช่วยหาตัวหมาป่าแล้วโหวตขับออก',
  };

  // ─── State ────────────────────────────────────────────────────
  var client = null;
  var room = null;
  var mySessionId = null;
  var isHost = false;
  var nickname = '';
  var avatar = '\u{1F600}';
  var pendingAction = null;
  var joinCode = '';
  var reconnectToken = null;

  // Game state
  var myRole = '';
  var myRoleTh = '';
  var myRoleIcon = '';
  var isWerewolf = false;
  var otherWolves = [];
  var currentPhase = '';
  var myIsAlive = true;
  var players = {};
  var hasActedThisNight = false;

  // ─── DOM ──────────────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };

  function showScreen(screenId) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active');
    }
    var target = $('screen-' + screenId);
    if (target) target.classList.add('active');
  }

  function showToast(msg, duration, isError) {
    duration = duration || 2500;
    var container = $('toastContainer');
    var toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function () { toast.remove(); }, duration);
  }

  function formatTime(secs) {
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
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
    if (client) { joinOrCreate(action, code); return; }
    var script = document.createElement('script');
    script.src = '/shared/vendor/colyseus.js@0.15.17.js';
    script.onload = function () {
      if (!ColyseusGuard.verify('werewolf')) return;
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
        body: JSON.stringify({ gameType: 'werewolf' }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.success) { showToast(data.error || 'สร้างห้องไม่ได้', 3000, true); return; }
          joinRoom(data.roomCode);
        })
        .catch(function () { showToast('ข้อผิดพลาดเซิร์ฟเวอร์', 3000, true); });
    } else {
      joinRoom(code || joinCode);
    }
  }

  function joinRoom(roomCode) {
    var opts = {
      nickname: nickname,
      avatar: avatar,
      roomCode: roomCode,
    };
    if (reconnectToken) opts.roomToken = reconnectToken;

    client.joinOrCreate(ROOM_NAME, opts).then(function (r) {
      room = r;
      mySessionId = room.sessionId;
      setupRoomListeners();
      showScreen('lobby');
      if (typeof Onboarding !== 'undefined') Onboarding.tryShow('werewolf');
    }).catch(function (err) {
      showToast('เข้าห้องไม่ได้: ' + (err.message || err), 3000, true);
    });
  }

  // ─── Room Listeners ──────────────────────────────────────────
  function setupRoomListeners() {
    room.onMessage('ROOM_TOKEN', function (msg) {
      reconnectToken = msg.token;
    });

    room.onMessage('ERROR', function (msg) {
      showToast(msg.message || msg.code, 3000, true);
    });

    room.onMessage('KICKED', function () {
      showToast('คุณถูกเตะออกจากห้อง', 3000, true);
      showScreen('home');
    });

    room.onMessage('HOST_TRANSFERRED', function (msg) {
      isHost = (msg.newHostId === mySessionId);
      renderLobby();
    });

    room.onMessage('ROLE_DATA', function (msg) {
      myRole = msg.role;
      myRoleTh = msg.roleTh;
      myRoleIcon = msg.roleIcon;
      isWerewolf = msg.isWerewolf;
      otherWolves = msg.otherWolves || [];
      showRoleReveal();
    });

    room.onMessage('PHASE_CHANGE', function (msg) {
      currentPhase = msg.phase;
      if (msg.phase === 'NIGHT') {
        hasActedThisNight = false;
        showNight(msg);
      } else if (msg.phase === 'DAY_ANNOUNCE') {
        showDayAnnounce(msg);
      } else if (msg.phase === 'DAY_DISCUSSION') {
        showDayDiscussion(msg);
      } else if (msg.phase === 'DAY_DEFENSE') {
        showDayDefense(msg);
      } else if (msg.phase === 'DAY_VOTE') {
        showDayVote(msg);
      } else if (msg.phase === 'SKIP_TO_NIGHT') {
        showToast('ไม่มีการเสนอชื่อ กลับเข้าสู่กลางคืน', 2000);
      }
    });

    room.onMessage('WOLF_VOTE_UPDATE', function (msg) {
      showToast(msg.voterNickname + ' เลือก ' + msg.targetNickname, 2000);
    });

    room.onMessage('SEER_RESULT', function (msg) {
      showSeerResult(msg);
    });

    room.onMessage('DOCTOR_SAVE_CONFIRMED', function (msg) {
      showToast('คุณเลือกรักษา ' + msg.targetNickname, 2000);
    });

    room.onMessage('VOTE_CAST', function (msg) {
      if ($('voteStatus')) {
        $('voteStatus').textContent = 'โหวตแล้ว ' + msg.totalVotesCast + '/' + msg.totalVotersExpected;
      }
    });

    room.onMessage('VOTE_RESULT', function (msg) {
      if (msg.isEliminated) {
        showToast(msg.targetNickname + ' ถูกขับออก!', 3000);
      } else {
        showToast(msg.targetNickname + ' รอดตัว', 2500);
      }
    });

    room.onMessage('PLAYER_ELIMINATED', function (msg) {
      showToast(msg.nickname + ' (' + msg.roleTh + ') ถูกขับออก', 3000);
    });

    room.onMessage('GAME_OVER', function (msg) {
      showGameOver(msg);
    });

    room.onMessage('PLAYER_RECONNECTED', function (msg) {
      showToast(msg.nickname + ' กลับมาแล้ว', 2000);
    });

    // State change listener for lobby updates
    room.onStateChange(function (state) {
      // Update player map
      players = {};
      state.players.forEach(function (p, key) {
        players[key] = {
          id: p.id,
          nickname: p.nickname,
          avatar: p.avatar,
          isHost: p.isHost,
          isAlive: p.isAlive,
          isConnected: p.isConnected,
          score: p.score,
          revealedRole: p.revealedRole,
          hasVoted: p.hasVoted,
        };
        if (key === mySessionId) {
          isHost = p.isHost;
          myIsAlive = p.isAlive;
        }
      });

      if (state.phase === 'LOBBY' || state.phase === 'GAME_OVER') {
        if (state.phase === 'LOBBY') renderLobby();
      }

      // Update timers
      if (state.phase === 'NIGHT' && $('nightTimer')) {
        $('nightTimer').textContent = state.timer;
      }
      if (state.phase === 'DAY_DISCUSSION' && $('dayTimer')) {
        $('dayTimer').textContent = formatTime(state.timer);
      }
      if ((state.phase === 'DAY_VOTE' || state.phase === 'DAY_DEFENSE') && $('voteTimer')) {
        $('voteTimer').textContent = state.timer;
        if (state.phase === 'DAY_DEFENSE' && $('voteStatus')) {
          $('voteStatus').textContent = 'รอผู้ถูกกล่าวหาแก้ตัว... ' + state.timer + ' วินาที';
        }
      }
    });

    room.onLeave(function () {
      showToast('ตัดการเชื่อมต่อ', 3000, true);
      room = null;
    });
  }

  // ─── Lobby Rendering ─────────────────────────────────────────
  function renderLobby() {
    if (!room) return;
    var container = $('lobbyContainer');
    if (!container) return;

    var state = room.state;
    var html = '<div class="lobby-header">';
    html += '<div class="lobby-game-icon">\u{1F43A}</div>';
    html += '<h2 class="lobby-game-title">หมาป่า</h2>';
    html += '<div class="lobby-room-code">ห้อง: <strong>' + state.roomCode + '</strong></div>';
    html += '<div class="lobby-player-count">ผู้เล่น: ' + state.playerCount + '/15 (ขั้นต่ำ 5)</div>';
    html += '<button class="btn-share-room" id="btnShareRoom" style="margin-top:8px;">\u{1f4f1} แชร์ห้อง / Share</button>';
    html += '</div>';

    html += '<div class="lobby-players">';
    state.players.forEach(function (p) {
      html += '<div class="lobby-player' + (!p.isConnected ? ' disconnected' : '') + '">';
      html += '<span class="lobby-player-avatar">' + p.avatar + '</span>';
      html += '<span class="lobby-player-name">' + p.nickname + '</span>';
      if (p.isHost) html += '<span class="lobby-host-badge">\u{1F451}</span>';
      html += '</div>';
    });
    html += '</div>';

    if (isHost) {
      html += '<div class="lobby-host-controls">';
      html += '<button class="btn btn-primary" id="btnStartGame"' +
        (state.playerCount < 5 ? ' disabled style="opacity:0.5"' : '') +
        '>เริ่มเกม</button>';
      html += '</div>';
    } else {
      html += '<div class="lobby-wait-msg">รอเจ้าของห้องเริ่มเกม...</div>';
    }

    container.innerHTML = html;

    if (isHost) {
      var btnStart = $('btnStartGame');
      if (btnStart) {
        btnStart.addEventListener('click', function () {
          room.send('START_GAME');
        });
      }
    }

    // Share room button
    var btnShare = $('btnShareRoom');
    if (btnShare && window.RoomShare) {
      btnShare.addEventListener('click', function () {
        window.RoomShare.showShareModal(state.roomCode);
      });
    }
  }

  // ─── Role Reveal ─────────────────────────────────────────────
  function showRoleReveal() {
    showScreen('roleReveal');
    $('roleRevealIcon').textContent = myRoleIcon;
    $('roleRevealName').textContent = myRoleTh;
    $('roleRevealInfo').textContent = ROLE_DESCRIPTIONS[myRole] || '';

    if (isWerewolf && otherWolves.length > 0) {
      var wolvesDiv = $('roleRevealWolves');
      wolvesDiv.style.display = 'block';
      var wolfNames = otherWolves.map(function (w) { return w.nickname; }).join(', ');
      wolvesDiv.innerHTML = '<p style="font-size:14px;color:var(--ww-wolf);">\u{1F43A} หมาป่าด้วยกัน: ' + wolfNames + '</p>';
    } else {
      $('roleRevealWolves').style.display = 'none';
    }
  }

  // ─── Night Screen ────────────────────────────────────────────
  function showNight(msg) {
    showScreen('night');
    $('nightNumber').textContent = msg.nightNumber || 1;
    $('nightTimer').textContent = msg.timer || 30;

    // Hide all panels first
    $('wolfPanel').style.display = 'none';
    $('seerPanel').style.display = 'none';
    $('doctorPanel').style.display = 'none';
    $('villagerPanel').style.display = 'none';
    $('deadPanel').style.display = 'none';

    if (!myIsAlive) {
      $('deadPanel').style.display = 'block';
      return;
    }

    if (myRole === 'werewolf') {
      $('wolfPanel').style.display = 'block';
      renderWolfTargets();
    } else if (myRole === 'seer') {
      $('seerPanel').style.display = 'block';
      $('seerResult').style.display = 'none';
      renderSeerTargets();
    } else if (myRole === 'doctor') {
      $('doctorPanel').style.display = 'block';
      renderDoctorTargets();
    } else {
      $('villagerPanel').style.display = 'block';
    }
  }

  function renderWolfTargets() {
    var list = $('wolfTargetList');
    list.innerHTML = '';
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p.isAlive || id === mySessionId) return;
      // Don't show other wolves as targets
      var isOtherWolf = otherWolves.some(function (w) { return w.id === id; });
      if (isOtherWolf) return;

      var item = document.createElement('div');
      item.className = 'player-select-item';
      item.innerHTML = '<span class="avatar">' + p.avatar + '</span>' +
        '<span class="name">' + p.nickname + '</span>' +
        '<button class="action-btn">เลือก</button>';
      item.querySelector('.action-btn').addEventListener('click', function () {
        room.send('WOLF_VOTE', { targetId: id });
        hasActedThisNight = true;
        showToast('เลือก ' + p.nickname + ' เป็นเหยื่อ', 2000);
      });
      list.appendChild(item);
    });
  }

  function renderSeerTargets() {
    var list = $('seerTargetList');
    list.innerHTML = '';
    if (hasActedThisNight) {
      list.innerHTML = '<p class="night-waiting">รอจนกว่าจะรุ่งเช้า...</p>';
      return;
    }
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p.isAlive || id === mySessionId) return;

      var item = document.createElement('div');
      item.className = 'player-select-item';
      item.innerHTML = '<span class="avatar">' + p.avatar + '</span>' +
        '<span class="name">' + p.nickname + '</span>' +
        '<button class="action-btn">ดู</button>';
      item.querySelector('.action-btn').addEventListener('click', function () {
        room.send('SEER_PEEK', { targetId: id });
        hasActedThisNight = true;
      });
      list.appendChild(item);
    });
  }

  function showSeerResult(msg) {
    var result = $('seerResult');
    result.style.display = 'block';
    if (msg.isWerewolf) {
      result.className = 'seer-result wolf';
      result.textContent = msg.targetNickname + ' เป็น \u{1F43A} หมาป่า!';
    } else {
      result.className = 'seer-result safe';
      result.textContent = msg.targetNickname + ' ไม่ใช่หมาป่า';
    }
    // Hide target list
    $('seerTargetList').innerHTML = '<p class="night-waiting">รอจนกว่าจะรุ่งเช้า...</p>';
  }

  function renderDoctorTargets() {
    var list = $('doctorTargetList');
    list.innerHTML = '';
    if (hasActedThisNight) {
      list.innerHTML = '<p class="night-waiting">รอจนกว่าจะรุ่งเช้า...</p>';
      return;
    }
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p.isAlive) return;

      var item = document.createElement('div');
      item.className = 'player-select-item';
      item.innerHTML = '<span class="avatar">' + p.avatar + '</span>' +
        '<span class="name">' + p.nickname + (id === mySessionId ? ' (ตัวเอง)' : '') + '</span>' +
        '<button class="action-btn">รักษา</button>';
      item.querySelector('.action-btn').addEventListener('click', function () {
        room.send('DOCTOR_SAVE', { targetId: id });
        hasActedThisNight = true;
        list.innerHTML = '<p class="night-waiting">รอจนกว่าจะรุ่งเช้า...</p>';
      });
      list.appendChild(item);
    });
  }

  // ─── Day Announce ────────────────────────────────────────────
  function showDayAnnounce(msg) {
    showScreen('dayAnnounce');
    var result = $('dayAnnounceResult');
    if (msg.wasSaved) {
      result.innerHTML = '<span class="saved-msg">หมอรักษาเหยื่อได้สำเร็จ!</span><br>ไม่มีใครถูกจับคืนนี้';
    } else if (msg.victimId) {
      result.innerHTML = '<span class="victim-name">' + msg.victimNickname + '</span>ถูกหมาป่าจับไปเมื่อคืนนี้...';
    } else {
      result.innerHTML = 'ไม่มีใครถูกจับเมื่อคืนนี้';
    }
  }

  // ─── Day Discussion ──────────────────────────────────────────
  function showDayDiscussion(msg) {
    showScreen('dayDiscussion');
    $('dayTimer').textContent = formatTime(msg.timer || 90);
    renderAlivePlayers();
    renderNominateTargets();
  }

  function renderAlivePlayers() {
    var grid = $('alivePlayers');
    grid.innerHTML = '';
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      var chip = document.createElement('div');
      chip.className = 'alive-player-chip';
      var label = p.avatar + ' ' + p.nickname;
      if (!p.isAlive) {
        label = '<span class="dead">' + label + '</span>';
        if (p.revealedRole) label += ' (' + p.revealedRole + ')';
      }
      chip.innerHTML = label;
      grid.appendChild(chip);
    });
  }

  function renderNominateTargets() {
    var section = $('nominateSection');
    var list = $('nominateTargetList');
    if (!myIsAlive) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    list.innerHTML = '';
    Object.keys(players).forEach(function (id) {
      var p = players[id];
      if (!p.isAlive || id === mySessionId) return;

      var item = document.createElement('div');
      item.className = 'player-select-item';
      item.innerHTML = '<span class="avatar">' + p.avatar + '</span>' +
        '<span class="name">' + p.nickname + '</span>' +
        '<button class="action-btn">เสนอชื่อ</button>';
      item.querySelector('.action-btn').addEventListener('click', function () {
        room.send('NOMINATE', { targetId: id });
      });
      list.appendChild(item);
    });
  }

  // ─── Day Defense (WW-003.4) ──────────────────────────────────
  function showDayDefense(msg) {
    showScreen('dayVote');
    $('voteTarget').textContent = msg.targetNickname + ' ถูกเสนอชื่อโดย ' + msg.nominatorNickname;
    $('voteStatus').textContent = 'รอผู้ถูกกล่าวหาแก้ตัว... ' + (msg.timer || 30) + ' วินาที';
    $('voteTimer').textContent = msg.timer || 30;

    // Hide vote buttons during defense phase
    var buttons = $('voteButtons');
    buttons.style.display = 'none';
  }

  // ─── Day Vote ────────────────────────────────────────────────
  function showDayVote(msg) {
    showScreen('dayVote');
    $('voteTarget').textContent = msg.targetNickname + ' ถูกเสนอชื่อโดย ' + msg.nominatorNickname;
    $('voteStatus').textContent = 'โหวตแล้ว 0/' + (room ? room.state.totalVotersExpected : '?');
    $('voteTimer').textContent = msg.timer || 30;

    var btnElim = $('btnEliminate');
    var btnSpare = $('btnSpare');
    var buttons = $('voteButtons');

    // If nominated player is me, hide vote buttons
    if (mySessionId === msg.targetId || !myIsAlive) {
      buttons.style.display = 'none';
    } else {
      buttons.style.display = 'flex';
      btnElim.disabled = false;
      btnSpare.disabled = false;

      btnElim.onclick = function () {
        room.send('DAY_VOTE', { vote: 'eliminate' });
        buttons.style.display = 'none';
        showToast('คุณโหวตขับออก', 1500);
      };
      btnSpare.onclick = function () {
        room.send('DAY_VOTE', { vote: 'spare' });
        buttons.style.display = 'none';
        showToast('คุณโหวตยกเว้น', 1500);
      };
    }
  }

  // ─── Game Over ───────────────────────────────────────────────
  function showGameOver(msg) {
    showScreen('gameOver');

    if (msg.winner === 'village') {
      $('gameOverIcon').textContent = '\u{1F9D1}';
      $('gameOverTitle').textContent = 'ชาวบ้านชนะ!';
    } else {
      $('gameOverIcon').textContent = '\u{1F43A}';
      $('gameOverTitle').textContent = 'หมาป่าชนะ!';
    }

    var reasonText = {
      'all_wolves_eliminated': 'หมาป่าทุกตัวถูกจับได้',
      'wolves_outnumber_village': 'หมาป่ามีจำนวนมากกว่าหรือเท่ากับชาวบ้าน',
    };
    $('gameOverReason').textContent = reasonText[msg.reason] || msg.reason;

    // Show all roles
    var rolesDiv = $('gameOverRoles');
    rolesDiv.innerHTML = '';
    var roleCssClass = { werewolf: 'wolf', seer: 'seer', doctor: 'doctor', villager: 'villager' };
    (msg.players || []).forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'gameover-role-item' + (!p.isAlive ? ' dead' : '');
      item.innerHTML = '<span class="avatar">' + (players[p.playerId]?.avatar || '\u{1F9D1}') + '</span>' +
        '<span class="name">' + p.nickname + (!p.isAlive ? ' \u{1F480}' : '') + '</span>' +
        '<span class="role-badge ' + (roleCssClass[p.role] || 'villager') + '">' +
        p.roleIcon + ' ' + p.roleTh + '</span>';
      rolesDiv.appendChild(item);
    });

    // Show kill history
    var historyDiv = $('gameOverHistory');
    if (msg.killHistory && msg.killHistory.length > 0) {
      var histHtml = '<h3>ประวัติ</h3>';
      msg.killHistory.forEach(function (k) {
        if (k.cause === 'no_kill') {
          histHtml += '<div class="gameover-history-item">คืนที่ ' + k.night + ': ไม่มีใครถูกจับ</div>';
        } else if (k.wasSaved) {
          histHtml += '<div class="gameover-history-item">คืนที่ ' + k.night + ': หมอรักษา ' + k.victimNickname + ' สำเร็จ</div>';
        } else if (k.cause === 'wolf_kill') {
          histHtml += '<div class="gameover-history-item">คืนที่ ' + k.night + ': ' + k.victimNickname + ' (' + k.victimRole + ') ถูกจับ</div>';
        } else if (k.cause === 'vote_eliminated') {
          histHtml += '<div class="gameover-history-item">วันที่ ' + k.night + ': ' + k.victimNickname + ' (' + k.victimRole + ') ถูกขับออก</div>';
        }
      });
      historyDiv.innerHTML = histHtml;
    } else {
      historyDiv.innerHTML = '';
    }
  }

  // ─── Event Listeners ─────────────────────────────────────────
  function init() {
    renderAvatarPicker();

    $('btnCreate').addEventListener('click', function () {
      pendingAction = 'create';
      $('joinCodeGroup').style.display = 'none';
      showScreen('nickname');
    });

    $('btnJoin').addEventListener('click', function () {
      pendingAction = 'join';
      $('joinCodeGroup').style.display = 'block';
      showScreen('nickname');
    });

    $('btnBackHome').addEventListener('click', function () {
      showScreen('home');
    });

    $('btnConnect').addEventListener('click', function () {
      nickname = ($('nicknameInput').value || '').trim();
      if (!nickname) { showToast('กรุณาใส่ชื่อ', 2000, true); return; }

      if (pendingAction === 'join') {
        joinCode = ($('joinCodeInput').value || '').trim().toUpperCase();
        if (!joinCode || joinCode.length !== 4) { showToast('กรุณาใส่รหัสห้อง 4 ตัว', 2000, true); return; }
      }

      connectToRoom(pendingAction, joinCode);
    });

    $('btnPlayAgain').addEventListener('click', function () {
      if (room && isHost) {
        room.send('START_GAME');
      } else {
        showToast('รอเจ้าของห้องเริ่มเกมใหม่', 2000);
      }
    });

    // Deep link support: ?join=XXXX
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var deepJoinCode = (urlParams.get('join') || '').trim().toUpperCase();
      if (deepJoinCode && deepJoinCode.length >= 4) {
        pendingAction = 'join';
        joinCode = deepJoinCode;
        $('joinCodeGroup').style.display = 'block';
        $('joinCodeInput').value = deepJoinCode;
        showScreen('nickname');
      }
    } catch (_) { /* URLSearchParams unsupported — fall through to normal home */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
