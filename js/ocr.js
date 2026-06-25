/* ocr.js — OCR for scanned / image PDFs (Tesseract.js).
   Recognized text lines become editable text boxes over a background-matched cover,
   so scanned text can be edited / deleted / restyled like normal text. */
(function () {
  'use strict';
  const OCR = {};
  let worker = null, workerLang = null;

  OCR.available = () => !!window.Tesseract;

  async function getWorker(lang) {
    if (worker && workerLang === lang) return worker;
    if (worker) { try { await worker.terminate(); } catch (e) {} worker = null; }
    workerLang = lang;
    worker = await Tesseract.createWorker(lang, 1, {
      logger: (m) => {
        if (!m || !m.status) return;
        if (m.status === 'recognizing text') Util.busy(true, 'Recognizing text… ' + Math.round((m.progress || 0) * 100) + '%');
        else if (/load|init/i.test(m.status)) Util.busy(true, 'Loading OCR model…');
      }
    });
    return worker;
  }

  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

  // Render a clean, high-resolution copy of the original page for OCR (zoom-independent,
  // no overlays). Falls back to the on-screen canvas if a dedicated render fails / hangs.
  async function ocrCanvas(page) {
    const src = state.srcDocs[page.docId];
    // Best path for image inputs: OCR the ORIGINAL image at full resolution — no PDF
    // re-render (reliable, never hangs) and maximum accuracy. (Skip if the page is rotated.)
    if (src && src.imageDataUrl && !((page.rotation || 0) % 360)) {
      try {
        const img = await loadImg(src.imageDataUrl);
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        const cap = 3200; if (Math.max(w, h) > cap) { const s = cap / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const minW = 1600; if (w < minW) { const s = minW / w; w = Math.round(w * s); h = Math.round(h * s); }
        const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
        const ctx = oc.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const pageHpts = (img.naturalHeight || img.height);
        return { canvas: oc, pageHpts };
      } catch (e) { /* fall through to render */ }
    }
    try {
      const pj = await state.srcDocs[page.docId].pdfjsDoc.getPage(page.srcIndex + 1);
      const rot = page.rotation || 0;
      const base = pj.getViewport({ scale: 1, rotation: rot });
      const scale = Math.min(4, Math.max(2, 2400 / base.width));
      const vp = pj.getViewport({ scale, rotation: rot });
      const oc = document.createElement('canvas');
      oc.width = Math.ceil(vp.width); oc.height = Math.ceil(vp.height);
      const ctx = oc.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, oc.width, oc.height);
      const task = pj.render({ canvasContext: ctx, viewport: vp });
      await Promise.race([task.promise, new Promise((_, rej) => setTimeout(() => { try { task.cancel(); } catch (e) {} rej(new Error('render timeout')); }, 20000))]);
      return { canvas: oc, pageHpts: base.height };
    } catch (e) {
      const disp = Viewer.getPageCanvas(page.id);
      if (disp && disp.width) {
        const pj = await state.srcDocs[page.docId].pdfjsDoc.getPage(page.srcIndex + 1);
        const base = pj.getViewport({ scale: 1, rotation: page.rotation || 0 });
        return { canvas: disp, pageHpts: base.height };
      }
      return null;
    }
  }

  function currentPage() {
    const vp = document.getElementById('pageviewport');
    const wraps = Array.from(document.querySelectorAll('.page-wrap'));
    if (!wraps.length) return state.pages[0];
    let t = wraps[0]; const mid = vp.scrollTop + vp.clientHeight / 2;
    wraps.forEach(w => { if (w.offsetTop <= mid) t = w; });
    return state.getPage(t.dataset.pageId) || state.pages[0];
  }

  OCR.run = async function (opts) {
    if (!window.Tesseract) { Util.toast('OCR engine not loaded (offline?)', 'err', 4000); return 0; }
    if (!state.hasDoc()) return 0;
    const pages = opts.scope === 'all' ? state.pages.slice() : [currentPage()];
    Util.busy(true, 'Recognizing text (OCR)…');
    let total = 0;
    try {
      const wk = await getWorker(opts.lang || 'eng');
      for (const page of pages) {
        const rc = await ocrCanvas(page);
        if (!rc || !rc.canvas || !rc.canvas.width) continue;
        const canvas = rc.canvas, pageHpts = rc.pageHpts;
        const { data } = await wk.recognize(canvas, {}, { blocks: true });
        let lines = (data.lines && data.lines.length) ? data.lines : [];
        if (!lines.length && data.blocks) data.blocks.forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => lines.push(l))));
        lines.forEach(line => {
          const txt = (line.text || '').replace(/\s+/g, ' ').trim();
          if (!txt || !line.bbox) return;
          const bb = line.bbox;
          const box = { x: bb.x0 / canvas.width, y: bb.y0 / canvas.height, w: (bb.x1 - bb.x0) / canvas.width, h: (bb.y1 - bb.y0) / canvas.height };
          if (box.w < 0.01 || box.h < 0.002) return;
          let bg = '#ffffff', fg = '#000000';
          try { const c = TextEdit.sampleColors(canvas, box); bg = c.bg; fg = c.fg; } catch (e) {}
          const fontSize = Math.max(6, Math.round(box.h * pageHpts * 0.82));
          const font = /[ঀ-৿]/.test(txt) ? 'SolaimanLipi' : 'Helvetica';
          const pad = 0.003;
          const ebox = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), w: Math.min(1, box.w + pad * 2), h: Math.min(1, box.h + pad * 2) };
          const pt = TextEdit.erasePatch ? TextEdit.erasePatch(canvas, ebox) : { bg, img: null };
          page.annotations.push({ id: state.uid('a'), type: 'whiteout', x: ebox.x, y: ebox.y, w: ebox.w, h: ebox.h, color: pt.bg, img: pt.img });
          page.annotations.push({ id: state.uid('a'), type: 'text', x: box.x, y: box.y, w: Math.min(1 - box.x, box.w * 1.18 + 0.02), text: txt, size: fontSize, color: fg, font, banglaFont: 'SolaimanLipi', bold: false, italic: false, underline: false, strike: false, align: 'left', bg: null, lineSpacing: 1.05 });
          total++;
        });
        page._ocrDone = true;
      }
      if (total) { Viewer.renderAll(); if (UI.refreshThumbs) UI.refreshThumbs(); UI.updateStatus(); state.pushHistory(); }
      Util.toast(total ? ('OCR added ' + total + ' editable text line(s) — edit or delete any of them') : 'No text was recognized on the page(s)', total ? 'ok' : 'warn', 4000);
      return total;
    } catch (e) { console.error(e); Util.toast('OCR failed: ' + (e.message || e), 'err', 4500); return 0; }
    finally { Util.busy(false); }
  };

  OCR.dialog = function () {
    if (!state.hasDoc()) { Util.toast('Open or create a document first', 'warn'); return; }
    if (!window.Tesseract) { Util.toast('OCR engine could not load (offline?)', 'err', 4000); return; }
    const el = Util.el;
    const lang = el('select', { style: { width: '100%' } }, [['eng', 'English'], ['ben', 'বাংলা (Bengali)'], ['eng+ben', 'English + Bengali']].map(([v, t]) => el('option', { value: v, text: t })));
    const scope = el('select', { style: { width: '100%' } }, [['current', 'Current page'], ['all', 'All pages']].map(([v, t]) => el('option', { value: v, text: t })));
    const body = el('div', {}, [
      el('div', { class: 'modal-head' }, [el('h3', { text: 'Recognize text (OCR)' }), el('p', { text: 'Make a scanned / image PDF editable. Recognized lines become editable text boxes over a background-matched cover, so you can edit or delete them like normal text.' })]),
      el('div', { class: 'modal-body' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Language' }), lang]),
        el('div', { class: 'field' }, [el('label', { text: 'Pages' }), scope]),
        el('div', { class: 'note', text: 'The first run downloads the language model (a few MB). OCR isn’t perfect — fix any line by editing it.' }),
      ])
    ]);
    const run = el('button', { class: 'btn primary', text: 'Recognize' });
    body.appendChild(el('div', { class: 'modal-foot' }, [el('button', { class: 'btn ghost', text: 'Cancel', onclick: () => m.close() }), run]));
    const m = Util.modal(body);
    run.onclick = () => { const o = { lang: lang.value, scope: scope.value }; m.close(); OCR.run(o); };
  };

  window.OCR = OCR;
})();
