/* annotate.js — create / render / manipulate page annotations (DOM overlay) */
(function () {
  'use strict';

  const Annotate = {};
  const FONTS = {
    Helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    'Times-Roman': 'Georgia, "Times New Roman", Times, serif',
    Courier: '"Courier New", Courier, monospace',
  };
  Annotate._pendingImage = null; // {dataUrl, fmt}

  const scale = () => state.baseScale * state.zoom;
  function luminance(hex) { const c = Util.hex2rgb(hex); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }

  /* ---------------- rendering ---------------- */
  Annotate.renderAnnotations = function (overlay, page) {
    Array.from(overlay.children).forEach(c => {
      if (c.classList.contains('anno') || c.classList.contains('anno-vec') || c.classList.contains('anno-ctrl')
        || c.classList.contains('anno-handle') || c.classList.contains('txt-edit') || c.classList.contains('txt-edit-hint')) c.remove();
    });
    const W = page._dispW, H = page._dispH, s = scale();
    page.annotations.forEach(a => {
      const node = buildNode(a, W, H, s, page);
      if (node) overlay.appendChild(node);
    });
    addSelectionControls(overlay, page);
    if (window.TextEdit) TextEdit.maybeBuild(overlay, page);
  };

  const RESIZABLE = { text: 1, highlight: 1, whiteout: 1, rect: 1, ellipse: 1, image: 1, signature: 1, table: 1 };
  function addSelectionControls(overlay, page) {
    if (!state.selectedAnno || state.selectedAnno.pageId !== page.id) return;
    const a = page.annotations.find(x => x.id === state.selectedAnno.annoId);
    if (!a) return;
    const node = overlay.querySelector('[data-anno-id="' + a.id + '"]');
    if (!node) return;
    const W = page._dispW, H = page._dispH;
    let box;
    if (a.type === 'rect' || a.type === 'ellipse') box = { x: a.x * W, y: a.y * H, w: a.w * W, h: a.h * H };
    else if (a.type === 'line') box = { x: Math.min(a.x1, a.x2) * W, y: Math.min(a.y1, a.y2) * H, w: Math.abs(a.x2 - a.x1) * W, h: Math.abs(a.y2 - a.y1) * H };
    else if (a.type === 'draw') { const xs = a.points.map(p => p[0]), ys = a.points.map(p => p[1]); box = { x: Math.min(...xs) * W, y: Math.min(...ys) * H, w: (Math.max(...xs) - Math.min(...xs)) * W, h: (Math.max(...ys) - Math.min(...ys)) * H }; }
    else { const orect = overlay.getBoundingClientRect(), r = node.getBoundingClientRect(); box = { x: r.left - orect.left, y: r.top - orect.top, w: r.width, h: r.height }; }
    const ctrl = Util.el('div', { class: 'anno anno-ctrl', style: {
      left: box.x + 'px', top: box.y + 'px', width: Math.max(box.w, 1) + 'px', height: Math.max(box.h, 1) + 'px',
      pointerEvents: 'none', outline: '1.5px dashed var(--brand)', outlineOffset: '2px'
    } });
    addDeleteBtn(ctrl, a, page);
    if (RESIZABLE[a.type]) addResizeHandle(ctrl, a, page);
    overlay.appendChild(ctrl);
    if (a.type === 'line') addLineControls(overlay, a, page);
  }
  function addLineControls(overlay, a, page) {
    const W = page._dispW, H = page._dispH;
    function handle(nx, ny, onDrag, cls) {
      const h = Util.el('div', { class: 'anno-handle ' + (cls || ''), style: { left: (nx * W - 6) + 'px', top: (ny * H - 6) + 'px', pointerEvents: 'auto', position: 'absolute', right: 'auto', bottom: 'auto', cursor: 'move' } });
      h.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        function mv(ev) { const r = overlay.getBoundingClientRect(); onDrag(Util.clamp((ev.clientX - r.left) / r.width, 0, 1), Util.clamp((ev.clientY - r.top) / r.height, 0, 1)); Viewer.refreshOverlay(page.id); }
        function up() { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); state.pushHistory(); }
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
      overlay.appendChild(h);
    }
    handle(a.x1, a.y1, (x, y) => { a.x1 = x; a.y1 = y; });
    handle(a.x2, a.y2, (x, y) => { a.x2 = x; a.y2 = y; });
    const cx = a.cx != null ? a.cx : (a.x1 + a.x2) / 2, cy = a.cy != null ? a.cy : (a.y1 + a.y2) / 2;
    handle(cx, cy, (x, y) => { const mx = (a.x1 + a.x2) / 2, my = (a.y1 + a.y2) / 2; if (Math.hypot(x - mx, y - my) < 0.02) { a.cx = null; a.cy = null; } else { a.cx = x; a.cy = y; } }, 'curve');
  }
  function addDeleteBtn(ctrl, a, page) {
    const b = Util.el('button', { class: 'anno-del', html: '&times;', title: 'Delete', style: { pointerEvents: 'auto' } });
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', e => {
      e.stopPropagation(); state.pushHistory();
      const i = page.annotations.indexOf(a); if (i >= 0) page.annotations.splice(i, 1);
      state.selectedAnno = null; Viewer.refreshOverlay(page.id);
    });
    ctrl.appendChild(b);
  }
  function addResizeHandle(ctrl, a, page) {
    const h = Util.el('div', { class: 'anno-handle br', style: { pointerEvents: 'auto' } });
    h.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const W = page._dispW, H = page._dispH;
      const start = { mx: e.clientX, my: e.clientY, w: a.w, h: a.h };
      function mv(ev) {
        const dx = (ev.clientX - start.mx) / W, dy = (ev.clientY - start.my) / H;
        if (a.type === 'text') a.w = Math.max(0.03, start.w + dx);
        else { a.w = Math.max(0.01, start.w + dx); a.h = Math.max(0.01, start.h + dy); }
        Viewer.refreshOverlay(page.id);
      }
      function up() { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); state.pushHistory(); }
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    ctrl.appendChild(h);
  }

  function buildNode(a, W, H, s, page) {
    switch (a.type) {
      case 'text': return buildText(a, W, H, s, page);
      case 'image': case 'signature': return buildImage(a, W, H, page);
      case 'highlight': return buildBox(a, W, H, page, 'highlight');
      case 'whiteout': return buildBox(a, W, H, page, 'whiteout');
      case 'draw': return buildDraw(a, W, H, s, page);
      case 'rect': case 'ellipse': case 'line': return buildVector(a, W, H, s, page);
      case 'table': return buildTable(a, W, H, s, page);
    }
    return null;
  }

  function buildTable(a, W, H, s, page) {
    const el = Util.el('div', { class: 'anno' });
    el.style.left = (a.x * W) + 'px'; el.style.top = (a.y * H) + 'px';
    el.style.width = (a.w * W) + 'px'; el.style.height = (a.h * H) + 'px';
    const table = Util.el('table', { class: 'anno-table' });
    table.style.width = '100%'; table.style.height = '100%';
    table.style.fontFamily = (window.Fonts ? Fonts.autoStack(a.font, 'SolaimanLipi') : (FONTS[a.font] || FONTS.Helvetica));
    table.style.fontSize = (a.fontSize * s) + 'px';
    table.style.color = a.color;
    for (let r = 0; r < a.rows; r++) {
      const tr = Util.el('tr');
      for (let c = 0; c < a.cols; c++) {
        const td = Util.el('td', { text: (a.cells[r] && a.cells[r][c]) || '' });
        td.style.border = (a.borderWidth * s) + 'px solid ' + a.borderColor;
        td.dataset.r = r; td.dataset.c = c;
        td.addEventListener('dblclick', (e) => { e.stopPropagation(); editCell(td, a, r, c, page); });
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    el.appendChild(table);
    el.addEventListener('pointerdown', (e) => onAnnoPointerDown(e, a, page, el));
    return frame(el, a, page);
  }

  function editCell(td, a, r, c, page) {
    td.contentEditable = 'true';
    if (window.Suggest) Suggest.attach(td);
    if (window.Avro && !td._avAttached) { Avro.attach(td); td._avAttached = true; }
    td.focus();
    const sel = window.getSelection(); const rng = document.createRange();
    rng.selectNodeContents(td); sel.removeAllRanges(); sel.addRange(rng);
    function finish() {
      td.contentEditable = 'false'; td.removeEventListener('blur', finish);
      const v = td.innerText.replace(/\n$/, '');
      if (!a.cells[r]) a.cells[r] = [];
      if (a.cells[r][c] !== v) { state.pushHistory(); a.cells[r][c] = v; }
    }
    td.addEventListener('blur', finish);
  }

  function frame(el, a, page) {
    el.dataset.annoId = a.id;
    const isSvg = el.tagName && el.tagName.toLowerCase() === 'svg';
    if (state.selectedAnno && state.selectedAnno.annoId === a.id && !isSvg) {
      el.classList.add('selected');
    }
    return el;
  }

  function buildText(a, W, H, s, page) {
    const el = Util.el('div', { class: 'anno anno-text' });
    el.style.left = (a.x * W) + 'px';
    el.style.top = (a.y * H) + 'px';
    el.style.width = (a.w * W) + 'px';
    el.style.fontSize = (a.size * s) + 'px';
    el.style.color = a.color;
    el.style.fontFamily = (window.Fonts ? Fonts.autoStack(a.font, a.banglaFont) : (FONTS[a.font] || FONTS.Helvetica));
    el.style.fontWeight = a.bold ? '700' : '400';
    el.style.fontStyle = a.italic ? 'italic' : 'normal';
    el.style.textAlign = a.align || 'left';
    el.style.lineHeight = a.lineSpacing || 1.25;
    const dec = [a.underline ? 'underline' : '', a.strike ? 'line-through' : ''].filter(Boolean).join(' ');
    el.style.textDecoration = dec || 'none';
    if (a.bg) el.style.background = a.bg;
    if (a.html) el.innerHTML = a.html; else el.textContent = a.text;
    el.addEventListener('pointerdown', (e) => onAnnoPointerDown(e, a, page, el));
    el.addEventListener('dblclick', () => editText(el, a, page));
    return frame(el, a, page);
  }

  function buildImage(a, W, H, page) {
    const el = Util.el('div', { class: 'anno' });
    el.style.left = (a.x * W) + 'px'; el.style.top = (a.y * H) + 'px';
    el.style.width = (a.w * W) + 'px'; el.style.height = (a.h * H) + 'px';
    const img = Util.el('img', { src: a.dataUrl, style: { width: '100%', height: '100%', display: 'block', pointerEvents: 'none' } });
    if (a.type === 'signature') {
      img.style.mixBlendMode = 'multiply';
      el.addEventListener('dblclick', (e) => { e.stopPropagation(); if (window.UI) UI.openSignaturePad((dataUrl) => { state.pushHistory(); a.dataUrl = dataUrl; Viewer.refreshOverlay(page.id); }); });
    }
    el.appendChild(img);
    el.addEventListener('pointerdown', (e) => onAnnoPointerDown(e, a, page, el));
    return frame(el, a, page);
  }

  function buildBox(a, W, H, page, kind) {
    const el = Util.el('div', { class: 'anno' });
    el.style.left = (a.x * W) + 'px'; el.style.top = (a.y * H) + 'px';
    el.style.width = (a.w * W) + 'px'; el.style.height = (a.h * H) + 'px';
    if (kind === 'highlight') { el.style.background = a.color; el.style.opacity = a.opacity ?? 0.4; el.style.mixBlendMode = 'multiply'; }
    else if (a.img) { el.appendChild(Util.el('img', { src: a.img, style: { width: '100%', height: '100%', display: 'block', pointerEvents: 'none' } })); }
    else { el.style.background = a.color || '#ffffff'; }
    el.addEventListener('pointerdown', (e) => onAnnoPointerDown(e, a, page, el));
    return frame(el, a, page);
  }

  function svgRoot(W, H) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'anno-vec');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.pointerEvents = 'none';
    return svg;
  }

  function buildDraw(a, W, H, s, page) {
    const svg = svgRoot(W, H);
    const pts = a.points.map(p => (p[0] * W) + ',' + (p[1] * H)).join(' ');
    const pl = document.createElementNS(svg.namespaceURI, 'polyline');
    pl.setAttribute('points', pts);
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', a.color);
    pl.setAttribute('stroke-width', a.size * s);
    pl.setAttribute('stroke-linecap', 'round');
    pl.setAttribute('stroke-linejoin', 'round');
    pl.setAttribute('opacity', a.opacity ?? 1);
    pl.style.pointerEvents = 'stroke';
    pl.addEventListener('pointerdown', (e) => onAnnoPointerDown(e, a, page, svg));
    svg.appendChild(pl);
    return frame(svg, a, page);
  }

  function buildVector(a, W, H, s, page) {
    const svg = svgRoot(W, H);
    let shape;
    const NS = svg.namespaceURI;
    if (a.type === 'rect') {
      shape = document.createElementNS(NS, 'rect');
      shape.setAttribute('x', a.x * W); shape.setAttribute('y', a.y * H);
      shape.setAttribute('width', a.w * W); shape.setAttribute('height', a.h * H);
    } else if (a.type === 'ellipse') {
      shape = document.createElementNS(NS, 'ellipse');
      shape.setAttribute('cx', (a.x + a.w / 2) * W); shape.setAttribute('cy', (a.y + a.h / 2) * H);
      shape.setAttribute('rx', Math.abs(a.w / 2) * W); shape.setAttribute('ry', Math.abs(a.h / 2) * H);
    } else { // line / arrow (straight or curved)
      if (a.cx != null && a.cy != null) {
        shape = document.createElementNS(NS, 'path');
        shape.setAttribute('d', 'M ' + (a.x1 * W) + ' ' + (a.y1 * H) + ' Q ' + (a.cx * W) + ' ' + (a.cy * H) + ' ' + (a.x2 * W) + ' ' + (a.y2 * H));
      } else {
        shape = document.createElementNS(NS, 'line');
        shape.setAttribute('x1', a.x1 * W); shape.setAttribute('y1', a.y1 * H);
        shape.setAttribute('x2', a.x2 * W); shape.setAttribute('y2', a.y2 * H);
      }
      if (a.arrow) { shape.setAttribute('marker-end', 'url(#' + arrowMarker(svg, a.color) + ')'); }
    }
    shape.setAttribute('stroke', a.color);
    shape.setAttribute('stroke-width', (a.size || 2) * s);
    shape.setAttribute('fill', a.fill ? a.color : 'none');
    if (a.fill) shape.setAttribute('fill-opacity', '0.25');
    shape.style.pointerEvents = a.fill ? 'all' : 'stroke';
    shape.addEventListener('pointerdown', (e) => onAnnoPointerDown(e, a, page, svg));
    svg.appendChild(shape);
    if (a.type === 'line') {   // invisible wide hit area so thin lines/arrows are easy to select
      const hit = shape.cloneNode(false);
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', Math.max(14, (a.size || 2) * s + 12));
      hit.removeAttribute('marker-end'); hit.setAttribute('fill', 'none');
      hit.style.pointerEvents = 'stroke';
      hit.addEventListener('pointerdown', (e) => onAnnoPointerDown(e, a, page, svg));
      svg.appendChild(hit);
    }
    return frame(svg, a, page);
  }

  let markerSeq = 0;
  function arrowMarker(svg, color) {
    const NS = svg.namespaceURI;
    const defs = document.createElementNS(NS, 'defs');
    const id = 'arw' + (++markerSeq);
    const m = document.createElementNS(NS, 'marker');
    m.setAttribute('id', id); m.setAttribute('markerWidth', '10'); m.setAttribute('markerHeight', '10');
    m.setAttribute('refX', '7'); m.setAttribute('refY', '3'); m.setAttribute('orient', 'auto');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M0,0 L7,3 L0,6 Z'); p.setAttribute('fill', color);
    m.appendChild(p); defs.appendChild(m); svg.appendChild(defs);
    return id;
  }

  /* ---------------- selection / move ---------------- */
  function onAnnoPointerDown(e, a, page, el) {
    if (state.activeTool !== 'select') return; // only move in select mode
    e.stopPropagation();
    state.selectedAnno = { pageId: page.id, annoId: a.id };
    Viewer.refreshOverlay(page.id);
    if (a.type === 'text' && window.Ribbon) Ribbon.onSelectText();
    const W = page._dispW, H = page._dispH;
    const isLine = a.type === 'line';
    const start = { mx: e.clientX, my: e.clientY };
    const base = isLine ? { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 }
      : a.type === 'draw' ? { points: a.points.map(p => p.slice()) }
        : { x: a.x, y: a.y };
    let moved = false;
    function mv(ev) {
      const dx = (ev.clientX - start.mx) / W, dy = (ev.clientY - start.my) / H;
      if (Math.abs(dx) + Math.abs(dy) > 0.001) moved = true;
      if (isLine) { a.x1 = base.x1 + dx; a.y1 = base.y1 + dy; a.x2 = base.x2 + dx; a.y2 = base.y2 + dy; }
      else if (a.type === 'draw') { a.points = base.points.map(p => [p[0] + dx, p[1] + dy]); }
      else { a.x = base.x + dx; a.y = base.y + dy; }
      Viewer.refreshOverlay(page.id);
    }
    function up() {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (moved) state.pushHistory();
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  function editText(el, a, page) {
    el.contentEditable = 'true';
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    if (window.Suggest) Suggest.attach(el);
    if (window.Avro && !el._avAttached) { Avro.attach(el); el._avAttached = true; }
    if (!el._enterBound) { el._enterBound = true; el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.blur(); } }); }
    Annotate._editing = { el, a, page };
    el.focus();
    const sel = window.getSelection(); const r = document.createRange();
    r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
    function finish() {
      el.contentEditable = 'false';
      el.removeEventListener('blur', finish);
      if (Annotate._editing && Annotate._editing.el === el) Annotate._editing = null;
      const txt = el.innerText.replace(/\n$/, '');
      const rich = a._rich || /<(span|b|i|u|strong|em|font)[\s>]/i.test(el.innerHTML);
      const changed = rich ? (el.innerHTML !== a.html) : (txt !== a.text);
      if (changed) state.pushHistory();
      a.text = txt;
      if (rich) { a.html = el.innerHTML; a._rich = true; }
      if (!txt.trim()) { const i = page.annotations.indexOf(a); if (i >= 0) page.annotations.splice(i, 1); }
      Viewer.refreshOverlay(page.id);
    }
    el.addEventListener('blur', finish);
  }

  /* ---------------- overlay (creation) ---------------- */
  Annotate.attachOverlay = function (overlay, page) {
    overlay.onpointerdown = (e) => onCreate(e, overlay, page);
  };

  function localFrac(overlay, e) {
    const r = overlay.getBoundingClientRect();
    return {
      x: Util.clamp((e.clientX - r.left) / r.width, 0, 1),
      y: Util.clamp((e.clientY - r.top) / r.height, 0, 1)
    };
  }

  function onCreate(e, overlay, page) {
    const tool = state.activeTool;
    if (tool === 'select') { state.selectedAnno = null; Viewer.refreshOverlay(page.id); return; }
    if (tool === 'edittext') return; // handled by editable text spans
    if (e.target.closest('.anno, .anno-vec, .txt-edit')) return;
    e.preventDefault();
    const p0 = localFrac(overlay, e);

    if (tool === 'text') { createText(page, p0); return; }
    if (tool === 'image') {
      if (!Annotate._pendingImage) { UI.pickImageThen(() => placeImageDrag(overlay, page, e)); return; }
      placeImageDrag(overlay, page, e); return;
    }
    if (tool === 'sign') {
      if (!state.signatureDataUrl) { UI.openSignaturePad(); return; }
      placeSignDrag(overlay, page, e); return;
    }
    if (tool === 'table') { tableDrag(overlay, page, p0); return; }
    if (tool === 'draw' || tool === 'highlight') { freehandOrBox(overlay, page, p0, tool); return; }
    // rect/ellipse/line/arrow/whiteout -> drag box
    dragBox(overlay, page, p0, tool);
  }

  async function nearestTextStyle(page, p0) {
    try {
      const src = state.srcDocs[page.docId];
      const pj = await src.pdfjsDoc.getPage(page.srcIndex + 1);
      const tc = page._tc || (page._tc = await pj.getTextContent());
      const vp = pj.getViewport({ scale: 1, rotation: 0 });
      let best = null, bd = 1e9;
      tc.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const T = it.transform, fs = Math.hypot(T[1], T[3]) || it.height || 12;
        const pt = vp.convertToViewportPoint(T[4], T[5]);
        const d = Math.hypot(pt[0] / vp.width - p0.x, pt[1] / vp.height - p0.y);
        if (d < bd) { bd = d; best = { size: Math.round(fs), font: /[ঀ-৿]/.test(it.str) ? 'SolaimanLipi' : (window.TextEdit && TextEdit.fontFromStyles ? TextEdit.fontFromStyles(tc.styles, it) : 'Helvetica') }; }
      });
      return best;
    } catch (e) { return null; }
  }

  async function createText(page, p0) {
    const t = state.opt.text;
    let size = t.size, font = t.font;
    // automatically adopt the nearest existing PDF text's size & font (the user can still change it)
    const near = await nearestTextStyle(page, p0);
    if (near && near.size >= 6) { size = near.size; font = near.font; }
    state.pushHistory();
    const a = {
      id: state.uid('a'), type: 'text', x: p0.x, y: p0.y, w: 0.3, text: 'Text',
      size, color: t.color, font, banglaFont: t.banglaFont, bold: t.bold, italic: t.italic,
      underline: t.underline, strike: t.strike, align: t.align, bg: null, lineSpacing: t.lineSpacing
    };
    // transparent by default (uses the PDF background); only fill a bg if the user enabled Auto-bg
    if (state.autoBg) {
      try {
        const canvas = Viewer.getPageCanvas(page.id);
        if (canvas && window.TextEdit) { const sm = TextEdit.sampleColors(canvas, { x: p0.x, y: p0.y, w: 0.14, h: 0.045 }); a.bg = sm.bg; if (luminance(sm.bg) < 0.5) a.color = '#ffffff'; }
      } catch (e) {}
    }
    page.annotations.push(a);
    state.selectedAnno = { pageId: page.id, annoId: a.id };
    Viewer.refreshOverlay(page.id);
    const el = document.querySelector('.page-overlay [data-anno-id="' + a.id + '"]');
    if (el) editText(el, a, page);
    UI.setTool('select');
  }

  function freehandOrBox(overlay, page, p0, tool) {
    if (tool === 'highlight') { dragBox(overlay, page, p0, 'highlight'); return; }
    // freehand draw
    const pts = [[p0.x, p0.y]];
    const svg = svgRoot(page._dispW, page._dispH);
    const pl = document.createElementNS(svg.namespaceURI, 'polyline');
    pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', state.opt.color);
    pl.setAttribute('stroke-width', state.opt.strokeWidth * scale());
    pl.setAttribute('stroke-linecap', 'round'); pl.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(pl); overlay.appendChild(svg);
    function mv(ev) {
      const p = localFrac(overlay, ev); pts.push([p.x, p.y]);
      pl.setAttribute('points', pts.map(q => (q[0] * page._dispW) + ',' + (q[1] * page._dispH)).join(' '));
    }
    function up() {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      svg.remove();
      if (pts.length > 1) {
        state.pushHistory();
        page.annotations.push({ id: state.uid('a'), type: 'draw', points: pts, color: state.opt.color, size: state.opt.strokeWidth, opacity: state.opt.opacity });
        Viewer.refreshOverlay(page.id);
      }
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  function dragBox(overlay, page, p0, tool) {
    const ghost = Util.el('div', { class: 'anno', style: { left: (p0.x * page._dispW) + 'px', top: (p0.y * page._dispH) + 'px', border: '1.5px dashed var(--brand)', background: 'rgba(47,109,246,.08)' } });
    overlay.appendChild(ghost);
    let cur = p0;
    function mv(ev) {
      cur = localFrac(overlay, ev);
      const x = Math.min(p0.x, cur.x), y = Math.min(p0.y, cur.y);
      ghost.style.left = (x * page._dispW) + 'px'; ghost.style.top = (y * page._dispH) + 'px';
      ghost.style.width = (Math.abs(cur.x - p0.x) * page._dispW) + 'px';
      ghost.style.height = (Math.abs(cur.y - p0.y) * page._dispH) + 'px';
    }
    function up() {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      ghost.remove();
      const x = Math.min(p0.x, cur.x), y = Math.min(p0.y, cur.y);
      const w = Math.abs(cur.x - p0.x), h = Math.abs(cur.y - p0.y);
      if (tool === 'line' || tool === 'arrow') { addLine(page, p0, cur, tool === 'arrow'); UI.setTool('select'); return; }
      if (w < 0.005 || h < 0.005) {
        // tiny drag -> default size box for shapes
        if (tool === 'rect' || tool === 'ellipse' || tool === 'highlight' || tool === 'whiteout') { addBoxAnno(page, x, y, 0.2, 0.08, tool); }
        UI.setTool('select'); return;
      }
      addBoxAnno(page, x, y, w, h, tool);
      UI.setTool('select');
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  function addBoxAnno(page, x, y, w, h, tool) {
    state.pushHistory();
    let a;
    if (tool === 'highlight') a = { id: state.uid('a'), type: 'highlight', x, y, w, h, color: state.opt.highlightColor, opacity: 0.4 };
    else if (tool === 'whiteout') {
      let p = { bg: '#ffffff', img: null };
      try { const c = Viewer.getPageCanvas(page.id); if (c && window.TextEdit && TextEdit.erasePatch) p = TextEdit.erasePatch(c, { x, y, w, h }); } catch (e) {}
      a = { id: state.uid('a'), type: 'whiteout', x, y, w, h, color: p.bg, img: p.img };
    }
    else if (tool === 'rect') a = { id: state.uid('a'), type: 'rect', x, y, w, h, color: state.opt.color, size: state.opt.strokeWidth, fill: state.opt.fill };
    else a = { id: state.uid('a'), type: 'ellipse', x, y, w, h, color: state.opt.color, size: state.opt.strokeWidth, fill: state.opt.fill };
    page.annotations.push(a);
    state.selectedAnno = { pageId: page.id, annoId: a.id };
    Viewer.refreshOverlay(page.id);
  }

  function tableDrag(overlay, page, p0) {
    const ghost = Util.el('div', { class: 'anno', style: { left: (p0.x * page._dispW) + 'px', top: (p0.y * page._dispH) + 'px', border: '1.5px dashed var(--brand)', background: 'rgba(47,109,246,.08)' } });
    overlay.appendChild(ghost);
    let cur = p0;
    function mv(ev) {
      cur = localFrac(overlay, ev);
      const x = Math.min(p0.x, cur.x), y = Math.min(p0.y, cur.y);
      ghost.style.left = (x * page._dispW) + 'px'; ghost.style.top = (y * page._dispH) + 'px';
      ghost.style.width = (Math.abs(cur.x - p0.x) * page._dispW) + 'px';
      ghost.style.height = (Math.abs(cur.y - p0.y) * page._dispH) + 'px';
    }
    function up() {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      ghost.remove();
      const x = Math.min(p0.x, cur.x), y = Math.min(p0.y, cur.y);
      let w = Math.abs(cur.x - p0.x), h = Math.abs(cur.y - p0.y);
      const t = state.opt.table;
      if (w < 0.02 || h < 0.02) { w = Math.min(0.55, t.cols * 0.12); h = Math.min(0.4, t.rows * 0.06); }
      state.pushHistory();
      const cells = []; for (let r = 0; r < t.rows; r++) cells.push(new Array(t.cols).fill(''));
      const a = { id: state.uid('a'), type: 'table', x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y), rows: t.rows, cols: t.cols, cells, borderColor: t.borderColor, borderWidth: t.borderWidth, color: t.color, fontSize: t.fontSize, font: t.font };
      page.annotations.push(a);
      state.selectedAnno = { pageId: page.id, annoId: a.id };
      Viewer.refreshOverlay(page.id);
      Util.toast('Table added — double-click a cell to type', 'ok', 3000);
      UI.setTool('select');
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  function addLine(page, p0, p1, arrow) {
    state.pushHistory();
    const a = { id: state.uid('a'), type: 'line', x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, color: state.opt.color, size: state.opt.strokeWidth, arrow: arrow != null ? arrow : state.opt.arrow };
    page.annotations.push(a);
    state.selectedAnno = { pageId: page.id, annoId: a.id };
    Viewer.refreshOverlay(page.id);
  }

  function placeImageDrag(overlay, page, e) {
    const img = new Image();
    img.onload = () => {
      const ar = img.naturalWidth / img.naturalHeight;
      const p = localFrac(overlay, e);
      const w = 0.3, h = (0.3 * page._dispW / page._dispH) / ar;
      state.pushHistory();
      const a = { id: state.uid('a'), type: 'image', x: Util.clamp(p.x - w / 2, 0, 1 - w), y: Util.clamp(p.y - h / 2, 0, 1 - h), w, h, dataUrl: Annotate._pendingImage.dataUrl, fmt: Annotate._pendingImage.fmt };
      page.annotations.push(a);
      state.selectedAnno = { pageId: page.id, annoId: a.id };
      Viewer.refreshOverlay(page.id);
      Annotate._pendingImage = null;
      UI.setTool('select');
    };
    img.src = Annotate._pendingImage.dataUrl;
  }

  function placeSignDrag(overlay, page, e) {
    const img = new Image();
    img.onload = () => {
      const p = localFrac(overlay, e);
      const w = 0.25, h = (0.25 * page._dispW / page._dispH) * (img.naturalHeight / img.naturalWidth);
      state.pushHistory();
      const a = { id: state.uid('a'), type: 'signature', x: Util.clamp(p.x - w / 2, 0, 1 - w), y: Util.clamp(p.y - h / 2, 0, 1 - h), w, h, dataUrl: state.signatureDataUrl, fmt: 'png' };
      page.annotations.push(a);
      state.selectedAnno = { pageId: page.id, annoId: a.id };
      Viewer.refreshOverlay(page.id);
      UI.setTool('select');
    };
    img.src = state.signatureDataUrl;
  }

  // Delete currently selected annotation (keyboard)
  Annotate.deleteSelected = function () {
    if (!state.selectedAnno) return false;
    const page = state.getPage(state.selectedAnno.pageId);
    if (!page) return false;
    const i = page.annotations.findIndex(a => a.id === state.selectedAnno.annoId);
    if (i < 0) return false;
    state.pushHistory();
    page.annotations.splice(i, 1);
    state.selectedAnno = null;
    Viewer.refreshOverlay(page.id);
    return true;
  };

  // Delete the current selection: a selected component, or selected page(s)
  Annotate.deleteCurrent = function () {
    if (Annotate.deleteSelected()) return true;
    if (state.selectedPageIds && state.selectedPageIds.size && window.Pages) { Pages.deleteSelected(); return true; }
    Util.toast('Select a component (Select tool) or page(s) first, then delete', 'warn', 3000);
    return false;
  };

  Annotate.FONTS = FONTS;
  window.Annotate = Annotate;
})();
