/* saveas.js — export to DOCX, DOC, JSON (project), and load JSON projects back */
(function () {
  'use strict';
  const SaveAs = {};

  /* ---------- text gathering ---------- */
  function linesFromItems(items) {
    const lines = []; let cur = '', lastY = null;
    items.forEach(it => {
      if (!it.str) return;
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 3) { if (cur.trim()) lines.push(cur.trim()); cur = ''; }
      cur += it.str + (it.hasEOL ? ' ' : '');
      lastY = y;
    });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }
  async function gatherText() {
    const pages = [];
    for (const p of state.pages) {
      const src = state.srcDocs[p.docId];
      const pj = await src.pdfjsDoc.getPage(p.srcIndex + 1);
      const tc = await pj.getTextContent();
      const lines = linesFromItems(tc.items);
      p.annotations.forEach(a => {
        if (a.type === 'text' && a.text.trim()) a.text.split('\n').forEach(l => lines.push(l));
        else if (a.type === 'table') a.cells.forEach(row => lines.push(row.join('\t')));
      });
      pages.push(lines);
    }
    return pages;
  }

  const escXml = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escHtml = escXml;

  /* ---------- DOCX ---------- */
  const CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  function docXml(pages) {
    let body = '';
    pages.forEach((lines, pi) => {
      if (pi > 0) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (!lines.length) body += '<w:p/>';
      lines.forEach(ln => { body += '<w:p><w:r><w:t xml:space="preserve">' + escXml(ln) + '</w:t></w:r></w:p>'; });
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr/></w:body></w:document>';
  }
  SaveAs.docx = async function () {
    if (!window.JSZip) { Util.toast('Zip library not loaded (offline?)', 'err'); return; }
    Util.busy(true, 'Building Word document…');
    try {
      const pages = await gatherText();
      const zip = new JSZip();
      zip.file('[Content_Types].xml', CT);
      zip.folder('_rels').file('.rels', RELS);
      zip.folder('word').file('document.xml', docXml(pages));
      const blob = await zip.generateAsync({ type: 'blob' });
      Util.download(blob, Util.baseName(state.primaryName) + '.docx');
      Util.toast('Saved as Word (.docx)', 'ok');
    } catch (e) { console.error(e); Util.toast('DOCX export failed', 'err'); } finally { Util.busy(false); }
  };

  /* ---------- DOCX with page images (exact look, not editable text) ---------- */
  SaveAs.docxImages = async function () {
    if (!window.JSZip) { Util.toast('Zip library not loaded (offline?)', 'err'); return; }
    Util.busy(true, 'Rendering pages into Word…');
    try {
      const bytes = await Export.buildPdf({});
      const pj = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const zip = new JSZip();
      const media = zip.folder('word').folder('media');
      let body = '', rels = '';
      for (let i = 1; i <= pj.numPages; i++) {
        const page = await pj.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        media.file('image' + i + '.png', c.toDataURL('image/png').split(',')[1], { base64: true });
        const wEMU = 5943600, hEMU = Math.round(wEMU * (vp.height / vp.width)), rid = 'rId' + i;
        rels += '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + i + '.png"/>';
        if (i > 1) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        body += '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + wEMU + '" cy="' + hEMU + '"/><wp:docPr id="' + i + '" name="Page' + i + '"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + i + '" name="Page' + i + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + wEMU + '" cy="' + hEMU + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
      }
      const ct2 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
      const doc2 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' + body + '<w:sectPr/></w:body></w:document>';
      zip.file('[Content_Types].xml', ct2);
      zip.folder('_rels').file('.rels', RELS);
      zip.folder('word').file('document.xml', doc2);
      zip.folder('word').folder('_rels').file('document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>');
      const blob = await zip.generateAsync({ type: 'blob' });
      Util.download(blob, Util.baseName(state.primaryName) + '-pages.docx');
      Util.toast('Saved Word with page images', 'ok');
    } catch (e) { console.error(e); Util.toast('DOCX (images) failed', 'err'); } finally { Util.busy(false); }
  };

  /* ---------- DOC (Word-openable HTML) ---------- */
  SaveAs.doc = async function () {
    Util.busy(true, 'Building Word document…');
    try {
      const pages = await gatherText();
      let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + escHtml(Util.baseName(state.primaryName)) + '</title></head><body>';
      pages.forEach((lines, pi) => {
        if (pi > 0) html += '<br clear=all style="page-break-before:always">';
        if (!lines.length) html += '<p>&nbsp;</p>';
        lines.forEach(l => html += '<p>' + (escHtml(l) || '&nbsp;') + '</p>');
      });
      html += '</body></html>';
      Util.download(new Blob(['﻿' + html], { type: 'application/msword' }), Util.baseName(state.primaryName) + '.doc');
      Util.toast('Saved as Word (.doc)', 'ok');
    } catch (e) { console.error(e); Util.toast('DOC export failed', 'err'); } finally { Util.busy(false); }
  };

  /* ---------- JSON project (self-contained, re-openable) ---------- */
  function u8ToB64(u8) { let s = ''; const ch = 0x8000; for (let i = 0; i < u8.length; i += ch) s += String.fromCharCode.apply(null, u8.subarray(i, i + ch)); return btoa(s); }
  function b64ToU8(b64) { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }

  SaveAs.json = async function () {
    Util.busy(true, 'Saving project…');
    try {
      const sources = {};
      for (const id in state.srcDocs) sources[id] = u8ToB64(state.srcDocs[id].bytes);
      const data = {
        app: 'TJAIPDFEditor', version: 1, primaryName: state.primaryName,
        pages: state.pages.map(p => ({ docId: p.docId, srcIndex: p.srcIndex, rotation: p.rotation, annotations: p.annotations })),
        sources
      };
      Util.download(new Blob([JSON.stringify(data)], { type: 'application/json' }), Util.baseName(state.primaryName) + '.json');
      Util.toast('Saved editable project (.json)', 'ok');
    } catch (e) { console.error(e); Util.toast('JSON export failed', 'err'); } finally { Util.busy(false); }
  };

  SaveAs.isProjectFile = (file) => /\.json$/i.test(file.name) || file.type === 'application/json';
  SaveAs.openProject = async function (file) {
    const data = JSON.parse(await file.text());
    if (data.app !== 'TJAIPDFEditor' && data.app !== 'MasterPDFEditor') throw new Error('Not a TJ AI PDF Editor project');
    state.srcDocs = {}; state.pages = [];
    for (const id in data.sources) {
      const bytes = b64ToU8(data.sources[id]);
      const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      let libDoc = null; try { libDoc = await PDFLib.PDFDocument.load(bytes.slice(0), { ignoreEncryption: true }); } catch (e) {}
      state.srcDocs[id] = { bytes, libDoc, pdfjsDoc, name: data.primaryName || 'document.pdf' };
    }
    state.pages = (data.pages || []).map(p => ({ id: state.uid('pg'), docId: p.docId, srcIndex: p.srcIndex, rotation: p.rotation || 0, annotations: p.annotations || [] }));
    state.primaryName = data.primaryName || 'document.pdf';
  };

  /* ---------- Save As dialog (rename + format + choose location) ---------- */
  const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx-img': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', txt: 'text/plain', json: 'application/json', png: 'image/png', jpg: 'image/jpeg' };
  const EXT = { pdf: 'pdf', docx: 'docx', 'docx-img': 'docx', doc: 'doc', txt: 'txt', json: 'json', png: 'png', jpg: 'jpg' };

  function currentPageId() {
    const vp = document.getElementById('pageviewport');
    const wraps = Array.from(document.querySelectorAll('.page-wrap'));
    if (!wraps.length) return state.pages[0] && state.pages[0].id;
    let target = wraps[0]; const mid = vp.scrollTop + vp.clientHeight / 2;
    wraps.forEach(w => { if (w.offsetTop <= mid) target = w; });
    return target.dataset.pageId;
  }

  // run a producer, capturing the bytes/blob it would have downloaded
  async function produce(format) {
    let cap = null; const orig = Util.download;
    Util.download = (data, name, mime) => { cap = { data, mime }; };
    try {
      if (format === 'pdf') { const b = await Export.buildPdf(state.aiMetadata ? { metadata: state.aiMetadata } : {}); cap = { data: b }; }
      else if (format === 'docx') await SaveAs.docx();
      else if (format === 'docx-img') await SaveAs.docxImages();
      else if (format === 'doc') await SaveAs.doc();
      else if (format === 'json') await SaveAs.json();
      else if (format === 'txt') await Export.extractText();
      else if (format === 'png' || format === 'jpg') { const url = await Export.pageAsImage(currentPageId(), format); cap = { data: new Uint8Array(await (await fetch(url)).arrayBuffer()) }; }
    } finally { Util.download = orig; }
    return cap;
  }

  async function writeOut(cap, filename, format) {
    const ext = EXT[format], mime = MIME[format];
    let name = filename || 'document'; if (!new RegExp('\\.' + ext + '$', 'i').test(name)) name += '.' + ext;
    const blob = cap.data instanceof Blob ? cap.data : new Blob([cap.data], { type: mime });
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: ext.toUpperCase() + ' file', accept: { [mime]: ['.' + ext] } }] });
        const w = await handle.createWritable(); await w.write(blob); await w.close();
        Util.toast('Saved ' + name, 'ok'); return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    Util.download(blob, name, mime); Util.toast('Downloaded ' + name, 'ok');
  }

  SaveAs.saveDialog = function () {
    if (!state.hasDoc()) { Util.toast('Open or create a document first', 'warn'); return; }
    const el = Util.el;
    const base = Util.baseName(state.primaryName) || 'document';
    const nameIn = el('input', { type: 'text', value: base, style: { width: '100%' } });
    const fmtSel = el('select', { style: { width: '100%' } }, [
      ['pdf', 'PDF (.pdf)'], ['docx', 'Word — editable text (.docx)'], ['docx-img', 'Word — page images (.docx)'], ['doc', 'Word 97–2003 (.doc)'], ['json', 'Editable project (.json)']
    ].map(([v, t]) => el('option', { value: v, text: t })));
    const body = el('div', {}, [
      el('div', { class: 'modal-head' }, [el('h3', { text: 'Save / Download' }), el('p', { text: 'Rename, pick a format, and choose where to save.' })]),
      el('div', { class: 'modal-body' }, [
        el('div', { class: 'field' }, [el('label', { text: 'File name' }), nameIn]),
        el('div', { class: 'field' }, [el('label', { text: 'Save as type' }), fmtSel]),
        el('div', { class: 'note', text: window.showSaveFilePicker ? 'You’ll be asked where to save (choose folder & name).' : 'Saves to your browser’s Downloads folder.' }),
      ])
    ]);
    const save = el('button', { class: 'btn primary', text: 'Save' });
    body.appendChild(el('div', { class: 'modal-foot' }, [el('button', { class: 'btn ghost', text: 'Cancel', onclick: () => m.close() }), save]));
    const m = Util.modal(body);
    save.onclick = async () => {
      const fmt = fmtSel.value, fname = nameIn.value.trim() || base;
      m.close(); Util.busy(true, 'Preparing ' + EXT[fmt].toUpperCase() + '…');
      try { const cap = await produce(fmt); if (cap) await writeOut(cap, fname, fmt); }
      catch (e) { console.error(e); Util.toast('Save failed: ' + (e.message || e), 'err', 4000); }
      finally { Util.busy(false); }
    };
    setTimeout(() => { nameIn.focus(); nameIn.select(); }, 50);
  };

  window.SaveAs = SaveAs;
})();
