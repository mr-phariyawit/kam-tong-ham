/**
 * colyseusGuard.js -- Boot-time Colyseus.Client load verification
 *
 * Verifies window.Colyseus.Client is a function after the library loads.
 * If verification fails, renders a bilingual error overlay and posts telemetry
 * to /api/client-error so engineering can detect CDN or vendor regressions
 * before they cause silent failures.
 *
 * Usage (static-script games like forbidden-word, draw-guess):
 *   Load this script before the game script. After DOMContentLoaded, call:
 *     if (!ColyseusGuard.verify('game-id')) return;
 *
 * Usage (dynamic-script games like spy, werewolf, knights, word-link):
 *   Inside script.onload, before new Colyseus.Client(...):
 *     if (!ColyseusGuard.verify('game-id')) return;
 */
window.ColyseusGuard = {
  /**
   * Verify Colyseus.Client is a function.
   * Returns true if OK; renders error overlay + posts telemetry if not.
   * @param {string} gameId - e.g. 'werewolf', 'spy', 'forbidden-word'
   * @returns {boolean}
   */
  verify: function (gameId) {
    if (
      typeof window.Colyseus === 'object' &&
      window.Colyseus !== null &&
      typeof window.Colyseus.Client === 'function'
    ) {
      return true;
    }

    // --- Render bilingual error overlay ---
    var overlay = document.createElement('div');
    overlay.id = 'colyseus-guard-error';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,0.88)',
      'z-index:99999',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'padding:24px',
      'box-sizing:border-box',
      'font-family:Sarabun,sans-serif',
      'text-align:center',
      'color:#fff',
    ].join(';');

    var icon = document.createElement('div');
    icon.textContent = '⚠️';
    icon.style.cssText = 'font-size:48px;margin-bottom:16px';

    var msgTh = document.createElement('p');
    msgTh.textContent = 'เกิดข้อผิดพลาด: ไม่สามารถโหลดระบบเกมได้ กรุณารีเฟรชหน้า';
    msgTh.style.cssText = 'font-size:18px;font-weight:700;margin:0 0 8px';

    var msgEn = document.createElement('p');
    msgEn.textContent = 'Failed to load game engine. Please refresh.';
    msgEn.style.cssText = 'font-size:14px;opacity:0.8;margin:0 0 24px';

    var btn = document.createElement('button');
    btn.textContent = 'Refresh / รีเฟรช';
    btn.style.cssText = [
      'background:#e53e3e',
      'color:#fff',
      'border:none',
      'border-radius:8px',
      'padding:12px 32px',
      'font-size:16px',
      'font-family:Sarabun,sans-serif',
      'cursor:pointer',
    ].join(';');
    btn.onclick = function () { window.location.reload(); };

    overlay.appendChild(icon);
    overlay.appendChild(msgTh);
    overlay.appendChild(msgEn);
    overlay.appendChild(btn);

    if (document.body) {
      document.body.appendChild(overlay);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.appendChild(overlay);
      });
    }

    // --- Post telemetry ---
    try {
      var payload = JSON.stringify({
        gameId: String(gameId || '').slice(0, 64),
        ua: String(navigator.userAgent || '').slice(0, 256),
        ts: Date.now(),
        hint: 'colyseus_client_undefined',
      });
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(function () { /* best-effort, ignore network errors */ });
    } catch (e) {
      // noop — telemetry must never crash the guard
    }

    return false;
  },
};
