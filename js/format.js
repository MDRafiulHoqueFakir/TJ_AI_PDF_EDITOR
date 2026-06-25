/* format.js — live text formatting (applies to the selected text box, like Word) */
(function () {
  'use strict';
  const Format = {};

  function selText() {
    if (!state.selectedAnno) return null;
    const p = state.getPage(state.selectedAnno.pageId); if (!p) return null;
    const a = p.annotations.find(x => x.id === state.selectedAnno.annoId);
    return (a && a.type === 'text') ? { page: p, a } : null;
  }
  Format.selText = selText;
  Format.hasTextSelected = () => !!selText();

  // Apply a mutation to BOTH the default (for new text) and the selected text box (if any).
  function apply(mut) {
    mut(state.opt.text);
    const st = selText();
    if (st) {
      state.pushHistory();
      mut(st.a);
      Viewer.refreshOverlay(st.page.id);
      state.selectedAnno = { pageId: st.page.id, annoId: st.a.id };
    }
    if (window.Ribbon) Ribbon.syncFormat();
  }

  /* ---- per-character (rich) formatting when a selection exists mid-edit ---- */
  function hasSel() {
    const ed = window.Annotate && Annotate._editing;
    if (!ed) return null;
    const s = window.getSelection();
    if (!s.rangeCount) return null;
    const r = s.getRangeAt(0);
    if (r.collapsed || !ed.el.contains(r.commonAncestorContainer)) return null;
    return ed;
  }
  function commitRich(ed) { ed.a.html = ed.el.innerHTML; ed.a._rich = true; ed.a.text = ed.el.innerText; if (window.Ribbon) Ribbon.syncFormat(); }
  function exec(cmd, val) {
    const ed = hasSel(); if (!ed) return false;
    try { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); } catch (e) { return false; }
    commitRich(ed); return true;
  }
  function wrapSel(prop, val) {
    const ed = hasSel(); if (!ed) return false;
    const sel = window.getSelection(); const range = sel.getRangeAt(0);
    const span = document.createElement('span'); span.style[prop] = val;
    try { range.surroundContents(span); }
    catch (e) { const frag = range.extractContents(); span.appendChild(frag); range.insertNode(span); }
    const nr = document.createRange(); nr.selectNodeContents(span); sel.removeAllRanges(); sel.addRange(nr);
    commitRich(ed); return true;
  }

  Format.setFont = v => { if (wrapSel('fontFamily', window.Fonts ? Fonts.css(v) : v)) return; apply(o => o.font = v); };
  Format.setBanglaFont = v => apply(o => o.banglaFont = v);
  Format.setSize = v => {
    v = Math.max(4, Math.min(400, +v || 16));
    const ed = hasSel();
    if (ed) { wrapSel('fontSize', (v / (ed.a.size || 16)) + 'em'); return; }
    apply(o => o.size = v);
  };
  Format.bumpSize = d => { const c = Math.round(Format.current().size || 16); Format.setSize(c + d); };
  Format.toggleBold = () => { if (exec('bold')) return; apply(o => o.bold = !o.bold); };
  Format.toggleItalic = () => { if (exec('italic')) return; apply(o => o.italic = !o.italic); };
  Format.toggleUnderline = () => { if (exec('underline')) return; apply(o => o.underline = !o.underline); };
  Format.toggleStrike = () => { if (exec('strikeThrough')) return; apply(o => o.strike = !o.strike); };
  Format.setColor = v => { if (wrapSel('color', v)) return; apply(o => o.color = v); };
  Format.setHighlight = v => { if (v && wrapSel('backgroundColor', v)) return; apply(o => o.bg = v || null); };
  Format.setAlign = v => apply(o => o.align = v);
  Format.setLineSpacing = v => apply(o => o.lineSpacing = +v);

  Format.current = () => { const st = selText(); return st ? st.a : state.opt.text; };

  // Bulleted / numbered lists = a text transform on the selected box.
  Format.list = function (kind) {
    const st = selText();
    if (!st) { Util.toast('Select a text box first to make a list', 'warn'); return; }
    state.pushHistory();
    const lines = st.a.text.split('\n');
    const stripped = lines.map(l => l.replace(/^\s*(?:[•\-]\s+|\d+\.\s+)/, ''));
    const isBullet = lines.every(l => !l.trim() || /^\s*•\s/.test(l));
    const isNumber = lines.every(l => !l.trim() || /^\s*\d+\.\s/.test(l));
    const already = kind === 'bullet' ? isBullet : isNumber;
    if (already) st.a.text = stripped.join('\n');
    else if (kind === 'bullet') st.a.text = stripped.map(l => l.trim() ? '• ' + l : l).join('\n');
    else { let n = 0; st.a.text = stripped.map(l => l.trim() ? (++n) + '. ' + l : l).join('\n'); }
    Viewer.refreshOverlay(st.page.id);
    state.selectedAnno = { pageId: st.page.id, annoId: st.a.id };
    if (window.Ribbon) Ribbon.syncFormat();
  };

  window.Format = Format;
})();
