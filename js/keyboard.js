/* keyboard.js — on-screen QWERTY keyboard with Avro-style phonetic Bangla (type English → বাংলা) */
(function () {
  'use strict';
  const Keyboard = {};
  let panel = null, lastEditable = null;
  let mode = 'bn', shift = false, showNums = false;   // mode: 'bn' (phonetic) | 'en'
  let buf = '', convLen = 0;                            // roman buffer + length of last conversion

  const BN_DIGIT = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
  const ROWS = [['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], ['z', 'x', 'c', 'v', 'b', 'n', 'm']];
  const NUMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  document.addEventListener('focusin', e => { const t = e.target; if (t && t.isContentEditable) { lastEditable = t; buf = ''; convLen = 0; } });
  function ed() {
    if (window.Annotate && Annotate._editing && Annotate._editing.el && Annotate._editing.el.isContentEditable) return Annotate._editing.el;
    const a = document.activeElement;
    if (a && a.isContentEditable) return a;
    return (lastEditable && lastEditable.isContentEditable) ? lastEditable : null;
  }
  function syncAvro(el) { if (el && el._avCommit !== undefined) { el._avCommit = el.textContent; el._avBuf = ''; } if (window.Suggest) Suggest.update(el); }
  function insertRaw(el, t) { el.focus(); try { document.execCommand('insertText', false, t); } catch (e) { el.textContent += t; } }
  function delChars(el, n) { el.focus(); for (let i = 0; i < n; i++) { try { document.execCommand('delete'); } catch (e) {} } }

  function typeChar(ch, isLetter) {
    const el = ed(); if (!el) { Util.toast('Tap inside a text box first', 'warn'); return; }
    el.focus();
    if (mode === 'en' || !isLetter || !/^[A-Za-z]$/.test(ch)) {
      const lit = (mode === 'bn' && ch === '.') ? '।' : ((mode === 'bn' && BN_DIGIT[ch]) ? BN_DIGIT[ch] : ch);
      insertRaw(el, lit); buf = ''; convLen = 0; syncAvro(el); return;
    }
    // Bangla phonetic: accumulate roman, replace the trailing conversion
    buf += ch;
    const conv = Avro.toBangla(buf);
    delChars(el, convLen); insertRaw(el, conv); convLen = conv.length;
    syncAvro(el);
  }
  function space() { const el = ed(); if (!el) return; insertRaw(el, ' '); buf = ''; convLen = 0; syncAvro(el); }
  function enter() { const el = ed(); if (!el) return; insertRaw(el, '\n'); buf = ''; convLen = 0; syncAvro(el); }
  function backspace() {
    const el = ed(); if (!el) return; el.focus();
    if (mode === 'bn' && buf) { buf = buf.slice(0, -1); const conv = Avro.toBangla(buf); delChars(el, convLen); insertRaw(el, conv); convLen = conv.length; }
    else { delChars(el, 1); buf = ''; convLen = 0; }
    syncAvro(el);
  }

  Keyboard.isOpen = () => !!panel;
  Keyboard.toggle = () => { panel ? Keyboard.close() : open(); };
  Keyboard.close = () => { if (panel) { panel.remove(); panel = null; } };

  function open() {
    panel = Util.el('div', { class: 'bn-kbd qwerty' });
    panel.addEventListener('pointerdown', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }); // keep editor focus
    render();
    document.body.appendChild(panel);
  }

  function render() {
    panel.innerHTML = '';
    const head = Util.el('div', { class: 'bn-kbd-head' }, [
      Util.el('span', { text: mode === 'bn' ? 'বাংলা (অভ্র) — type English, get বাংলা' : 'English keyboard' }),
      Util.el('button', { class: 'bn-kbd-x', html: '&times;', title: 'Close', onclick: () => Keyboard.close() })
    ]);
    panel.appendChild(head); makeDraggable(head);

    if (showNums) addRow(NUMS.map(n => ({ label: mode === 'bn' ? BN_DIGIT[n] : n, ch: n })));
    ROWS.forEach((row, ri) => {
      const keys = row.map(c => { const ch = shift ? c.toUpperCase() : c; return { label: ch, ch, letter: true }; });
      if (ri === 2) { keys.unshift({ label: '⇧', special: 'shift', wide: true, on: shift }); keys.push({ label: '⌫', special: 'back', wide: true }); }
      addRow(keys);
    });
    addRow([
      { label: showNums ? 'ABC' : '?১২৩', special: 'nums', wide: true },
      { label: mode === 'bn' ? 'বাং' : 'EN', special: 'mode', mode: true, title: 'Switch English / Bangla' },
      { label: 'Space', special: 'space', grow: true },
      { label: mode === 'bn' ? '।' : '.', ch: '.' },
      { label: '↵', special: 'enter', wide: true },
    ]);
  }

  function addRow(keys) {
    const r = Util.el('div', { class: 'bn-kbd-row' });
    keys.forEach(k => {
      const b = Util.el('button', { class: 'bn-key' + (k.wide ? ' wide' : '') + (k.grow ? ' grow' : '') + (k.mode ? ' mode' : '') + (k.on ? ' on' : ''), title: k.title || '' });
      b.textContent = k.label;
      b.addEventListener('mousedown', e => e.preventDefault());   // keep the text box focused
      b.addEventListener('click', () => {
        switch (k.special) {
          case 'shift': shift = !shift; render(); return;
          case 'back': backspace(); return;
          case 'space': space(); return;
          case 'enter': enter(); return;
          case 'nums': showNums = !showNums; render(); return;
          case 'mode': mode = mode === 'bn' ? 'en' : 'bn'; buf = ''; convLen = 0; render(); return;
        }
        typeChar(k.ch, k.letter);
        if (shift && k.letter) { shift = false; render(); }   // one-shot shift
      });
      r.appendChild(b);
    });
    panel.appendChild(r);
  }

  function makeDraggable(handle) {
    handle.style.cursor = 'move';
    handle.addEventListener('pointerdown', e => {
      if (e.target.closest('.bn-kbd-x')) return;
      const r = panel.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top; panel.style.bottom = 'auto';
      function mv(ev) { panel.style.left = (ev.clientX - dx) + 'px'; panel.style.top = (ev.clientY - dy) + 'px'; }
      function up() { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  }

  window.Keyboard = Keyboard;
})();
