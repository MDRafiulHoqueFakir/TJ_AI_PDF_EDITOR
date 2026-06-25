/* ui.js — editor chrome: panels, thumbnails, signature, status, file picking */
(function () {
  'use strict';
  const UI = {};
  const $ = Util.$, el = Util.el;
  let currentPanel = null;
  UI._append = false;

  /* ---------- editor mode ---------- */
  UI.enterEditor = function () {
    $('#dropzone').hidden = true;
    $('#pageviewport').hidden = false;
    $('#docActions').hidden = false;
    $('#statusbar').hidden = false;
    $('#ribbon').hidden = false;
    if (window.Ribbon) Ribbon.showTab('home');
    UI.setTool('select');
  };

  UI.closeDoc = function () {
    state.srcDocs = {}; state.pages = []; state.selectedPageIds.clear();
    state.selectedAnno = null; state.history = []; state.future = [];
    $('#dropzone').hidden = false;
    $('#pageviewport').hidden = true; $('#pageviewport').innerHTML = '';
    $('#docActions').hidden = true;
    $('#statusbar').hidden = true;
    $('#ribbon').hidden = true;
    $('#sidepanel').hidden = true; currentPanel = null;
    $('#docName').textContent = '100% in your browser · private';
  };

  UI.setTool = function (tool) {
    const prev = state.activeTool;
    state.activeTool = tool;
    Viewer.updateToolCursor();
    if (window.Ribbon) { Ribbon.markActiveTool(tool); Ribbon.syncFormat(); }
    if (state.hasDoc() && (tool === 'edittext' || prev === 'edittext')) Viewer.refreshAllOverlays();
  };

  /* ---------- file picking ---------- */
  UI.openFilePicker = function (append) {
    UI._append = !!append;
    const input = $('#fileInput'); input.value = ''; input.click();
  };

  UI.pickImageThen = function (cb) {
    const input = $('#imageInput');
    input.value = '';
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      const dataUrl = await Util.readDataUrl(f);
      Annotate._pendingImage = { dataUrl, fmt: /png/i.test(f.type) ? 'png' : 'jpg' };
      UI.setTool('image');
      if (cb) cb();
    };
    input.click();
  };

  /* ---------- side panels (Pages / Forms) ---------- */
  UI.openPanel = function (name) {
    if (currentPanel === name && !$('#sidepanel').hidden) { $('#sidepanel').hidden = true; currentPanel = null; return; }
    currentPanel = name;
    const sp = $('#sidepanel'); sp.hidden = false;
    // re-trigger slide animation
    sp.style.animation = 'none'; void sp.offsetWidth; sp.style.animation = '';
    $('#sideTitle').textContent = name === 'pages' ? 'Organize pages' : 'Form fields';
    const b = $('#sideBody'); b.innerHTML = '';
    if (name === 'pages') buildPagesPanel(b);
    else buildFormsPanel(b);
  };

  function buildPagesPanel(b) {
    b.appendChild(el('div', { class: 'psec' }, [
      el('div', { class: 'row', style: { marginBottom: '8px' } }, [
        el('button', { class: 'btn sm full', text: 'Select all', onclick: () => Pages.selectAll() }),
        el('button', { class: 'btn sm full', text: 'Clear', onclick: () => Pages.clearSelection() }),
      ]),
      el('div', { class: 'row', style: { marginBottom: '8px' } }, [
        el('button', { class: 'btn sm full', html: '⟲ Rotate', onclick: () => Pages.rotateSelectedOrAll(-90) }),
        el('button', { class: 'btn sm full', html: 'Rotate ⟳', onclick: () => Pages.rotateSelectedOrAll(90) }),
      ]),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn sm full', text: '+ Blank page', onclick: () => Pages.insertBlankAfter(state.pages[state.pages.length - 1].id) }),
        el('button', { class: 'btn sm full danger', text: 'Delete selected', onclick: () => Pages.deleteSelected() }),
      ]),
    ]));
    const grid = el('div', { class: 'thumbs', id: 'thumbGrid' });
    b.appendChild(grid);
    renderThumbs(grid);
  }

  UI.refreshThumbs = function () {
    const grid = $('#thumbGrid');
    if (grid && currentPanel === 'pages' && !$('#sidepanel').hidden) renderThumbs(grid);
  };

  function renderThumbs(grid) {
    grid.innerHTML = '';
    state.pages.forEach((p, idx) => {
      const cell = el('div', { class: 'thumb' + (state.selectedPageIds.has(p.id) ? ' selected' : ''), draggable: true, dataset: { pageId: p.id, idx } });
      const canvas = el('canvas');
      cell.appendChild(canvas);
      cell.appendChild(el('div', { class: 'thumb-foot' }, [
        el('span', { class: 'thumb-num', text: '' + (idx + 1) }),
        el('div', { class: 'thumb-acts' }, [
          iconBtn('M7 7l-3 3 3 3M4 10h9a4 4 0 0 1 0 8h-1', 'Rotate left', () => Pages.rotate(p.id, -90)),
          iconBtn('M17 7l3 3-3 3M20 10h-9a4 4 0 0 0 0 8h1', 'Rotate right', () => Pages.rotate(p.id, 90)),
          iconBtn('M8 8h10v10H8zM6 6v10', 'Duplicate', () => Pages.duplicate(p.id)),
          iconBtn('M6 7h12M9 7V5h6v2m-7 0v11h8V7', 'Delete', () => Pages.delete(p.id)),
        ])
      ]));
      cell.onclick = (e) => { if (e.target.closest('.thumb-acts')) return; Pages.toggleSelect(p.id, e.ctrlKey || e.metaKey); Viewer.scrollToPage(p.id); };
      attachThumbDrag(cell);
      grid.appendChild(cell);
      renderThumbCanvas(p, canvas);
    });
  }
  function iconBtn(d, title, onClick) {
    const b = el('button', { title });
    b.innerHTML = '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="' + d + '"/></svg>';
    b.onclick = (e) => { e.stopPropagation(); onClick(); };
    return b;
  }
  async function renderThumbCanvas(p, canvas) {
    try {
      const src = state.srcDocs[p.docId];
      const pj = await src.pdfjsDoc.getPage(p.srcIndex + 1);
      const vp = pj.getViewport({ scale: 0.28, rotation: p.rotation });
      canvas.width = vp.width; canvas.height = vp.height;
      await pj.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    } catch (e) {}
  }
  function attachThumbDrag(cell) {
    cell.addEventListener('dragstart', e => { cell.classList.add('dragging'); e.dataTransfer.setData('text/plain', cell.dataset.idx); });
    cell.addEventListener('dragend', () => { cell.classList.remove('dragging'); Util.$$('.thumb').forEach(t => t.classList.remove('drop-before', 'drop-after')); });
    cell.addEventListener('dragover', e => { e.preventDefault(); const r = cell.getBoundingClientRect(); const after = e.clientX > r.left + r.width / 2; cell.classList.toggle('drop-after', after); cell.classList.toggle('drop-before', !after); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-before', 'drop-after'));
    cell.addEventListener('drop', e => {
      e.preventDefault();
      const from = +e.dataTransfer.getData('text/plain');
      let to = +cell.dataset.idx;
      const r = cell.getBoundingClientRect();
      if (e.clientX > r.left + r.width / 2) to += 1;
      if (from < to) to -= 1;
      Pages.move(from, to);
    });
  }

  function buildFormsPanel(b) {
    const data = Operations.getFormFields();
    if (!data.fields.length) {
      b.appendChild(el('div', { class: 'note', text: 'No interactive form fields were found in this document. You can still add your own text, checkboxes (shapes) and signatures with the editing tools.' }));
      return;
    }
    const values = {};
    data.fields.forEach(f => {
      const wrap = el('div', { class: 'formfield' });
      wrap.appendChild(el('div', { class: 'ff-type', text: f.type.replace('Field', '') }));
      wrap.appendChild(el('div', { class: 'ff-name', text: f.name }));
      if (f.type === 'CheckBox') {
        const cb = el('input', { type: 'checkbox' }); cb.checked = !!f.value;
        values[f.name] = cb.checked; cb.onchange = () => values[f.name] = cb.checked;
        wrap.appendChild(el('label', { class: 'checkrow' }, [cb, 'Checked']));
      } else if (f.options) {
        const sel = el('select', {}, [el('option', { value: '', text: '— choose —' })].concat(f.options.map(o => el('option', { value: o, text: o, selected: o === f.value }))));
        values[f.name] = f.value || ''; sel.onchange = () => values[f.name] = sel.value;
        wrap.appendChild(sel);
      } else {
        const inp = el('input', { type: 'text', value: f.value || '' });
        values[f.name] = f.value || ''; inp.oninput = () => values[f.name] = inp.value;
        wrap.appendChild(inp);
      }
      b.appendChild(wrap);
    });
    b.appendChild(el('div', { class: 'row', style: { marginTop: '10px' } }, [
      el('button', { class: 'btn full', text: 'Fill & save', onclick: () => Operations.fillForm(data.docId, values, false) }),
      el('button', { class: 'btn primary full', text: 'Fill & flatten', onclick: () => Operations.fillForm(data.docId, values, true) }),
    ]));
  }

  /* ---------- signature pad ---------- */
  UI.openSignaturePad = function (onUse) {
    const body = el('div');
    body.appendChild(el('div', { class: 'modal-head' }, [el('h3', { text: 'Add your signature' }), el('p', { text: 'Draw, type, or upload — it stays on your device.' })]));
    const bodyInner = el('div', { class: 'modal-body' });
    const tabs = el('div', { class: 'sig-tabs' });
    const tDraw = el('button', { class: 'active', text: 'Draw' });
    const tType = el('button', { text: 'Type' });
    const tUp = el('button', { text: 'Upload' });
    tabs.append(tDraw, tType, tUp);
    bodyInner.appendChild(tabs);
    const drawWrap = el('div', { class: 'sigpad-wrap' });
    const canvas = el('canvas', { id: 'sigCanvas' });
    drawWrap.appendChild(canvas);
    const typeInput = el('input', { id: 'sigType', type: 'text', placeholder: 'Type your name' });
    typeInput.style.display = 'none';
    const upInput = el('input', { type: 'file', accept: 'image/*' });
    upInput.style.display = 'none';
    let upDataUrl = null;
    upInput.onchange = async () => { upDataUrl = await Util.readDataUrl(upInput.files[0]); Util.toast('Image ready — click Use signature', 'ok'); };
    bodyInner.append(drawWrap, typeInput, upInput);
    const clearBtn = el('button', { class: 'btn ghost', text: 'Clear' });
    const useBtn = el('button', { class: 'btn primary', text: 'Use signature' });
    body.append(bodyInner, el('div', { class: 'modal-foot' }, [clearBtn, useBtn]));
    const m = Util.modal(body);

    const ctx = canvas.getContext('2d');
    function sizeCanvas() { canvas.width = canvas.clientWidth * 2; canvas.height = canvas.clientHeight * 2; ctx.scale(2, 2); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; }
    requestAnimationFrame(sizeCanvas);
    let drawing = false, has = false;
    canvas.addEventListener('pointerdown', e => { drawing = true; has = true; const r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top); });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; const r = canvas.getBoundingClientRect(); ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke(); });
    window.addEventListener('pointerup', () => drawing = false);
    let mode = 'draw';
    function setMode(mm) {
      mode = mm;
      [tDraw, tType, tUp].forEach(b => b.classList.remove('active'));
      drawWrap.style.display = typeInput.style.display = upInput.style.display = 'none';
      if (mm === 'draw') { tDraw.classList.add('active'); drawWrap.style.display = 'block'; requestAnimationFrame(sizeCanvas); }
      if (mm === 'type') { tType.classList.add('active'); typeInput.style.display = 'block'; }
      if (mm === 'up') { tUp.classList.add('active'); upInput.style.display = 'block'; upInput.click(); }
    }
    tDraw.onclick = () => setMode('draw'); tType.onclick = () => setMode('type'); tUp.onclick = () => setMode('up');
    clearBtn.onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); has = false; typeInput.value = ''; upDataUrl = null; };
    useBtn.onclick = () => {
      let dataUrl = null;
      if (mode === 'draw') { if (!has) { Util.toast('Draw your signature first', 'warn'); return; } dataUrl = canvas.toDataURL('image/png'); }
      else if (mode === 'type') { if (!typeInput.value.trim()) { Util.toast('Type your name first', 'warn'); return; } dataUrl = typedSignature(typeInput.value.trim()); }
      else { if (!upDataUrl) { Util.toast('Choose an image first', 'warn'); return; } dataUrl = upDataUrl; }
      if (typeof onUse === 'function') { m.close(); onUse(dataUrl); return; }   // replace an existing signature
      state.signatureDataUrl = dataUrl;
      m.close(); UI.setTool('sign');
      Util.toast('Drag on a page to place your signature', 'ok', 3200);
    };
  };
  function typedSignature(text) {
    const c = document.createElement('canvas');
    c.width = 600; c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.font = 'italic 80px "Brush Script MT", "Segoe Script", cursive';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 20, 110);
    return c.toDataURL('image/png');
  }

  /* ---------- status / zoom ---------- */
  UI.updateStatus = function () {
    if (!state.pages.length) return;
    const sel = state.selectedPageIds.size;
    $('#statusInfo').textContent = state.pages.length + ' page' + (state.pages.length > 1 ? 's' : '') + (sel ? ' · ' + sel + ' selected' : '');
    $('#docName').textContent = state.primaryName;
  };
  UI.updateZoomLabel = function () { $('#zoomLabel').textContent = state.fitWidth ? 'Fit' : Math.round(state.zoom * 100) + '%'; };
  UI.refreshHistoryButtons = function () { $('#btnUndo').disabled = !state.history.length; $('#btnRedo').disabled = !state.future.length; };

  window.UI = UI;
})();
