/* avro.js — Avro-style phonetic Bengali transliteration + live input binding */
(function () {
  'use strict';
  const Avro = {};

  const CONS = {
    'k': 'ক', 'kh': 'খ', 'g': 'গ', 'gh': 'ঘ', 'Ng': 'ঙ',
    'ch': 'চ', 'chh': 'ছ', 'c': 'চ', 'j': 'জ', 'jh': 'ঝ', 'NG': 'ঞ',
    'T': 'ট', 'Th': 'ঠ', 'D': 'ড', 'Dh': 'ঢ', 'N': 'ণ',
    't': 'ত', 'th': 'থ', 'd': 'দ', 'dh': 'ধ', 'n': 'ন',
    'p': 'প', 'ph': 'ফ', 'f': 'ফ', 'b': 'ব', 'bh': 'ভ', 'v': 'ভ', 'm': 'ম',
    'z': 'জ', 'Z': 'য', 'y': 'য়', 'Y': 'য়',
    'r': 'র', 'l': 'ল', 'sh': 'শ', 'Sh': 'ষ', 'S': 'ষ', 's': 'স', 'h': 'হ',
    'R': 'ড়', 'Rh': 'ঢ়', 'w': 'ও'
  };
  const VIND = { 'o': 'অ', 'a': 'আ', 'i': 'ই', 'I': 'ঈ', 'ee': 'ঈ', 'u': 'উ', 'oo': 'ঊ', 'U': 'ঊ', 'e': 'এ', 'OI': 'ঐ', 'oi': 'ঐ', 'O': 'ও', 'OU': 'ঔ', 'ou': 'ঔ', 'rri': 'ঋ' };
  const VKAR = { 'o': '', 'a': 'া', 'i': 'ি', 'I': 'ী', 'ee': 'ী', 'u': 'ু', 'oo': 'ূ', 'U': 'ূ', 'e': 'ে', 'OI': 'ৈ', 'oi': 'ৈ', 'O': 'ো', 'OU': 'ৌ', 'ou': 'ৌ', 'rri': 'ৃ' };
  const MOD = { 'ng': 'ং', ':': 'ঃ', 'NGG': 'ঁ' };
  const DIGITS = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };

  // token list sorted by length desc for longest-match
  const TOKENS = [];
  Object.keys(CONS).forEach(k => TOKENS.push({ k, t: 'C' }));
  Object.keys(VIND).forEach(k => TOKENS.push({ k, t: 'V' }));
  Object.keys(MOD).forEach(k => TOKENS.push({ k, t: 'M' }));
  TOKENS.sort((a, b) => b.k.length - a.k.length);

  function match(s, i) {
    for (const tk of TOKENS) if (s.startsWith(tk.k, i)) return tk;
    return null;
  }

  Avro.toBangla = function (s) {
    let out = '', prevC = false, i = 0;
    while (i < s.length) {
      const m = match(s, i);
      if (!m) { const ch = s[i]; out += DIGITS[ch] || ch; prevC = false; i++; continue; }
      i += m.k.length;
      if (m.t === 'C') { if (prevC) out += '্'; out += CONS[m.k]; prevC = true; }
      else if (m.t === 'V') { out += prevC ? VKAR[m.k] : VIND[m.k]; prevC = false; }
      else { out += MOD[m.k]; prevC = false; }
    }
    return out;
  };

  function placeCaretEnd(el) {
    try { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
  }

  // Attach live phonetic typing to a contenteditable element.
  Avro.attach = function (el) {
    el._avBuf = '';
    el._avCommit = el.textContent || '';
    el.addEventListener('keydown', onKey);
    el.addEventListener('focus', () => { el._avCommit = el.textContent || ''; el._avBuf = ''; });
    function rebuild() { el.textContent = el._avCommit + Avro.toBangla(el._avBuf); placeCaretEnd(el); if (window.Suggest) Suggest.update(el); }
    function onKey(e) {
      if (!state.avroOn || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k.length === 1 && /[A-Za-z]/.test(k)) { e.preventDefault(); el._avBuf += k; rebuild(); return; }
      if (k === ' ') { e.preventDefault(); el._avCommit += Avro.toBangla(el._avBuf) + ' '; el._avBuf = ''; rebuild(); return; }
      if (k === 'Backspace') {
        if (el._avBuf) { e.preventDefault(); el._avBuf = el._avBuf.slice(0, -1); rebuild(); }
        else setTimeout(() => { el._avCommit = el.textContent || ''; }, 0);
        return;
      }
      if (k === 'Enter') { el._avCommit += Avro.toBangla(el._avBuf); el._avBuf = ''; setTimeout(() => { el._avCommit = el.textContent || ''; }, 0); return; }
      if (k.length === 1) { e.preventDefault(); el._avCommit += Avro.toBangla(el._avBuf) + (k === '.' ? '।' : (DIGITS[k] || k)); el._avBuf = ''; rebuild(); return; }
    }
  };

  window.Avro = Avro;
})();
