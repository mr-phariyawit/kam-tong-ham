/**
 * Onboarding Overlay -- per-game "How to play" modal.
 *
 * Shows automatically the FIRST time a player joins a room of a given game type.
 * Tracks via localStorage. Supports "Don't show again" and a lobby "Show rules" button.
 *
 * Usage:
 *   <link rel="stylesheet" href="/shared/components/onboarding.css">
 *   <script src="/shared/components/onboarding.js"></script>
 *
 *   // Auto-show on first visit:
 *   Onboarding.tryShow('forbidden-word');
 *
 *   // Force show (from "Show rules" button):
 *   Onboarding.show('forbidden-word');
 *
 *   // Create a "Show rules" button element:
 *   var btn = Onboarding.createShowRulesButton('forbidden-word');
 *   lobbyContainer.appendChild(btn);
 *
 * @module shared/onboarding
 */

/* global window, document, localStorage */

(function () {
  'use strict';

  var STORAGE_PREFIX = 'onboarding_seen_';

  // ─── Game content registry ──────────────────────────────────
  // Each game type maps to: { title, subtitle, rules[], example }
  // Rules are in Thai with EN hints in parentheses where helpful.

  var GAME_CONTENT = {
    'forbidden-word': {
      icon: '🚫',
      title: 'คำต้องห้าม',
      subtitle: 'Forbidden Word -- guess your own word!',
      rules: [
        '🎯 ทุกคนจะมี "คำต้องห้าม" ติดหน้าผาก คนอื่นเห็นแต่คุณเห็นไม่ได้',
        '🗣️ พูดคุยกันได้ตามปกติ แต่ห้ามพูดคำต้องห้ามของคนอื่นตรงๆ',
        '🔍 พยายามเดาคำของตัวเองจากคำใบ้ของคนอื่น',
        '⚔️ ถ้าคิดว่าคนอื่นพูดคำต้องห้าม กดกล่าวหาได้! (accuse)',
        '🏆 เดาคำตัวเองถูก +3 คะแนน / กล่าวหาสำเร็จ +2 คะแนน',
      ],
      example: 'คำต้องห้ามของคุณคือ "สมาร์ทโฟน" เพื่อนๆ พยายามใบ้คำให้คุณเดาได้ เช่น "มันชาร์จได้นะ" หรือ "ใช้โทรได้"',
    },

    'word-link': {
      icon: '🔗',
      title: 'คำเชื่อม',
      subtitle: 'Word Link -- connect clues to your team\'s words',
      rules: [
        '👥 แบ่งเป็น 2 ทีม แต่ละทีมมีหัวหน้าทีม (Spymaster) 1 คน',
        '🃏 บนกระดานมีคำ 25 คำ แต่ละคำมีสีที่หัวหน้าทีมเห็นเท่านั้น',
        '💬 หัวหน้าทีมให้คำใบ้ 1 คำ + ตัวเลข (เช่น "สัตว์ 3") เพื่อให้ลูกทีมทาย',
        '❌ ระวัง! ถ้าทายโดนคำสีดำ (คำมรณะ) จะแพ้ทันที!',
        '🏆 ทีมที่เปิดคำของทีมตัวเองครบก่อนชนะ!',
      ],
      example: 'หัวหน้าทีมพูด "สัตว์ 3" ลูกทีมต้องหาว่าคำไหนบนกระดานที่เกี่ยวกับสัตว์ เช่น "แมว" "สุนัข" "ช้าง"',
    },

    'spy': {
      icon: '🕵️',
      title: 'สายลับ',
      subtitle: 'Spy -- find the spy among you!',
      rules: [
        '📍 ทุกคนจะได้รับสถานที่เดียวกัน ยกเว้นสายลับที่ไม่รู้สถานที่',
        '🗣️ ผลัดกันถามคำถาม พยายามหาว่าใครเป็นสายลับ',
        '🕵️ สายลับต้องตอบให้เนียนธรรมชาติโดยไม่โดนจับ',
        '🗳️ เมื่อพร้อมก็โหวต คนที่ได้คะแนนโหวตสูงสุดจะถูกกล่าวหา',
        '🏆 ชาวบ้านชนะถ้าจับสายลับได้ / สายลับชนะถ้าหนีรอดหรือเดาสถานที่ถูก',
      ],
      example: 'สถานที่คือ "โรงพยาบาล" คนอื่นถามว่า "ที่นี่มีเสียงดังมั้ย?" สายลับต้องตอบโดยไม่รู้ว่าสถานที่คืออะไร!',
    },

    'werewolf': {
      icon: '🐺',
      title: 'หมาป่า',
      subtitle: 'Werewolf -- survive the night!',
      rules: [
        '🌙 เกมสลับระหว่างกลางคืน (หมาป่าล่า) กับกลางวัน (ชาวบ้านถกเถียง)',
        '🐺 กลางคืน: หมาป่าเลือกคนที่จะกำจัด / หมอดูดวงเลือกคนที่จะปกป้อง',
        '☀️ กลางวัน: ผู้ต้องสงสัยมีเวลาแก้ตัว จากนั้นโหวตไล่คนออก',
        '🗳️ คนที่โดนโหวตมากที่สุดจะถูกไล่ออกจากหมู่บ้าน',
        '🏆 ชาวบ้านชนะถ้ากำจัดหมาป่าหมด / หมาป่าชนะถ้าเหลือจำนวนเท่าชาวบ้าน',
      ],
      example: 'กลางคืนหมาป่าเลือกกำจัด "สมชาย" กลางวันทุกคนถกเถียงกันว่าสมชายน่าสงสัยมั้ย? สมชายต้องแก้ตัวให้รอด!',
    },

    'knights': {
      icon: '⚔️',
      title: 'อัศวิน',
      subtitle: 'Knights -- hidden roles & team missions',
      rules: [
        '⚔️ ผู้เล่นจะได้รับบทบาทลับ: อัศวิน (ฝ่ายดี) หรือ ทรยศ (ฝ่ายชั่ว)',
        '👑 ทุกรอบ: ผู้นำเสนอทีมภารกิจ ทุกคนโหวตรับ/ปฏิเสธ',
        '📨 ถ้าทีมผ่าน: สมาชิกเลือกสำเร็จ/ล้มเหลวแบบลับ',
        '🚨 ทรยศสามารถเลือก "ล้มเหลว" เพื่อทำลายภารกิจได้!',
        '🏆 อัศวินชนะถ้าภารกิจสำเร็จ 3 จาก 5 รอบ / ทรยศชนะถ้าล้มเหลว 3 รอบ',
      ],
      example: 'รอบที่ 1: ผู้นำเสนอทีม 2 คนไปทำภารกิจ ถ้าทรยศแอบอยู่ในทีมและเลือก "ล้มเหลว" ภารกิจก็จะล้มเหลว!',
    },

    'draw-guess': {
      icon: '🎨',
      title: 'วาดทาย',
      subtitle: 'Draw & Guess -- draw it, guess it!',
      rules: [
        '✏️ ผลัดกันเป็นคนวาด คนวาดจะได้รับคำลับที่ต้องวาด',
        '🖼️ วาดรูปให้คนอื่นทายได้ ห้ามเขียนตัวอักษรหรือตัวเลข!',
        '💬 คนทายพิมพ์คำตอบในช่องแชท คนที่ตอบถูกก่อนได้คะแนนมากกว่า',
        '⏱️ มีเวลาจำกัดแต่ละรอบ วาดเร็วๆ ทายไวๆ!',
        '🏆 คนที่ได้คะแนนรวมสูงสุดเมื่อจบทุกรอบคือผู้ชนะ',
      ],
      example: 'คำลับคือ "ช้าง" คุณต้องวาดรูปช้างให้เพื่อนๆ ทายได้ คนที่พิมพ์ "ช้าง" ก่อนจะได้คะแนนเยอะ!',
    },
  };

  // ─── Core Functions ─────────────────────────────────────────

  /**
   * Check if onboarding has been seen for a game type.
   */
  function hasSeen(gameType) {
    try {
      return localStorage.getItem(STORAGE_PREFIX + gameType) === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * Mark onboarding as seen for a game type.
   */
  function markSeen(gameType) {
    try {
      localStorage.setItem(STORAGE_PREFIX + gameType, 'true');
    } catch (e) {
      // localStorage unavailable -- silently fail
    }
  }

  /**
   * Build and display the onboarding modal.
   * @param {string} gameType
   * @param {Object} [options]
   * @param {boolean} [options.force] - Show even if already seen
   */
  function showOnboarding(gameType, options) {
    options = options || {};
    var content = GAME_CONTENT[gameType];
    if (!content) return; // Unknown game type

    // Remove any existing overlay
    var existing = document.querySelector('.onboarding-overlay');
    if (existing) existing.remove();

    // Build overlay
    var overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';

    var modal = document.createElement('div');
    modal.className = 'onboarding-modal';

    // Header
    var title = document.createElement('h2');
    title.textContent = content.icon + ' ' + content.title;

    var subtitle = document.createElement('div');
    subtitle.className = 'onboarding-subtitle';
    subtitle.textContent = content.subtitle;

    // Rules list
    var rulesList = document.createElement('ul');
    rulesList.className = 'onboarding-rules';
    content.rules.forEach(function (rule) {
      var li = document.createElement('li');
      li.textContent = rule;
      rulesList.appendChild(li);
    });

    // Example
    var exampleBox = document.createElement('div');
    exampleBox.className = 'onboarding-example';

    var exampleLabel = document.createElement('span');
    exampleLabel.className = 'onboarding-example-label';
    exampleLabel.textContent = '\u{1f4a1} \u{0e15}\u{0e31}\u{0e27}\u{0e2d}\u{0e22}\u{0e48}\u{0e32}\u{0e07} / Example:';

    var exampleText = document.createTextNode(content.example);
    exampleBox.appendChild(exampleLabel);
    exampleBox.appendChild(exampleText);

    // Footer
    var footer = document.createElement('div');
    footer.className = 'onboarding-footer';

    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'onboarding-dismiss-btn';
    dismissBtn.textContent = '\u{0e40}\u{0e02}\u{0e49}\u{0e32}\u{0e43}\u{0e08}\u{0e41}\u{0e25}\u{0e49}\u{0e27} \u{0e40}\u{0e25}\u{0e48}\u{0e19}\u{0e40}\u{0e25}\u{0e22}!';

    var dontShowLabel = document.createElement('label');
    dontShowLabel.className = 'onboarding-dont-show';

    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    if (options.force) checkbox.checked = false;

    var labelText = document.createTextNode('\u{0e44}\u{0e21}\u{0e48}\u{0e15}\u{0e49}\u{0e2d}\u{0e07}\u{0e41}\u{0e2a}\u{0e14}\u{0e07}\u{0e2d}\u{0e35}\u{0e01} (Don\'t show again)');
    dontShowLabel.appendChild(checkbox);
    dontShowLabel.appendChild(labelText);

    // Dismiss handler
    dismissBtn.addEventListener('click', function () {
      if (checkbox.checked) {
        markSeen(gameType);
      }
      overlay.remove();
    });

    // Also close on overlay background click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        if (checkbox.checked) {
          markSeen(gameType);
        }
        overlay.remove();
      }
    });

    // Assemble
    footer.appendChild(dismissBtn);
    footer.appendChild(dontShowLabel);

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(rulesList);
    modal.appendChild(exampleBox);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Auto-show marks as seen (user can re-trigger via "Show rules" button)
    if (!options.force) {
      markSeen(gameType);
    }
  }

  /**
   * Try to show onboarding (only if not seen before).
   */
  function tryShow(gameType) {
    if (!hasSeen(gameType)) {
      showOnboarding(gameType);
    }
  }

  /**
   * Force-show the onboarding (for "Show rules" button).
   */
  function forceShow(gameType) {
    showOnboarding(gameType, { force: true });
  }

  /**
   * Create a "Show rules" button element.
   * @param {string} gameType
   * @returns {HTMLButtonElement}
   */
  function createShowRulesButton(gameType) {
    var btn = document.createElement('button');
    btn.className = 'show-rules-btn';
    btn.textContent = '\u{1f4d6} \u{0e14}\u{0e39}\u{0e01}\u{0e15}\u{0e34}\u{0e01}\u{0e32}';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      forceShow(gameType);
    });
    return btn;
  }

  /**
   * Check if content exists for a game type.
   */
  function hasContent(gameType) {
    return !!GAME_CONTENT[gameType];
  }

  // ─── Export ─────────────────────────────────────────────────

  var Onboarding = {
    tryShow: tryShow,
    show: forceShow,
    createShowRulesButton: createShowRulesButton,
    hasSeen: hasSeen,
    markSeen: markSeen,
    hasContent: hasContent,
  };

  if (typeof window !== 'undefined') {
    window.Onboarding = Onboarding;
  }
})();
