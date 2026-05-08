/**
 * game.js -- Knights (อัศวิน) client
 *
 * Connects to Colyseus KnightsRoom via WebSocket.
 * Manages all game screens: home, nickname, lobby, role reveal,
 * team proposal, team vote, mission, mission reveal, assassin guess, game over.
 */
(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────
  var SERVER_URL = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
  var ROOM_NAME = 'knights';
  var AVATARS = [
    '\u{1F600}','\u{1F60E}','\u{1F929}','\u{1F608}','\u{1F431}','\u{1F436}','\u{1F98A}','\u{1F438}',
    '\u{1F435}','\u{1F981}','\u{1F43C}','\u{1F428}','\u{1F42F}','\u{1F430}','\u{1F437}','\u{1F42E}',
    '\u{1F414}','\u{1F419}','\u{1F47B}','\u{1F916}','\u{1F47D}','\u{1F383}','\u{1F480}','\u{1F9E0}',
    '\u{1F525}','\u{2B50}','\u{1F48E}','\u{1F308}',
  ];

  var ROLE_DESCRIPTIONS = {
    'leader': 'คุณเป็นผู้นำอัศวิน! คุณรู้ว่าใครเป็นฝ่ายชั่ว แต่ต้องระวังมือสังหาร',
    'good-knight': 'คุณเป็นอัศวินฝ่ายดี! ช่วยทำภารกิจให้สำเร็จ',
    'advisor': 'คุณเป็นที่ปรึกษา! คุณรู้ว่าใครอาจเป็นผู้นำอัศวิน (แต่อาจเป็นสายลับฝ่ายชั่วก็ได้)',
    'traitor': 'คุณเป็นผู้ทรยศ! ล้มภารกิจให้ได้โดยไม่ให้ถูกจับ',
    'assassin': 'คุณเป็นมือสังหาร! ล้มภารกิจ และถ้าฝ่ายดีชนะ คุณมีโอกาสสุดท้ายเดาผู้นำอัศวิน',
    'double-agent': 'คุณเป็นสายลับฝ่ายชั่ว! ที่ปรึกษาจะเห็นคุณเหมือนผู้นำอัศวิน',
  };

  var WIN_REASONS = {
    'three_missions_failed': 'ภารกิจล้มเหลว 3 ครั้ง',
    'hammer_rule': 'ปฏิเสธทีม 5 ครั้งติดต่อกัน',
    'assassin_killed_leader': 'มือสังหารเดาผู้นำอัศวินถูกต้อง!',
    'assassin_missed': 'มือสังหารเดาผิด ผู้นำอัศวินรอดชีวิต!',
    'assassin_timeout': 'มือสังหารไม่ได้เดา ผู้นำอัศวินรอดชีวิต!',
    'assassin_disconnected': 'มือสังหารหลุดออก ผู้นำอัศวินรอดชีวิต!',
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
  var myTeam = '';
  var evilPlayers = [];
  var leaderCandidates = [];
  var currentPhase = '';
  var players = {};
  var selectedTeam = [];
  var selectedAssassinTarget = '';
  var hasVoted = false;
  var hasMissionVoted = false;
  var isOnTeam = false;

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

  // ─── Avatar Picker ────────────────────────────────────────────
  function renderAvatarPicker() {
    var picker = $('avatarPicker');
    picker.innerHTML = '';
    AVATARS.forEach(function (a) {
      var btn = document.createElement('div');
      btn.className = 'avatar-btn' + (a === avatar ? ' selected' : '');
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
      if (!ColyseusGuard.verify('knights')) return;
      client = new Colyseus.Client(SERVER_URL);
      joinOrCreate(action, code);
    };
    document.head.appendChild(script);
  }

  function joinOrCreate(action, code) {
    var opts = { nickname: nickname, avatar: avatar };
    if (reconnectToken) opts.roomToken = reconnectToken;

    var promise;
    if (action === 'create') {
      promise = client.create(ROOM_NAME, opts);
    } else {
      opts.roomCode = code.toUpperCase();
      promise = client.joinById(code, opts).catch(function () {
        return client.join(ROOM_NAME, opts);
      });
    }
    promise.then(function (r) {
      room = r;
      mySessionId = r.sessionId;
      setupRoom();
      showScreen('lobby');
      if (typeof Onboarding !== 'undefined') Onboarding.tryShow('knights');
    }).catch(function (e) {
      showToast('เข้าร่วมไม่สำเร็จ: ' + (e.message || e), 3000, true);
    });
  }

  // ─── Room Setup ───────────────────────────────────────────────
  function setupRoom() {
    room.state.players.onAdd(function (player, key) {
      players[key] = {
        id: key,
        nickname: player.nickname,
        avatar: player.avatar,
        isHost: player.isHost,
        isConnected: player.isConnected,
      };
      if (key === mySessionId) {
        isHost = player.isHost;
      }
      player.onChange(function () {
        players[key] = {
          id: key,
          nickname: player.nickname,
          avatar: player.avatar,
          isHost: player.isHost,
          isConnected: player.isConnected,
        };
        if (key === mySessionId) {
          isHost = player.isHost;
        }
        updateLobby();
      });
      updateLobby();
    });

    room.state.players.onRemove(function (_player, key) {
      delete players[key];
      updateLobby();
    });

    room.state.listen('phase', function (val) {
      currentPhase = val;
    });

    room.state.listen('timer', function (val) {
      updateTimers(val);
    });

    // ─── Message handlers ──────────────────────────────────────
    room.onMessage('ROOM_TOKEN', function (msg) {
      reconnectToken = msg.token;
    });

    room.onMessage('ERROR', function (msg) {
      showToast(msg.message || msg.code, 3000, true);
    });

    room.onMessage('KICKED', function () {
      showToast('คุณถูกเตะออกจากห้อง', 3000, true);
      showScreen('home');
      room = null;
    });

    room.onMessage('HOST_TRANSFERRED', function (msg) {
      showToast(msg.newHostNickname + ' เป็นเจ้าของห้องแล้ว');
    });

    room.onMessage('ROLE_DATA', function (msg) {
      myRole = msg.role;
      myRoleTh = msg.roleTh;
      myRoleIcon = msg.roleIcon;
      myTeam = msg.team;
      evilPlayers = msg.evilPlayers || [];
      leaderCandidates = msg.leaderCandidates || [];
      showRoleReveal();
    });

    room.onMessage('PHASE_CHANGE', function (msg) {
      handlePhaseChange(msg);
    });

    room.onMessage('PHASE_CONTEXT', function (msg) {
      // Reconnect context -- show appropriate screen
      handlePhaseChange(msg);
    });

    room.onMessage('TEAM_VOTE_CAST', function (msg) {
      $('teamVoteStatus').textContent = msg.totalVotesCast + '/' + msg.totalVotersExpected + ' โหวตแล้ว';
    });

    room.onMessage('TEAM_VOTE_RESULT', function (msg) {
      showTeamVoteResult(msg);
    });

    room.onMessage('MISSION_VOTE_CONFIRMED', function () {
      showToast('โหวตภารกิจสำเร็จ');
    });

    room.onMessage('MISSION_VOTE_PROGRESS', function (msg) {
      $('missionProgress').textContent = msg.missionVotesCast + '/' + msg.missionVotersExpected + ' โหวตแล้ว';
    });

    room.onMessage('MISSION_RESULT', function (msg) {
      showMissionReveal(msg);
    });

    room.onMessage('ASSASSIN_TARGETS', function (msg) {
      renderAssassinTargets(msg.targets);
    });

    room.onMessage('ASSASSIN_GUESS_RESULT', function (msg) {
      showAssassinResult(msg);
    });

    room.onMessage('GAME_OVER', function (msg) {
      showGameOver(msg);
    });

    room.onMessage('PLAYER_RECONNECTED', function (msg) {
      showToast(msg.nickname + ' กลับมาแล้ว');
    });
  }

  // ─── Lobby ────────────────────────────────────────────────────
  function updateLobby() {
    if (currentPhase && currentPhase !== 'LOBBY' && currentPhase !== 'GAME_OVER') return;

    var container = $('lobbyContainer');
    if (!container) return;

    var roomCode = room && room.state ? room.state.roomCode : '';
    var playerKeys = Object.keys(players);

    var html = '<div class="lobby-header">';
    html += '<h2 class="lobby-title">อัศวิน</h2>';
    html += '<div class="lobby-code">' + roomCode + '</div>';
    html += '<p class="lobby-count">' + playerKeys.length + ' ผู้เล่น (ต้องมีอย่างน้อย 5 คน)</p>';
    html += '<button class="btn-share-room" id="btnShareRoom" style="margin-top:8px;">\u{1f4f1} แชร์ห้อง / Share</button>';
    html += '</div>';

    html += '<div class="lobby-players">';
    playerKeys.forEach(function (key) {
      var p = players[key];
      html += '<div class="lobby-player' + (p.isHost ? ' host' : '') + '">';
      html += '<span class="lobby-avatar">' + p.avatar + '</span>';
      html += '<span class="lobby-name">' + p.nickname + '</span>';
      if (p.isHost) html += '<span class="lobby-badge">\u{1F451}</span>';
      if (!p.isConnected) html += '<span class="lobby-badge offline">\u{1F4F4}</span>';
      html += '</div>';
    });
    html += '</div>';

    if (isHost) {
      html += '<button class="btn btn-primary" id="btnStartGame" style="width: 100%; max-width: 300px; margin-top: 16px;">เริ่มเกม</button>';
    } else {
      html += '<p style="margin-top: 16px; color: var(--kn-text-secondary);">รอเจ้าของห้องเริ่มเกม...</p>';
    }

    container.innerHTML = html;

    var startBtn = $('btnStartGame');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        room.send('START_GAME');
      });
    }

    // Share room button
    var btnShare = $('btnShareRoom');
    if (btnShare && window.RoomShare) {
      btnShare.addEventListener('click', function () {
        window.RoomShare.showShareModal(roomCode);
      });
    }
  }

  // ─── Role Reveal ──────────────────────────────────────────────
  function showRoleReveal() {
    showScreen('roleReveal');
    $('roleRevealIcon').textContent = myRoleIcon;
    $('roleRevealName').textContent = myRoleTh;
    $('roleRevealInfo').textContent = ROLE_DESCRIPTIONS[myRole] || '';

    var teamDiv = $('roleRevealTeam');
    if (evilPlayers.length > 0 && myTeam === 'evil') {
      teamDiv.style.display = 'block';
      teamDiv.innerHTML = '<strong>ทีมฝ่ายชั่ว:</strong> ' + evilPlayers.map(function (p) {
        return p.nickname;
      }).join(', ');
    } else if (evilPlayers.length > 0 && myRole === 'leader') {
      teamDiv.style.display = 'block';
      teamDiv.innerHTML = '<strong>ฝ่ายชั่ว:</strong> ' + evilPlayers.map(function (p) {
        return p.nickname;
      }).join(', ');
    } else if (leaderCandidates.length > 0 && myRole === 'advisor') {
      teamDiv.style.display = 'block';
      teamDiv.innerHTML = '<strong>ผู้นำอัศวิน (อาจเป็น):</strong> ' + leaderCandidates.map(function (p) {
        return p.nickname;
      }).join(', ');
    } else {
      teamDiv.style.display = 'none';
    }
  }

  // ─── Mission Tracker ──────────────────────────────────────────
  function renderMissionTracker(containerId) {
    var container = $(containerId);
    if (!container || !room) return;
    var state = room.state;
    var html = '';
    for (var i = 1; i <= 5; i++) {
      var cls = 'mission-dot';
      // Check mission history
      var found = false;
      if (state.missionHistory) {
        state.missionHistory.forEach(function (m) {
          if (m.missionNumber === i) {
            cls += m.succeeded ? ' success' : ' fail';
            found = true;
          }
        });
      }
      if (!found && i === state.currentMission) cls += ' current';
      html += '<div class="' + cls + '">' + i + '</div>';
    }
    container.innerHTML = html;
  }

  // ─── Phase Change Handler ─────────────────────────────────────
  function handlePhaseChange(msg) {
    var phase = msg.phase;

    if (phase === 'TEAM_PROPOSAL') {
      showTeamProposal(msg);
    } else if (phase === 'TEAM_VOTE') {
      showTeamVote(msg);
    } else if (phase === 'MISSION') {
      showMission(msg);
    } else if (phase === 'MISSION_REVEAL') {
      // handled by MISSION_RESULT message
    } else if (phase === 'ASSASSIN_GUESS') {
      showAssassinGuess(msg);
    }
  }

  // ─── Team Proposal ────────────────────────────────────────────
  function showTeamProposal(msg) {
    showScreen('teamProposal');
    selectedTeam = [];
    hasVoted = false;
    hasMissionVoted = false;
    isOnTeam = false;

    renderMissionTracker('missionTracker');

    var isLeader = msg.leaderId === mySessionId;
    var teamSize = msg.teamSize || room.state.currentMissionTeamSize;

    $('proposalSubtitle').textContent = (msg.leaderNickname || room.state.currentLeaderNickname) +
      ' กำลังเลือกทีม ' + teamSize + ' คน สำหรับภารกิจที่ ' + (msg.currentMission || room.state.currentMission);

    var rejections = msg.consecutiveRejections || room.state.consecutiveRejections || 0;
    $('rejectionCounter').textContent = rejections > 0 ? 'ปฏิเสธติดต่อกัน: ' + rejections + '/5' : '';

    if (isLeader) {
      $('btnSubmitTeam').style.display = 'inline-flex';
      $('proposalWaiting').style.display = 'none';
      renderTeamSelectGrid(teamSize);
    } else {
      $('btnSubmitTeam').style.display = 'none';
      $('proposalWaiting').style.display = 'block';
      $('teamSelectGrid').innerHTML = '';
    }
  }

  function renderTeamSelectGrid(teamSize) {
    var grid = $('teamSelectGrid');
    grid.innerHTML = '';

    Object.keys(players).forEach(function (key) {
      var p = players[key];
      if (!p.isConnected) return;

      var card = document.createElement('div');
      card.className = 'player-select-card';
      card.innerHTML = '<div class="avatar">' + p.avatar + '</div><div class="name">' + p.nickname + '</div>';
      card.dataset.playerId = key;

      card.addEventListener('click', function () {
        var idx = selectedTeam.indexOf(key);
        if (idx >= 0) {
          selectedTeam.splice(idx, 1);
          card.classList.remove('selected');
        } else if (selectedTeam.length < teamSize) {
          selectedTeam.push(key);
          card.classList.add('selected');
        } else {
          showToast('เลือกได้สูงสุด ' + teamSize + ' คน');
        }
      });

      grid.appendChild(card);
    });
  }

  // ─── Team Vote ────────────────────────────────────────────────
  function showTeamVote(msg) {
    showScreen('teamVote');
    hasVoted = false;

    renderMissionTracker('missionTrackerVote');

    var teamDisplay = $('proposedTeamDisplay');
    teamDisplay.innerHTML = '';
    var teamIds = msg.teamIds || [];
    var teamNicknames = msg.teamNicknames || [];
    teamIds.forEach(function (id, i) {
      var div = document.createElement('div');
      div.className = 'team-member';
      div.textContent = (players[id] ? players[id].avatar + ' ' : '') + (teamNicknames[i] || id);
      teamDisplay.appendChild(div);
    });

    $('teamVoteStatus').textContent = '0/' + Object.keys(players).length + ' โหวตแล้ว';

    var approveBtn = $('btnApprove');
    var rejectBtn = $('btnReject');
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }

  function showTeamVoteResult(msg) {
    // Brief overlay showing results
    var overlay = document.createElement('div');
    overlay.className = 'vote-result-overlay';
    var card = document.createElement('div');
    card.className = 'vote-result-card';
    card.innerHTML = '<h3>' + (msg.approved ? 'ทีมอนุมัติแล้ว!' : 'ทีมถูกปฏิเสธ!') + '</h3>' +
      '<p>อนุมัติ: ' + msg.approveVotes + ' | ปฏิเสธ: ' + msg.rejectVotes + '</p>' +
      '<div class="vote-list">' + (msg.votes || []).map(function (v) {
        return v.nickname + ': ' + (v.vote === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ');
      }).join('<br>') + '</div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(function () { overlay.remove(); }, 3000);
  }

  // ─── Mission ──────────────────────────────────────────────────
  function showMission(msg) {
    showScreen('mission');
    hasMissionVoted = false;

    renderMissionTracker('missionTrackerMission');

    $('missionNumber').textContent = msg.currentMission || room.state.currentMission;
    $('missionProgress').textContent = '0/' + (msg.missionVotersExpected || room.state.missionVotersExpected) + ' โหวตแล้ว';

    var teamIds = msg.teamIds || [];
    isOnTeam = teamIds.indexOf(mySessionId) >= 0;

    if (isOnTeam) {
      $('teamMemberPanel').style.display = 'block';
      $('missionWaitPanel').style.display = 'none';
      $('btnMissionSuccess').disabled = false;

      // Evil players can vote fail
      if (myTeam === 'evil') {
        $('btnMissionFail').style.display = 'inline-flex';
        $('btnMissionFail').disabled = false;
      } else {
        $('btnMissionFail').style.display = 'none';
      }
    } else {
      $('teamMemberPanel').style.display = 'none';
      $('missionWaitPanel').style.display = 'block';
    }
  }

  function showMissionReveal(msg) {
    showScreen('missionReveal');
    var icon = $('missionRevealIcon');
    var title = $('missionRevealTitle');
    var result = $('missionRevealResult');
    var votes = $('missionRevealVotes');

    if (msg.succeeded) {
      icon.textContent = '\u{2705}'; // checkmark
      title.textContent = 'ภารกิจที่ ' + msg.missionNumber + ' สำเร็จ!';
      result.className = 'reveal-result success';
    } else {
      icon.textContent = '\u{274C}'; // cross
      title.textContent = 'ภารกิจที่ ' + msg.missionNumber + ' ล้มเหลว!';
      result.className = 'reveal-result fail';
    }
    result.textContent = 'สำเร็จ: ' + msg.successVotes + ' | ล้มเหลว: ' + msg.failVotes;
    votes.textContent = 'ฝ่ายดีชนะ: ' + msg.goodWins + ' | ฝ่ายชั่วชนะ: ' + msg.evilWins;
  }

  // ─── Assassin Guess ───────────────────────────────────────────
  function showAssassinGuess(msg) {
    showScreen('assassinGuess');
    selectedAssassinTarget = '';

    var isAssassin = myRole === 'assassin';
    $('assassinSubtitle').textContent = isAssassin ?
      'เลือกผู้เล่นที่คุณคิดว่าเป็นผู้นำอัศวิน' :
      'รอมือสังหารเลือกเป้าหมาย...';

    if (isAssassin) {
      $('assassinTargetGrid').style.display = 'grid';
      $('btnAssassinGuess').style.display = 'inline-flex';
      $('assassinWaiting').style.display = 'none';
    } else {
      $('assassinTargetGrid').style.display = 'none';
      $('btnAssassinGuess').style.display = 'none';
      $('assassinWaiting').style.display = 'block';
    }
  }

  function renderAssassinTargets(targets) {
    var grid = $('assassinTargetGrid');
    grid.innerHTML = '';
    grid.style.display = 'grid';

    targets.forEach(function (t) {
      var card = document.createElement('div');
      card.className = 'player-select-card';
      card.innerHTML = '<div class="avatar">' + (players[t.id] ? players[t.id].avatar : '') + '</div>' +
        '<div class="name">' + t.nickname + '</div>';
      card.dataset.playerId = t.id;

      card.addEventListener('click', function () {
        // Deselect all
        grid.querySelectorAll('.player-select-card').forEach(function (c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        selectedAssassinTarget = t.id;
      });

      grid.appendChild(card);
    });
  }

  function showAssassinResult(msg) {
    showToast(
      msg.correct ?
        'มือสังหารเดาถูก! ' + msg.targetNickname + ' เป็นผู้นำอัศวิน!' :
        'มือสังหารเดาผิด! ' + msg.targetNickname + ' เป็น' + msg.targetRoleTh,
      4000
    );
  }

  // ─── Game Over ────────────────────────────────────────────────
  function showGameOver(msg) {
    showScreen('gameOver');

    var title = $('gameOverTitle');
    var icon = $('gameOverIcon');

    if (msg.winner === 'good') {
      title.textContent = 'ฝ่ายอัศวินชนะ!';
      title.className = 'gameover-title good-wins';
      icon.textContent = '\u{1F6E1}'; // shield
    } else {
      title.textContent = 'ฝ่ายทรยศชนะ!';
      title.className = 'gameover-title evil-wins';
      icon.textContent = '\u{1F5E1}'; // dagger
    }

    $('gameOverReason').textContent = WIN_REASONS[msg.reason] || msg.reason;

    // Assassin guess info
    var assassinDiv = $('gameOverAssassin');
    if (msg.assassinGuessTargetId) {
      assassinDiv.style.display = 'block';
      assassinDiv.textContent = 'มือสังหารเลือก: ' + msg.assassinGuessTargetNickname +
        (msg.assassinGuessCorrect ? ' (ถูกต้อง!)' : ' (ผิด)');
    } else {
      assassinDiv.style.display = 'none';
    }

    // Player roles
    var rolesDiv = $('gameOverRoles');
    rolesDiv.innerHTML = '';
    (msg.players || []).forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'gameover-role-row ' + p.team;
      row.innerHTML = '<span class="role-icon">' + p.roleIcon + '</span>' +
        '<span class="player-name">' + p.nickname + '</span>' +
        '<span class="role-name">' + p.roleTh + '</span>';
      rolesDiv.appendChild(row);
    });

    // Mission history
    var missionsDiv = $('gameOverMissions');
    missionsDiv.innerHTML = '<h3 style="font-size: 16px; margin-bottom: 8px;">ผลภารกิจ</h3>';
    (msg.missionHistory || []).forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'gameover-mission-row';
      row.textContent = 'ภารกิจ ' + m.missionNumber + ': ' +
        (m.succeeded ? 'สำเร็จ' : 'ล้มเหลว') +
        ' (สำเร็จ:' + m.successVotes + ' ล้มเหลว:' + m.failVotes + ')';
      missionsDiv.appendChild(row);
    });
  }

  // ─── Timer Updates ────────────────────────────────────────────
  function updateTimers(val) {
    if (val < 0) val = 0;
    var s = String(val);
    var ids = ['proposalTimer', 'teamVoteTimer', 'missionTimer', 'assassinTimer'];
    ids.forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = s;
    });
  }

  // ─── Event Listeners ─────────────────────────────────────────
  function setupEvents() {
    $('btnCreate').addEventListener('click', function () {
      pendingAction = 'create';
      showScreen('nickname');
    });
    $('btnJoin').addEventListener('click', function () {
      pendingAction = 'join';
      showScreen('nickname');
      $('joinCodeGroup').style.display = 'block';
    });
    $('btnBackHome').addEventListener('click', function () {
      showScreen('home');
      $('joinCodeGroup').style.display = 'none';
    });

    $('btnConnect').addEventListener('click', function () {
      nickname = $('nicknameInput').value.trim();
      if (!nickname) { showToast('กรุณาใส่ชื่อ', 2000, true); return; }
      if (pendingAction === 'join') {
        joinCode = $('joinCodeInput').value.trim().toUpperCase();
        if (!joinCode) { showToast('กรุณาใส่รหัสห้อง', 2000, true); return; }
      }
      connectToRoom(pendingAction, joinCode);
    });

    // Team proposal submit
    $('btnSubmitTeam').addEventListener('click', function () {
      if (!room) return;
      var teamSize = room.state.currentMissionTeamSize;
      if (selectedTeam.length !== teamSize) {
        showToast('เลือกผู้เล่น ' + teamSize + ' คน', 2000, true);
        return;
      }
      room.send('PROPOSE_TEAM', { teamIds: selectedTeam });
    });

    // Team vote
    $('btnApprove').addEventListener('click', function () {
      if (!room || hasVoted) return;
      hasVoted = true;
      room.send('TEAM_VOTE', { vote: 'approve' });
      $('btnApprove').disabled = true;
      $('btnReject').disabled = true;
    });
    $('btnReject').addEventListener('click', function () {
      if (!room || hasVoted) return;
      hasVoted = true;
      room.send('TEAM_VOTE', { vote: 'reject' });
      $('btnApprove').disabled = true;
      $('btnReject').disabled = true;
    });

    // Mission vote
    $('btnMissionSuccess').addEventListener('click', function () {
      if (!room || hasMissionVoted) return;
      hasMissionVoted = true;
      room.send('MISSION_VOTE', { vote: 'success' });
      $('btnMissionSuccess').disabled = true;
      $('btnMissionFail').disabled = true;
    });
    $('btnMissionFail').addEventListener('click', function () {
      if (!room || hasMissionVoted) return;
      hasMissionVoted = true;
      room.send('MISSION_VOTE', { vote: 'fail' });
      $('btnMissionSuccess').disabled = true;
      $('btnMissionFail').disabled = true;
    });

    // Assassin guess
    $('btnAssassinGuess').addEventListener('click', function () {
      if (!room || !selectedAssassinTarget) {
        showToast('กรุณาเลือกเป้าหมาย', 2000, true);
        return;
      }
      room.send('ASSASSIN_GUESS', { targetId: selectedAssassinTarget });
      $('btnAssassinGuess').disabled = true;
    });

    // Play again
    $('btnPlayAgain').addEventListener('click', function () {
      if (room && isHost) {
        room.send('START_GAME');
      } else {
        showToast('เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้');
      }
    });
  }

  // ─── Init ─────────────────────────────────────────────────────
  renderAvatarPicker();
  setupEvents();

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
})();
