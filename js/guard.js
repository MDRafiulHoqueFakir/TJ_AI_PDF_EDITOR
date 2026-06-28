/* guard.js — best-effort screen-capture deterrents.
   HONEST LIMITATION: a browser cannot truly block screenshots or screen recording
   (no web API exists; OS tools, phone cameras, etc. are out of reach). This only
   deters casual capture: on a detected screenshot key combo it instantly blanks the
   document (so the captured frame is empty) and clears the clipboard, blanks content
   when the window loses focus / is hidden, and blocks right-click + copy of page
   content. Editing inside text boxes/inputs is never affected. Toggle in Review → Protect. */
(function () {
  'use strict';
  const Guard = {};
  const KEY = 'mpe-guard';
  let enabled = (localStorage.getItem(KEY) ?? '1') === '1';
  let shield = null, flashTimer = null;

  function docOpen() { return window.state && state.hasDoc && state.hasDoc(); }
  function isField(t) { return !!(t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))); }

  function ensureShield() {
    if (shield) return shield;
    shield = document.createElement('div');
    shield.className = 'screen-guard';
    shield.innerHTML =
      '<div class="screen-guard-card">' +
      '<svg viewBox="0 0 24 24" width="42" height="42"><path fill="currentColor" d="M12 1 3 5v6c0 5 3.8 9.7 9 11 5.2-1.3 9-6 9-11V5l-9-4z"/></svg>' +
      '<div class="screen-guard-title">Content hidden</div>' +
      '<div class="screen-guard-sub">Screen capture is discouraged while editing. Click to dismiss.</div>' +
      '</div>';
    shield.addEventListener('click', hide);      // safety: never let it get stuck
    document.body.appendChild(shield);
    return shield;
  }
  function show(autoHideMs) {
    if (!enabled || !docOpen()) return;
    ensureShield().classList.add('on');
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    if (autoHideMs) flashTimer = setTimeout(hide, autoHideMs);
  }
  function hide() { if (shield) shield.classList.remove('on'); if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; } }

  async function clearClipboard() {
    try { if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(' '); } catch (e) {}
  }

  function isCaptureCombo(e) {
    const k = (e.key || '').toLowerCase();
    if (k === 'printscreen') return true;                              // PrintScreen (any)
    if (e.shiftKey && e.metaKey && k === 's') return true;             // Windows Win+Shift+S (snip)
    if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(k)) return true; // macOS Cmd+Shift+3/4/5
    return false;
  }

  function onKey(e) {
    if (!enabled || !docOpen()) return;
    if (isCaptureCombo(e)) {
      show(1600);            // blank instantly so the capture frame is empty
      clearClipboard();
      if (window.Util) Util.toast('Screenshots are discouraged on protected documents', 'warn', 2400);
    }
  }
  function onBlur() { if (enabled && docOpen()) show(0); }   // stays hidden until focus returns
  function onFocus() { hide(); }
  function onVis() { if (document.hidden) { if (enabled && docOpen()) show(0); } else hide(); }

  function onContext(e) { if (enabled && docOpen() && !isField(e.target)) e.preventDefault(); }
  function onCopyCut(e) { if (enabled && docOpen() && !isField(e.target)) e.preventDefault(); }
  function onDragStart(e) { if (enabled && docOpen() && !isField(e.target)) e.preventDefault(); }

  Guard.isEnabled = function () { return enabled; };
  Guard.setEnabled = function (v) {
    enabled = !!v;
    localStorage.setItem(KEY, enabled ? '1' : '0');
    document.documentElement.classList.toggle('guard-on', enabled);
    if (!enabled) hide();
    if (window.Util) Util.toast('Screen guard ' + (enabled ? 'on — best-effort deterrent' : 'off'), enabled ? 'ok' : 'info', 2200);
  };
  Guard.toggle = function () { Guard.setEnabled(!enabled); return enabled; };

  Guard.init = function () {
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('contextmenu', onContext, true);
    document.addEventListener('copy', onCopyCut, true);
    document.addEventListener('cut', onCopyCut, true);
    document.addEventListener('dragstart', onDragStart, true);
    document.documentElement.classList.toggle('guard-on', enabled);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Guard.init);
  else Guard.init();
  window.Guard = Guard;
})();
