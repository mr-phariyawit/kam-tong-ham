/**
 * Shared Room Share Component
 *
 * Provides QR code generation and share-room functionality for all games.
 * Depends on: qrcode-generator (../vendor/qrcode.min.js)
 *
 * Usage:
 *   <script src="/shared/vendor/qrcode.min.js"></script>
 *   <script src="/shared/components/roomShare.js"></script>
 *
 *   RoomShare.renderQR('qr-container', 'https://app/?join=ABCD');
 *   var url = RoomShare.getRoomURL('ABCD');
 *   RoomShare.copyToClipboard(url);
 *   RoomShare.showShareModal(roomCode);
 *   RoomShare.hideShareModal();
 *
 * @module shared/roomShare
 */

(function () {
  'use strict';

  // ─── Modal HTML template ───────────────────────────────────────
  var MODAL_ID = 'roomShareModal';

  function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;

    var overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'room-share-overlay hidden';

    overlay.innerHTML =
      '<div class="room-share-modal">' +
        '<div class="room-share-header">' +
          '<h3 class="room-share-title">📱 แชร์ห้อง / Share Room</h3>' +
          '<button class="room-share-close" id="roomShareClose">✕</button>' +
        '</div>' +
        '<div class="room-share-qr" id="roomShareQR"></div>' +
        '<div class="room-share-code" id="roomShareCode">----</div>' +
        '<div class="room-share-url" id="roomShareURL"></div>' +
        '<button class="room-share-copy-btn" id="roomShareCopy">' +
          '📋 คัดลอกลิงก์ / Copy Link' +
        '</button>' +
        '<div class="room-share-copied hidden" id="roomShareCopied">✅ คัดลอกแล้ว!</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Close handlers
    document.getElementById('roomShareClose').addEventListener('click', function () {
      hideShareModal();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideShareModal();
    });

    // Copy handler
    document.getElementById('roomShareCopy').addEventListener('click', function () {
      var url = document.getElementById('roomShareURL').textContent;
      copyToClipboard(url).then(function () {
        var msg = document.getElementById('roomShareCopied');
        msg.classList.remove('hidden');
        setTimeout(function () { msg.classList.add('hidden'); }, 2000);
      });
    });
  }

  // ─── Get room URL ──────────────────────────────────────────────
  function getRoomURL(roomCode) {
    var base = window.location.origin + window.location.pathname;
    return base + '?join=' + (roomCode || '').toUpperCase();
  }

  // ─── Render QR into element ────────────────────────────────────
  function renderQR(elementId, url) {
    var container = typeof elementId === 'string'
      ? document.getElementById(elementId)
      : elementId;
    if (!container) return;

    container.innerHTML = '';

    if (typeof qrcode !== 'function') {
      container.textContent = '[QR library not loaded]';
      return;
    }

    try {
      var qr = qrcode(0, 'M'); // auto type-number, medium error correction
      qr.addData(url || '');
      qr.make();

      // Use SVG for crisp rendering on all screens
      var svg = qr.createSvgTag({ cellSize: 4, margin: 2 });
      container.innerHTML = svg;

      // Style the SVG to fit the container
      var svgEl = container.querySelector('svg');
      if (svgEl) {
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        svgEl.style.maxWidth = '200px';
        svgEl.style.maxHeight = '200px';
        svgEl.style.display = 'block';
        svgEl.style.margin = '0 auto';
      }
    } catch (err) {
      container.textContent = '[QR error]';
    }
  }

  // ─── Copy to clipboard ─────────────────────────────────────────
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers
    return new Promise(function (resolve) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) { /* ignore */ }
      document.body.removeChild(ta);
      resolve();
    });
  }

  // ─── Show share modal ──────────────────────────────────────────
  function showShareModal(roomCode) {
    ensureModal();
    var url = getRoomURL(roomCode);

    document.getElementById('roomShareCode').textContent = (roomCode || '----').toUpperCase();
    document.getElementById('roomShareURL').textContent = url;
    renderQR('roomShareQR', url);

    var overlay = document.getElementById(MODAL_ID);
    overlay.classList.remove('hidden');

    // Hide copied message on fresh open
    var msg = document.getElementById('roomShareCopied');
    if (msg) msg.classList.add('hidden');
  }

  // ─── Hide share modal ─────────────────────────────────────────
  function hideShareModal() {
    var overlay = document.getElementById(MODAL_ID);
    if (overlay) overlay.classList.add('hidden');
  }

  // ─── Public API ────────────────────────────────────────────────
  window.RoomShare = {
    renderQR: renderQR,
    getRoomURL: getRoomURL,
    copyToClipboard: copyToClipboard,
    showShareModal: showShareModal,
    hideShareModal: hideShareModal,
  };
})();
