/* main.js — bootstrap & global event wiring */
(function () {
  'use strict';
  const $ = Util.$;

  function init() {
    if (!LIBS.ready()) Util.toast('Failed to load libraries: ' + LIBS.missing().join(', ') + '. Check your connection.', 'err', 6000);

    applyTheme(localStorage.getItem('mpe-theme') || 'auto');
    if (window.Ribbon) Ribbon.init();
    if (window.Chat) Chat.init();
    if (window.Suggest) setTimeout(() => { Suggest.loadExtra(); Suggest.loadExtraBangla(); }, 1500);

    // Open / files
    const fileInput = $('#fileInput');
    $('#btnOpen').onclick = () => UI.openFilePicker(false);
    $('#btnBlank').onclick = createBlank;
    fileInput.onchange = async () => {
      if (fileInput.files.length) await Loader.handleFiles(fileInput.files, UI._append && state.hasDoc());
      fileInput.value = '';
    };

    // App bar
    $('#btnSave').onclick = () => SaveAs.saveDialog();
    $('#btnUndo').onclick = () => state.undo();
    $('#btnRedo').onclick = () => state.redo();
    $('#sideClose').onclick = () => { $('#sidepanel').hidden = true; };
    $('#btnTheme').onclick = (e) => { e.stopPropagation(); openThemeMenu($('#btnTheme')); };

    const moreMenu = $('#moreMenu');
    $('#btnMore').onclick = (e) => { e.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; };
    document.addEventListener('click', () => { moreMenu.hidden = true; });
    moreMenu.addEventListener('click', e => e.stopPropagation());
    moreMenu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      moreMenu.hidden = true;
      const k = b.dataset.export;
      if (k === 'save') SaveAs.saveDialog();
      else if (k === 'close') confirmClose();
    }));

    // Zoom
    $('#zoomIn').onclick = () => Viewer.zoomBy(0.15);
    $('#zoomOut').onclick = () => Viewer.zoomBy(-0.15);
    $('#zoomFit').onclick = () => Viewer.fit();

    // Drag & drop
    const dz = $('#dropzone');
    ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); if (!state.hasDoc()) dz.classList.add('dragover'); }
    }));
    ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'dragleave' && e.relatedTarget) return; dz.classList.remove('dragover'); }));
    document.addEventListener('drop', async e => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      await Loader.handleFiles(e.dataTransfer.files, state.hasDoc());
    });

    // Paste image
    document.addEventListener('paste', async e => {
      if (!state.hasDoc()) return;
      const item = Array.from(e.clipboardData.items || []).find(i => i.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile();
      Annotate._pendingImage = { dataUrl: await Util.readDataUrl(file), fmt: /png/i.test(file.type) ? 'png' : 'jpg' };
      UI.setTool('image');
      Util.toast('Image pasted — drag on a page to place it', 'ok', 3200);
    });

    document.addEventListener('keydown', onKey);
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (state.fitWidth && state.hasDoc()) Viewer.renderAll(); }, 200); });
    UI.updateZoomLabel();
  }

  /* ---------- theme ---------- */
  function applyTheme(mode) {
    if (mode === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    localStorage.setItem('mpe-theme', mode);
  }
  let themePop = null;
  function openThemeMenu(anchor) {
    if (themePop) { closeThemeMenu(); return; }
    const cur = localStorage.getItem('mpe-theme') || 'auto';
    const pop = Util.el('div', { class: 'menu pop', style: { position: 'fixed', zIndex: '60', minWidth: '170px' } });
    pop.appendChild(Util.el('div', { class: 'menu-title', text: 'Theme' }));
    [['light', 'Light'], ['dark', 'Dark'], ['auto', 'System (auto)']].forEach(([val, label]) => {
      const row = Util.el('label', { class: 'radio-row' });
      const radio = Util.el('input', { type: 'radio', name: 'thm', value: val });
      if (val === cur) radio.checked = true;
      radio.addEventListener('change', () => { applyTheme(val); Util.toast('Theme: ' + label, 'ok', 1200); });
      row.append(radio, Util.el('span', { text: label }));
      pop.appendChild(row);
    });
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.right = (window.innerWidth - r.right) + 'px'; pop.style.top = (r.bottom + 6) + 'px';
    themePop = pop;
    setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
    function onDoc(e) { if (!pop.contains(e.target)) closeThemeMenu(); }
    closeThemeMenu._onDoc = onDoc;
  }
  function closeThemeMenu() { if (themePop) { themePop.remove(); themePop = null; document.removeEventListener('pointerdown', closeThemeMenu._onDoc); } }

  function isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
  }

  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (state.hasDoc()) SaveAs.saveDialog(); return; }
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { if (isTyping()) return; e.preventDefault(); state.undo(); return; }
    if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { if (isTyping()) return; e.preventDefault(); state.redo(); return; }
    // text formatting shortcuts (work even while a text box is selected)
    if (mod && state.hasDoc() && 'biu'.includes(e.key.toLowerCase()) && window.Format) {
      if (isTyping() && !Format.hasTextSelected()) return;
      e.preventDefault();
      if (e.key.toLowerCase() === 'b') Format.toggleBold();
      else if (e.key.toLowerCase() === 'i') Format.toggleItalic();
      else Format.toggleUnderline();
      return;
    }
    if (isTyping()) return;
    if (!state.hasDoc()) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (Annotate.deleteSelected()) { e.preventDefault(); return; }
      if (state.selectedPageIds.size) { e.preventDefault(); Pages.deleteSelected(); return; }
      return;
    }
    if (e.key === 'Escape') { state.selectedAnno = null; UI.setTool('select'); Viewer.refreshAllOverlays(); return; }
    const map = { v: 'select', g: 'edittext', t: 'text', d: 'draw', h: 'highlight', r: 'rect', e: 'ellipse', l: 'line', s: 'sign', i: 'image', x: 'whiteout' };
    if (map[e.key.toLowerCase()] && !mod) UI.setTool(map[e.key.toLowerCase()]);
  }

  async function createBlank() {
    Util.busy(true, 'Creating…');
    try {
      await Loader.createBlank();
      UI.enterEditor(); Viewer.renderAll(); UI.updateStatus(); state.pushHistory();
    } catch (e) { Util.toast('Failed to create blank PDF', 'err'); console.error(e); }
    finally { Util.busy(false); }
  }

  async function exportCurrentPng() {
    const vp = $('#pageviewport');
    const wraps = Util.$$('.page-wrap');
    let target = wraps[0];
    const mid = vp.scrollTop + vp.clientHeight / 2;
    for (const w of wraps) { if (w.offsetTop <= mid) target = w; }
    if (!target) return;
    const dataUrl = await Export.pageAsImage(target.dataset.pageId, 'png');
    const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    Util.download(bytes, Util.baseName(state.primaryName) + '-page.png', 'image/png');
    Util.toast('Page exported', 'ok');
  }

  async function confirmClose() {
    const ok = await Util.confirm({ title: 'Close document?', message: 'Unsaved edits will be lost. Download first if you want to keep them.', ok: 'Close', danger: true });
    if (ok) UI.closeDoc();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
