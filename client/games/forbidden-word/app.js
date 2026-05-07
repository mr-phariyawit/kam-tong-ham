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
    { id: 'trap-words',    label: '💣 คำกับดัก',          desc: 'คำที่พูดบ่อยสุดๆ ยากมาก!' },
    { id: 'daily-life',    label: '🏠 ชีวิตประจำวัน',      desc: 'กิจวัตร ทำงาน กินข้าว' },
    { id: 'slang',         label: '🔥 คำฮิตวัยรุ่น',      desc: 'คำสแลง คำฮิต พูดกันทุกวัน' },
    { id: 'common',        label: '💬 คำทั่วไป',          desc: 'คำที่ใช้ในชีวิตประจำวัน' },
    { id: 'food',          label: '🍜 อาหาร',             desc: 'อาหารไทยและต่างประเทศ' },
    { id: 'shopping',      label: '🛒 ช้อปปิ้ง',          desc: 'ซื้อของ ตลาด ออนไลน์' },
    { id: 'entertainment', label: '📱 บันเทิง/โซเชียล',   desc: 'หนัง เพลง เกม โซเชียล' },
    { id: 'school',        label: '🎓 โรงเรียน/มหาลัย',   desc: 'เรียน สอบ เพื่อน ครู' },
    { id: 'office',        label: '💼 ออฟฟิศ',            desc: 'ประชุม อีเมล เจ้านาย' },
    { id: 'travel',        label: '✈️ เที่ยว',             desc: 'ทะเล ภูเขา ท่องเที่ยว' },
    { id: 'relationships', label: '💕 ความสัมพันธ์',       desc: 'จีบ แฟน เลิก รัก' },
    { id: 'animals',       label: '🐘 สัตว์',              desc: 'สัตว์ทุกชนิด' },
    { id: 'emotions',      label: '😊 อารมณ์',             desc: 'คำเกี่ยวกับความรู้สึก' },
    { id: 'sports',        label: '⚽ กีฬา',               desc: 'กีฬาทุกประเภท' },
    { id: 'places',        label: '🏛️ สถานที่',            desc: 'สถานที่ในไทยและทั่วโลก' },
    { id: 'body',          label: '🦷 ร่างกาย',            desc: 'อวัยวะและส่วนต่างๆ' },
    { id: 'colors',        label: '🎨 สี',                 desc: 'สีต่างๆ' },
    { id: 'family',        label: '👨‍👩‍👧 ครอบครัว',        desc: 'คำเกี่ยวกับครอบครัว' },
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
  let wordHidden = false;
  let reconnectToken = null;

  // ─── Reconnection State ──────────────────────────────────────
  let isReconnecting = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let wakeLockSentinel = null;
  var RECONNECT_MAX_ATTEMPTS = 20;
  var RECONNECT_MAX_DELAY_MS = 30000;
  var RECONNECT_STORAGE_KEY = 'ktb_reconnect';

  // ─── DOM Cache ────────────────────────────────────────────────
  const _$ = (id) => document.getElementById(id);
  // Safe $: returns a proxy that silently ignores calls on null elements
  const $ = (id) => {
    var el = _$(id);
    if (el) return el;
    // Return a dummy that won't crash on .addEventListener, .classList, .textContent etc.
    return new Proxy({}, { get: () => () => {} });
  };

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
    var errEl = $('nicknameError');
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
    var input = $('nicknameInput');
    if (input) input.classList.remove('input-error');
  }

  function showNicknameRejectionError(message) {
    // Re-open the nickname modal and show inline error so player can retry
    var modal = $('nicknameModal');
    if (modal) modal.classList.remove('hidden');
    var errEl = $('nicknameError');
    if (errEl) { errEl.textContent = message; errEl.classList.remove('hidden'); }
    var input = $('nicknameInput');
    if (input) { input.classList.add('input-error'); input.focus(); input.select(); }
  }

  function showTransferHostPicker() {
    var players = getPlayersArray().filter(function (p) {
      return p.isConnected && p.isAlive && p.id !== mySessionId;
    });
    if (players.length === 0) {
      showToast('ไม่มีผู้เล่นที่สามารถโอนตำแหน่งได้');
      return;
    }
    // Build a simple inline picker using a toast-style dropdown modal
    var existing = $('transferHostModal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'transferHostModal';
    var content = document.createElement('div');
    content.className = 'modal-content';
    content.innerHTML = '<div class="modal-title">🔑 โอนตำแหน่งโฮสต์</div>';

    players.forEach(function (p) {
      var btn = document.createElement('button');
      btn.className = 'btn btn-ghost';
      btn.style.cssText = 'width:100%;margin-top:8px;display:flex;align-items:center;gap:8px;';
      btn.innerHTML = '<span>' + p.avatar + '</span><span>' + escapeHtml(p.nickname) + '</span>';
      btn.addEventListener('click', function () {
        if (room) room.send('TRANSFER_HOST', { targetId: p.id });
        overlay.remove();
        vibrate(20);
      });
      content.appendChild(btn);
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.style.cssText = 'width:100%;margin-top:12px;';
    cancelBtn.textContent = 'ยกเลิก';
    cancelBtn.addEventListener('click', function () { overlay.remove(); });
    content.appendChild(cancelBtn);

    overlay.appendChild(content);
    document.body.appendChild(overlay);
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

  // ─── Dynamic Categories (from server API) ──────────────────────
  let serverCategories = CATEGORIES; // fallback to hardcoded

  async function loadCategoriesFromServer() {
    try {
      // Use relative URL — works on any domain (localhost, production, preview)
      var resp = await fetch('/api/categories');
      var data = await resp.json();
      console.log('[categories] loaded', data.categories ? data.categories.length : 0);
      if (data.success && data.categories && data.categories.length > 0) {
        serverCategories = data.categories.map(function (c) {
          return {
            id: c.id,
            label: c.icon + ' ' + c.category,
            desc: c.wordCount + ' คำ' + (c.difficulty === 'extreme' ? ' (โหดมาก!)' : c.difficulty === 'hard' ? ' (ยาก)' : ''),
          };
        });
        populateCategorySelect();
        console.log('[categories] select populated with', serverCategories.length);
      }
    } catch (e) {
      console.warn('[categories] failed to load, using defaults', e);
    }
  }

  function populateCategorySelect() {
    var select = $('configCategory');
    if (!select) return;
    select.innerHTML = '';
    serverCategories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      select.appendChild(opt);
    });
  }

  // ─── Categories Modal ─────────────────────────────────────────
  function showCategoriesModal() {
    var list = $('categoryList');
    list.innerHTML = '';

    serverCategories.forEach(function (cat) {
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

  // ─── Word Hide System ──────────────────────────────────────────
  // Prevents player from seeing their own word when interacting with buttons.
  // Method 1: Gyroscope — word blurs when phone tilts toward user
  // Method 2: Touch Hold — long-press anywhere on word area to hide

  function hideWord() {
    if (wordHidden) return;
    wordHidden = true;
    var overlay = $('wordHiddenOverlay');
    var wordEl = $('wordDisplay');
    if (overlay) overlay.classList.add('active');
    if (wordEl) wordEl.classList.add('tilted');
  }

  function showWord() {
    if (!wordHidden) return;
    wordHidden = false;
    var overlay = $('wordHiddenOverlay');
    var wordEl = $('wordDisplay');
    if (overlay) overlay.classList.remove('active');
    if (wordEl) wordEl.classList.remove('tilted');
  }

  function initWordHideSystem() {
    var wordArea = $('playingWordArea');
    if (!wordArea) return;

    // Method 1: Gyroscope / DeviceOrientation
    // When phone is tilted toward user (beta > 70°), hide the word
    // When held upright or facing away (beta < 50°), show the word
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', function (e) {
        if (currentPhase !== 'PLAYING') return;
        // beta: front-back tilt. ~0° = flat, 90° = vertical facing user
        // When user holds phone outward (others see): beta ~70-90°
        // When user tilts to look at screen: beta ~20-60°
        // We hide when beta drops below 50° (user is looking at screen)
        if (e.beta !== null && e.beta < 50 && e.beta > -30) {
          hideWord();
        } else {
          showWord();
        }
      });
    }

    // Method 2: Touch Hold — press and hold the word area to toggle hide
    var touchTimer = null;
    wordArea.addEventListener('touchstart', function (e) {
      touchTimer = setTimeout(function () {
        hideWord();
        vibrate(30);
      }, 300); // 300ms hold to hide
    });
    wordArea.addEventListener('touchend', function () {
      clearTimeout(touchTimer);
      // Show word again after 3 seconds (or when user lifts finger from buttons)
      setTimeout(function () {
        if (currentPhase === 'PLAYING') showWord();
      }, 5000);
    });

    // Method 3: Kill/Guess/Surrender buttons auto-hide word when pressed
    ['btnKill', 'btnGuessWord'].forEach(function (btnId) {
      var btn = $(btnId);
      if (btn) {
        btn.addEventListener('touchstart', function () {
          hideWord();
        });
      }
    });
  }

  // ─── Reconnection Helpers ─────────────────────────────────────

  /** Save room session to localStorage for reconnection after refresh/sleep/etc. */
  function saveReconnectSession() {
    if (!room) return;
    try {
      // Colyseus 0.15: reconnectionToken is set after join
      var token = room.reconnectionToken || reconnectToken;
      if (!token) {
        console.warn('[save] no reconnectionToken yet, skipping save');
        return;
      }
      var data = {
        roomId: room.id,
        sessionId: room.sessionId,
        reconnectionToken: token,
        roomCode: (room.state && room.state.roomCode) ? room.state.roomCode : '',
        nickname: nickname,
        avatar: avatar,
        savedAt: Date.now(),
      };
      localStorage.setItem(RECONNECT_STORAGE_KEY, JSON.stringify(data));
      console.log('[save] session saved, token:', token.substring(0, 20) + '...');
    } catch (_) { /* localStorage unavailable */ }
  }

  /** Clear saved reconnect session from localStorage. */
  function clearReconnectSession() {
    try {
      localStorage.removeItem(RECONNECT_STORAGE_KEY);
    } catch (_) {}
  }

  /** Get saved reconnect session, or null if expired / missing. */
  function getSavedReconnectSession() {
    try {
      var raw = localStorage.getItem(RECONNECT_STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      // Expire after 10 minutes (generous — server allows 5 min, but we add buffer for retries)
      if (Date.now() - data.savedAt > 10 * 60 * 1000) {
        clearReconnectSession();
        return null;
      }
      return data;
    } catch (_) {
      return null;
    }
  }

  /** Show the reconnection overlay with progress info. */
  function showReconnectOverlay(attemptNum, maxAttempts) {
    var overlay = $('reconnectOverlay');
    var text = $('reconnectText');
    var attempt = $('reconnectAttempt');
    var cancelBtn = $('btnCancelReconnect');

    if (text) text.textContent = '\uD83D\uDD04 \u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E43\u0E2B\u0E21\u0E48...'; // กำลังเชื่อมต่อใหม่...
    if (attempt) attempt.textContent = '\u0E04\u0E23\u0E31\u0E49\u0E07\u0E17\u0E35\u0E48 ' + attemptNum + '/' + maxAttempts; // ครั้งที่
    if (cancelBtn) cancelBtn.textContent = '\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01'; // ยกเลิก
    if (overlay) overlay.classList.remove('hidden');
  }

  /** Hide the reconnection overlay. */
  function hideReconnectOverlay() {
    var overlay = $('reconnectOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /** Calculate exponential backoff delay: 1s, 2s, 4s, 8s, ... capped at 30s. */
  function getReconnectDelay(attempt) {
    var delay = Math.min(1000 * Math.pow(2, attempt), RECONNECT_MAX_DELAY_MS);
    // Add small jitter (0-500ms) to prevent thundering herd
    return delay + Math.floor(Math.random() * 500);
  }

  /** Attempt to reconnect to a saved room session with exponential backoff. */
  function startReconnectFlow(savedSession) {
    if (isReconnecting) return;
    isReconnecting = true;
    reconnectAttempts = 0;

    function attemptReconnect() {
      reconnectAttempts++;
      if (reconnectAttempts > RECONNECT_MAX_ATTEMPTS) {
        // Exhausted all attempts
        isReconnecting = false;
        hideReconnectOverlay();
        clearReconnectSession();
        showToast('\u0E2B\u0E49\u0E2D\u0E07\u0E2B\u0E21\u0E14\u0E2D\u0E32\u0E22\u0E38 \u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E44\u0E14\u0E49', 4000); // ห้องหมดอายุ หรือไม่สามารถเชื่อมต่อได้
        showScreen('home');
        checkRejoinBanner();
        return;
      }

      showReconnectOverlay(reconnectAttempts, RECONNECT_MAX_ATTEMPTS);

      initClient();
      // Colyseus 0.15: reconnect(reconnectionToken) — token contains roomId already
      var token = savedSession.reconnectionToken;
      console.log('[reconnect] attempt', reconnectAttempts, 'token:', token ? token.substring(0, 20) + '...' : 'MISSING');
      if (!token) {
        console.error('[reconnect] no token! cannot reconnect');
        isReconnecting = false;
        hideReconnectOverlay();
        clearReconnectSession();
        showToast('ไม่มี token สำหรับเชื่อมต่อใหม่');
        showScreen('home');
        return;
      }
      client.reconnect(token).then(function (reconnectedRoom) {
        // Success!
        isReconnecting = false;
        reconnectAttempts = 0;
        hideReconnectOverlay();

        room = reconnectedRoom;
        mySessionId = room.sessionId;
        reconnectToken = room.reconnectionToken;
        nickname = savedSession.nickname || nickname;
        avatar = savedSession.avatar || avatar;

        setupRoomListeners();
        saveReconnectSession(); // Update with new token

        // The phase listener will show the correct screen
        var phase = room.state ? room.state.phase : 'LOBBY';
        onPhaseChange(phase, '');

        showToast('\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E43\u0E2B\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08!'); // เชื่อมต่อใหม่สำเร็จ!

        // Request wake lock again
        requestWakeLock();
      }).catch(function (err) {
        console.warn('[reconnect] attempt', reconnectAttempts, 'failed:', err.message || err);
        // Schedule next attempt with exponential backoff
        var delay = getReconnectDelay(reconnectAttempts - 1);
        reconnectTimer = setTimeout(attemptReconnect, delay);
      });
    }

    attemptReconnect();
  }

  /** Stop any ongoing reconnection flow. */
  function cancelReconnectFlow() {
    isReconnecting = false;
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    hideReconnectOverlay();
  }

  // ─── Wake Lock (prevent screen off during active game) ───────

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', function () {
        wakeLockSentinel = null;
      });
    } catch (_) { /* Wake Lock not available or denied */ }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      try { wakeLockSentinel.release(); } catch (_) {}
      wakeLockSentinel = null;
    }
  }

  // ─── Rejoin Banner (shown on home screen) ────────────────────

  function checkRejoinBanner() {
    var saved = getSavedReconnectSession();
    var banner = $('rejoinBanner');
    if (!banner) return;

    if (saved && saved.roomCode) {
      var text = $('rejoinBannerText');
      var rejoinBtn = $('btnRejoinRoom');
      var dismissBtn = $('btnDismissRejoin');
      if (text) text.textContent = '\uD83C\uDFAE \u0E04\u0E38\u0E13\u0E21\u0E35\u0E40\u0E01\u0E21\u0E04\u0E49\u0E32\u0E07\u0E2D\u0E22\u0E39\u0E48 (\u0E2B\u0E49\u0E2D\u0E07 ' + saved.roomCode + ')'; // คุณมีเกมค้างอยู่ (ห้อง X)
      if (rejoinBtn) rejoinBtn.textContent = '\u0E01\u0E25\u0E31\u0E1A\u0E40\u0E02\u0E49\u0E32\u0E2B\u0E49\u0E2D\u0E07'; // กลับเข้าห้อง
      if (dismissBtn) dismissBtn.textContent = '\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01'; // ยกเลิก
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  // ─── Colyseus Connection ──────────────────────────────────────
  function initClient() {
    client = new Colyseus.Client(SERVER_URL);
  }

  async function createRoom() {
    try {
      initClient();
      // Step 1: Get a room code from REST API
      var apiResp = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'common' }),
      });
      var apiData = await apiResp.json();
      if (!apiData.success) throw new Error(apiData.error || 'ไม่สามารถสร้างห้องได้');
      var roomCode = apiData.roomCode;
      console.log('Got room code from API:', roomCode);

      // Step 2: Create Colyseus room with the code
      room = await client.create(ROOM_NAME, {
        nickname: nickname,
        avatar: avatar,
        roomCode: roomCode,
      });
      mySessionId = room.sessionId;
      reconnectToken = room.reconnectionToken;
      setupRoomListeners();
      saveReconnectSession();
      requestWakeLock();
      showScreen('lobby');
      if (typeof Onboarding !== 'undefined') Onboarding.tryShow('forbidden-word');
      showToast('สร้างห้องสำเร็จ! รหัส: ' + roomCode);
    } catch (err) {
      console.error('Create room error:', err);
      showToast('ไม่สามารถสร้างห้องได้: ' + (err.message || 'ลองอีกครั้ง'));
    }
  }

  async function joinRoom(code) {
    try {
      initClient();
      code = code.toUpperCase().trim();
      console.log('Joining room with code:', code);

      // Step 1: Check if room exists via REST API
      var checkResp = await fetch('/api/rooms/' + code);
      var checkData = await checkResp.json();
      console.log('Room check:', checkData);

      // Step 2: Join via Colyseus with roomCode
      room = await client.join(ROOM_NAME, {
        nickname: nickname,
        avatar: avatar,
        roomCode: code,
      });
      mySessionId = room.sessionId;
      reconnectToken = room.reconnectionToken;
      setupRoomListeners();
      saveReconnectSession();
      requestWakeLock();
      showScreen('lobby');
      if (typeof Onboarding !== 'undefined') Onboarding.tryShow('forbidden-word');
      showToast('เข้าร่วมห้องสำเร็จ!');
    } catch (err) {
      console.error('Join room error:', err);
      // Fallback: try joinById (in case code is a room ID)
      try {
        room = await client.joinById(code, {
          nickname: nickname,
          avatar: avatar,
          roomCode: code,
        });
        mySessionId = room.sessionId;
        reconnectToken = room.reconnectionToken;
        setupRoomListeners();
        saveReconnectSession();
        requestWakeLock();
        showScreen('lobby');
        if (typeof Onboarding !== 'undefined') Onboarding.tryShow('forbidden-word');
        showToast('เข้าร่วมห้องสำเร็จ!');
      } catch (err2) {
        console.error('Join room error:', err, err2);
        showToast('ไม่พบห้อง หรือห้องเต็มแล้ว');
      }
    }
  }

  function leaveRoom() {
    stopLocalTimer();
    stopKeepalive();
    cancelReconnectFlow();
    if (voteProgressInterval !== null) {
      clearInterval(voteProgressInterval);
      voteProgressInterval = null;
    }
    if (room) {
      try { room.leave(true); } catch (_) {} // consented=true
      room = null;
    }
    mySessionId = null;
    myWord = '';
    isHost = false;
    currentPhase = '';
    hasVoted = false;
    hasGuessed = false;
    reconnectToken = null;
    clearReconnectSession();
    releaseWakeLock();
    showScreen('home');
    checkRejoinBanner();
  }

  // ─── Keepalive Ping (prevent Cloud Run WebSocket idle timeout) ──
  var keepaliveInterval = null;

  function startKeepalive() {
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    keepaliveInterval = setInterval(function () {
      if (room) {
        try { room.send('PING'); } catch (e) { /* ignore */ }
      }
    }, 30000); // every 30s
  }

  function stopKeepalive() {
    if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
  }

  // ─── Room Listeners ───────────────────────────────────────────
  function setupRoomListeners() {
    if (!room) return;
    startKeepalive();

    // Phase change — also save reconnect session on every transition
    room.state.listen('phase', function (value) {
      var oldPhase = currentPhase;
      currentPhase = value;
      saveReconnectSession();
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

    room.onMessage('HOST_TRANSFERRED', function (data) {
      // data: { newHostId, newHostName }
      var msg = (data.newHostName || 'ผู้เล่น') + ' เป็นเจ้าของห้องแล้ว 👑';
      showToast(msg);
      // isHost state is updated via player.listen('isHost') which calls updateHostUI()
    });

    room.onMessage('NICKNAME_REJECTED', function (data) {
      // data: { reason: 'OFFENSIVE' | 'RESERVED' }
      var messages = {
        OFFENSIVE: 'ชื่อนี้ไม่ได้รับอนุญาต กรุณาเลือกชื่ออื่น',
        RESERVED: 'ชื่อนี้ถูกสงวนไว้ กรุณาเลือกชื่ออื่น',
      };
      var errorText = messages[data.reason] || 'ชื่อนี้ไม่สามารถใช้ได้ กรุณาเลือกชื่ออื่น';
      showNicknameRejectionError(errorText);
    });

    room.onMessage('ROOM_EXPIRED', function (data) {
      showToast(data.message || 'ห้องหมดเวลา');
      clearReconnectSession();
      leaveRoom();
    });

    // Reconnection token — save/update whenever server sends it
    room.onMessage('ROOM_TOKEN', function (data) {
      if (data && data.token) {
        reconnectToken = data.token;
        saveReconnectSession();
      }
    });

    // Player reconnected notification
    room.onMessage('PLAYER_RECONNECTED', function (data) {
      if (data && data.nickname) {
        showToast(data.nickname + ' \u0E01\u0E25\u0E31\u0E1A\u0E21\u0E32\u0E41\u0E25\u0E49\u0E27'); // กลับมาแล้ว
      }
    });

    room.onLeave(function (code) {
      console.log('[room] onLeave, code:', code);
      stopLocalTimer();

      // code 1000 = normal close (consented leave or kicked)
      // code 4000+ = server-side forced close
      // code < 1000 or other = unexpected disconnect
      if (code === 1000) {
        // Normal leave — already handled by leaveRoom() or KICKED handler
        room = null;
        showScreen('home');
        checkRejoinBanner();
        return;
      }

      // Unexpected disconnect — try to reconnect
      room = null;
      var saved = getSavedReconnectSession();
      if (saved && saved.reconnectionToken) {
        console.log('[room] unexpected disconnect, starting reconnect flow...');
        startReconnectFlow(saved);
      } else {
        showToast('\u0E16\u0E39\u0E01\u0E15\u0E31\u0E14\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D'); // ถูกตัดการเชื่อมต่อ
        showScreen('home');
        checkRejoinBanner();
      }
    });

    room.onError(function (code, message) {
      console.error('[room] onError:', code, message);
      // Don't show toast for transient errors during reconnection
      if (!isReconnecting) {
        showToast('\u0E02\u0E49\u0E2D\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14: ' + (message || code)); // ข้อผิดพลาด:
      }
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
    var hostActions = $('lobbyHostActions');

    if (isHost) {
      if (config) config.style.display = '';
      if (startBtn) startBtn.style.display = '';
      if (hostLabel) hostLabel.textContent = '👑 คุณเป็นเจ้าของห้อง';
      if (hostActions && currentPhase === 'LOBBY') hostActions.classList.remove('hidden');
    } else {
      if (config) config.style.display = 'none';
      if (startBtn) startBtn.style.display = 'none';
      if (hostLabel) hostLabel.textContent = '';
      if (hostActions) hostActions.classList.add('hidden');
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

    // Host sees "Next" button, others see waiting text
    var nextBtn = $('btnNextFromRoundend');
    if (nextBtn) {
      if (isHost) {
        nextBtn.style.display = '';
        nextBtn.textContent = '▶ รอบถัดไป';
      } else {
        nextBtn.style.display = '';
        nextBtn.textContent = '⏳ รอโฮสต์...';
        nextBtn.disabled = true;
      }
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

    // ── Rules modal ────────────────────────────────────────────
    $('btnShowRules').addEventListener('click', function () {
      vibrate(15);
      $('rulesModal').classList.add('active');
    });
    $('btnCloseRules').addEventListener('click', function () {
      vibrate(15);
      $('rulesModal').classList.remove('active');
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

    $('nicknameInput').addEventListener('input', function () {
      var errEl = $('nicknameError');
      if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
      this.classList.remove('input-error');
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

    // Transfer Host
    var btnTransferHost = $('btnTransferHost');
    if (btnTransferHost) {
      btnTransferHost.addEventListener('click', function () {
        vibrate(15);
        showTransferHostPicker();
      });
    }

    // ── Playing screen ──────────────────────────────────────────

    $('btnKill').addEventListener('click', function () {
      vibrate(50);
      var me = getMyPlayer();
      if (me && !me.isAlive) {
        showToast('คุณตายไปแล้ว');
        return;
      }
      // Show confirm death modal
      $('confirmDeathModal').classList.remove('hidden');
    });

    $('btnConfirmDeath').addEventListener('click', function () {
      vibrate([100, 50, 100]);
      if (window.soundManager) window.soundManager.eliminated();
      $('confirmDeathModal').classList.add('hidden');
      if (room) room.send('SURRENDER');
      showToast('💀 คุณตายแล้ว! คำของคุณคือ "' + myWord + '"');
    });

    $('btnDenyDeath').addEventListener('click', function () {
      vibrate(15);
      $('confirmDeathModal').classList.add('hidden');
      showToast('เล่นต่อ! ระวังอย่าพูดคำต้องห้าม');
    });

    $('btnGuessWord').addEventListener('click', function () {
      vibrate(30);
      if (window.soundManager) window.soundManager.tap();
      var me = getMyPlayer();
      if (me && !me.isAlive) {
        showToast('คุณตายแล้ว — รู้คำตัวเองแล้วไม่ต้องเดา');
        return;
      }
      if (me && me.hasGuessed) {
        showToast('คุณเดาคำแล้ว');
        return;
      }
      var guess = prompt('เดาคำของคุณ (ถ้ารอดจนจบ + ทายถูก ได้โบนัส +3):');
      if (guess !== null && guess.trim()) {
        sendGuessWord(guess);
      }
    });

    // Surrender button removed — merged into "ตาย" button

    // Target modal removed (self-report death)

    // ── Voting screen removed (self-report death) ────────────────

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
      if (window.soundManager) window.soundManager.tap();
      sendNextRound();
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

  // ─── Reconnection Event Bindings ───────────────────────────────

  function bindReconnectEvents() {
    // ── 1. Page visibility change (screen off/on, tab switch) ───
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        console.log('[reconnect] page became visible');
        // Re-acquire wake lock (browser releases it when page is hidden)
        if (room && currentPhase && currentPhase !== 'LOBBY' && currentPhase !== 'GAME_OVER') {
          requestWakeLock();
        }
        // If we lost the room while hidden, attempt reconnect
        if (!room && !isReconnecting) {
          var saved = getSavedReconnectSession();
          if (saved && saved.reconnectionToken) {
            console.log('[reconnect] room lost while hidden, reconnecting...');
            startReconnectFlow(saved);
          }
        }
      }
    });

    // ── 2. Online/offline network events ────────────────────────
    window.addEventListener('online', function () {
      console.log('[reconnect] network online');
      if (!room && !isReconnecting) {
        var saved = getSavedReconnectSession();
        if (saved && saved.reconnectionToken) {
          console.log('[reconnect] network restored, reconnecting...');
          startReconnectFlow(saved);
        }
      }
    });

    window.addEventListener('offline', function () {
      console.log('[reconnect] network offline');
      if (room) {
        showToast('\u0E02\u0E32\u0E14\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D \u0E23\u0E2D\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E01\u0E25\u0E31\u0E1A\u0E21\u0E32...'); // ขาดการเชื่อมต่อ รอสัญญาณกลับมา...
      }
    });

    // ── 3. beforeunload warning for active game ─────────────────
    window.addEventListener('beforeunload', function (e) {
      if (room && currentPhase && currentPhase !== 'LOBBY' && currentPhase !== 'GAME_OVER') {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });

    // ── 4. Cancel reconnect button ──────────────────────────────
    var btnCancel = _$('btnCancelReconnect');
    if (btnCancel) {
      btnCancel.addEventListener('click', function () {
        cancelReconnectFlow();
        clearReconnectSession();
        showScreen('home');
        checkRejoinBanner();
      });
    }

    // ── 5. Rejoin banner buttons ────────────────────────────────
    var btnRejoin = _$('btnRejoinRoom');
    if (btnRejoin) {
      btnRejoin.addEventListener('click', function () {
        vibrate(30);
        var saved = getSavedReconnectSession();
        if (saved && saved.reconnectionToken) {
          $('rejoinBanner').classList.add('hidden');
          startReconnectFlow(saved);
        } else {
          showToast('\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2B\u0E49\u0E2D\u0E07\u0E40\u0E01\u0E48\u0E32'); // ไม่พบข้อมูลห้องเก่า
          clearReconnectSession();
          $('rejoinBanner').classList.add('hidden');
        }
      });
    }

    var btnDismiss = _$('btnDismissRejoin');
    if (btnDismiss) {
      btnDismiss.addEventListener('click', function () {
        clearReconnectSession();
        $('rejoinBanner').classList.add('hidden');
      });
    }
  }

  // ─── Init ─────────────────────────────────────────────────────
  function init() {
    showScreen('home');
    loadCategoriesFromServer();
    try { bindEvents(); } catch(e) { console.error('[init] bindEvents crashed:', e); }
    try { bindReconnectEvents(); } catch(e) { console.error('[init] bindReconnectEvents crashed:', e); }
    try { initWordHideSystem(); } catch(e) { console.error('[init] initWordHideSystem crashed:', e); }

    // ── Auto-reconnect on page load (covers refresh, wake from sleep) ──
    var savedSession = getSavedReconnectSession();
    if (savedSession && savedSession.reconnectionToken) {
      // Restore nickname/avatar so the UI is consistent
      nickname = savedSession.nickname || nickname;
      avatar = savedSession.avatar || avatar;
      console.log('[init] found saved session, attempting reconnect to room', savedSession.roomCode);
      startReconnectFlow(savedSession);
    } else {
      // Show rejoin banner if there's an expired/partial session
      checkRejoinBanner();
    }

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
