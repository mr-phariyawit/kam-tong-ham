/**
 * app.js — Main game client for "คำต้องห้าม" Thai party game
 * Connects to Colyseus server and manages all 8 game screens.
 */
(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────
  const SERVER_URL = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
  const ROOM_NAME = 'kham_tong_ham';
  const AVATARS = [
    '😀','😎','🤩','😈','🐱','🐶','🦊','🐸',
    '🐵','🦁','🐼','🐨','🐯','🐰','🐷','🐮',
    '🐔','🐙','👻','🤖','👽','🎃','💀','🧠',
    '🔥','⭐','💎','🌈',
  ];
  const CATEGORIES = [
    { id: 'common',   label: '💬 คำทั่วไป',     desc: 'คำที่ใช้ในชีวิตประจำวัน' },
    { id: 'food',     label: '🍜 อาหาร',        desc: 'อาหารไทยและต่างประเทศ' },
    { id: 'animals',  label: '🐘 สัตว์',         desc: 'สัตว์ทุกชนิด' },
    { id: 'jobs',     label: '👨‍⚕️ อาชีพ',       desc: 'อาชีพต่างๆ' },
    { id: 'places',   label: '🏛️ สถานที่',       desc: 'สถานที่ในไทยและทั่วโลก' },
    { id: 'emotions', label: '😊 อารมณ์',        desc: 'คำเกี่ยวกับอารมณ์ความรู้สึก' },
    { id: 'sports',   label: '⚽ กีฬา',          desc: 'กีฬาทุกประเภท' },
    { id: 'colors',   label: '🎨 สี',            desc: 'สีต่างๆ' },
    { id: 'body',     label: '🦷 ร่างกาย',       desc: 'อวัยวะและส่วนต่างๆ ของร่างกาย' },
    { id: 'family',   label: '👨‍👩‍👧 ครอบครัว',   desc: 'คำเกี่ยวกับครอบครัวและความสัมพันธ์' },
  ];

  // ─── State ────────────────────────────────────────────────────
  let client = null;
  let room = null;
  let mySessionId = null;
  let myWord = '';
  let isHost = false;
  let currentPhase = '';
  let localTimerInterval = null;
  let voteProgressInterval = null;
  let localTimerValue = 0;
  let hasVoted = false;
  let hasGuessed = false;
  let nickname = '';
  let avatar = '😀';
  let pendingAction = null; // 'create' | 'join'
  let joinCode = '';
  let reconnectToken = null;

  // ─── DOM Cache ────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  const screens = {
    home:       $('screen-home'),
    lobby:      $('screen-lobby'),
    playing:    $('screen-playing'),
    voting:     $('screen-voting'),
    guess:      $('screen-guess'),
    roundend:   $('screen-roundend'),
    scoreboard: $('screen-scoreboard'),
    gameover:   $('screen-gameover'),
  };

  // ─── Screen Manager ───────────────────────────────────────────
  function showScreen(name) {
    Object.values(screens).forEach((el) => {
      if (el) el.classList.remove('active');
    });
    const target = screens[name];
    if (target) target.classList.add('active');
  }

  // ─── Utilities ────────────────────────────────────────────────
  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern || 30);
    } catch (_) { /* non-critical */ }
  }

  function showToast(message, duration) {
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration || 2500);
  }

  function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startLocalTimer(initialValue, displayEl, onTick) {
    stopLocalTimer();
    localTimerValue = initialValue;
    if (displayEl) displayEl.textContent = formatTime(localTimerValue);
    localTimerInterval = setInterval(() => {
      localTimerValue--;
      if (localTimerValue < 0) localTimerValue = 0;
      if (displayEl) displayEl.textContent = formatTime(localTimerValue);
      if (onTick) onTick(localTimerValue);
      if (localTimerValue <= 0) stopLocalTimer();
    }, 1000);
  }

  function stopLocalTimer() {
    if (localTimerInterval) {
      clearInterval(localTimerInterval);
      localTimerInterval = null;
    }
  }

  function getRankEmoji(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '#' + rank;
  }

  function getPlayersArray() {
    if (!room || !room.state || !room.state.players) return [];
    var arr = [];
    room.state.players.forEach(function (player) {
      arr.push(player);
    });
    return arr;
  }

  function getPlayersSortedByScore() {
    return getPlayersArray().slice().sort(function (a, b) { return b.score - a.score; });
  }

  function getMyPlayer() {
    if (!room || !room.state || !room.state.players) return null;
    return room.state.players.get(mySessionId);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Confetti ─────────────────────────────────────────────────
  function spawnConfetti() {
    var container = $('confettiContainer');
    if (!container) return;
    container.innerHTML = '';
    var colors = ['#FF4757','#2ED573','#FFA502','#1E90FF','#FF6B9D','#FFC312','#9C59D1'];
    for (var i = 0; i < 60; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 2) + 's';
      piece.style.animationDuration = (2 + Math.random() * 2) + 's';
      container.appendChild(piece);
    }
    setTimeout(function () { container.innerHTML = ''; }, 5000);
  }

  // ─── Nickname & Avatar Modal ──────────────────────────────────
  function showNicknameModal(action) {
    pendingAction = action;
    var modal = $('nicknameModal');
    var grid = $('emojiGrid');
    var input = $('nicknameInput');

    var savedName = localStorage.getItem('ktb_nickname');
    var savedAvatar = localStorage.getItem('ktb_avatar');
    if (savedName) input.value = savedName;
    if (savedAvatar) avatar = savedAvatar;

    grid.innerHTML = '';
    AVATARS.forEach(function (emoji) {
      var btn = document.createElement('button');
      btn.className = 'emoji-option' + (emoji === avatar ? ' selected' : '');
      btn.textContent = emoji;
      btn.addEventListener('click', function () {
        avatar = emoji;
        grid.querySelectorAll('.emoji-option').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        vibrate(15);
        window.soundManager.tap();
      });
      grid.appendChild(btn);
    });

    modal.classList.remove('hidden');
    setTimeout(function () { input.focus(); }, 100);
  }

  function hideNicknameModal() {
    $('nicknameModal').classList.add('hidden');
  }

  // ─── Join Modal ───────────────────────────────────────────────
  function showJoinModal() {
    $('joinModal').classList.remove('hidden');
    var input = $('joinCodeInput');
    input.value = joinCode || '';
    setTimeout(function () { input.focus(); }, 100);
  }

  function hideJoinModal() {
    $('joinModal').classList.add('hidden');
  }

  // ─── Target Selection Modal ───────────────────────────────────
  function showTargetModal() {
    var list = $('targetList');
    list.innerHTML = '';

    var targets = getPlayersArray().filter(function (p) {
      return p.isAlive && p.isConnected && p.id !== mySessionId;
    });

    if (targets.length === 0) {
      showToast('ไม่มีเป้าหมายที่เลือกได้');
      return;
    }

    targets.forEach(function (player) {
      var btn = document.createElement('button');
      btn.className = 'target-item';
      btn.innerHTML =
        '<span class="target-avatar">' + escapeHtml(player.avatar) + '</span>' +
        '<span class="target-name">' + escapeHtml(player.nickname) + '</span>';
      btn.addEventListener('click', function () {
        hideTargetModal();
        sendAccuse(player.id);
      });
      list.appendChild(btn);
    });

    $('targetModal').classList.remove('hidden');
  }

  function hideTargetModal() {
    $('targetModal').classList.add('hidden');
  }

  // ─── Categories Modal ─────────────────────────────────────────
  function showCategoriesModal() {
    var list = $('categoryList');
    list.innerHTML = '';

    CATEGORIES.forEach(function (cat) {
      var item = document.createElement('div');
      item.className = 'category-item';
      item.innerHTML =
        '<div class="category-item-label">' + escapeHtml(cat.label) + '</div>' +
        '<div class="category-item-desc">' + escapeHtml(cat.desc) + '</div>';
      list.appendChild(item);
    });

    $('categoriesModal').classList.remove('hidden');
  }

  function hideCategoriesModal() {
    $('categoriesModal').classList.add('hidden');
  }

  // ─── Countdown Overlay ────────────────────────────────────────
  var countdownInterval = null;

  function showCountdown(seconds) {
    var overlay = $('countdownOverlay');
    var content = $('countdownContent');
    if (countdownInterval) clearInterval(countdownInterval);

    overlay.classList.remove('hidden');
    var count = seconds;
    content.textContent = count;
    content.className = 'countdown-number';
    window.soundManager.tick();
    vibrate(50);

    countdownInterval = setInterval(function () {
      count--;
      if (count > 0) {
        content.textContent = count;
        content.className = 'countdown-number';
        window.soundManager.tick();
        vibrate(50);
      } else {
        content.textContent = 'เริ่ม!';
        content.className = 'countdown-go';
        window.soundManager.go();
        vibrate(100);
        clearInterval(countdownInterval);
        countdownInterval = null;
        setTimeout(function () {
          overlay.classList.add('hidden');
        }, 800);
      }
    }, 1000);
  }

  // ─── Vote Result Overlay ──────────────────────────────────────
  function showVoteResult(guilty, targetName) {
    var overlay = $('voteResultOverlay');
    var icon = $('voteResultIcon');
    var text = $('voteResultText');
    var detail = $('voteResultDetail');

    if (guilty) {
      icon.textContent = '💀';
      text.textContent = targetName + ' ถูกกำจัด!';
      detail.textContent = 'เสียงส่วนใหญ่ตัดสินว่าผิด';
      window.soundManager.eliminated();
      vibrate([100, 50, 100]);
    } else {
      icon.textContent = '✅';
      text.textContent = targetName + ' รอดตัว!';
      detail.textContent = 'เสียงส่วนใหญ่ตัดสินว่ายังไม่ผิด';
      window.soundManager.success();
    }

    overlay.classList.remove('hidden');
    setTimeout(function () {
      overlay.classList.add('hidden');
    }, 2500);
  }

  // ─── Colyseus Connection ──────────────────────────────────────
  function initClient() {
    client = new Colyseus.Client(SERVER_URL);
  }

  async function createRoom() {
    try {
      initClient();
      room = await client.create(ROOM_NAME, {
        nickname: nickname,
        avatar: avatar,
      });
      mySessionId = room.sessionId;
      reconnectToken = room.reconnectionToken;
      setupRoomListeners();
      showScreen('lobby');
      showToast('สร้างห้องสำเร็จ!');
    } catch (err) {
      console.error('Create room error:', err);
      showToast('ไม่สามารถสร้างห้องได้: ' + (err.message || 'ลองอีกครั้ง'));
    }
  }

  async function joinRoom(code) {
    try {
      initClient();
      // Attempt joinById first (code may be the room ID)
      room = await client.joinById(code, {
        nickname: nickname,
        avatar: avatar,
        roomCode: code,
      });
      mySessionId = room.sessionId;
      reconnectToken = room.reconnectionToken;
      setupRoomListeners();
      showScreen('lobby');
      showToast('เข้าร่วมห้องสำเร็จ!');
    } catch (err) {
      // Fallback: join by room name (never create — use client.join to avoid spawning a wrong room)
      try {
        room = await client.join(ROOM_NAME, {
          nickname: nickname,
          avatar: avatar,
          roomCode: code,
        });
        mySessionId = room.sessionId;
        reconnectToken = room.reconnectionToken;
        setupRoomListeners();
        showScreen('lobby');
        showToast('เข้าร่วมห้องสำเร็จ!');
      } catch (err2) {
        console.error('Join room error:', err, err2);
        showToast('ไม่พบห้อง หรือห้องเต็มแล้ว');
      }
    }
  }

  function leaveRoom() {
    stopLocalTimer();
    if (voteProgressInterval !== null) {
      clearInterval(voteProgressInterval);
      voteProgressInterval = null;
    }
    if (room) {
      try { room.leave(); } catch (_) {}
      room = null;
    }
    mySessionId = null;
    myWord = '';
    isHost = false;
    currentPhase = '';
    hasVoted = false;
    hasGuessed = false;
    reconnectToken = null;
    showScreen('home');
  }

  // ─── Room Listeners ───────────────────────────────────────────
  function setupRoomListeners() {
    if (!room) return;

    // Phase change
    room.state.listen('phase', function (value) {
      var oldPhase = currentPhase;
      currentPhase = value;
      onPhaseChange(value, oldPhase);
    });

    // Timer syncs — keep local timer aligned with server
    room.state.listen('roundTimer', function (value) {
      if (currentPhase === 'PLAYING') {
        localTimerValue = value;
        var el = $('playingTimer');
        if (el) el.textContent = formatTime(value);
      }
    });

    room.state.listen('voteTimer', function (value) {
      if (currentPhase === 'VOTING') {
        localTimerValue = value;
        var el = $('voteTimerDisplay');
        if (el) el.textContent = formatTime(value);
      }
    });

    room.state.listen('guessTimer', function (value) {
      if (currentPhase === 'GUESS_PHASE') {
        localTimerValue = value;
        var el = $('guessTimerDisplay');
        if (el) el.textContent = formatTime(value);
      }
    });

    room.state.listen('aliveCount', function (value) {
      var el = $('aliveCount');
      if (el) el.textContent = '👁️ ' + value + ' คน';
    });

    room.state.listen('roomCode', function (value) {
      var el = $('roomCodeDisplay');
      if (el) el.textContent = value || '----';
      renderRoomCode(value);
    });

    room.state.listen('playerCount', function () {
      updateLobbyPlayers();
      updateStartButton();
    });

    // Accusation changes
    room.state.listen('currentAccusation', function (value) {
      if (value) {
        updateVotingScreenFromState(value);
      }
    });

    // Player add / remove
    room.state.players.onAdd(function (player, key) {
      updateLobbyPlayers();
      updateStartButton();
      trackPlayerChanges(player, key);
    });

    room.state.players.onRemove(function () {
      updateLobbyPlayers();
      updateStartButton();
    });

    // ── Private / broadcast messages ────────────────────────────

    room.onMessage('YOUR_WORD', function (data) {
      myWord = data.word;
      var el = $('wordDisplay');
      if (el) el.textContent = myWord;
    });

    room.onMessage('COUNTDOWN', function (data) {
      if (data.secondsLeft > 0) {
        showCountdown(data.secondsLeft);
      }
    });

    room.onMessage('ACCUSATION', function (data) {
      hasVoted = false;
      updateVotingScreenFromMessage(data);
      window.soundManager.kill();
      vibrate(100);
    });

    room.onMessage('VOTE_RESULT', function (data) {
      var targetPlayer = room.state.players.get(data.targetId);
      var name = targetPlayer ? targetPlayer.nickname : 'ผู้เล่น';
      showVoteResult(data.guilty, name);
    });

    room.onMessage('VOTE_REVEAL', function (data) {
      // data.votes: [{ playerId, nickname, vote: "guilty"|"not_yet" }]
      revealVoterCards(data.votes || []);
    });

    room.onMessage('CHALLENGE_PENALTY', function (data) {
      // data: { accuserId, accuserName, penalty }
      showChallengePenaltyToast(data.accuserName, data.penalty || 1);
    });

    room.onMessage('GUESS_RESULT', function (data) {
      showGuessResult(data.correct, data.word);
    });

    room.onMessage('ROUND_END', function () {
      // Phase listener handles the screen transition
    });

    room.onMessage('GAME_OVER', function () {
      // Phase listener handles the screen transition
    });

    room.onMessage('ERROR', function (data) {
      showToast(data.message || 'เกิดข้อผิดพลาด');
    });

    room.onMessage('KICKED', function (data) {
      showToast(data.message || 'คุณถูกเตะออกจากห้อง');
      leaveRoom();
    });

    room.onMessage('ROOM_EXPIRED', function (data) {
      showToast(data.message || 'ห้องหมดเวลา');
      leaveRoom();
    });

    room.onLeave(function (code) {
      console.log('Left room, code:', code);
      stopLocalTimer();
      if (code >= 4000) {
        showToast('ถูกตัดการเชื่อมต่อ');
      }
      room = null;
      showScreen('home');
    });

    room.onError(function (code, message) {
      console.error('Room error:', code, message);
      showToast('ข้อผิดพลาด: ' + (message || code));
    });
  }

  function trackPlayerChanges(player, key) {
    player.listen('isHost', function (value) {
      if (key === mySessionId) {
        isHost = value;
        updateHostUI();
      }
      updateLobbyPlayers();
      updateStartButton();
    });

    player.listen('isAlive', function (value) {
      if (key === mySessionId && !value && currentPhase === 'PLAYING') {
        showSpectatorOverlay();
        window.soundManager.eliminated();
        vibrate([100, 50, 100, 50, 100]);
      }
    });

    player.listen('vote', function (value) {
      if (currentPhase === 'VOTING') {
        updateVoteProgress();
        if (value) markVoterCardVoted(key);
      }
    });
  }

  // ─── Phase Transitions ────────────────────────────────────────
  function onPhaseChange(phase, oldPhase) {
    stopLocalTimer();

    switch (phase) {
      case 'LOBBY':
        showScreen('lobby');
        updateLobbyPlayers();
        updateHostUI();
        break;

      case 'COUNTDOWN':
        // The countdown overlay is shown via the COUNTDOWN message handler.
        // Keep current screen visible behind the overlay.
        break;

      case 'PLAYING':
        showScreen('playing');
        setupPlayingScreen();
        break;

      case 'VOTING':
        hasVoted = false;
        showScreen('voting');
        setupVotingScreen();
        break;

      case 'GUESS_PHASE':
        hasGuessed = false;
        showScreen('guess');
        setupGuessScreen();
        break;

      case 'ROUND_END':
        showScreen('roundend');
        setupRoundEndScreen();
        break;

      case 'SCOREBOARD':
        showScreen('scoreboard');
        setupScoreboardScreen();
        break;

      case 'GAME_OVER':
        showScreen('gameover');
        setupGameOverScreen();
        break;
    }
  }

  // ─── Lobby Screen ─────────────────────────────────────────────
  function updateLobbyPlayers() {
    if (!room || !room.state) return;

    var list = $('lobbyPlayerList');
    var countLabel = $('playerCountLabel');
    if (!list) return;

    var players = getPlayersArray();
    if (countLabel) countLabel.textContent = 'ผู้เล่น ' + players.length + '/8';
    list.innerHTML = '';

    players.forEach(function (player) {
      var item = document.createElement('div');
      item.className = 'player-item';
      if (!player.isConnected) item.classList.add('disconnected');

      var avatarSpan = document.createElement('span');
      avatarSpan.className = 'player-avatar';
      avatarSpan.textContent = player.avatar;

      var nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      nameSpan.textContent = player.nickname + (player.id === mySessionId ? ' (คุณ)' : '');

      var badges = document.createElement('span');
      badges.className = 'player-badges';
      if (player.isHost) {
        var hostBadge = document.createElement('span');
        hostBadge.className = 'badge badge-host';
        hostBadge.textContent = '👑';
        badges.appendChild(hostBadge);
      }

      item.appendChild(avatarSpan);
      item.appendChild(nameSpan);
      item.appendChild(badges);

      // Host kick button (lobby only)
      if (isHost && player.id !== mySessionId && currentPhase === 'LOBBY') {
        var kickBtn = document.createElement('button');
        kickBtn.className = 'btn-kick';
        kickBtn.textContent = '✕';
        kickBtn.title = 'เตะออก';
        (function (pid, pname) {
          kickBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (confirm('เตะ ' + pname + ' ออกจากห้อง?')) {
              room.send('KICK_PLAYER', { targetPlayerId: pid });
            }
          });
        })(player.id, player.nickname);
        item.appendChild(kickBtn);
      }

      list.appendChild(item);
    });
  }

  function updateHostUI() {
    var config = $('lobbyConfig');
    var startBtn = $('btnStartGame');
    var hostLabel = $('lobbyHostLabel');

    if (isHost) {
      if (config) config.style.display = '';
      if (startBtn) startBtn.style.display = '';
      if (hostLabel) hostLabel.textContent = '👑 คุณเป็นเจ้าของห้อง';
    } else {
      if (config) config.style.display = 'none';
      if (startBtn) startBtn.style.display = 'none';
      if (hostLabel) hostLabel.textContent = '';
    }
  }

  function updateStartButton() {
    var btn = $('btnStartGame');
    if (!btn || !room || !room.state) return;
    var connectedCount = getPlayersArray().filter(function (p) { return p.isConnected; }).length;
    btn.disabled = connectedCount < 2;
  }

  function renderRoomCode(code) {
    var canvas = $('qrCanvas');
    if (!canvas || !code) return;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 120, 120);
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 32px Sarabun, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code, 60, 50);
    ctx.font = '12px Sarabun, sans-serif';
    ctx.fillText('รหัสห้อง', 60, 85);
  }

  // ─── Playing Screen ───────────────────────────────────────────
  function setupPlayingScreen() {
    var wordEl = $('wordDisplay');
    if (wordEl) wordEl.textContent = myWord || '---';

    var timerEl = $('playingTimer');
    if (room && room.state) {
      startLocalTimer(room.state.roundTimer, timerEl, function (val) {
        if (val <= 10 && val > 0) {
          window.soundManager.tick();
          vibrate(30);
          if (timerEl) timerEl.classList.add('timer-warning');
        }
        if (val <= 0) {
          window.soundManager.buzzer();
          vibrate(300);
        }
      });
    }

    var aliveEl = $('aliveCount');
    if (aliveEl && room && room.state) {
      aliveEl.textContent = '👁️ ' + room.state.aliveCount + ' คน';
    }

    // Reset spectator overlay
    var overlay = $('spectatorOverlay');
    if (overlay) overlay.classList.add('hidden');

    // If already eliminated, show spectator
    var me = getMyPlayer();
    if (me && !me.isAlive) {
      showSpectatorOverlay();
    }

    // Remove timer warning class
    if ($('playingTimer')) $('playingTimer').classList.remove('timer-warning');
  }

  function showSpectatorOverlay() {
    var overlay = $('spectatorOverlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  // ─── Voting Screen ────────────────────────────────────────────
  function setupVotingScreen() {
    var voteButtons = $('voteButtonsContainer');
    var voteStatus = $('voteStatus');
    var guiltyBtn = $('btnVoteGuilty');
    var notYetBtn = $('btnVoteNotYet');

    // Reset UI
    if (voteButtons) voteButtons.style.display = '';
    if (voteStatus) voteStatus.textContent = '';
    if (guiltyBtn) guiltyBtn.disabled = false;
    if (notYetBtn) notYetBtn.disabled = false;

    // Start local vote timer
    if (room && room.state) {
      startLocalTimer(room.state.voteTimer, $('voteTimerDisplay'), function (val) {
        if (val <= 5 && val > 0) {
          window.soundManager.tick();
          vibrate(30);
        }
      });
    }

    updateVoteProgress();
    renderVoterList();

    var me = getMyPlayer();
    var acc = (room && room.state) ? room.state.currentAccusation : null;

    // Check if I am the accused
    if (acc && me && acc.targetId === mySessionId) {
      if (voteButtons) voteButtons.style.display = 'none';
      if (voteStatus) voteStatus.textContent = 'คุณถูกกล่าวหา — รอผลโหวต...';
    }

    // Check if I am the challenger (accuser) — cannot vote on own challenge
    if (acc && me && acc.accuserId === mySessionId) {
      if (voteButtons) voteButtons.style.display = 'none';
      if (voteStatus) voteStatus.textContent = 'คุณเป็นผู้กล่าวหา — ไม่สามารถโหวตได้';
    }

    // Check if already eliminated
    if (me && !me.isAlive && (!acc || (acc.targetId !== mySessionId && acc.accuserId !== mySessionId))) {
      if (voteButtons) voteButtons.style.display = 'none';
      if (voteStatus) voteStatus.textContent = 'คุณถูกคัดออกแล้ว — ดูอย่างเดียว';
    }
  }

  function updateVotingScreenFromState(accusation) {
    if (!accusation) return;
    var nameEl = $('accusedName');
    var wordEl = $('accusedWord');
    if (nameEl) nameEl.textContent = accusation.targetName || '---';
    if (wordEl) wordEl.textContent = accusation.targetWord || '---';
    updateVoteProgress();
  }

  function updateVotingScreenFromMessage(data) {
    var nameEl = $('accusedName');
    var wordEl = $('accusedWord');
    if (nameEl) nameEl.textContent = data.targetName || '---';
    if (wordEl) wordEl.textContent = data.targetWord || '---';
    updateVoteProgress();
  }

  function updateVoteProgress() {
    if (!room || !room.state || !room.state.currentAccusation) return;
    var acc = room.state.currentAccusation;
    var total = acc.totalVoters;
    var voted = acc.yesCount + acc.noCount;
    var pending = total - voted;
    var pct = total > 0 ? Math.round((voted / total) * 100) : 0;

    var fill = $('voteProgressFill');
    var text = $('voteProgressText');
    var waiting = $('voteWaitingText');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = voted + '/' + total + ' โหวตแล้ว';
    if (waiting) {
      waiting.textContent = pending > 0
        ? 'รอผู้เล่นอีก ' + pending + ' คน...'
        : 'ครบทุกคนแล้ว!';
    }
  }

  function renderVoterList() {
    var container = $('voterList');
    if (!container) return;
    container.innerHTML = '';
    if (!room || !room.state) return;

    var acc = room.state.currentAccusation;
    var accuserId = acc ? acc.accuserId : null;
    var targetId = acc ? acc.targetId : null;

    room.state.players.forEach(function (player, id) {
      if (!player.isAlive) return;
      // Both the accused and the challenger are excluded from the eligible voter list display
      // but we still show the challenger card as greyed out
      var isChallenger = id === accuserId;
      var isAccused = id === targetId;
      if (isAccused) return; // don't show accused in voter list

      var card = document.createElement('div');
      card.className = 'voter-card' + (isChallenger ? ' challenger' : '');
      card.dataset.playerId = id;

      var avatarEmoji = player.avatar || '👤';
      var tooltip = isChallenger ? 'title="ไม่สามารถโหวตได้"' : '';

      card.innerHTML =
        '<div class="voter-card__inner" ' + tooltip + '>' +
          '<div class="voter-card__front">' + avatarEmoji + '</div>' +
          '<div class="voter-card__back" id="vcard-back-' + id + '"></div>' +
        '</div>' +
        '<div class="voter-card__name">' + (player.nickname || '?') + '</div>';

      if (isChallenger) {
        var front = card.querySelector('.voter-card__front');
        if (front) front.style.fontSize = '13px';
        front.textContent = '🚫';
      }

      // If already voted (reconnect scenario), mark voted
      if (player.vote) card.classList.add('voted');

      container.appendChild(card);
    });
  }

  function markVoterCardVoted(playerId) {
    var card = document.querySelector('.voter-card[data-player-id="' + playerId + '"]');
    if (card && !card.classList.contains('challenger')) {
      card.classList.add('voted');
    }
  }

  function revealVoterCards(votes) {
    votes.forEach(function (v, i) {
      setTimeout(function () {
        var card = document.querySelector('.voter-card[data-player-id="' + v.playerId + '"]');
        if (!card) return;
        var back = card.querySelector('.voter-card__back');
        if (back) {
          if (v.vote === 'guilty') {
            back.className = 'voter-card__back guilty';
            back.textContent = '👎';
          } else {
            back.className = 'voter-card__back not-yet';
            back.textContent = '👍';
          }
        }
        card.classList.add('flipped');
      }, i * 80);
    });
  }

  function showChallengePenaltyToast(name, penalty) {
    var toast = $('penaltyToast');
    if (!toast) return;
    toast.textContent = '⚠️ ' + name + ' -' + penalty + ' คะแนน (กล่าวหาผิด)';
    toast.classList.remove('hidden');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function () {
      toast.classList.add('hidden');
    }, 3000);
  }

  // ─── Guess Phase Screen ───────────────────────────────────────
  function setupGuessScreen() {
    hasGuessed = false;
    var input = $('guessInput');
    var submitBtn = $('btnSubmitGuess');
    var skipBtn = $('btnSkipGuess');
    var resultDisplay = $('guessResultDisplay');

    if (input) { input.value = ''; input.disabled = false; }
    if (submitBtn) submitBtn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
    if (resultDisplay) resultDisplay.classList.add('hidden');

    // Start local guess timer
    if (room && room.state) {
      startLocalTimer(room.state.guessTimer, $('guessTimerDisplay'), function (val) {
        if (val <= 3 && val > 0) {
          window.soundManager.tick();
          vibrate(30);
        }
      });
    }

    // If already guessed this round, disable
    var me = getMyPlayer();
    if (me && me.hasGuessed) {
      disableGuessUI();
    }

    if (input) setTimeout(function () { input.focus(); }, 200);
  }

  function showGuessResult(correct, word) {
    var resultDisplay = $('guessResultDisplay');
    var resultIcon = $('guessResultIcon');
    var resultText = $('guessResultText');
    var resultWord = $('guessResultWord');

    if (resultDisplay) resultDisplay.classList.remove('hidden');

    if (correct) {
      if (resultIcon) resultIcon.textContent = '🎉';
      if (resultText) resultText.textContent = 'ถูกต้อง! +3 คะแนน';
      window.soundManager.success();
      vibrate(100);
    } else {
      if (resultIcon) resultIcon.textContent = '❌';
      if (resultText) resultText.textContent = 'ไม่ถูกต้อง';
      window.soundManager.fail();
      vibrate([50, 30, 50]);
    }

    if (resultWord) resultWord.textContent = 'คำของคุณคือ: ' + word;
    disableGuessUI();
  }

  function disableGuessUI() {
    var input = $('guessInput');
    var submitBtn = $('btnSubmitGuess');
    var skipBtn = $('btnSkipGuess');
    if (input) input.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    if (skipBtn) skipBtn.disabled = true;
  }

  // ─── Round End Screen ─────────────────────────────────────────
  function setupRoundEndScreen() {
    if (!room || !room.state) return;

    var title = $('roundendTitle');
    if (title) {
      title.textContent = 'จบรอบ ' + room.state.currentRound + '/' + room.state.config.totalRounds;
    }

    var table = $('roundendTable');
    if (!table) return;
    table.innerHTML = '';

    var players = getPlayersArray();
    players.forEach(function (player) {
      var row = document.createElement('div');
      row.className = 'roundend-row';
      if (!player.isAlive) row.classList.add('eliminated');

      // Left: avatar + name
      var left = document.createElement('div');
      left.className = 'roundend-left';
      left.innerHTML =
        '<span class="roundend-avatar">' + escapeHtml(player.avatar) + '</span>' +
        '<span class="roundend-name">' + escapeHtml(player.nickname) + '</span>';

      // Middle: assigned word (revealed)
      var mid = document.createElement('div');
      mid.className = 'roundend-word';
      mid.textContent = player.assignedWord || '???';

      // Right: round points
      var right = document.createElement('div');
      right.className = 'roundend-points';
      var pts = player.roundPoints;
      right.textContent = (pts >= 0 ? '+' : '') + pts;
      right.style.color = pts >= 0 ? 'var(--success)' : 'var(--accent-red)';

      // Status icon
      var status = document.createElement('div');
      status.className = 'roundend-status';
      if (!player.isAlive) {
        status.textContent = '💀';
      } else if (player.guessCorrect) {
        status.textContent = '🧠✅';
      } else {
        status.textContent = '✅';
      }

      row.appendChild(left);
      row.appendChild(mid);
      row.appendChild(right);
      row.appendChild(status);
      table.appendChild(row);
    });

    // Only host sees "Next" button
    var nextBtn = $('btnNextFromRoundend');
    if (nextBtn) {
      // The server auto-advances to SCOREBOARD after 5 s, but
      // having the button is a UX hint for the host.
      nextBtn.style.display = isHost ? '' : 'none';
    }
  }

  // ─── Scoreboard Screen ────────────────────────────────────────
  function setupScoreboardScreen() {
    if (!room || !room.state) return;

    var roundLabel = $('scoreboardRound');
    if (roundLabel) {
      roundLabel.textContent = 'รอบ ' + room.state.currentRound + '/' + room.state.config.totalRounds;
    }

    var list = $('scoreboardList');
    if (!list) return;
    list.innerHTML = '';

    var sorted = getPlayersSortedByScore();
    sorted.forEach(function (player, index) {
      var rank = index + 1;
      var item = document.createElement('div');
      item.className = 'scoreboard-item';
      if (rank <= 3) item.classList.add('top-' + rank);
      if (player.id === mySessionId) item.classList.add('is-me');

      item.innerHTML =
        '<span class="scoreboard-rank">' + getRankEmoji(rank) + '</span>' +
        '<span class="scoreboard-avatar">' + escapeHtml(player.avatar) + '</span>' +
        '<span class="scoreboard-name">' + escapeHtml(player.nickname) + '</span>' +
        '<span class="scoreboard-score">' + player.score + ' คะแนน</span>';

      list.appendChild(item);
    });

    // Host controls
    var bottom = $('scoreboardBottom');
    var nextRoundBtn = $('btnNextRound');
    var endGameBtn = $('btnEndGame');

    if (isHost) {
      if (bottom) bottom.style.display = '';
      if (room.state.currentRound >= room.state.config.totalRounds) {
        if (nextRoundBtn) nextRoundBtn.style.display = 'none';
        if (endGameBtn) endGameBtn.textContent = 'ดูผลสรุป';
      } else {
        if (nextRoundBtn) nextRoundBtn.style.display = '';
        if (endGameBtn) endGameBtn.textContent = 'จบเกม';
      }
    } else {
      if (bottom) bottom.style.display = 'none';
    }

    window.soundManager.success();
  }

  // ─── Game Over Screen ─────────────────────────────────────────
  function setupGameOverScreen() {
    if (!room || !room.state) return;

    var sorted = getPlayersSortedByScore();
    var winner = sorted[0];

    if (winner) {
      var nameEl = $('gameoverWinnerName');
      var avatarEl = $('gameoverWinnerAvatar');
      var scoreEl = $('gameoverWinnerScore');
      if (nameEl) nameEl.textContent = winner.nickname;
      if (avatarEl) avatarEl.textContent = winner.avatar;
      if (scoreEl) scoreEl.textContent = winner.score + ' คะแนน';
    }

    var rankings = $('gameoverRankings');
    if (rankings) {
      rankings.innerHTML = '';
      sorted.forEach(function (player, index) {
        var rank = index + 1;
        var item = document.createElement('div');
        item.className = 'gameover-rank-item';
        if (player.id === mySessionId) item.classList.add('is-me');

        item.innerHTML =
          '<span class="gameover-rank">' + getRankEmoji(rank) + '</span>' +
          '<span class="gameover-rank-avatar">' + escapeHtml(player.avatar) + '</span>' +
          '<span class="gameover-rank-name">' + escapeHtml(player.nickname) + '</span>' +
          '<span class="gameover-rank-score">' + player.score + ' คะแนน</span>';

        rankings.appendChild(item);
      });
    }

    spawnConfetti();
    window.soundManager.celebration();
    vibrate([100, 50, 100, 50, 200]);
  }

  // ─── Send Messages to Server ──────────────────────────────────
  function sendStartGame() {
    if (room) room.send('START_GAME', {});
  }

  function sendAccuse(targetPlayerId) {
    if (room) {
      room.send('ACCUSE', { targetPlayerId: targetPlayerId });
      window.soundManager.kill();
      vibrate(100);
    }
  }

  function sendVote(isGuilty) {
    if (!room || hasVoted) return;
    hasVoted = true;
    room.send('VOTE', { vote: isGuilty ? 'guilty' : 'not_yet' });
    window.soundManager.vote();
    vibrate(30);

    var guiltyBtn = $('btnVoteGuilty');
    var notYetBtn = $('btnVoteNotYet');
    if (guiltyBtn) guiltyBtn.disabled = true;
    if (notYetBtn) notYetBtn.disabled = true;

    var status = $('voteStatus');
    if (status) status.textContent = '✅ โหวตของคุณถูกล็อกแล้ว — รอผลโหวต...';
  }

  function sendGuessWord(guess) {
    if (!room || hasGuessed) return;
    hasGuessed = true;
    room.send('GUESS_WORD', { guess: guess.trim() });
    vibrate(30);
  }

  function sendSurrender() {
    if (room) {
      room.send('SURRENDER', {});
      vibrate([100, 50, 100]);
    }
  }

  function sendNextRound() {
    if (room) room.send('NEXT_ROUND', {});
  }

  function sendEndGame() {
    if (room) room.send('END_GAME', {});
  }

  function sendUpdateConfig(data) {
    if (room) room.send('UPDATE_CONFIG', data);
  }

  // ─── Share Results ────────────────────────────────────────────
  function shareResults() {
    var sorted = getPlayersSortedByScore();
    var text = '🎭 คำต้องห้าม — ผลเกม!\n\n';
    sorted.forEach(function (player, index) {
      text += getRankEmoji(index + 1) + ' ' + player.nickname + ' — ' + player.score + ' คะแนน\n';
    });
    text += '\nเล่นกันเลย! 🎮';

    if (navigator.share) {
      navigator.share({ title: 'คำต้องห้าม', text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('คัดลอกผลเกมแล้ว!');
      }).catch(function () {
        showToast('ไม่สามารถคัดลอกได้');
      });
    } else {
      showToast('เบราว์เซอร์ไม่รองรับการแชร์');
    }
  }

  // ─── Event Bindings ───────────────────────────────────────────
  function bindEvents() {

    // Sound toggle
    var soundToggle = $('soundToggle');
    if (soundToggle) {
      soundToggle.addEventListener('click', function () {
        var enabled = window.soundManager.toggle();
        soundToggle.textContent = enabled ? '🔊' : '🔇';
        vibrate(15);
      });
    }

    // ── Home screen ─────────────────────────────────────────────

    $('btnCreateRoom').addEventListener('click', function () {
      vibrate(30);
      window.soundManager.tap();
      showNicknameModal('create');
    });

    $('btnJoinRoom').addEventListener('click', function () {
      vibrate(30);
      window.soundManager.tap();
      showNicknameModal('join');
    });

    $('btnBrowseCategories').addEventListener('click', function () {
      vibrate(15);
      showCategoriesModal();
    });

    // ── Nickname modal ──────────────────────────────────────────

    $('btnConfirmNickname').addEventListener('click', function () {
      var input = $('nicknameInput');
      var name = (input.value || '').trim();
      if (!name || name.length < 1) {
        showToast('กรุณาใส่ชื่อ');
        return;
      }
      nickname = name.slice(0, 15);
      localStorage.setItem('ktb_nickname', nickname);
      localStorage.setItem('ktb_avatar', avatar);
      hideNicknameModal();
      vibrate(30);
      window.soundManager.tap();

      if (pendingAction === 'create') {
        createRoom();
      } else if (pendingAction === 'join') {
        showJoinModal();
      }
    });

    $('nicknameInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('btnConfirmNickname').click();
    });

    // ── Join modal ──────────────────────────────────────────────

    $('btnConfirmJoin').addEventListener('click', function () {
      var input = $('joinCodeInput');
      var code = (input.value || '').trim().toUpperCase();
      if (!code || code.length < 2) {
        showToast('กรุณาใส่รหัสห้อง');
        return;
      }
      joinCode = code;
      hideJoinModal();
      vibrate(30);
      window.soundManager.tap();
      joinRoom(joinCode);
    });

    $('joinCodeInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('btnConfirmJoin').click();
    });

    $('btnCancelJoin').addEventListener('click', function () {
      hideJoinModal();
    });

    // ── Categories modal ────────────────────────────────────────

    $('btnCloseCategories').addEventListener('click', function () {
      hideCategoriesModal();
    });

    // ── Lobby screen ────────────────────────────────────────────

    $('btnLobbyBack').addEventListener('click', function () {
      vibrate(30);
      if (confirm('ออกจากห้องนี้?')) {
        leaveRoom();
      }
    });

    $('roomCodeDisplay').addEventListener('click', function () {
      var code = $('roomCodeDisplay').textContent;
      if (code && code !== '----' && navigator.clipboard) {
        navigator.clipboard.writeText(code).then(function () {
          var copied = $('roomCodeCopied');
          if (copied) {
            copied.style.opacity = '1';
            setTimeout(function () { copied.style.opacity = '0'; }, 1500);
          }
          vibrate(30);
        });
      }
    });

    $('btnStartGame').addEventListener('click', function () {
      vibrate(50);
      window.soundManager.tap();
      sendStartGame();
    });

    // Config: rounds
    var configRounds = $('configRounds');
    if (configRounds) {
      configRounds.addEventListener('click', function (e) {
        var btn = e.target.closest('.config-option');
        if (!btn) return;
        var value = parseInt(btn.dataset.value, 10);
        configRounds.querySelectorAll('.config-option').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        sendUpdateConfig({ totalRounds: value });
        vibrate(15);
        window.soundManager.tap();
      });
    }

    // Config: timer
    var configTimer = $('configTimer');
    if (configTimer) {
      configTimer.addEventListener('click', function (e) {
        var btn = e.target.closest('.config-option');
        if (!btn) return;
        var value = parseInt(btn.dataset.value, 10);
        configTimer.querySelectorAll('.config-option').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        sendUpdateConfig({ roundDurationSecs: value });
        vibrate(15);
        window.soundManager.tap();
      });
    }

    // Config: category
    var configCategory = $('configCategory');
    if (configCategory) {
      configCategory.addEventListener('change', function () {
        sendUpdateConfig({ category: configCategory.value });
        vibrate(15);
      });
    }

    // ── Playing screen ──────────────────────────────────────────

    $('btnKill').addEventListener('click', function () {
      vibrate(50);
      window.soundManager.tap();
      var me = getMyPlayer();
      if (me && !me.isAlive) {
        showToast('คุณถูกคัดออกแล้ว');
        return;
      }
      if (room && room.state && room.state.currentAccusation) {
        showToast('กำลังโหวตอยู่ รอสักครู่');
        return;
      }
      showTargetModal();
    });

    $('btnGuessWord').addEventListener('click', function () {
      vibrate(30);
      window.soundManager.tap();
      var me = getMyPlayer();
      if (me && me.hasGuessed) {
        showToast('คุณเดาคำแล้ว');
        return;
      }
      var guess = prompt('เดาคำของคุณ (ถ้าถูกได้ +3 คะแนน):');
      if (guess !== null && guess.trim()) {
        sendGuessWord(guess);
      }
    });

    $('btnSurrender').addEventListener('click', function () {
      vibrate(30);
      if (confirm('ยอมแพ้? คุณจะเสีย 3 คะแนน')) {
        sendSurrender();
      }
    });

    $('btnCancelTarget').addEventListener('click', function () {
      hideTargetModal();
    });

    // ── Voting screen ───────────────────────────────────────────

    $('btnVoteGuilty').addEventListener('click', function () {
      vibrate(30);
      sendVote(true);
    });

    $('btnVoteNotYet').addEventListener('click', function () {
      vibrate(30);
      sendVote(false);
    });

    // ── Guess phase screen ──────────────────────────────────────

    $('btnSubmitGuess').addEventListener('click', function () {
      var input = $('guessInput');
      var guess = (input.value || '').trim();
      if (!guess) {
        showToast('กรุณาพิมพ์คำ');
        return;
      }
      vibrate(30);
      window.soundManager.tap();
      sendGuessWord(guess);
    });

    $('guessInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('btnSubmitGuess').click();
    });

    $('btnSkipGuess').addEventListener('click', function () {
      vibrate(30);
      hasGuessed = true;
      sendGuessWord('');
      disableGuessUI();
      showToast('ข้ามการเดาคำ');
    });

    // ── Round end screen ────────────────────────────────────────

    $('btnNextFromRoundend').addEventListener('click', function () {
      vibrate(30);
      window.soundManager.tap();
      // Server auto-advances to SCOREBOARD after ~5s.
      // This button is cosmetic; phase change handles the rest.
    });

    // ── Scoreboard screen ───────────────────────────────────────

    $('btnNextRound').addEventListener('click', function () {
      vibrate(30);
      window.soundManager.tap();
      sendNextRound();
    });

    $('btnEndGame').addEventListener('click', function () {
      vibrate(30);
      window.soundManager.tap();
      sendEndGame();
    });

    // ── Game over screen ────────────────────────────────────────

    $('btnShareResults').addEventListener('click', function () {
      vibrate(30);
      shareResults();
    });

    $('btnPlayAgain').addEventListener('click', function () {
      vibrate(50);
      window.soundManager.tap();
      leaveRoom();
      setTimeout(function () {
        showNicknameModal('create');
      }, 400);
    });

    $('btnExit').addEventListener('click', function () {
      vibrate(30);
      leaveRoom();
    });

    // ── Close modals on backdrop click ──────────────────────────

    ['nicknameModal', 'joinModal', 'targetModal', 'categoriesModal'].forEach(function (id) {
      var overlay = $(id);
      if (overlay) {
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) overlay.classList.add('hidden');
        });
      }
    });

    // ── Periodic vote progress sync ─────────────────────────────
    voteProgressInterval = setInterval(function () {
      if (currentPhase === 'VOTING') updateVoteProgress();
    }, 500);
  }

  // ─── Init ─────────────────────────────────────────────────────
  function init() {
    showScreen('home');
    bindEvents();

    // Deep link support: ?room=XXXX
    var params = new URLSearchParams(window.location.search);
    var urlCode = params.get('room');
    if (urlCode) {
      joinCode = urlCode.toUpperCase();
      showNicknameModal('join');
    }
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
