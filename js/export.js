/* export.js — bake the page model + annotations into a final PDF */
(function () {
  'use strict';

  const Export = {};
  const { rgb, degrees, StandardFonts } = PDFLib;

  const FONT_MAP = {
    Helvetica: { n: StandardFonts.Helvetica, b: StandardFonts.HelveticaBold, i: StandardFonts.HelveticaOblique, bi: StandardFonts.HelveticaBoldOblique },
    'Times-Roman': { n: StandardFonts.TimesRoman, b: StandardFonts.TimesRomanBold, i: StandardFonts.TimesRomanItalic, bi: StandardFonts.TimesRomanBoldItalic },
    Courier: { n: StandardFonts.Courier, b: StandardFonts.CourierBold, i: StandardFonts.CourierOblique, bi: StandardFonts.CourierBoldOblique },
  };

  // Map a screen-normalized point (u,v) on a page rotated R° (clockwise display)
  // to PDF content-space coordinates (origin bottom-left, y up).
  function s2c(u, v, R, Wp, Hp) {
    let a, b;
    if (R === 90) { a = v; b = u; }
    else if (R === 180) { a = 1 - u; b = v; }
    else if (R === 270) { a = 1 - v; b = 1 - u; }
    else { a = u; b = 1 - v; }
    return { x: a * Wp, y: b * Hp };
  }
  // unit "screen-down" vector expressed in content space
  function downVec(R) {
    if (R === 90) return { x: 1, y: 0 };
    if (R === 180) return { x: 0, y: 1 };
    if (R === 270) return { x: -1, y: 0 };
    return { x: 0, y: -1 };
  }
  function screenWidthPts(R, Wp, Hp) { return (R === 90 || R === 270) ? Hp : Wp; }
  function screenHeightPts(R, Wp, Hp) { return (R === 90 || R === 270) ? Wp : Hp; }

  function col(hex) { const c = Util.hex2rgb(hex); return rgb(c.r, c.g, c.b); }

  // bbox of an axis-aligned screen rect mapped to content space
  function rectToContent(a, R, Wp, Hp) {
    const p1 = s2c(a.x, a.y, R, Wp, Hp);
    const p2 = s2c(a.x + a.w, a.y + a.h, R, Wp, Hp);
    return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) };
  }

  Export.buildPdf = async function (opts) {
    opts = opts || {};
    const out = await PDFLib.PDFDocument.create();
    const fontCache = {};
    async function getFont(name, bold, italic) {
      const fam = FONT_MAP[name] || FONT_MAP.Helvetica;
      const key = (bold && italic) ? 'bi' : bold ? 'b' : italic ? 'i' : 'n';
      const std = fam[key];
      if (!fontCache[std]) fontCache[std] = await out.embedFont(std);
      return fontCache[std];
    }

    const list = opts.pageIds ? opts.pageIds.map(id => state.getPage(id)).filter(Boolean) : state.pages;

    for (const page of list) {
      const src = state.srcDocs[page.docId];
      let outPage;
      if (src.libDoc) {
        const [cp] = await out.copyPages(src.libDoc, [page.srcIndex]);
        out.addPage(cp);
        outPage = cp;
      } else {
        outPage = await rasterFallback(out, src, page.srcIndex);
      }
      const R = ((page.rotation % 360) + 360) % 360;
      const size = outPage.getSize();
      const Wp = size.width, Hp = size.height;
      await bake(out, outPage, page, R, Wp, Hp, getFont);
      if (opts.watermark) await drawWatermark(out, outPage, opts.watermark, Wp, Hp, getFont);
      outPage.setRotation(degrees(R));
    }

    // metadata
    if (opts.metadata) applyMeta(out, opts.metadata);
    out.setProducer('Master PDF Editor');
    if (!opts.metadata) out.setModificationDate(new Date());

    const saveOpts = {};
    if (opts.encrypt) {
      // pdf-lib (stock) does not encrypt; guarded by caller capability check.
      saveOpts.userPassword = opts.encrypt.userPassword;
      saveOpts.ownerPassword = opts.encrypt.ownerPassword;
    }
    return await out.save(saveOpts);
  };

  async function bake(out, outPage, page, R, Wp, Hp, getFont) {
    for (const a of page.annotations) {
      try {
        if (a.type === 'highlight') {
          const r = rectToContent(a, R, Wp, Hp);
          outPage.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: col(a.color), opacity: a.opacity ?? 0.4 });
        } else if (a.type === 'whiteout') {
          if (a.img) await placeRasterImage(out, outPage, a.img, { x: a.x, y: a.y, w: a.w, h: a.h }, R, Wp, Hp);
          else { const r = rectToContent(a, R, Wp, Hp); outPage.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: col(a.color || '#ffffff') }); }
        } else if (a.type === 'rect') {
          const r = rectToContent(a, R, Wp, Hp);
          outPage.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, borderColor: col(a.color), borderWidth: a.size || 2, color: a.fill ? col(a.color) : undefined, opacity: a.fill ? 0.25 : undefined });
        } else if (a.type === 'ellipse') {
          const r = rectToContent(a, R, Wp, Hp);
          outPage.drawEllipse({ x: r.x + r.w / 2, y: r.y + r.h / 2, xScale: r.w / 2, yScale: r.h / 2, borderColor: col(a.color), borderWidth: a.size || 2, color: a.fill ? col(a.color) : undefined, opacity: a.fill ? 0.25 : undefined });
        } else if (a.type === 'line') {
          const color = col(a.color), th = a.size || 2;
          const p1 = s2c(a.x1, a.y1, R, Wp, Hp), p2 = s2c(a.x2, a.y2, R, Wp, Hp);
          if (a.cx != null && a.cy != null) {
            const pc = s2c(a.cx, a.cy, R, Wp, Hp);
            const Q = (u) => { const iu = 1 - u; return { x: iu * iu * p1.x + 2 * iu * u * pc.x + u * u * p2.x, y: iu * iu * p1.y + 2 * iu * u * pc.y + u * u * p2.y }; };
            let prev = p1;
            for (let t = 1; t <= 20; t++) { const pt = Q(t / 20); outPage.drawLine({ start: prev, end: pt, thickness: th, color }); prev = pt; }
            if (a.arrow) drawArrowHead(outPage, Q(0.95), p2, th, color);
          } else {
            outPage.drawLine({ start: p1, end: p2, thickness: th, color });
            if (a.arrow) drawArrowHead(outPage, p1, p2, th, color);
          }
        } else if (a.type === 'draw') {
          const pts = a.points.map(p => s2c(p[0], p[1], R, Wp, Hp));
          for (let i = 1; i < pts.length; i++) {
            outPage.drawLine({ start: pts[i - 1], end: pts[i], thickness: a.size || 2, color: col(a.color), opacity: a.opacity ?? 1 });
          }
        } else if (a.type === 'image' || a.type === 'signature') {
          await bakeImage(out, outPage, a, R, Wp, Hp);
        } else if (a.type === 'text') {
          const hasBn = /[ঀ-৿]/.test(a.text);
          if (a.html && a._rich) await bakeRichText(out, outPage, a, R, Wp, Hp, getFont);
          else if (hasBn && window.Fonts && Fonts.isCore(a.font)) {
            // auto-detect: Latin stays selectable vector, Bengali rendered in the Bengali font
            if (R !== 0) await bakeTextRaster(out, outPage, a, R, Wp, Hp);
            else await bakeRuns(out, outPage, plainRuns(a), a, Wp, Hp, getFont);
          }
          else if (window.Fonts && Fonts.needsRaster(a.font, a.text)) await bakeTextRaster(out, outPage, a, R, Wp, Hp);
          else await bakeText(outPage, a, R, Wp, Hp, getFont);
        } else if (a.type === 'table') {
          await bakeTable(out, outPage, a, R, Wp, Hp, getFont);
        }
      } catch (e) { console.warn('annotation bake failed', a.type, e); }
    }
  }

  function drawArrowHead(outPage, p1, p2, thick, color) {
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const len = 8 + thick * 2;
    const a1 = ang + Math.PI - 0.4, a2 = ang + Math.PI + 0.4;
    outPage.drawLine({ start: p2, end: { x: p2.x + len * Math.cos(a1), y: p2.y + len * Math.sin(a1) }, thickness: thick, color });
    outPage.drawLine({ start: p2, end: { x: p2.x + len * Math.cos(a2), y: p2.y + len * Math.sin(a2) }, thickness: thick, color });
  }

  async function bakeText(outPage, a, R, Wp, Hp, getFont) {
    const font = await getFont(a.font, a.bold, a.italic);
    const size = a.size;
    const tl = s2c(a.x, a.y, R, Wp, Hp);
    const d = downVec(R);
    const rdir = rightVec(R);
    const ascent = size * 0.80;
    const lineH = size * (a.lineSpacing || 1.25);
    const maxW = a.w * screenWidthPts(R, Wp, Hp);
    const lines = wrapText(a.text, font, size, maxW);
    const color = col(a.color);
    const bg = a.bg ? col(a.bg) : null;
    lines.forEach((line, idx) => {
      const off = ascent + idx * lineH;
      let bx = tl.x + d.x * off;
      let by = tl.y + d.y * off;
      const lw = font.widthOfTextAtSize(line, size);
      if (a.align && a.align !== 'left') {
        const shift = a.align === 'center' ? (maxW - lw) / 2 : (maxW - lw);
        bx += rdir.x * Math.max(0, shift);
        by += rdir.y * Math.max(0, shift);
      }
      // text highlight background (precise for unrotated pages)
      if (bg && R === 0) outPage.drawRectangle({ x: bx, y: by - size * 0.24, width: lw, height: lineH, color: bg });
      outPage.drawText(line, { x: bx, y: by, size, font, color, rotate: degrees(R) });
      // underline / strikethrough
      if (a.underline) {
        const o = size * 0.12;
        outPage.drawLine({ start: { x: bx + d.x * o, y: by + d.y * o }, end: { x: bx + d.x * o + rdir.x * lw, y: by + d.y * o + rdir.y * lw }, thickness: Math.max(0.6, size * 0.05), color });
      }
      if (a.strike) {
        const o = -size * 0.28;
        outPage.drawLine({ start: { x: bx + d.x * o, y: by + d.y * o }, end: { x: bx + d.x * o + rdir.x * lw, y: by + d.y * o + rdir.y * lw }, thickness: Math.max(0.6, size * 0.05), color });
      }
    });
  }

  async function bakeTable(out, outPage, a, R, Wp, Hp, getFont) {
    const font = await getFont(a.font, false, false);
    const color = col(a.color), bc = col(a.borderColor), bw = a.borderWidth || 1;
    for (let i = 0; i <= a.cols; i++) {
      const x = a.x + (i / a.cols) * a.w;
      outPage.drawLine({ start: s2c(x, a.y, R, Wp, Hp), end: s2c(x, a.y + a.h, R, Wp, Hp), thickness: bw, color: bc });
    }
    for (let j = 0; j <= a.rows; j++) {
      const y = a.y + (j / a.rows) * a.h;
      outPage.drawLine({ start: s2c(a.x, y, R, Wp, Hp), end: s2c(a.x + a.w, y, R, Wp, Hp), thickness: bw, color: bc });
    }
    const size = a.fontSize, d = downVec(R), padX = 0.004, padY = 0.004;
    const cellWpts = (a.w / a.cols) * screenWidthPts(R, Wp, Hp);
    for (let r = 0; r < a.rows; r++) for (let c = 0; c < a.cols; c++) {
      const txt = (a.cells[r] && a.cells[r][c]) || ''; if (!txt.trim()) continue;
      if (window.Fonts && Fonts.needsRaster(a.font, txt)) {
        const o = { text: txt, size, color: a.color, font: a.font, bold: false, italic: false, align: 'left', bg: null, lineSpacing: 1.15 };
        const rr = await rasterTextBlock(o, (a.w / a.cols - 0.008) * screenWidthPts(R, Wp, Hp));
        const box = { x: a.x + (c / a.cols) * a.w + padX, y: a.y + (r / a.rows) * a.h + padY, w: rr.widthPts / screenWidthPts(R, Wp, Hp), h: rr.heightPts / screenHeightPts(R, Wp, Hp) };
        await placeRasterImage(out, outPage, rr.dataUrl, box, R, Wp, Hp);
        continue;
      }
      const tl = s2c(a.x + (c / a.cols) * a.w + padX, a.y + (r / a.rows) * a.h + padY, R, Wp, Hp);
      const lines = wrapText(txt, font, size, Math.max(8, cellWpts - 6));
      const lineH = size * 1.2, ascent = size * 0.8;
      lines.forEach((line, idx) => {
        const off = ascent + idx * lineH;
        outPage.drawText(line, { x: tl.x + d.x * off, y: tl.y + d.y * off, size, font, color, rotate: degrees(R) });
      });
    }
  }
  function rightVec(R) {
    if (R === 90) return { x: 0, y: 1 };
    if (R === 180) return { x: -1, y: 0 };
    if (R === 270) return { x: 0, y: -1 };
    return { x: 1, y: 0 };
  }

  function wrapText(text, font, size, maxW) {
    const out = [];
    (text || '').split('\n').forEach(para => {
      if (para === '') { out.push(''); return; }
      const words = para.split(/(\s+)/);
      let line = '';
      for (const w of words) {
        const test = line + w;
        if (font.widthOfTextAtSize(test.trimEnd(), size) > maxW && line.trim()) {
          out.push(line.trimEnd()); line = w.trimStart();
        } else line = test;
      }
      if (line.trim() || line === '') out.push(line.trimEnd());
    });
    return out.length ? out : [''];
  }

  // ---- rasterized text (Calibri / Bengali / any non-WinAnsi) for exact look & shaping ----
  async function placeRasterImage(out, outPage, dataUrl, box, R, Wp, Hp) {
    let url = dataUrl;
    if (R) url = await rotateImage(dataUrl, (360 - R) % 360);
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const img = await out.embedPng(bytes);
    const r = rectToContent(box, R, Wp, Hp);
    outPage.drawImage(img, { x: r.x, y: r.y, width: r.w, height: r.h });
  }

  function wrapCanvas(ctx, text, maxW) {
    const out = [];
    (text || '').split('\n').forEach(para => {
      if (para === '') { out.push(''); return; }
      const words = para.split(/(\s+)/); let line = '';
      for (const w of words) { const test = line + w; if (ctx.measureText(test.replace(/\s+$/, '')).width > maxW && line.trim()) { out.push(line.replace(/\s+$/, '')); line = w.replace(/^\s+/, ''); } else line = test; }
      out.push(line.replace(/\s+$/, ''));
    });
    return out.length ? out : [''];
  }

  async function rasterTextBlock(o, screenWpts) {
    await Fonts.ready();
    const DPI = 3, size = o.size;
    const fontStr = (o.italic ? 'italic ' : '') + (o.bold ? '700 ' : '400 ') + (size * DPI) + 'px ' + Fonts.autoStack(o.font, o.banglaFont || 'SolaimanLipi');
    const meas = document.createElement('canvas').getContext('2d'); meas.font = fontStr;
    const maxWpx = Math.max(10, screenWpts * DPI);
    const lines = wrapCanvas(meas, o.text, maxWpx);
    const lineH = size * (o.lineSpacing || 1.25) * DPI, padX = 2 * DPI, padY = 1 * DPI;
    const c = document.createElement('canvas');
    c.width = Math.ceil(maxWpx + padX * 2); c.height = Math.ceil(lines.length * lineH + padY * 2);
    const ctx = c.getContext('2d');
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.font = fontStr; ctx.fillStyle = o.color || '#000'; ctx.textBaseline = 'alphabetic';
    lines.forEach((ln, idx) => {
      const lw = ctx.measureText(ln).width;
      let x = padX; if (o.align === 'center') x = (c.width - lw) / 2; else if (o.align === 'right') x = c.width - padX - lw;
      const baseline = padY + idx * lineH + size * 0.8 * DPI;
      ctx.fillText(ln, x, baseline);
      if (o.underline) ctx.fillRect(x, baseline + size * 0.12 * DPI, lw, Math.max(1, size * 0.05 * DPI));
      if (o.strike) ctx.fillRect(x, baseline - size * 0.28 * DPI, lw, Math.max(1, size * 0.05 * DPI));
    });
    return { dataUrl: c.toDataURL('image/png'), widthPts: c.width / DPI, heightPts: c.height / DPI };
  }

  // ---- rich (per-character) text -> parse styled runs -> canvas render -> image ----
  function rgbToHex(s) {
    const m = (s || '').match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
  }
  function parseRuns(a) {
    const cont = document.createElement('div');
    cont.style.cssText = 'position:absolute;left:-99999px;top:0;white-space:pre-wrap;font-size:' + a.size + 'px;font-family:' + Fonts.css(a.font) + ';color:' + a.color + ';font-weight:' + (a.bold ? '700' : '400') + ';font-style:' + (a.italic ? 'italic' : 'normal');
    cont.innerHTML = a.html;
    document.body.appendChild(cont);
    const runs = [];
    (function walk(node) {
      node.childNodes.forEach(ch => {
        if (ch.nodeType === 3) {
          if (!ch.nodeValue) return;
          const cs = getComputedStyle(ch.parentElement);
          const dec = cs.textDecorationLine || cs.textDecoration || '';
          const fontId = window.Fonts ? Fonts.idFromCss(cs.fontFamily) : 'Helvetica';
          runs.push({ text: ch.nodeValue, bold: (parseInt(cs.fontWeight) >= 600 || cs.fontWeight === 'bold'), italic: cs.fontStyle === 'italic', underline: dec.includes('underline'), strike: dec.includes('line-through'), color: rgbToHex(cs.color), bg: (cs.backgroundColor && !/rgba?\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) ? rgbToHex(cs.backgroundColor) : null, sizePt: parseFloat(cs.fontSize) || a.size, fontCss: cs.fontFamily, fontId });
        } else if (ch.nodeName === 'BR') runs.push({ newline: true });
        else walk(ch);
      });
    })(cont);
    document.body.removeChild(cont);
    return runs;
  }
  function runFont(r, DPI) { return (r.italic ? 'italic ' : '') + (r.bold ? '700 ' : '400 ') + (r.sizePt * DPI) + 'px ' + r.fontCss; }

  async function rasterRichBlock(a, screenWpts) {
    await Fonts.ready();
    const DPI = 3, pad = 2 * DPI;
    const runs = parseRuns(a);
    const maxW = Math.max(10, screenWpts * DPI);
    const meas = document.createElement('canvas').getContext('2d');
    // layout into lines of tokens {text, run}
    const lines = [[]]; let lineW = 0;
    function pushTok(text, run) {
      meas.font = runFont(run, DPI);
      const w = meas.measureText(text).width;
      if (lineW + w > maxW && lines[lines.length - 1].length) { lines.push([]); lineW = 0; }
      lines[lines.length - 1].push({ text, run, w }); lineW += w;
    }
    runs.forEach(run => {
      if (run.newline) { lines.push([]); lineW = 0; return; }
      const parts = run.text.split(/(\s+)/);
      parts.forEach(p => { if (p === '') return; pushTok(p, run); });
    });
    const lineH = lines.map(toks => (toks.reduce((m, t) => Math.max(m, t.run.sizePt), a.size)) * 1.3 * DPI);
    const totalH = lineH.reduce((s, h) => s + h, 0) + pad * 2;
    const c = document.createElement('canvas'); c.width = Math.ceil(maxW + pad * 2); c.height = Math.ceil(totalH);
    const ctx = c.getContext('2d'); ctx.textBaseline = 'alphabetic';
    let y = pad;
    lines.forEach((toks, li) => {
      const h = lineH[li]; const baseline = y + h * 0.78; let x = pad;
      toks.forEach(t => {
        ctx.font = runFont(t.run, DPI);
        if (t.run.bg) { ctx.fillStyle = t.run.bg; ctx.fillRect(x, y + h * 0.1, t.w, h * 0.86); }
        ctx.fillStyle = t.run.color; ctx.fillText(t.text, x, baseline);
        if (t.run.underline) ctx.fillRect(x, baseline + t.run.sizePt * 0.12 * DPI, t.w, Math.max(1, t.run.sizePt * 0.05 * DPI));
        if (t.run.strike) ctx.fillRect(x, baseline - t.run.sizePt * 0.3 * DPI, t.w, Math.max(1, t.run.sizePt * 0.05 * DPI));
        x += t.w;
      });
      y += h;
    });
    return { dataUrl: c.toDataURL('image/png'), widthPts: c.width / DPI, heightPts: c.height / DPI };
  }
  const NON_WINANSI = /[^ -ÿ‘’“”–—…]/;
  function rasterToken(text, run, lineHeightPt, ascentPt) {
    const DPI = 3;
    const fontStr = (run.italic ? 'italic ' : '') + (run.bold ? '700 ' : '400 ') + (run.sizePt * DPI) + 'px ' + run.fontCss;
    const meas = document.createElement('canvas').getContext('2d'); meas.font = fontStr;
    const w = Math.max(1, meas.measureText(text).width);
    const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(lineHeightPt * DPI);
    const ctx = c.getContext('2d'); ctx.font = fontStr; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = run.color;
    ctx.fillText(text, 0, ascentPt * DPI);
    return { dataUrl: c.toDataURL('image/png'), widthPt: w / DPI };
  }

  async function bakeRichText(out, outPage, a, R, Wp, Hp, getFont) {
    if (R !== 0) { // rotated pages: single rasterized block (rare combo)
      const screenWpts = a.w * screenWidthPts(R, Wp, Hp);
      const r = await rasterRichBlock(a, screenWpts);
      const box = { x: a.x, y: a.y, w: r.widthPts / screenWidthPts(R, Wp, Hp), h: r.heightPts / screenHeightPts(R, Wp, Hp) };
      await placeRasterImage(out, outPage, r.dataUrl, box, R, Wp, Hp);
      return;
    }
    await bakeRuns(out, outPage, parseRuns(a), a, Wp, Hp, getFont);
  }

  // auto-detect script: split plain text into Latin / Bengali runs, each with its own font
  function plainRuns(a) {
    const bnFont = a.banglaFont || 'SolaimanLipi';
    const runs = [];
    a.text.split('\n').forEach((para, pi) => {
      if (pi > 0) runs.push({ newline: true });
      const re = /[ঀ-৿][ঀ-৿‌‍]*|[^ঀ-৿]+/g; let m;
      while ((m = re.exec(para)) !== null) {
        const bn = /[ঀ-৿]/.test(m[0]); const fid = bn ? bnFont : a.font;
        runs.push({ text: m[0], bold: a.bold, italic: a.italic, underline: a.underline, strike: a.strike, color: a.color, sizePt: a.size, fontId: fid, fontCss: Fonts.css(fid), bg: null });
      }
    });
    return runs;
  }

  // run layout engine: Latin/core runs -> selectable vector; Bengali/non-core -> inline raster
  async function bakeRuns(out, outPage, runs, a, Wp, Hp, getFont) {
    const originX = a.x * Wp, originTop = a.y * Hp, maxW = a.w * Wp;
    const meas = document.createElement('canvas').getContext('2d');
    const tokens = [];
    for (const run of runs) {
      if (run.newline) { tokens.push({ newline: true }); continue; }
      const raster = !Fonts.isCore(run.fontId) || NON_WINANSI.test(run.text);
      let font = null;
      if (!raster) font = await getFont(run.fontId, run.bold, run.italic);
      run.text.split(/(\s+)/).forEach(part => {
        if (part === '') return;
        let w;
        if (raster) { meas.font = (run.italic ? 'italic ' : '') + (run.bold ? '700 ' : '400 ') + (run.sizePt * 3) + 'px ' + run.fontCss; w = meas.measureText(part).width / 3; }
        else w = font.widthOfTextAtSize(part, run.sizePt);
        tokens.push({ text: part, run, raster, font, w });
      });
    }
    const lines = [[]]; let lineW = 0;
    tokens.forEach(t => {
      if (t.newline) { lines.push([]); lineW = 0; return; }
      const isSpace = /^\s+$/.test(t.text);
      if (lineW + t.w > maxW && lines[lines.length - 1].length && !isSpace) { lines.push([]); lineW = 0; }
      lines[lines.length - 1].push(t); lineW += t.w;
    });
    const lh = (a.lineSpacing || 1.25);
    let yTop = originTop;
    for (const line of lines) {
      const maxSize = line.reduce((m, t) => Math.max(m, t.run.sizePt), a.size);
      const ascent = maxSize * 0.8, lineHeight = maxSize * lh;
      const lineWidth = line.reduce((s, t) => s + t.w, 0);
      let x = originX;
      if (a.align === 'center') x = originX + Math.max(0, (maxW - lineWidth) / 2);
      else if (a.align === 'right') x = originX + Math.max(0, maxW - lineWidth);
      if (a.bg) outPage.drawRectangle({ x: originX, y: Hp - (yTop + lineHeight), width: maxW, height: lineHeight, color: col(a.bg) });
      for (const t of line) {
        const baselineY = Hp - (yTop + ascent);
        if (t.run.bg) outPage.drawRectangle({ x, y: Hp - (yTop + lineHeight), width: t.w, height: lineHeight, color: col(t.run.bg) });
        if (t.raster) {
          const img = rasterToken(t.text, t.run, lineHeight, ascent);
          const bytes = new Uint8Array(await (await fetch(img.dataUrl)).arrayBuffer());
          const emb = await out.embedPng(bytes);
          outPage.drawImage(emb, { x, y: Hp - (yTop + lineHeight), width: t.w, height: lineHeight });
        } else if (t.text.trim()) {
          outPage.drawText(t.text, { x, y: baselineY, size: t.run.sizePt, font: t.font, color: col(t.run.color) });
        }
        if (t.run.underline) outPage.drawLine({ start: { x, y: baselineY - t.run.sizePt * 0.12 }, end: { x: x + t.w, y: baselineY - t.run.sizePt * 0.12 }, thickness: Math.max(0.5, t.run.sizePt * 0.05), color: col(t.run.color) });
        if (t.run.strike) outPage.drawLine({ start: { x, y: baselineY + t.run.sizePt * 0.28 }, end: { x: x + t.w, y: baselineY + t.run.sizePt * 0.28 }, thickness: Math.max(0.5, t.run.sizePt * 0.05), color: col(t.run.color) });
        x += t.w;
      }
      yTop += maxSize * lh;
    }
  }

  async function bakeTextRaster(out, outPage, a, R, Wp, Hp) {
    const screenWpts = a.w * screenWidthPts(R, Wp, Hp);
    const r = await rasterTextBlock(a, screenWpts);
    const box = { x: a.x, y: a.y, w: r.widthPts / screenWidthPts(R, Wp, Hp), h: r.heightPts / screenHeightPts(R, Wp, Hp) };
    await placeRasterImage(out, outPage, r.dataUrl, box, R, Wp, Hp);
  }

  async function bakeImage(out, outPage, a, R, Wp, Hp) {
    let dataUrl = a.dataUrl;
    if (R) dataUrl = await rotateImage(dataUrl, (360 - R) % 360);
    const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    let img;
    if (/^data:image\/png/i.test(dataUrl) || a.fmt === 'png' || a.type === 'signature') img = await out.embedPng(bytes);
    else { try { img = await out.embedJpg(bytes); } catch { img = await out.embedPng(new Uint8Array(await (await fetch(await toPng(dataUrl))).arrayBuffer())); } }
    const r = rectToContent(a, R, Wp, Hp);
    outPage.drawImage(img, { x: r.x, y: r.y, width: r.w, height: r.h });
  }

  function rotateImage(dataUrl, deg) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const rad = deg * Math.PI / 180;
        if (deg === 90 || deg === 270) { c.width = img.naturalHeight; c.height = img.naturalWidth; }
        else { c.width = img.naturalWidth; c.height = img.naturalHeight; }
        const ctx = c.getContext('2d');
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        res(c.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  }
  function toPng(dataUrl) {
    return new Promise(res => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); res(c.toDataURL('image/png')); }; i.src = dataUrl; });
  }

  async function rasterFallback(out, src, srcIndex) {
    const pj = await src.pdfjsDoc.getPage(srcIndex + 1);
    const base = pj.getViewport({ scale: 1, rotation: 0 });
    const vp = pj.getViewport({ scale: 2, rotation: 0 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await pj.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const png = new Uint8Array(await (await fetch(canvas.toDataURL('image/png'))).arrayBuffer());
    const page = out.addPage([base.width, base.height]);
    const emb = await out.embedPng(png);
    page.drawImage(emb, { x: 0, y: 0, width: base.width, height: base.height });
    return page;
  }

  async function drawWatermark(out, outPage, wm, Wp, Hp, getFont) {
    const opacity = wm.opacity ?? 0.25;
    if (wm.image) {
      const bytes = new Uint8Array(await (await fetch(wm.image)).arrayBuffer());
      let img; try { img = await out.embedPng(bytes); } catch { img = await out.embedJpg(bytes); }
      const scale = wm.scale || 0.5;
      const w = Wp * scale, h = w * (img.height / img.width);
      outPage.drawImage(img, { x: (Wp - w) / 2, y: (Hp - h) / 2, width: w, height: h, opacity });
      return;
    }
    const text = wm.text || 'CONFIDENTIAL';
    const font = await getFont('Helvetica', true, false);
    const size = wm.size || Math.max(24, Wp / Math.max(8, text.length) * 1.6);
    const angle = wm.angle ?? 45;
    const tw = font.widthOfTextAtSize(text, size);
    const rad = angle * Math.PI / 180;
    const cx = Wp / 2, cy = Hp / 2;
    const x = cx - (tw / 2) * Math.cos(rad) + (size / 2) * Math.sin(rad);
    const y = cy - (tw / 2) * Math.sin(rad) - (size / 2) * Math.cos(rad);
    outPage.drawText(text, { x, y, size, font, color: col(wm.color || '#ff0000'), opacity, rotate: degrees(angle) });
  }

  function applyMeta(out, m) {
    if (m.title != null) out.setTitle(m.title || '');
    if (m.author != null) out.setAuthor(m.author || '');
    if (m.subject != null) out.setSubject(m.subject || '');
    if (m.keywords != null) out.setKeywords((m.keywords || '').split(',').map(s => s.trim()).filter(Boolean));
    if (m.creator != null) out.setCreator(m.creator || 'Master PDF Editor');
    out.setModificationDate(new Date());
  }

  // ---- High level outputs ----
  Export.downloadCurrent = async function () {
    Util.busy(true, 'Building PDF…');
    try {
      const bytes = await Export.buildPdf(state.aiMetadata ? { metadata: state.aiMetadata } : {});
      Util.download(bytes, outName(), 'application/pdf');
      Util.toast('Downloaded', 'ok');
    } catch (e) { console.error(e); Util.toast('Export failed: ' + (e.message || e), 'err', 4000); }
    finally { Util.busy(false); }
  };

  Export.pageAsImage = async function (pageId, fmt) {
    const page = state.getPage(pageId);
    const src = state.srcDocs[page.docId];
    const pj = await src.pdfjsDoc.getPage(page.srcIndex + 1);
    const vp = pj.getViewport({ scale: 2.5, rotation: page.rotation });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    if (fmt === 'jpg') { const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    await pj.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    // also draw annotations onto the raster export
    const dataUrl = canvas.toDataURL(fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
    return dataUrl;
  };

  Export.exportAllImages = async function (fmt) {
    Util.busy(true, 'Rendering pages…');
    try {
      for (let i = 0; i < state.pages.length; i++) {
        const dataUrl = await Export.pageAsImage(state.pages[i].id, fmt);
        const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
        Util.download(bytes, Util.baseName(state.primaryName) + '_p' + (i + 1) + '.' + fmt, fmt === 'jpg' ? 'image/jpeg' : 'image/png');
        await new Promise(r => setTimeout(r, 120));
      }
      Util.toast('Exported ' + state.pages.length + ' image(s)', 'ok');
    } catch (e) { Util.toast('Export failed', 'err'); console.error(e); }
    finally { Util.busy(false); }
  };

  Export.extractText = async function () {
    Util.busy(true, 'Extracting text…');
    try {
      let all = '';
      for (let i = 0; i < state.pages.length; i++) {
        const p = state.pages[i];
        const src = state.srcDocs[p.docId];
        const pj = await src.pdfjsDoc.getPage(p.srcIndex + 1);
        const tc = await pj.getTextContent();
        const txt = tc.items.map(it => it.str).join(' ');
        all += '----- Page ' + (i + 1) + ' -----\n' + txt + '\n\n';
      }
      Util.download(new TextEncoder().encode(all), Util.baseName(state.primaryName) + '.txt', 'text/plain');
      Util.toast('Text extracted', 'ok');
    } catch (e) { Util.toast('Extract failed', 'err'); console.error(e); }
    finally { Util.busy(false); }
  };

  function outName() { return Util.baseName(state.primaryName) + '-edited.pdf'; }
  Export.outName = outName;

  window.Export = Export;
})();
