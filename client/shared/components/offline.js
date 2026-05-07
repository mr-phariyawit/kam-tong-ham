/**
 * Shared Offline Screen Component -- Sprint 14 (KTH-T-090)
 *
 * Provides a unified offline/connection-failure overlay for all games.
 * When a WebSocket connection fails or the server is unreachable,
 * games call Offline.show() to present retry + home buttons instead
 * of leaving the player on a half-rendered screen.
 *
 * Usage (browser):
 *   <link rel="stylesheet" href="/shared/components/offline.css">
 *   <script src="/shared/components/offline.js"></script>
 *
 *   Offline.show({
 *     onRetry: function() { location.reload(); },
 *     onHome: function() { location.href = '/'; }
 *   });
 *
 *   Offline.hide();
 *
 * @module shared/offline
 */

(function () {
  'use strict';

  var OVERLAY_ID = 'offlineOverlay';

  /**
   * Build the HTML string for the offline overlay.
   * Pure string -- no DOM dependency for testability.
   */
  function buildHTML() {
    return (
      '<div class="offline-modal">' +
        '<div class="offline-icon">&#x1F50C;</div>' +
        '<h2 class="offline-title">' +
          'ไม่สามารถเชื่อมต่อได้' +
        '</h2>' +
        '<p class="offline-subtitle">Connection failed</p>' +
        '<div class="offline-actions">' +
          '<button class="offline-btn offline-btn-retry" id="offlineRetryBtn">' +
            'ลองใหม่ / Retry' +
          '</button>' +
          '<button class="offline-btn offline-btn-home" id="offlineHomeBtn">' +
            'กลับหน้าหลัก / Back to Home' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  /**
   * Show the offline overlay.
   * @param {Object} opts
   * @param {Function} [opts.onRetry] - Called when "Retry" is clicked
   * @param {Function} [opts.onHome]  - Called when "Back to Home" is clicked
   */
  function show(opts) {
    opts = opts || {};

    // Only works in browser
    if (typeof document === 'undefined') return;

    // Don't create duplicate overlays
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.classList.remove('hidden');
      return;
    }

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'offline-overlay';
    overlay.innerHTML = buildHTML();

    document.body.appendChild(overlay);

    // Wire up buttons
    var retryBtn = document.getElementById('offlineRetryBtn');
    var homeBtn = document.getElementById('offlineHomeBtn');

    if (retryBtn && opts.onRetry) {
      retryBtn.addEventListener('click', function () {
        hide();
        opts.onRetry();
      });
    }

    if (homeBtn && opts.onHome) {
      homeBtn.addEventListener('click', function () {
        hide();
        opts.onHome();
      });
    }
  }

  /**
   * Hide the offline overlay.
   */
  function hide() {
    if (typeof document === 'undefined') return;
    var el = document.getElementById(OVERLAY_ID);
    if (el) {
      el.remove();
    }
  }

  var api = {
    show: show,
    hide: hide,
    buildHTML: buildHTML,
    OVERLAY_ID: OVERLAY_ID,
  };

  if (typeof window !== 'undefined') {
    window.Offline = api;
  }
  // CommonJS export for node-side unit tests (same pattern as roomShare).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
