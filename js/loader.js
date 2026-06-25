/* loader.js — open PDFs / images, build the page model */
(function () {
  'use strict';

  const Loader = {};

  // Register a source PDF (bytes) -> docId, loading both pdf.js + pdf-lib views.
  async function addSourcePdf(bytes, name, password) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const docId = state.uid('doc');

    // pdf.js doc (needs its own copy; pdf.js may detach the buffer)
    const pdfjsDoc = await pdfjsLib.getDocument({
      data: u8.slice(0), password: password || undefined
    }).promise;

    // pdf-lib doc for editing/copying
    let libDoc = null;
    try {
      libDoc = await PDFLib.PDFDocument.load(u8.slice(0), { ignoreEncryption: true });
    } catch (e) {
      libDoc = null; // some encrypted docs can't be edited by pdf-lib; rendering still works
    }

    state.srcDocs[docId] = { bytes: u8, libDoc, pdfjsDoc, name: name || 'document.pdf' };
    return { docId, pageCount: pdfjsDoc.numPages };
  }

  // Open one PDF file (handles password prompt).
  Loader.openPdfFile = async function (file, append) {
    const buf = await Util.readFile(file);
    let res, password;
    while (true) {
      try {
        res = await addSourcePdf(buf, file.name, password);
        break;
      } catch (e) {
        if (e && e.name === 'PasswordException') {
          password = await promptPassword(file.name);
          if (password == null) return null; // cancelled
          continue;
        }
        throw e;
      }
    }
    await appendPages(res.docId, res.pageCount, append);
    if (!append) state.primaryName = file.name;
    return res;
  };

  // Open an image file as a new PDF page (sized to the image).
  Loader.openImageFile = async function (file, append) {
    const dataUrl = await Util.readDataUrl(file);
    const img = await loadImage(dataUrl);
    const libDoc = await PDFLib.PDFDocument.create();
    const isPng = /png/i.test(file.type) || /\.png$/i.test(file.name);
    const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    const embed = isPng ? await libDoc.embedPng(bytes) : await libDoc.embedJpg(bytes).catch(async () => {
      // convert unsupported (webp/gif) to png via canvas
      const png = await toPngBytes(img);
      return libDoc.embedPng(png);
    });
    const page = libDoc.addPage([img.naturalWidth, img.naturalHeight]);
    page.drawImage(embed, { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight });
    const pdfBytes = await libDoc.save();
    const res = await addSourcePdf(pdfBytes, Util.baseName(file.name) + '.pdf', null);
    state.srcDocs[res.docId].imageDataUrl = dataUrl; state.srcDocs[res.docId].isImage = true;
    await appendPages(res.docId, res.pageCount, append);
    if (!append && state.pages.length === res.pageCount) state.primaryName = Util.baseName(file.name) + '.pdf';
    return res;
  };

  Loader.openImageDataUrl = async function (dataUrl, append) {
    const img = await loadImage(dataUrl);
    const libDoc = await PDFLib.PDFDocument.create();
    const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    let embed;
    try { embed = dataUrl.startsWith('data:image/png') ? await libDoc.embedPng(bytes) : await libDoc.embedJpg(bytes); }
    catch { embed = await libDoc.embedPng(await toPngBytes(img)); }
    const page = libDoc.addPage([img.naturalWidth, img.naturalHeight]);
    page.drawImage(embed, { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight });
    const res = await addSourcePdf(await libDoc.save(), 'pasted-image.pdf', null);
    state.srcDocs[res.docId].imageDataUrl = dataUrl; state.srcDocs[res.docId].isImage = true;
    await appendPages(res.docId, res.pageCount, append);
    return res;
  };

  // Blank PDF
  Loader.createBlank = async function (w, h) {
    const libDoc = await PDFLib.PDFDocument.create();
    libDoc.addPage([w || 595.28, h || 841.89]); // A4 portrait points
    const res = await addSourcePdf(await libDoc.save(), 'blank.pdf', null);
    await appendPages(res.docId, res.pageCount, false);
    state.primaryName = 'document.pdf';
    return res;
  };

  // Handle a mixed FileList
  Loader.handleFiles = async function (fileList, append) {
    const files = Array.from(fileList);
    if (!files.length) return;
    Util.busy(true, append ? 'Adding files…' : 'Opening…');
    try {
      let opened = 0;
      for (const f of files) {
        const isJson = window.SaveAs && SaveAs.isProjectFile(f);
        const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        const isImg = f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
        const doAppend = append || opened > 0;
        if (isJson) { await SaveAs.openProject(f); opened++; }
        else if (isPdf) { const r = await Loader.openPdfFile(f, doAppend); if (r) opened++; }
        else if (isImg) { await Loader.openImageFile(f, doAppend); opened++; }
        else Util.toast('Skipped unsupported file: ' + f.name, 'warn');
      }
      if (opened) {
        UI.enterEditor();
        Viewer.renderAll();
        UI.refreshThumbs();
        UI.updateStatus();
        state.pushHistory();
        Util.toast(append ? 'Added ' + opened + ' file(s)' : 'Document ready', 'ok');
      }
    } catch (e) {
      console.error(e);
      Util.toast('Could not open file: ' + (e.message || e), 'err', 4200);
    } finally {
      Util.busy(false);
    }
  };

  async function appendPages(docId, count, append) {
    if (!append) { state.pages = []; }
    const src = state.srcDocs[docId];
    for (let i = 0; i < count; i++) {
      let rot = 0;
      try { const pg = await src.pdfjsDoc.getPage(i + 1); rot = ((pg.rotate % 360) + 360) % 360; } catch (e) {}
      state.pages.push({
        id: state.uid('pg'), docId, srcIndex: i, rotation: rot, annotations: []
      });
    }
  }

  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  async function toPngBytes(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }

  function promptPassword(name) {
    return new Promise(resolve => {
      const body = Util.el('div', {}, [
        Util.el('div', { class: 'modal-head' }, [
          Util.el('h3', { text: 'Password required' }),
          Util.el('p', { text: '"' + name + '" is encrypted. Enter its password to open.' })
        ]),
        Util.el('div', { class: 'modal-body' }, [
          Util.el('input', { type: 'password', id: 'pwIn', class: '', style: { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: '7px', background: 'var(--bg)', color: 'var(--ink)' }, placeholder: 'Password' })
        ]),
        Util.el('div', { class: 'modal-foot' }, [
          Util.el('button', { class: 'btn ghost', text: 'Cancel', onclick: () => { m.close(); resolve(null); } }),
          Util.el('button', { class: 'btn primary', text: 'Open', onclick: ok })
        ])
      ]);
      const m = Util.modal(body);
      const input = body.querySelector('#pwIn');
      input.focus();
      input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      function ok() { const v = input.value; m.close(); resolve(v); }
    });
  }

  window.Loader = Loader;
})();
