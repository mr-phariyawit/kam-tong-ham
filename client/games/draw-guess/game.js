/**
 * game.js -- Draw & Guess (วาดทาย) client
 *
 * Connects to Colyseus DrawGuessRoom via WebSocket.
 * Manages: home, nickname, lobby, drawing canvas, guessing, round end, scoreboard, game over.
 *
 * Canvas features: freehand pen, eraser, 8 colors, 3 sizes, undo, clear.
 * Touch + mouse support (mobile-first).
 */
(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────
  var SERVER_URL = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
  var ROOM_NAME = 'draw_guess';
  var AVATARS = [
    '\u{1f600}','\u{1f60e}','\u{1f929}','\u{1f608}','\u{1f431}','\u{1f436}','\u{1f98a}','\u{1f438}',
    '\u{1f435}','\u{1f981}','\u{1f43c}','\u{1f428}','\u{1f42f}','\u{1f430}','\u{1f437}','\u{1f42e}',
    '\u{1f414}','\u{1f419}','\u{1f47b}','\u{1f916}','\u{1f47d}','\u{1f383}','\u{1f480}','\u{1f9e0}',
    '\u{1f525}','⭐','\u{1f48e}','\u{1f308}',
  ];
  var COLORS = ['#000000','#FF0000','#0000FF','#00AA00','#FFD700','#FF8C00','#800080','#FFFFFF'];
  var SIZES = [2, 5, 10];

  // ─── State ────────────────────────────────────────────────────
  var client = null;
  var room = null;
  var mySessionId = null;
  var isHost = false;
  var nickname = '';
  var avatar = '\u{1f600}';
  var pendingAction = null; // 'create' | 'join'
  var joinCode = '';
  var reconnectToken = null;

  // Game state
  var isDrawer = false;
  var currentWord = '';
  var hasGuessedCorrectly = false;
  var currentPhase = '';
  var configRounds = 2;
  var configDrawTime = 60;

  // Canvas state
  var canvas = null;
  var ctx = null;
  var isDrawing = false;
  var currentTool = 'pen';
  var currentColor = '#000000';
  var currentSize = 5;
  var strokes = []; // StrokeData[]
  var currentPoints = []; // current stroke points

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
    if (screenId === 'game') resizeCanvas();
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
      btn.addEventListener('click', function () { avatar = a; renderAvatarPicker(); });
      picker.appendChild(btn);
    });
  }

  // ─── Connection ───────────────────────────────────────────────
  function connectToRoom(action, code) {
    if (client) {
      try { if (room) room.leave(); } catch (_) {}
    }
    client = new Colyseus.Client(SERVER_URL);

    var options = { nickname: nickname, avatar: avatar };
    if (reconnectToken) options.roomToken = reconnectToken;

    var promise;
    if (action === 'create') {
      promise = client.create(ROOM_NAME, options);
    } else {
      options.roomCode = code.toUpperCase();
      promise = client.joinById(code, options).catch(function () {
        return client.join(ROOM_NAME, options);
      });
    }

    promise.then(function (r) {
      room = r;
      mySessionId = r.sessionId;
      setupRoomHandlers();
      showScreen('lobby');
    }).catch(function (err) {
      showToast('เชื่อมต่อไม่สำเร็จ: ' + (err.message || err), 3000, true);
    });
  }

  function setupRoomHandlers() {
    room.onStateChange(function (state) {
      updateLobby(state);
      updateGameUI(state);
    });

    room.onMessage('ROOM_TOKEN', function (data) {
      reconnectToken = data.token;
      try { localStorage.setItem('dg_reconnectToken', data.token); } catch (_) {}
    });

    room.onMessage('ERROR', function (data) {
      showToast(data.message || data.code, 3000, true);
    });

    room.onMessage('CONFIG_UPDATED', function (data) {
      configRounds = data.rounds;
      configDrawTime = data.drawTime;
      $('roundsValue').textContent = data.rounds;
      $('timeValue').textContent = data.drawTime;
    });

    room.onMessage('DRAW_WORD', function (data) {
      currentWord = data.word;
      renderWordDisplay();
    });

    room.onMessage('PHASE_CHANGE', function (data) {
      currentPhase = data.phase;
      handlePhaseChange(data);
    });

    room.onMessage('WORD_HINT', function (data) {
      renderHint(data.wordLength, data.firstChar);
    });

    room.onMessage('STROKE', function (data) {
      if (!isDrawer) drawStrokeOnCanvas(data);
    });

    room.onMessage('CLEAR_CANVAS', function () {
      if (!isDrawer) { strokes = []; clearCanvas(); }
    });

    room.onMessage('UNDO_STROKE', function () {
      if (!isDrawer) { strokes.pop(); redrawCanvas(); }
    });

    room.onMessage('GUESS', function (data) {
      addGuessFeedItem(data.nickname + ': ' + data.text, false);
    });

    room.onMessage('CORRECT_GUESS', function (data) {
      addGuessFeedItem(data.nickname + ' ทายถูก! (+' + data.points + ')', true);
      if (data.playerId === mySessionId) {
        hasGuessedCorrectly = true;
        $('guessInput').disabled = true;
        $('guessInput').placeholder = 'ทายถูกแล้ว!';
      }
    });

    room.onMessage('TURN_END', function (data) {
      showRoundEnd(data);
    });

    room.onMessage('SCOREBOARD', function (data) {
      showScoreboard(data);
    });

    room.onMessage('GAME_OVER', function (data) {
      showGameOver(data);
    });

    room.onMessage('STROKE_SNAPSHOT', function (data) {
      try {
        var snapshotStrokes = JSON.parse(data.strokes);
        strokes = snapshotStrokes;
        redrawCanvas();
      } catch (_) {}
    });

    room.onMessage('PHASE_CONTEXT', function (data) {
      currentPhase = data.phase;
      hasGuessedCorrectly = data.hasGuessedCorrectly || false;
    });

    room.onMessage('KICKED', function () {
      showToast('คุณถูกเตะออกจากห้อง', 3000, true);
      showScreen('home');
    });

    room.onMessage('HOST_TRANSFERRED', function (data) {
      isHost = (data.newHostId === mySessionId);
      showToast(data.newHostNickname + ' เป็นเจ้าของห้องใหม่');
    });

    room.onLeave(function () {
      showToast('ตัดการเชื่อมต่อ', 2000, true);
    });
  }

  // ─── Lobby ────────────────────────────────────────────────────
  function updateLobby(state) {
    if (!state) return;

    $('roomCodeDisplay').textContent = state.roomCode || '----';

    // Build player list
    var listEl = $('playerList');
    listEl.innerHTML = '';
    state.players.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = '<span class="player-avatar">' + (p.avatar || '\u{1f600}') + '</span>' +
        '<span class="player-name">' + p.nickname + '</span>' +
        (p.isHost ? '<span class="player-host">\u{1f451} เจ้าของห้อง</span>' : '') +
        (!p.isConnected ? '<span style="color:var(--dg-error);font-size:12px;">ออฟไลน์</span>' : '');
      listEl.appendChild(row);

      if (p.id === mySessionId) {
        isHost = p.isHost;
      }
    });

    // Show config + start button for host
    $('configPanel').style.display = isHost ? 'block' : 'none';
    $('btnStart').style.display = isHost ? 'block' : 'none';
  }

  // ─── Phase Handling ───────────────────────────────────────────
  function handlePhaseChange(data) {
    switch (data.phase) {
      case 'COUNTDOWN':
        isDrawer = (data.drawerId === mySessionId);
        currentWord = '';
        hasGuessedCorrectly = false;
        strokes = [];
        showScreen('game');
        clearCanvas();
        setupGameUI(data);
        $('gameTimer').textContent = data.timer;
        $('gameTimer').classList.remove('urgent');
        break;

      case 'DRAWING':
        $('gameTimer').textContent = data.timer;
        $('toolsPanel').style.display = isDrawer ? 'flex' : 'none';
        $('guessArea').style.display = isDrawer ? 'none' : 'block';
        $('guessInput').disabled = hasGuessedCorrectly;
        $('guessInput').placeholder = hasGuessedCorrectly ? 'ทายถูกแล้ว!' : 'พิมพ์คำตอบ...';
        $('guessFeed').innerHTML = '';
        renderWordDisplay();
        break;
    }
  }

  function setupGameUI(data) {
    $('roundInfo').textContent = 'รอบ ' + (data.currentRound || 1) + '/' + (configRounds) +
      ' (' + (data.currentTurn || 1) + '/' + (data.turnsPerRound || 3) + ')';
    $('drawerInfo').textContent = 'กำลังวาด: ' + (data.drawerNickname || '...');

    // Word hint area
    if (!isDrawer && data.wordLength) {
      var hint = '';
      for (var i = 0; i < data.wordLength; i++) hint += '_ ';
      $('wordText').innerHTML = '<span class="word-hint">' + hint.trim() + '</span>';
    }

    // Canvas tools
    $('toolsPanel').style.display = 'none';
    $('guessArea').style.display = 'none';

    // Score sidebar
    updateScoreSidebar();
  }

  function renderWordDisplay() {
    var el = $('wordDisplay');
    if (isDrawer && currentWord) {
      $('wordText').innerHTML = 'คำของคุณ: <span class="word-secret">' + currentWord + '</span>';
    }
  }

  function renderHint(wordLength, firstChar) {
    if (isDrawer) return;
    var hint = firstChar;
    for (var i = 1; i < wordLength; i++) hint += ' _';
    $('wordText').innerHTML = '<span class="word-hint">' + hint + '</span>';
  }

  // ─── Timer ────────────────────────────────────────────────────
  function updateTimer() {
    if (!room || !room.state) return;
    var timer = room.state.timer;
    var el = $('gameTimer');
    if (el) {
      el.textContent = timer;
      if (timer <= 10) { el.classList.add('urgent'); }
      else { el.classList.remove('urgent'); }
    }
  }

  // ─── Canvas ───────────────────────────────────────────────────
  function initCanvas() {
    canvas = $('drawCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();

    // Mouse events
    canvas.addEventListener('mousedown', onPointerStart);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerEnd);
    canvas.addEventListener('mouseleave', onPointerEnd);

    // Touch events
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onPointerEnd);
    canvas.addEventListener('touchcancel', onPointerEnd);

    window.addEventListener('resize', resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas) return;
    var container = $('canvasContainer');
    if (!container) return;
    var w = container.clientWidth;
    var h = container.clientHeight;
    var size = Math.max(Math.min(w, h), 300);
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    redrawCanvas();
  }

  function clearCanvas() {
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function redrawCanvas() {
    clearCanvas();
    for (var i = 0; i < strokes.length; i++) {
      drawStrokeOnCanvas(strokes[i]);
    }
  }

  function drawStrokeOnCanvas(stroke) {
    if (!ctx || !stroke || !stroke.points || stroke.points.length < 1) return;

    ctx.beginPath();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color || '#000000';
    }
    ctx.lineWidth = stroke.size || 5;

    var pts = stroke.points;
    if (pts.length === 1) {
      ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var j = 1; j < pts.length; j++) {
        ctx.lineTo(pts[j].x, pts[j].y);
      }
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function getCanvasCoords(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function onPointerStart(e) {
    if (!isDrawer || currentPhase !== 'DRAWING') return;
    isDrawing = true;
    var coords = getCanvasCoords(e);
    currentPoints = [coords];
    drawStrokeOnCanvas({ tool: currentTool, color: currentColor, size: currentSize, points: currentPoints });
  }

  function onPointerMove(e) {
    if (!isDrawing || !isDrawer) return;
    var coords = getCanvasCoords(e);
    currentPoints.push(coords);
    // Redraw current stroke
    redrawCanvas();
    drawStrokeOnCanvas({ tool: currentTool, color: currentColor, size: currentSize, points: currentPoints });
  }

  function onPointerEnd() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentPoints.length > 0) {
      var stroke = { tool: currentTool, color: currentColor, size: currentSize, points: currentPoints };
      strokes.push(stroke);
      // Send to server
      if (room) room.send('STROKE', stroke);
    }
    currentPoints = [];
  }

  function onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      var touch = e.touches[0];
      onPointerStart({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      var touch = e.touches[0];
      onPointerMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  // ─── Drawing Tools ────────────────────────────────────────────
  function renderColorPalette() {
    var palette = $('colorPalette');
    palette.innerHTML = '';
    COLORS.forEach(function (c) {
      var swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (c === currentColor ? ' active' : '');
      swatch.style.backgroundColor = c;
      if (c === '#FFFFFF') swatch.style.border = '2px solid #ccc';
      swatch.addEventListener('click', function () {
        currentColor = c;
        currentTool = 'pen';
        renderColorPalette();
        updateToolButtons();
      });
      palette.appendChild(swatch);
    });
  }

  function updateToolButtons() {
    $('toolPen').classList.toggle('active', currentTool === 'pen');
    $('toolEraser').classList.toggle('active', currentTool === 'eraser');
  }

  function renderSizeButtons() {
    var btns = $('sizeButtons').querySelectorAll('.size-btn');
    btns.forEach(function (btn) {
      btn.classList.toggle('active', parseInt(btn.dataset.size) === currentSize);
    });
  }

  // ─── Guess Feed ───────────────────────────────────────────────
  function addGuessFeedItem(text, isCorrect) {
    var feed = $('guessFeed');
    var item = document.createElement('div');
    item.className = 'guess-item' + (isCorrect ? ' guess-correct' : '');
    item.textContent = text;
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
  }

  // ─── Score Sidebar ────────────────────────────────────────────
  function updateScoreSidebar() {
    var sidebar = $('scoreSidebar');
    if (!room || !room.state) { sidebar.classList.remove('visible'); return; }
    sidebar.classList.add('visible');
    sidebar.innerHTML = '';
    var scores = [];
    room.state.players.forEach(function (p) {
      scores.push({ name: p.nickname, pts: p.score });
    });
    scores.sort(function (a, b) { return b.pts - a.pts; });
    scores.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'score-row';
      row.innerHTML = '<span class="score-name">' + s.name + '</span><span class="score-pts">' + s.pts + '</span>';
      sidebar.appendChild(row);
    });
  }

  // ─── Round End ────────────────────────────────────────────────
  function showRoundEnd(data) {
    showScreen('roundend');
    $('revealedWord').textContent = data.word;

    var resultsEl = $('roundResults');
    resultsEl.innerHTML = '';
    var results = data.results || [];
    results.sort(function (a, b) { return b.roundPoints - a.roundPoints; });
    results.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'result-row';
      var label = r.isDrawer ? '<span class="result-drawer"> (วาด)</span>' : '';
      var pts = r.roundPoints > 0 ? ('+' + r.roundPoints) : '0';
      row.innerHTML = '<span class="result-name">' + r.nickname + label + '</span>' +
        '<span class="result-pts">' + pts + '</span>';
      resultsEl.appendChild(row);
    });
  }

  // ─── Scoreboard ───────────────────────────────────────────────
  function showScoreboard(data) {
    showScreen('scoreboard');
    $('scoreboardTitle').textContent = data.isFinal ? 'คะแนนรวมสุดท้าย' : ('คะแนนหลังรอบ ' + data.currentRound);

    var listEl = $('scoreboardList');
    listEl.innerHTML = '';
    var scores = data.scores || [];
    scores.forEach(function (s) {
      var entry = document.createElement('div');
      entry.className = 'score-entry';
      entry.innerHTML = '<span class="rank">#' + s.rank + '</span>' +
        '<span class="name">' + s.nickname + '</span>' +
        '<span class="pts">' + s.score + '</span>';
      listEl.appendChild(entry);
    });
  }

  // ─── Game Over ────────────────────────────────────────────────
  function showGameOver(data) {
    showScreen('gameover');
    $('winnerName').textContent = data.winnerNickname;
    var topScore = data.scores && data.scores[0] ? data.scores[0].score : 0;
    $('winnerScore').textContent = topScore + ' คะแนน';

    var scoresEl = $('finalScores');
    scoresEl.innerHTML = '';
    (data.scores || []).forEach(function (s) {
      var entry = document.createElement('div');
      entry.className = 'score-entry';
      entry.innerHTML = '<span class="rank">#' + s.rank + '</span>' +
        '<span class="name">' + s.nickname + '</span>' +
        '<span class="pts">' + s.score + '</span>';
      scoresEl.appendChild(entry);
    });
  }

  // ─── Event Listeners ──────────────────────────────────────────
  function init() {
    renderAvatarPicker();
    initCanvas();
    renderColorPalette();
    renderSizeButtons();

    // Home screen
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
    $('btnBackHome').addEventListener('click', function () { showScreen('home'); });

    // Nickname screen
    $('btnGo').addEventListener('click', function () {
      nickname = $('nicknameInput').value.trim() || '\u{1f600}';
      if (pendingAction === 'join') {
        joinCode = $('joinCodeInput').value.trim().toUpperCase();
        if (joinCode.length < 4) { showToast('กรุณาใส่รหัสห้อง 4 ตัว', 2000, true); return; }
      }
      connectToRoom(pendingAction, joinCode);
    });

    // Lobby
    $('roomCodeDisplay').addEventListener('click', function () {
      var code = this.textContent;
      if (code && code !== '----') {
        navigator.clipboard.writeText(code).then(function () { showToast('คัดลอกรหัสห้องแล้ว'); });
      }
    });
    $('btnStart').addEventListener('click', function () { if (room) room.send('START_GAME'); });

    // Config steppers
    $('roundsMinus').addEventListener('click', function () {
      if (configRounds > 1) { configRounds--; $('roundsValue').textContent = configRounds; if (room) room.send('CONFIG', { rounds: configRounds }); }
    });
    $('roundsPlus').addEventListener('click', function () {
      if (configRounds < 5) { configRounds++; $('roundsValue').textContent = configRounds; if (room) room.send('CONFIG', { rounds: configRounds }); }
    });
    $('timeMinus').addEventListener('click', function () {
      if (configDrawTime > 30) { configDrawTime -= 10; $('timeValue').textContent = configDrawTime; if (room) room.send('CONFIG', { drawTime: configDrawTime }); }
    });
    $('timePlus').addEventListener('click', function () {
      if (configDrawTime < 120) { configDrawTime += 10; $('timeValue').textContent = configDrawTime; if (room) room.send('CONFIG', { drawTime: configDrawTime }); }
    });

    // Drawing tools
    $('toolPen').addEventListener('click', function () { currentTool = 'pen'; updateToolButtons(); });
    $('toolEraser').addEventListener('click', function () { currentTool = 'eraser'; updateToolButtons(); });
    $('toolUndo').addEventListener('click', function () {
      if (strokes.length > 0) {
        strokes.pop();
        redrawCanvas();
        if (room) room.send('UNDO_STROKE');
      }
    });
    $('toolClear').addEventListener('click', function () {
      strokes = [];
      clearCanvas();
      if (room) room.send('CLEAR_CANVAS');
    });

    // Size buttons
    var sizeBtns = $('sizeButtons').querySelectorAll('.size-btn');
    sizeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentSize = parseInt(btn.dataset.size);
        renderSizeButtons();
      });
    });

    // Guess input
    $('guessSubmit').addEventListener('click', submitGuess);
    $('guessInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitGuess();
    });

    // Play again
    $('btnPlayAgain').addEventListener('click', function () {
      if (room && isHost) {
        room.send('START_GAME');
      } else {
        showScreen('lobby');
      }
    });

    // Timer update interval
    setInterval(function () {
      updateTimer();
      updateScoreSidebar();
    }, 250);
  }

  function submitGuess() {
    var input = $('guessInput');
    var text = input.value.trim();
    if (!text || hasGuessedCorrectly) return;
    if (room) room.send('GUESS', { text: text });
    input.value = '';
  }

  // ─── Init ─────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
