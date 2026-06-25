/* operations.js — merge/split/extract, compress, watermark, metadata, forms, security */
(function () {
  'use strict';

  const Operations = {};
  const { degrees, rgb } = PDFLib;

  Operations.encryptionAvailable = function () {
    return !!(window.PDFLibEnc && window.PDFLibEnc.PDFDocument);
  };

  /* ---- parse "1-3,5,8-10" into 0-based indices within current page list ---- */
  Operations.parseRanges = function (str, max) {
    const out = [];
    (str || '').split(',').forEach(part => {
      part = part.trim(); if (!part) return;
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) { let a = +m[1], b = +m[2]; if (a > b) [a, b] = [b, a]; for (let i = a; i <= b; i++) if (i >= 1 && i <= max) out.push(i - 1); }
      else { const n = +part; if (n >= 1 && n <= max) out.push(n - 1); }
    });
    return out;
  };

  Operations.extractSelected = async function () {
    if (!state.selectedPageIds.size) { Util.toast('Select pages first (click thumbnails)', 'warn'); return; }
    const ids = state.pages.filter(p => state.selectedPageIds.has(p.id)).map(p => p.id);
    Util.busy(true, 'Extracting…');
    try {
      const bytes = await Export.buildPdf({ pageIds: ids });
      Util.download(bytes, Util.baseName(state.primaryName) + '-extract.pdf', 'application/pdf');
      Util.toast('Extracted ' + ids.length + ' page(s)', 'ok');
    } catch (e) { Util.toast('Failed', 'err'); console.error(e); } finally { Util.busy(false); }
  };

  Operations.splitByRanges = async function (str) {
    const idx = Operations.parseRanges(str, state.pages.length);
    if (!idx.length) { Util.toast('Enter a valid page range', 'warn'); return; }
    const ids = idx.map(i => state.pages[i].id);
    Util.busy(true, 'Splitting…');
    try {
      const bytes = await Export.buildPdf({ pageIds: ids });
      Util.download(bytes, Util.baseName(state.primaryName) + '-pages.pdf', 'application/pdf');
      Util.toast('Saved ' + ids.length + ' page(s)', 'ok');
    } catch (e) { Util.toast('Failed', 'err'); console.error(e); } finally { Util.busy(false); }
  };

  // split into N separate files, one per page
  Operations.splitEachPage = async function () {
    Util.busy(true, 'Splitting each page…');
    try {
      for (let i = 0; i < state.pages.length; i++) {
        const bytes = await Export.buildPdf({ pageIds: [state.pages[i].id] });
        Util.download(bytes, Util.baseName(state.primaryName) + '-p' + (i + 1) + '.pdf', 'application/pdf');
        await new Promise(r => setTimeout(r, 150));
      }
      Util.toast('Saved ' + state.pages.length + ' files', 'ok');
    } catch (e) { Util.toast('Failed', 'err'); console.error(e); } finally { Util.busy(false); }
  };

  /* ---- Compress: rasterize pages to JPEG at chosen quality ---- */
  Operations.compress = async function (quality, dpiScale) {
    Util.busy(true, 'Compressing…');
    try {
      const out = await PDFLib.PDFDocument.create();
      for (const p of state.pages) {
        const src = state.srcDocs[p.docId];
        const pj = await src.pdfjsDoc.getPage(p.srcIndex + 1);
        const base = pj.getViewport({ scale: 1, rotation: p.rotation });
        const vp = pj.getViewport({ scale: dpiScale, rotation: p.rotation });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pj.render({ canvasContext: ctx, viewport: vp }).promise;
        // draw annotation overlay onto raster via temporary export image
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
        const img = await out.embedJpg(bytes);
        const page = out.addPage([base.width, base.height]);
        page.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      }
      const bytes = await out.save();
      Util.download(bytes, Util.baseName(state.primaryName) + '-compressed.pdf', 'application/pdf');
      Util.toast('Compressed PDF saved (' + Math.round(bytes.length / 1024) + ' KB)', 'ok', 3500);
    } catch (e) { Util.toast('Compress failed', 'err'); console.error(e); } finally { Util.busy(false); }
  };

  /* ---- Watermark (text or current signature/image) applied to all/selected ---- */
  Operations.watermark = async function (opts) {
    Util.busy(true, 'Applying watermark…');
    try {
      const bytes = await Export.buildPdf({ watermark: opts });
      Util.download(bytes, Util.baseName(state.primaryName) + '-watermarked.pdf', 'application/pdf');
      Util.toast('Watermark applied', 'ok');
    } catch (e) { Util.toast('Failed', 'err'); console.error(e); } finally { Util.busy(false); }
  };

  /* ---- Metadata ---- */
  Operations.readMetadata = function () {
    const p = state.pages[0]; if (!p) return {};
    const d = state.srcDocs[p.docId].libDoc;
    if (!d) return {};
    const k = d.getKeywords && d.getKeywords();
    return {
      title: safe(d.getTitle), author: safe(d.getAuthor), subject: safe(d.getSubject),
      keywords: Array.isArray(k) ? k.join(', ') : (k || ''), creator: safe(d.getCreator)
    };
    function safe(fn) { try { return fn.call(d) || ''; } catch { return ''; } }
  };
  Operations.applyMetadata = async function (meta) {
    Util.busy(true, 'Saving metadata…');
    try {
      const bytes = await Export.buildPdf({ metadata: meta });
      Util.download(bytes, Util.baseName(state.primaryName) + '.pdf', 'application/pdf');
      Util.toast('Metadata updated', 'ok');
    } catch (e) { Util.toast('Failed', 'err'); console.error(e); } finally { Util.busy(false); }
  };

  /* ---- Forms : operate on a single underlying source document ---- */
  Operations.getFormFields = function () {
    const docIds = [...new Set(state.pages.map(p => p.docId))];
    for (const id of docIds) {
      const d = state.srcDocs[id].libDoc;
      if (!d) continue;
      try {
        const form = d.getForm();
        const fields = form.getFields();
        if (fields.length) return { docId: id, fields: fields.map(describeField) };
      } catch (e) { /* no form */ }
    }
    return { docId: docIds[0], fields: [] };
  };
  function describeField(f) {
    const type = f.constructor.name.replace('PDF', '');
    const info = { name: f.getName(), type };
    try {
      if (type === 'TextField') info.value = f.getText() || '';
      else if (type === 'CheckBox') info.value = f.isChecked();
      else if (type === 'Dropdown') { info.options = f.getOptions(); info.value = (f.getSelected() || [])[0] || ''; }
      else if (type === 'OptionList') { info.options = f.getOptions(); info.value = (f.getSelected() || [])[0] || ''; }
      else if (type === 'RadioGroup') { info.options = f.getOptions(); info.value = f.getSelected() || ''; }
    } catch (e) {}
    return info;
  }
  Operations.fillForm = async function (docId, values, flatten) {
    Util.busy(true, 'Filling form…');
    try {
      const src = state.srcDocs[docId];
      const doc = await PDFLib.PDFDocument.load(src.bytes.slice(0), { ignoreEncryption: true });
      const form = doc.getForm();
      for (const name in values) {
        try {
          const f = form.getField(name);
          const type = f.constructor.name.replace('PDF', '');
          if (type === 'TextField') f.setText(values[name] || '');
          else if (type === 'CheckBox') values[name] ? f.check() : f.uncheck();
          else if (type === 'Dropdown' || type === 'OptionList') { if (values[name]) f.select(values[name]); }
          else if (type === 'RadioGroup') { if (values[name]) f.select(values[name]); }
        } catch (e) { console.warn('field', name, e); }
      }
      if (flatten) form.flatten();
      const bytes = await doc.save();
      Util.download(bytes, Util.baseName(state.primaryName) + (flatten ? '-filled-flat.pdf' : '-filled.pdf'), 'application/pdf');
      Util.toast('Form ' + (flatten ? 'filled & flattened' : 'filled'), 'ok');
    } catch (e) { Util.toast('Form fill failed', 'err'); console.error(e); } finally { Util.busy(false); }
  };

  /* ---- Security: protect (encrypt) / unlock (already decrypted on open) ---- */
  Operations.protect = async function (userPassword, ownerPassword, perms) {
    if (!Operations.encryptionAvailable()) {
      Util.toast('Encryption engine not loaded — cannot add password', 'err', 4500);
      return;
    }
    Util.busy(true, 'Encrypting…');
    try {
      const composed = await Export.buildPdf({});
      const Enc = window.PDFLibEnc;
      const doc = await Enc.PDFDocument.load(composed);
      const permissions = {
        printing: perms.printing ? 'highResolution' : undefined,
        modifying: perms.modifying, copying: perms.copying,
        annotating: perms.annotating,
      };
      let bytes;
      if (typeof doc.encrypt === 'function') {
        doc.encrypt({ userPassword, ownerPassword: ownerPassword || userPassword, permissions });
        bytes = await doc.save();
      } else {
        bytes = await doc.save({ userPassword, ownerPassword: ownerPassword || userPassword, permissions });
      }
      Util.download(bytes, Util.baseName(state.primaryName) + '-protected.pdf', 'application/pdf');
      Util.toast('Password-protected PDF saved', 'ok');
    } catch (e) { Util.toast('Encryption failed: ' + (e.message || e), 'err', 4500); console.error(e); }
    finally { Util.busy(false); }
  };

  // Unlock = export without encryption (document already decrypted when opened with its password)
  Operations.unlock = async function () {
    Util.busy(true, 'Removing protection…');
    try {
      const bytes = await Export.buildPdf({});
      Util.download(bytes, Util.baseName(state.primaryName) + '-unlocked.pdf', 'application/pdf');
      Util.toast('Saved an unprotected copy', 'ok');
    } catch (e) { Util.toast('Failed', 'err'); console.error(e); } finally { Util.busy(false); }
  };

  window.Operations = Operations;
})();
