/* ribbon.js — Word/Google-Docs-style categorized ribbon with tabs, controls & dialogs */
(function () {
  'use strict';
  const Ribbon = {};
  const el = Util.el, $ = Util.$;
  const panels = {};
  const ctrls = {};
  let activeTab = 'home';

  /* ---------- icons ---------- */
  const I = {
    select: '<path fill="currentColor" d="M7 2l12 11-5 1 3 6-2 1-3-6-4 4z"/>',
    edittext: '<path fill="currentColor" d="M3 5h12v2H3zM3 9h8v2H3zm0 4h6v2H3z"/><path fill="currentColor" d="M20.7 9.3l-1-1a1 1 0 0 0-1.4 0l-7 7V18h2.7l7-7a1 1 0 0 0 0-1.4z"/>',
    erase: '<path fill="currentColor" d="M16.24 3.56l4.2 4.2a1.5 1.5 0 0 1 0 2.12l-9 9H6.34l-3.9-3.9a1.5 1.5 0 0 1 0-2.12l9.68-9.3a1.5 1.5 0 0 1 2.12 0z"/>',
    draw: '<path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/>',
    highlight: '<path fill="currentColor" d="M3 18h18v3H3zM6 14l8-8 4 4-8 8H6z"/>',
    addtext: '<path fill="currentColor" d="M5 4v3h5.5v12h3V7H19V4z"/>',
    table: '<path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 5h16v14H4zM4 10h16M4 15h16M9 5v14M14 5v14"/>',
    image: '<path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z"/>',
    signature: '<path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM2 22h20v-2H2z"/>',
    rect: '<path fill="none" stroke="currentColor" stroke-width="2" d="M4 5h16v14H4z"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="2"/>',
    line: '<path fill="currentColor" d="M4 19l14-14 1.4 1.4-14 14z"/>',
    alignL: '<path fill="currentColor" d="M3 5h18v2H3zm0 4h12v2H3zm0 4h18v2H3zm0 4h12v2H3z"/>',
    alignC: '<path fill="currentColor" d="M3 5h18v2H3zm3 4h12v2H6zm-3 4h18v2H3zm3 4h12v2H6z"/>',
    alignR: '<path fill="currentColor" d="M3 5h18v2H3zm6 4h12v2H9zm-6 4h18v2H3zm6 4h12v2H9z"/>',
    bullet: '<path fill="currentColor" d="M4 6a1.4 1.4 0 1 0 0 2.8A1.4 1.4 0 0 0 4 6zm0 5a1.4 1.4 0 1 0 0 2.8A1.4 1.4 0 0 0 4 11zm0 5a1.4 1.4 0 1 0 0 2.8A1.4 1.4 0 0 0 4 16zM8 6h13v2H8zm0 5h13v2H8zm0 5h13v2H8z"/>',
    number: '<path fill="currentColor" d="M8 6h13v2H8zm0 5h13v2H8zm0 5h13v2H8zM3 5h1.4v4H3.6V6.2l-.7.4-.3-.7zM2.5 12.1c0-.7.6-1.1 1.3-1.1.8 0 1.3.4 1.3 1 0 .5-.3.8-.8 1.2l-.8.7h1.7v.8H2.4v-.6l1.3-1.2c.3-.3.4-.5.4-.7s-.2-.4-.5-.4-.5.2-.5.6zM2.6 16.9h2.5v.7l-.9.8c.6.1 1 .4 1 1 0 .7-.6 1.1-1.4 1.1-.6 0-1.1-.2-1.4-.5l.4-.6c.2.2.5.3.9.3.3 0 .6-.1.6-.4 0-.3-.3-.4-.8-.4h-.3v-.6l.8-.7H2.6z"/>',
    rotateL: '<path fill="currentColor" d="M7 7V4L2 8l5 4V9a6 6 0 1 1-5 6H0a8 8 0 1 0 7-8z"/>',
    rotateR: '<path fill="currentColor" d="M17 7V4l5 4-5 4V9a6 6 0 1 0 5 6h2a8 8 0 1 1-7-8z"/>',
    trash: '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M6 7h12M9 7V5h6v2m-7 0v11h8V7"/>',
    duplicate: '<path fill="none" stroke="currentColor" stroke-width="1.7" d="M9 9h10v10H9zM5 5v10M5 5h10"/>',
    blank: '<path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"/>',
    merge: '<path fill="currentColor" d="M4 4h6v6H4zm10 10h6v6h-6zM10 7h7v2h-7zM13 13H7v-2h6z"/>',
    organize: '<path fill="currentColor" d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/>',
    selectAll: '<path fill="none" stroke="currentColor" stroke-width="1.7" d="M5 5h14v14H5z"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M8 12l2.5 2.5L16 9"/>',
    extract: '<path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 9V8l4 4-4 4v-3H9v-2z"/>',
    split: '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M20 4 9 15M20 20 9 9M6 5.5a2.5 2.5 0 1 1-2.5 2.5A2.5 2.5 0 0 1 6 5.5zM6 16a2.5 2.5 0 1 0 2.5 2.5A2.5 2.5 0 0 0 6 16z"/>',
    lock: '<path fill="currentColor" d="M12 1a5 5 0 0 0-5 5v3H5v12h14V9h-2V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0z"/>',
    unlock: '<path fill="currentColor" d="M12 1a5 5 0 0 0-5 5h2a3 3 0 0 1 6 0v3H5v12h14V9H9V6"/>',
    watermark: '<path fill="currentColor" d="M12 2s7 7.6 7 12a7 7 0 1 1-14 0c0-4.4 7-12 7-12z" opacity=".85"/>',
    compress: '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    props: '<path fill="none" stroke="currentColor" stroke-width="1.7" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/><path fill="currentColor" d="M11 10.5h2V17h-2zM11 7h2v2h-2z"/>',
    forms: '<path fill="currentColor" d="M3 5h18v4H3zm0 6h18v2H3zm0 4h12v4H3z"/>',
    png: '<path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z"/>',
    txt: '<path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 1.5L18.5 9H13zM8 13h8v1.5H8zm0 3h8v1.5H8zm0-6h5v1.5H8z"/>',
    download: '<path fill="currentColor" d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>',
    keyboard: '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M3 6h18v12H3z"/><path fill="currentColor" d="M6 9h2v2H6zm3 0h2v2H9zm3 0h2v2h-2zm3 0h2v2h-2zM6 12h2v2H6zm3 0h8v2H9zm9-3h0M8 15h8v1.5H8z"/>',
    ocr: '<path fill="currentColor" d="M3 5h11v2H3zm0 4h8v2H3zm0 4h6v2H3z"/><circle cx="17" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M20 19l2.5 2.5"/>',
    shield: '<path fill="currentColor" d="M12 1 3 5v6c0 5 3.8 9.7 9 11 5.2-1.3 9-6 9-11V5l-9-4z"/>',
  };
  function iconSvg(name) { return '<svg viewBox="0 0 24 24">' + (I[name] || '') + '</svg>'; }

  /* ---------- builders ---------- */
  function rbtn(o) {
    const b = el('button', { class: 'rbtn ripple', title: o.title || o.label });
    b.innerHTML = iconSvg(o.icon) + '<span>' + o.label + '</span>';
    if (o.tool) b.dataset.tool = o.tool;
    b.addEventListener('click', () => { if (o.tool) UI.setTool(o.tool); if (o.onClick) o.onClick(b); });
    if (o.id) b.id = o.id;
    return b;
  }
  function ibtn(o) {
    const b = el('button', { class: 'ibtn ripple', title: o.title });
    if (o.glyph) b.innerHTML = '<span style="font-size:15px;font-weight:700;' + (o.style || '') + '">' + o.glyph + '</span>';
    else b.innerHTML = iconSvg(o.icon);
    if (o.tool) b.dataset.tool = o.tool;
    b.addEventListener('click', () => { if (o.tool) UI.setTool(o.tool); if (o.onClick) o.onClick(b); });
    if (o.id) b.id = o.id;
    return b;
  }
  function group(label, nodes) { return el('div', { class: 'rgroup' }, [el('div', { class: 'rgroup-body' }, nodes), el('div', { class: 'rgroup-label', text: label })]); }

  // category -> subcategory dropdown (big button + caret -> popover list)
  function rmenu(o) {
    const b = el('button', { class: 'rbtn ripple', title: o.title || o.label });
    b.innerHTML = iconSvg(o.icon) + '<span>' + o.label + ' ▾</span>';
    b.addEventListener('click', () => openListPop(b, o.items));
    return b;
  }
  function openListPop(anchor, items) {
    closePop();
    const pop = el('div', { class: 'menu pop', style: { position: 'fixed', zIndex: '60', minWidth: '196px' } });
    items.forEach(it => {
      if (it.sep) { pop.appendChild(el('div', { class: 'menu-sep' })); return; }
      const mb = el('button');
      mb.innerHTML = (it.icon ? iconSvg(it.icon) : '') + '<span>' + it.label + '</span>';
      mb.addEventListener('click', () => { closePop(); if (it.onClick) it.onClick(); });
      pop.appendChild(mb);
    });
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 210) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
    function onDoc(e) { if (!pop.contains(e.target)) closePop(); }
    Ribbon._closePop = () => { pop.remove(); document.removeEventListener('pointerdown', onDoc); Ribbon._closePop = null; };
  }
  function rrow(nodes) { return el('div', { class: 'rrow' }, nodes); }
  function rcol(nodes) { return el('div', { class: 'rcol' }, nodes); }
  function rsep() { return el('div', { class: 'r-sep' }); }

  function colorField(def, onChange, title) {
    const wrap = el('div', { class: 'color-field', title });
    const inp = el('input', { type: 'color', value: def });
    const chip = el('div', { class: 'color-chip', style: { background: def } });
    inp.addEventListener('input', () => { chip.style.background = inp.value; onChange(inp.value); });
    wrap.append(inp, chip);
    return { node: wrap, input: inp, set(v) { if (v) { inp.value = v; chip.style.background = v; } } };
  }

  /* ---------- HOME ---------- */
  function buildHome() {
    const panel = el('div', { class: 'ribbon-panel' });

    panel.appendChild(group('Tools', [
      rbtn({ icon: 'select', label: 'Select', tool: 'select', title: 'Select / move (V)' }),
      rbtn({ icon: 'edittext', label: 'Edit text', tool: 'edittext', title: 'Edit existing text (G)' }),
      rbtn({ icon: 'erase', label: 'Erase', tool: 'whiteout', title: 'Erase / delete area (X)' }),
      rbtn({ icon: 'trash', label: 'Delete', title: 'Delete the selected component or page(s)', onClick: () => Annotate.deleteCurrent() }),
    ]));

    const fontSel = el('select', { class: 'fontfam', title: 'Latin font' }, Fonts.list().map(f => el('option', { value: f.id, text: f.label })));
    fontSel.addEventListener('change', () => Format.setFont(fontSel.value)); ctrls.font = fontSel;
    const bnSel = el('select', { class: 'fontfam bn', title: 'Bengali font (auto-used for বাংলা text)' }, Fonts.bengaliList().map(f => el('option', { value: f.id, text: f.label })));
    bnSel.addEventListener('change', () => Format.setBanglaFont(bnSel.value)); ctrls.banglaFont = bnSel;
    const sizeIn = el('input', { class: 'fontsize', type: 'number', min: 4, max: 400, value: 16, title: 'Font size' });
    sizeIn.addEventListener('change', () => Format.setSize(+sizeIn.value)); ctrls.size = sizeIn;
    const sizeUp = ibtn({ glyph: 'A', title: 'Grow font', onClick: () => Format.bumpSize(1), style: 'font-size:14px' });
    const sizeDn = ibtn({ glyph: 'A', title: 'Shrink font', onClick: () => Format.bumpSize(-1), style: 'font-size:10px' });
    ctrls.bold = ibtn({ glyph: 'B', title: 'Bold (Ctrl+B)', onClick: () => Format.toggleBold(), style: 'font-weight:800' });
    ctrls.italic = ibtn({ glyph: 'I', title: 'Italic (Ctrl+I)', onClick: () => Format.toggleItalic(), style: 'font-style:italic' });
    ctrls.under = ibtn({ glyph: 'U', title: 'Underline (Ctrl+U)', onClick: () => Format.toggleUnderline(), style: 'text-decoration:underline' });
    ctrls.strike = ibtn({ glyph: 'S', title: 'Strikethrough', onClick: () => Format.toggleStrike(), style: 'text-decoration:line-through' });
    ctrls.textColor = colorField('#1c2230', v => Format.setColor(v), 'Text color');
    const hiField = colorField('#ffff00', v => Format.setHighlight(v), 'Highlight color');
    const hiClear = ibtn({ glyph: '⌀', title: 'Remove highlight', onClick: () => Format.setHighlight(null), style: 'font-size:13px' });
    ctrls.avro = ibtn({ glyph: 'অ', title: 'Bangla phonetic typing (Avro) — type Roman, get বাংলা', onClick: (b) => { state.avroOn = !state.avroOn; b.classList.toggle('active', state.avroOn); Util.toast(state.avroOn ? 'Bangla phonetic ON — e.g. "amar nam" → আমার নাম' : 'Bangla phonetic OFF', state.avroOn ? 'ok' : 'warn', 3200); } });
    const autoBg = ibtn({ glyph: '▦', title: 'Auto-match new text background to the page', onClick: (b) => { state.autoBg = !state.autoBg; b.classList.toggle('active', state.autoBg); } });
    if (state.autoBg) autoBg.classList.add('active');
    panel.appendChild(group('Font', [
      rcol([rrow([fontSel, bnSel, rcol([sizeUp, sizeDn])]), rrow([sizeIn, ctrls.bold, ctrls.italic, ctrls.under, ctrls.strike, rsep(), ctrls.textColor.node, hiField.node, hiClear, rsep(), ctrls.avro, autoBg])])
    ]));

    ctrls.alignL = ibtn({ icon: 'alignL', title: 'Align left', onClick: () => Format.setAlign('left') });
    ctrls.alignC = ibtn({ icon: 'alignC', title: 'Center', onClick: () => Format.setAlign('center') });
    ctrls.alignR = ibtn({ icon: 'alignR', title: 'Align right', onClick: () => Format.setAlign('right') });
    const bul = ibtn({ icon: 'bullet', title: 'Bulleted list', onClick: () => Format.list('bullet') });
    const num = ibtn({ icon: 'number', title: 'Numbered list', onClick: () => Format.list('number') });
    const ls = el('select', { title: 'Line spacing' }, [['1', '1.0'], ['1.25', '1.15'], ['1.5', '1.5'], ['2', '2.0']].map(([v, t]) => el('option', { value: v, text: t })));
    ls.addEventListener('change', () => Format.setLineSpacing(+ls.value)); ctrls.lineSpacing = ls;
    panel.appendChild(group('Paragraph', [rcol([rrow([ctrls.alignL, ctrls.alignC, ctrls.alignR, rsep(), bul, num]), rrow([el('span', { class: 'rgroup-label', text: 'Spacing', style: { margin: '0 4px 0 0' } }), ls])])]));

    const drawColor = el('input', { type: 'color', value: state.opt.color, title: 'Pen color' });
    drawColor.oninput = () => state.opt.color = drawColor.value;
    const stroke = el('input', { type: 'number', min: 1, max: 30, value: state.opt.strokeWidth, title: 'Thickness', style: { width: '50px' } });
    stroke.onchange = () => state.opt.strokeWidth = +stroke.value;
    panel.appendChild(group('Draw', [rcol([rrow([rbtn({ icon: 'draw', label: 'Pen', tool: 'draw' }), rbtn({ icon: 'highlight', label: 'Marker', tool: 'highlight' })]), rrow([drawColor, stroke])])]));

    return panel;
  }

  /* ---------- INSERT ---------- */
  function buildInsert() {
    const panel = el('div', { class: 'ribbon-panel' });
    panel.appendChild(group('Text', [rbtn({ icon: 'addtext', label: 'Text box', tool: 'text', title: 'Add a text box (T)' })]));
    panel.appendChild(group('Table', [rbtn({ icon: 'table', label: 'Table', title: 'Insert a table', onClick: (b) => openTablePicker(b) })]));
    panel.appendChild(group('Media', [
      rbtn({ icon: 'image', label: 'Image', title: 'Place an image', onClick: () => UI.pickImageThen(() => Util.toast('Drag on the page to place', 'ok')) }),
      rbtn({ icon: 'signature', label: 'Signature', title: 'Create & place a signature (double-click a placed one to redraw)', onClick: () => UI.openSignaturePad() }),
    ]));
    panel.appendChild(group('Bangla', [
      rbtn({ icon: 'keyboard', label: 'Bangla keys', title: 'Toggle the Bengali on-screen keyboard', onClick: (b) => { Keyboard.toggle(); b.classList.toggle('active', Keyboard.isOpen()); } }),
    ]));
    const shapeColor = el('input', { type: 'color', value: state.opt.color, title: 'Shape color' });
    shapeColor.oninput = () => state.opt.color = shapeColor.value;
    const shapeStroke = el('input', { type: 'number', min: 1, max: 30, value: state.opt.strokeWidth, title: 'Stroke width', style: { width: '50px' } });
    shapeStroke.onchange = () => state.opt.strokeWidth = +shapeStroke.value;
    const fillT = ibtn({ glyph: '▣', title: 'Toggle fill', onClick: (b) => { state.opt.fill = !state.opt.fill; b.classList.toggle('active', state.opt.fill); } });
    const arrowT = ibtn({ glyph: '→', title: 'Arrow head on lines', onClick: (b) => { state.opt.arrow = !state.opt.arrow; b.classList.toggle('active', state.opt.arrow); } });
    panel.appendChild(group('Shapes & lines', [rcol([
      rrow([
        rmenu({ icon: 'rect', label: 'Shape', title: 'Insert a shape', items: [
          { icon: 'rect', label: 'Rectangle', onClick: () => UI.setTool('rect') },
          { icon: 'ellipse', label: 'Ellipse', onClick: () => UI.setTool('ellipse') },
          { icon: 'line', label: 'Line', onClick: () => UI.setTool('line') },
          { icon: 'line', label: 'Arrow', onClick: () => UI.setTool('arrow') },
        ] }),
      ]),
      rrow([el('span', { class: 'rgroup-label', style: { margin: '0 2px' }, text: 'Style' }), shapeColor, shapeStroke, fillT, arrowT])
    ])]));
    return panel;
  }

  /* ---------- PAGES ---------- */
  function buildPages() {
    const panel = el('div', { class: 'ribbon-panel' });
    const last = () => state.pages[state.pages.length - 1];
    panel.appendChild(group('Arrange', [
      rmenu({ icon: 'rotateR', label: 'Rotate', title: 'Rotate pages', items: [
        { icon: 'rotateL', label: 'Rotate left 90°', onClick: () => Pages.rotateSelectedOrAll(-90) },
        { icon: 'rotateR', label: 'Rotate right 90°', onClick: () => Pages.rotateSelectedOrAll(90) },
        { icon: 'rotateR', label: 'Rotate 180°', onClick: () => { Pages.rotateSelectedOrAll(90); Pages.rotateSelectedOrAll(90); } },
      ] }),
      rbtn({ icon: 'duplicate', label: 'Duplicate', onClick: dupSelected }),
      rbtn({ icon: 'trash', label: 'Delete', onClick: () => state.selectedPageIds.size ? Pages.deleteSelected() : Util.toast('Open Organize and select pages first', 'warn') }),
    ]));
    panel.appendChild(group('Insert pages', [
      rbtn({ icon: 'blank', label: 'Blank page', onClick: () => Pages.insertBlankAfter(last().id) }),
      rbtn({ icon: 'merge', label: 'Merge files', title: 'Add / merge PDFs or images', onClick: () => UI.openFilePicker(true) }),
    ]));
    panel.appendChild(group('Organize', [
      rbtn({ icon: 'organize', label: 'Reorder', title: 'Open page organizer', onClick: () => UI.openPanel('pages') }),
      rbtn({ icon: 'selectAll', label: 'Select all', onClick: () => Pages.selectAll() }),
    ]));
    panel.appendChild(group('Split & extract', [
      rbtn({ icon: 'extract', label: 'Extract', title: 'Selected pages → new PDF', onClick: () => Operations.extractSelected() }),
      rmenu({ icon: 'split', label: 'Split', title: 'Split this PDF', items: [
        { icon: 'split', label: 'Save a page range…', onClick: openSplitDialog },
        { icon: 'split', label: 'One file per page', onClick: () => Operations.splitEachPage() },
      ] }),
    ]));
    return panel;
  }
  function dupSelected() {
    if (state.selectedPageIds.size) [...state.selectedPageIds].forEach(id => Pages.duplicate(id));
    else Pages.duplicate(state.pages[0].id);
  }

  /* ---------- REVIEW ---------- */
  function buildReview() {
    const panel = el('div', { class: 'ribbon-panel' });
    const guardBtn = rbtn({
      icon: 'shield', label: 'Screen guard', id: 'btnScreenGuard',
      title: 'Best-effort deterrent: blanks the page on screenshot keys / focus loss and blocks right-click & copy. Note: a browser cannot fully block screen capture.',
      onClick: (b) => { if (window.Guard) { Guard.toggle(); b.classList.toggle('guard-active', Guard.isEnabled()); } }
    });
    if (window.Guard && Guard.isEnabled()) guardBtn.classList.add('guard-active');
    panel.appendChild(group('Protect', [
      rbtn({ icon: 'lock', label: 'Password', title: 'Encrypt with a password', onClick: openSecurityDialog }),
      rbtn({ icon: 'unlock', label: 'Unlock', title: 'Save an unprotected copy', onClick: () => Operations.unlock() }),
      guardBtn,
    ]));
    panel.appendChild(group('Modify', [
      rbtn({ icon: 'watermark', label: 'Watermark', onClick: openWatermarkDialog }),
      rbtn({ icon: 'compress', label: 'Compress', onClick: openCompressDialog }),
    ]));
    panel.appendChild(group('Document', [
      rbtn({ icon: 'props', label: 'Properties', onClick: openPropsDialog }),
      rbtn({ icon: 'forms', label: 'Form fields', onClick: () => UI.openPanel('forms') }),
    ]));
    panel.appendChild(group('Recognize', [
      rbtn({ icon: 'ocr', label: 'OCR', title: 'Recognize text in a scanned / image PDF and make it editable', onClick: () => OCR.dialog() }),
    ]));
    panel.appendChild(group('Save', [
      rbtn({ icon: 'download', label: 'Save as…', title: 'Rename, pick a format (PDF / Word / JSON), choose location', onClick: () => SaveAs.saveDialog() }),
    ]));
    return panel;
  }

  /* ---------- table picker popover ---------- */
  function openTablePicker(anchor) {
    closePop();
    const pop = el('div', { class: 'menu pop', style: { position: 'fixed', zIndex: 60 } });
    const label = el('div', { class: 'tablepick-label', text: 'Insert table: 3 × 3' });
    const grid = el('div', { class: 'tablepick' });
    const N = 8; const cells = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const i = el('i', { dataset: { r, c } }); grid.appendChild(i); cells.push(i); }
    function hi(rr, cc) { cells.forEach(i => i.classList.toggle('on', +i.dataset.r <= rr && +i.dataset.c <= cc)); label.textContent = 'Insert table: ' + (cc + 1) + ' × ' + (rr + 1); }
    grid.addEventListener('mousemove', e => { const t = e.target.closest('i'); if (t) hi(+t.dataset.r, +t.dataset.c); });
    grid.addEventListener('click', e => {
      const t = e.target.closest('i'); if (!t) return;
      state.opt.table.rows = +t.dataset.r + 1; state.opt.table.cols = +t.dataset.c + 1;
      closePop(); UI.setTool('table');
      Util.toast('Drag on the page to drop a ' + state.opt.table.cols + '×' + state.opt.table.rows + ' table, then double-click cells', 'ok', 3600);
    });
    pop.append(label, grid, el('div', { class: 'note', text: 'Double-click cells to type. Resize with the corner handle.' }));
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 240) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
    function onDoc(e) { if (!pop.contains(e.target)) closePop(); }
    Ribbon._closePop = () => { pop.remove(); document.removeEventListener('pointerdown', onDoc); Ribbon._closePop = null; };
  }
  function closePop() { if (Ribbon._closePop) Ribbon._closePop(); }

  /* ---------- dialogs ---------- */
  function dialog(o) {
    const root = el('div');
    root.append(el('div', { class: 'modal-head' }, [el('h3', { text: o.title }), o.desc ? el('p', { text: o.desc }) : null]));
    root.append(el('div', { class: 'modal-body' }, o.body));
    const cancel = el('button', { class: 'btn ghost', text: 'Cancel' });
    const ok = el('button', { class: 'btn primary', text: o.submitLabel || 'Apply' });
    root.append(el('div', { class: 'modal-foot' }, [cancel, ok]));
    const m = Util.modal(root, o.wide);
    cancel.onclick = () => m.close();
    ok.onclick = () => { if (o.onSubmit() !== false) m.close(); };
    return m;
  }
  function dfield(label, control) { return el('div', { class: 'field' }, [el('label', { text: label }), control]); }
  function check(v) { const c = el('input', { type: 'checkbox' }); c.checked = v; return c; }

  function openWatermarkDialog() {
    const text = el('input', { type: 'text', value: 'CONFIDENTIAL' });
    const color = el('input', { type: 'color', value: '#ff0000', style: { width: '100%', height: '34px' } });
    const opacity = el('input', { type: 'number', value: 20, min: 5, max: 100 });
    const angle = el('input', { type: 'number', value: 45, min: -90, max: 90 });
    const size = el('input', { type: 'number', value: 60, min: 8, max: 300 });
    dialog({ title: 'Watermark', desc: 'Stamp a diagonal watermark on every page.', body: [dfield('Text', text), el('div', { class: 'row' }, [dfield('Color', color), dfield('Opacity %', opacity)]), el('div', { class: 'row' }, [dfield('Angle', angle), dfield('Font size', size)])], submitLabel: 'Apply to all pages', onSubmit: () => Operations.watermark({ text: text.value || 'WATERMARK', color: color.value, opacity: (+opacity.value || 20) / 100, angle: +angle.value || 0, size: +size.value || 60 }) });
  }
  function openCompressDialog() {
    const q = el('input', { type: 'range', min: 30, max: 95, value: 65, style: { flex: '1' } });
    const ql = el('span', { class: 'note', text: '65%' }); q.oninput = () => ql.textContent = q.value + '%';
    const dpi = el('select', {}, [['1.5', 'Low (smallest)'], ['2', 'Medium'], ['3', 'High']].map(([v, t]) => el('option', { value: v, text: t, selected: v === '2' })));
    dialog({ title: 'Compress PDF', desc: 'Re-renders pages as images to shrink scanned/large PDFs (text becomes non-selectable).', body: [dfield('Quality', el('div', { class: 'row', style: { alignItems: 'center' } }, [q, ql])), dfield('Resolution', dpi)], submitLabel: 'Compress & download', onSubmit: () => Operations.compress(+q.value / 100, +dpi.value) });
  }
  function openSecurityDialog() {
    const ok = Operations.encryptionAvailable();
    const user = el('input', { type: 'password', placeholder: 'Required to open', disabled: !ok });
    const owner = el('input', { type: 'password', placeholder: 'Restricts editing', disabled: !ok });
    const cPrint = check(true), cCopy = check(true), cMod = check(false);
    dialog({
      title: 'Password & security', desc: 'Encrypt this PDF so it requires a password to open.',
      body: [ok ? null : el('div', { class: 'note warn', text: 'Encryption engine did not load (offline?). You can still remove protection from a PDF.' }), dfield('Open password', user), dfield('Owner password (optional)', owner), el('label', { class: 'checkrow' }, [cPrint, 'Allow printing']), el('label', { class: 'checkrow' }, [cCopy, 'Allow copying text']), el('label', { class: 'checkrow' }, [cMod, 'Allow editing'])],
      submitLabel: 'Encrypt & download',
      onSubmit: () => { if (!ok) return false; if (!user.value) { Util.toast('Enter an open password', 'warn'); return false; } Operations.protect(user.value, owner.value, { printing: cPrint.checked, copying: cCopy.checked, modifying: cMod.checked, annotating: cMod.checked }); }
    });
  }
  function openPropsDialog() {
    const m = Operations.readMetadata();
    const t = el('input', { type: 'text', value: m.title || '' }), a = el('input', { type: 'text', value: m.author || '' }), s = el('input', { type: 'text', value: m.subject || '' }), k = el('input', { type: 'text', value: m.keywords || '' });
    dialog({ title: 'Document properties', body: [dfield('Title', t), dfield('Author', a), dfield('Subject', s), dfield('Keywords (comma separated)', k)], submitLabel: 'Save & download', onSubmit: () => Operations.applyMetadata({ title: t.value, author: a.value, subject: s.value, keywords: k.value }) });
  }
  function openSplitDialog() {
    const r = el('input', { type: 'text', placeholder: 'e.g. 1-3, 5, 8-10' });
    dialog({ title: 'Save page range', desc: 'Export specific pages as a new PDF.', body: [dfield('Pages', r)], submitLabel: 'Save range', onSubmit: () => { if (!r.value.trim()) { Util.toast('Enter a range', 'warn'); return false; } Operations.splitByRanges(r.value); } });
  }

  /* ---------- tabs & sync ---------- */
  function buildTabs() {
    const tabsHost = $('#ribbonTabs'); tabsHost.innerHTML = '';
    [['home', 'Home'], ['insert', 'Insert'], ['pages', 'Pages'], ['review', 'Review']].forEach(([id, label]) => {
      const t = el('button', { class: 'rtab', dataset: { tab: id }, text: label });
      t.addEventListener('click', () => showTab(id));
      tabsHost.appendChild(t);
    });
    tabsHost.appendChild(el('div', { class: 'rtab-indicator' }));
  }
  function showTab(name) {
    activeTab = name;
    const body = $('#ribbonBody'); body.innerHTML = '';
    const p = panels[name]; p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter');
    body.appendChild(p);
    Util.$$('.rtab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    moveIndicator();
    Ribbon.markActiveTool(state.activeTool); Ribbon.syncFormat();
  }
  function moveIndicator() {
    const tab = $('.rtab.active'), ind = $('.rtab-indicator');
    if (tab && ind) { ind.style.left = tab.offsetLeft + 'px'; ind.style.width = tab.offsetWidth + 'px'; }
  }
  function toggleActive(node, on) { if (node) node.classList.toggle('active', !!on); }

  Ribbon.markActiveTool = function (tool) { Util.$$('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool)); };
  Ribbon.syncFormat = function () {
    const f = Format.current();
    if (ctrls.font) ctrls.font.value = f.font || 'Helvetica';
    if (ctrls.banglaFont) ctrls.banglaFont.value = f.banglaFont || 'SolaimanLipi';
    if (ctrls.size) ctrls.size.value = Math.round(f.size || 16);
    toggleActive(ctrls.bold, f.bold); toggleActive(ctrls.italic, f.italic);
    toggleActive(ctrls.under, f.underline); toggleActive(ctrls.strike, f.strike);
    const al = f.align || 'left';
    toggleActive(ctrls.alignL, al === 'left'); toggleActive(ctrls.alignC, al === 'center'); toggleActive(ctrls.alignR, al === 'right');
    if (ctrls.textColor) ctrls.textColor.set(f.color || '#1c2230');
    if (ctrls.lineSpacing) ctrls.lineSpacing.value = String(f.lineSpacing || 1.25);
  };
  Ribbon.onSelectText = function () { if (activeTab !== 'home') showTab('home'); else Ribbon.syncFormat(); };
  Ribbon.showTab = showTab;

  Ribbon.init = function () {
    buildTabs();
    panels.home = buildHome(); panels.insert = buildInsert(); panels.pages = buildPages(); panels.review = buildReview();
    showTab('home');
    window.addEventListener('resize', moveIndicator);
    // ripple on interactive controls
    document.addEventListener('pointerdown', e => {
      const t = e.target.closest('.rbtn, .ibtn, .btn.ripple, .ripple');
      if (!t || t.disabled) return;
      const r = t.getBoundingClientRect(); const size = Math.max(r.width, r.height);
      const ink = el('span', { class: 'ripple-ink' });
      ink.style.width = ink.style.height = size + 'px';
      ink.style.left = (e.clientX - r.left - size / 2) + 'px';
      ink.style.top = (e.clientY - r.top - size / 2) + 'px';
      t.appendChild(ink); setTimeout(() => ink.remove(), 580);
    });
  };

  window.Ribbon = Ribbon;
})();
