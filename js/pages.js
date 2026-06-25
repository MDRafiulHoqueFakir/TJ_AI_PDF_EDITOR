/* pages.js — structural page operations */
(function () {
  'use strict';

  const Pages = {};

  function after() {
    Viewer.renderAll();
    UI.refreshThumbs();
    UI.updateStatus();
  }

  Pages.rotate = function (pageId, deltaDeg) {
    const p = state.getPage(pageId); if (!p) return;
    state.pushHistory();
    p.rotation = ((p.rotation + deltaDeg) % 360 + 360) % 360;
    after();
  };
  Pages.rotateSelectedOrAll = function (delta) {
    state.pushHistory();
    const ids = state.selectedPageIds.size ? [...state.selectedPageIds] : state.pages.map(p => p.id);
    ids.forEach(id => { const p = state.getPage(id); if (p) p.rotation = ((p.rotation + delta) % 360 + 360) % 360; });
    after();
  };

  Pages.delete = async function (pageId) {
    if (state.pages.length <= 1) { Util.toast('A document needs at least one page', 'warn'); return; }
    const i = state.pageIndex(pageId); if (i < 0) return;
    state.pushHistory();
    state.pages.splice(i, 1);
    state.selectedPageIds.delete(pageId);
    after();
  };

  Pages.deleteSelected = async function () {
    if (!state.selectedPageIds.size) return;
    if (state.selectedPageIds.size >= state.pages.length) { Util.toast('Cannot delete every page', 'warn'); return; }
    const ok = await Util.confirm({ title: 'Delete ' + state.selectedPageIds.size + ' page(s)?', danger: true, ok: 'Delete' });
    if (!ok) return;
    state.pushHistory();
    state.pages = state.pages.filter(p => !state.selectedPageIds.has(p.id));
    state.selectedPageIds.clear();
    after();
  };

  Pages.duplicate = function (pageId) {
    const i = state.pageIndex(pageId); if (i < 0) return;
    const p = state.pages[i];
    state.pushHistory();
    state.pages.splice(i + 1, 0, {
      id: state.uid('pg'), docId: p.docId, srcIndex: p.srcIndex, rotation: p.rotation,
      annotations: JSON.parse(JSON.stringify(p.annotations)).map(a => (a.id = state.uid('a'), a))
    });
    after();
  };

  Pages.move = function (fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    state.pushHistory();
    const [p] = state.pages.splice(fromIndex, 1);
    state.pages.splice(toIndex, 0, p);
    after();
  };

  Pages.insertBlankAfter = async function (pageId) {
    // match size of reference page
    const ref = state.getPage(pageId) || state.pages[state.pages.length - 1];
    let w = 595.28, h = 841.89;
    if (ref) {
      const src = state.srcDocs[ref.docId];
      const pg = await src.pdfjsDoc.getPage(ref.srcIndex + 1);
      const vp = pg.getViewport({ scale: 1 });
      w = vp.width; h = vp.height;
    }
    const libDoc = await PDFLib.PDFDocument.create();
    libDoc.addPage([w, h]);
    const bytes = await libDoc.save();
    const docId = state.uid('doc');
    const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    state.srcDocs[docId] = { bytes, libDoc: await PDFLib.PDFDocument.load(bytes), pdfjsDoc, name: 'blank.pdf' };
    state.pushHistory();
    const at = ref ? state.pageIndex(ref.id) + 1 : state.pages.length;
    state.pages.splice(at, 0, { id: state.uid('pg'), docId, srcIndex: 0, rotation: 0, annotations: [] });
    after();
  };

  Pages.toggleSelect = function (pageId, additive) {
    if (!additive) {
      const only = state.selectedPageIds.size === 1 && state.selectedPageIds.has(pageId);
      state.selectedPageIds.clear();
      if (!only) state.selectedPageIds.add(pageId);
    } else {
      if (state.selectedPageIds.has(pageId)) state.selectedPageIds.delete(pageId);
      else state.selectedPageIds.add(pageId);
    }
    UI.refreshThumbs();
    Util.$$('.page-wrap').forEach(w => w.classList.toggle('selected', state.selectedPageIds.has(w.dataset.pageId)));
    UI.updateStatus();
  };

  Pages.selectAll = function () {
    state.pages.forEach(p => state.selectedPageIds.add(p.id));
    UI.refreshThumbs();
    Util.$$('.page-wrap').forEach(w => w.classList.add('selected'));
    UI.updateStatus();
  };
  Pages.clearSelection = function () {
    state.selectedPageIds.clear();
    UI.refreshThumbs();
    Util.$$('.page-wrap').forEach(w => w.classList.remove('selected'));
    UI.updateStatus();
  };

  window.Pages = Pages;
})();
