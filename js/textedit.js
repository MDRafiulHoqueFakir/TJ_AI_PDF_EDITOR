/* textedit.js — edit & delete EXISTING text in the PDF (in-place, cover + replace) */
(function () {
  'use strict';
  const TextEdit = {};

  const scale = () => state.baseScale * state.zoom;

  // Called from Annotate.renderAnnotations after rebuilding annotations.
  TextEdit.maybeBuild = function (overlay, page) {
    if (state.activeTool !== 'edittext') return;
    const R = ((page.rotation % 360) + 360) % 360;
    if (R !== 0) { addHint(overlay, 'Set this page’s rotation back to 0° to edit its text'); return; }
    const token = state.uid('te');
    overlay._teToken = token;
    buildSpans(overlay, page, token);
  };

  async function buildSpans(overlay, page, token) {
    const src = state.srcDocs[page.docId];
    let tc = page._tc;
    try {
      if (!tc) { const pj = await src.pdfjsDoc.getPage(page.srcIndex + 1); page._tc = tc = await pj.getTextContent(); }
    } catch (e) { return; }
    if (overlay._teToken !== token || state.activeTool !== 'edittext') return; // stale

    const pj = await src.pdfjsDoc.getPage(page.srcIndex + 1);
    const vp = pj.getViewport({ scale: 1, rotation: 0 });
    const vw = vp.width, vh = vp.height;
    const dispW = page._dispW, dispH = page._dispH;
    if (overlay._teToken !== token) return;

    page._editedKeys = page._editedKeys || new Set();
    let count = 0;

    tc.items.forEach((item, idx) => {
      if (!item.str || !item.str.trim()) return;
      if (page._editedKeys.has(idx)) return;
      const T = item.transform;
      const fontSize = Math.hypot(T[1], T[3]) || item.height || 12;
      const e = T[4], f = T[5];
      const width = item.width || fontSize * item.str.length * 0.5;
      const top = f + fontSize * 0.80, bottom = f - fontSize * 0.22, right = e + width;
      const corners = [[e, top], [right, top], [e, bottom], [right, bottom]]
        .map(c => vp.convertToViewportPoint(c[0], c[1]));
      const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const box = { x: minX / vw, y: minY / vh, w: (maxX - minX) / vw, h: (maxY - minY) / vh };

      const span = Util.el('div', { class: 'txt-edit' });
      span.contentEditable = 'true';
      span.spellcheck = false;
      span.textContent = item.str;
      span.style.left = (box.x * dispW) + 'px';
      span.style.top = (box.y * dispH) + 'px';
      span.style.height = (box.h * dispH) + 'px';
      span.style.minWidth = (box.w * dispW) + 'px';
      span.style.fontSize = (fontSize * scale()) + 'px';
      span.style.lineHeight = (box.h * dispH) + 'px';
      span.style.fontFamily = mapFontCSS(tc.styles, item);

      const fontName = mapFont(tc.styles, item);
      span.addEventListener('focus', () => {
        const colors = sampleColors(Viewer.getPageCanvas(page.id), box);
        span._colors = colors;
        span.classList.add('editing');
        span.style.background = colors.bg;
        span.style.color = colors.fg;
      });
      span.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); span.blur(); }
        if (ev.key === 'Escape') { span.textContent = item.str; span.blur(); }
      });
      span.addEventListener('blur', () => commit(span, page, item, box, fontSize, idx, fontName));
      overlay.appendChild(span);
      count++;
    });

    if (count) addHint(overlay, 'Click any text to edit it · clear the text and click away to delete it');
  }

  function commit(span, page, item, box, fontSize, idx, fontName) {
    span.classList.remove('editing');
    const newText = span.innerText.replace(/\n+$/,'').replace(/\n/g, ' ');
    const colors = span._colors || { bg: '#ffffff', fg: '#000000' };
    if (newText === item.str) { resetSpan(span); return; }

    state.pushHistory();
    page._editedKeys.add(idx);
    const pad = 0.003;
    const ebox = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), w: Math.min(1, box.w + pad * 2), h: Math.min(1, box.h + pad * 2) };
    let pt = { bg: colors.bg, img: null };
    try { const c = Viewer.getPageCanvas(page.id); if (c) pt = TextEdit.erasePatch(c, ebox); } catch (e) {}
    page.annotations.push({ id: state.uid('a'), type: 'whiteout', x: ebox.x, y: ebox.y, w: ebox.w, h: ebox.h, color: pt.bg, img: pt.img });
    if (newText.trim()) {
      // keep the original size & font exactly — editing must not change formatting
      const size = fontSize;
      page.annotations.push({
        id: state.uid('a'), type: 'text',
        x: box.x, y: box.y, w: Math.min(1 - box.x, box.w * 1.06 + 0.01),
        text: newText, size, color: colors.fg, font: fontName, banglaFont: 'SolaimanLipi',
        bold: false, italic: false, align: 'left', bg: null, lineSpacing: 1.2
      });
    }
    Viewer.refreshOverlay(page.id);
    Util.toast(newText.trim() ? 'Text updated' : 'Text deleted', 'ok');
  }

  function resetSpan(span) {
    span.style.background = ''; span.style.color = '';
  }

  function addHint(overlay, text) {
    if (overlay.querySelector('.txt-edit-hint')) return;
    overlay.appendChild(Util.el('div', { class: 'txt-edit-hint', text }));
  }

  /* ---- colour sampling from the rendered page canvas ---- */
  function sampleColors(canvas, box) {
    const fallback = { bg: '#ffffff', fg: '#000000' };
    if (!canvas) return fallback;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const cw = canvas.width, ch = canvas.height;
    const bx = Math.floor(box.x * cw), by = Math.floor(box.y * ch);
    const bw = Math.max(3, Math.floor(box.w * cw)), bh = Math.max(3, Math.floor(box.h * ch));
    const ring = Math.max(2, Math.round(bh * 0.4));
    const m = ring + 2;
    const X = Math.max(0, bx - m), Y = Math.max(0, by - m);
    const W = Math.min(cw - X, bw + 2 * m), H = Math.min(ch - Y, bh + 2 * m);
    let img;
    try { img = ctx.getImageData(X, Y, W, H); } catch (e) { return fallback; }
    const d = img.data;
    const get = (px, py) => { const ix = Math.round(px - X), iy = Math.round(py - Y); if (ix < 0 || iy < 0 || ix >= W || iy >= H) return null; const o = (iy * W + ix) * 4; return [d[o], d[o + 1], d[o + 2]]; };

    // background = average of ring pixels just outside the box
    const bgPts = [];
    const sx = Math.max(1, Math.floor(bw / 8)), sy = Math.max(1, Math.floor(bh / 3));
    for (let i = 0; i <= bw; i += sx) { bgPts.push([bx + i, by - ring]); bgPts.push([bx + i, by + bh + ring]); }
    for (let j = 0; j <= bh; j += sy) { bgPts.push([bx - ring, by + j]); bgPts.push([bx + bw + ring, by + j]); }
    let br = 0, bgc = 0, bb = 0, n = 0;
    bgPts.forEach(p => { const c = get(p[0], p[1]); if (c) { br += c[0]; bgc += c[1]; bb += c[2]; n++; } });
    const bg = n ? [Math.round(br / n), Math.round(bgc / n), Math.round(bb / n)] : [255, 255, 255];

    // foreground = inside pixel furthest from background (the text colour)
    let best = null, bestDist = 0;
    for (let i = 2; i < bw - 2; i += Math.max(1, Math.floor(bw / 24)))
      for (let j = 2; j < bh - 2; j += Math.max(1, Math.floor(bh / 6))) {
        const c = get(bx + i, by + j); if (!c) continue;
        const dist = Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]);
        if (dist > bestDist) { bestDist = dist; best = c; }
      }
    const fg = (best && bestDist > 60) ? best : [0, 0, 0];
    return { bg: rgbHex(bg), fg: rgbHex(fg) };
  }
  function rgbHex(c) { return '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join(''); }

  /* ---- font guessing ---- */
  function mapFont(styles, item) {
    if (/[ঀ-৿]/.test(item.str)) return 'SolaimanLipi'; // Bengali original keeps a Bengali font
    const st = styles && styles[item.fontName]; const fam = ((st && st.fontFamily) || '').toLowerCase(); const fn = (item.fontName || '').toLowerCase();
    if (/courier|mono/.test(fam + fn)) return 'Courier';
    if (/serif|times|georgia|roman/.test(fam + fn) && !/sans/.test(fam)) return 'Times-Roman';
    return 'Helvetica';
  }
  function mapFontCSS(styles, item) {
    return window.Fonts ? Fonts.autoStack(mapFont(styles, item), 'SolaimanLipi') : (Annotate.FONTS[mapFont(styles, item)] || Annotate.FONTS.Helvetica);
  }

  // Invalidate cached text content (call when the source for a page changes)
  TextEdit.invalidate = function (page) { if (page) { page._tc = null; } };
  TextEdit.sampleColors = sampleColors; // shared with the Erase tool

  // Content-aware erase fill: interpolate the pixels bordering the box across it,
  // so erasing/covering blends into images, photos and gradients (not a flat color).
  // Returns { bg:hexFallback, img:dataUrl|null }.
  TextEdit.erasePatch = function (canvas, box) {
    let bg = '#ffffff';
    if (!canvas || !canvas.width) return { bg, img: null };
    try { bg = sampleColors(canvas, box).bg; } catch (e) {}
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const cw = canvas.width, ch = canvas.height;
      const x = Math.round(box.x * cw), y = Math.round(box.y * ch);
      const w = Math.max(1, Math.round(box.w * cw)), h = Math.max(1, Math.round(box.h * ch));
      if (w * h > 600000) return { bg, img: null };   // too big — keep it cheap, use flat color
      const rx = Math.max(0, x - 1), ry = Math.max(0, y - 1);
      const rw = Math.min(cw - rx, w + 2), rh = Math.min(ch - ry, h + 2);
      if (rw <= 0 || rh <= 0) return { bg, img: null };
      const buf = ctx.getImageData(rx, ry, rw, rh).data;
      const at = (px, py) => { let ix = px - rx, iy = py - ry; ix = ix < 0 ? 0 : (ix >= rw ? rw - 1 : ix); iy = iy < 0 ? 0 : (iy >= rh ? rh - 1 : iy); const o = (iy * rw + ix) * 4; return [buf[o], buf[o + 1], buf[o + 2]]; };
      const top = [], bot = []; for (let i = 0; i < w; i++) { top.push(at(x + i, y - 1)); bot.push(at(x + i, y + h)); }
      const left = [], right = []; for (let j = 0; j < h; j++) { left.push(at(x - 1, y + j)); right.push(at(x + w, y + j)); }
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      const octx = out.getContext('2d'); const im = octx.createImageData(w, h); const dd = im.data;
      for (let j = 0; j < h; j++) {
        const tw = 1 / (j + 1), bw = 1 / (h - j);
        for (let i = 0; i < w; i++) {
          const lw = 1 / (i + 1), rwt = 1 / (w - i), s = tw + bw + lw + rwt;
          const t = top[i], b = bot[i], l = left[j], r = right[j], o = (j * w + i) * 4;
          dd[o] = (t[0] * tw + b[0] * bw + l[0] * lw + r[0] * rwt) / s;
          dd[o + 1] = (t[1] * tw + b[1] * bw + l[1] * lw + r[1] * rwt) / s;
          dd[o + 2] = (t[2] * tw + b[2] * bw + l[2] * lw + r[2] * rwt) / s;
          dd[o + 3] = 255;
        }
      }
      octx.putImageData(im, 0, 0);
      return { bg, img: out.toDataURL('image/png') };
    } catch (e) { return { bg, img: null }; }
  };
  TextEdit.fontFromStyles = (styles, item) => mapFont(styles, item); // used by new-text auto font detection

  // Programmatic find & replace on a page (used by the AI assistant). Returns match count.
  TextEdit.aiReplace = async function (pageId, find, replaceWith) {
    const page = state.getPage(pageId); if (!page || !find) return 0;
    if ((((page.rotation % 360) + 360) % 360) !== 0) throw new Error('Rotate the page back to 0° before replacing its text.');
    const src = state.srcDocs[page.docId];
    const pj = await src.pdfjsDoc.getPage(page.srcIndex + 1);
    const tc = await pj.getTextContent();
    const vp = pj.getViewport({ scale: 1, rotation: 0 });
    const vw = vp.width, vh = vp.height;
    const canvas = Viewer.getPageCanvas(pageId);
    page._editedKeys = page._editedKeys || new Set();
    let count = 0;
    tc.items.forEach((item, idx) => {
      if (!item.str || item.str.indexOf(find) < 0 || page._editedKeys.has(idx)) return;
      const newStr = item.str.split(find).join(replaceWith);
      const T = item.transform, fontSize = Math.hypot(T[1], T[3]) || item.height || 12;
      const e = T[4], f = T[5], width = item.width || fontSize * item.str.length * 0.5;
      const corners = [[e, f + fontSize * 0.8], [e + width, f + fontSize * 0.8], [e, f - fontSize * 0.22], [e + width, f - fontSize * 0.22]].map(c => vp.convertToViewportPoint(c[0], c[1]));
      const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
      const box = { x: Math.min(...xs) / vw, y: Math.min(...ys) / vh, w: (Math.max(...xs) - Math.min(...xs)) / vw, h: (Math.max(...ys) - Math.min(...ys)) / vh };
      let colors = { bg: '#ffffff', fg: '#000000' };
      if (canvas) { try { colors = sampleColors(canvas, box); } catch (e2) {} }
      page._editedKeys.add(idx);
      const pad = 0.003;
      const ebox2 = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), w: Math.min(1, box.w + pad * 2), h: Math.min(1, box.h + pad * 2) };
      const pt2 = canvas ? TextEdit.erasePatch(canvas, ebox2) : { bg: colors.bg, img: null };
      page.annotations.push({ id: state.uid('a'), type: 'whiteout', x: ebox2.x, y: ebox2.y, w: ebox2.w, h: ebox2.h, color: pt2.bg, img: pt2.img });
      if (newStr.trim()) {
        const fontName = /[ঀ-৿]/.test(newStr) ? 'SolaimanLipi' : mapFont(tc.styles, item);
        page.annotations.push({ id: state.uid('a'), type: 'text', x: box.x, y: box.y, w: Math.min(1 - box.x, box.w * 1.3 + 0.02), text: newStr, size: fontSize, color: colors.fg, font: fontName, banglaFont: 'SolaimanLipi', bold: false, italic: false, align: 'left', bg: null, lineSpacing: 1.2 });
      }
      count++;
    });
    if (count) Viewer.refreshOverlay(pageId);
    return count;
  };

  window.TextEdit = TextEdit;
})();
