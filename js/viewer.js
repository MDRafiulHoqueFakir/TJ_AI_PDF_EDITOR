/* viewer.js — render pages to canvas + host annotation overlays */
(function () {
  'use strict';

  const Viewer = {};
  const viewport = () => document.getElementById('pageviewport');
  const renderTokens = {}; // pageId -> token to cancel stale renders

  // Compute fit-to-width base scale from the first page.
  async function computeBaseScale() {
    if (!state.pages.length) return 1;
    const p = state.pages[0];
    const src = state.srcDocs[p.docId];
    const page = await src.pdfjsDoc.getPage(p.srcIndex + 1);
    const vp = page.getViewport({ scale: 1, rotation: p.rotation });
    const avail = (viewport().clientWidth || window.innerWidth - 400) - 60;
    return Util.clamp(avail / vp.width, 0.2, 3);
  }

  Viewer.renderAll = async function () {
    const vp = viewport();
    if (!state.pages.length) { vp.hidden = true; vp.innerHTML = ''; return; }
    vp.hidden = false;

    if (state.fitWidth) state.baseScale = await computeBaseScale();

    // Build skeleton first (keeps order stable), then render canvases.
    vp.innerHTML = '';
    for (const page of state.pages) {
      const wrap = Util.el('div', { class: 'page-wrap', dataset: { pageId: page.id } });
      if (state.selectedPageIds.has(page.id)) wrap.classList.add('selected');
      const canvas = Util.el('canvas', { class: 'page-canvas' });
      const overlay = Util.el('div', { class: 'page-overlay tool-' + state.activeTool });
      const badge = Util.el('div', { class: 'page-badge', text: 'Page ' + (state.pageIndex(page.id) + 1) });
      wrap.appendChild(canvas);
      wrap.appendChild(overlay);
      wrap.appendChild(badge);
      vp.appendChild(wrap);
      renderPageCanvas(page, canvas, overlay);
    }
  };

  async function renderPageCanvas(page, canvas, overlay) {
    const token = state.uid('rt');
    renderTokens[page.id] = token;
    const src = state.srcDocs[page.docId];
    const pdfPage = await src.pdfjsDoc.getPage(page.srcIndex + 1);
    const scale = state.baseScale * state.zoom;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewportPdf = pdfPage.getViewport({ scale: scale * dpr, rotation: page.rotation });
    const cssVp = pdfPage.getViewport({ scale, rotation: page.rotation });

    canvas.width = viewportPdf.width;
    canvas.height = viewportPdf.height;
    canvas.style.width = cssVp.width + 'px';
    canvas.style.height = cssVp.height + 'px';

    const wrap = canvas.parentElement;
    wrap.style.width = cssVp.width + 'px';
    wrap.style.height = cssVp.height + 'px';
    overlay.style.width = cssVp.width + 'px';
    overlay.style.height = cssVp.height + 'px';

    const ctx = canvas.getContext('2d');
    try {
      await pdfPage.render({ canvasContext: ctx, viewport: viewportPdf }).promise;
    } catch (e) { /* render cancelled */ return; }
    if (renderTokens[page.id] !== token) return; // stale

    // Cache displayed (CSS) page size for annotation math
    page._dispW = cssVp.width;
    page._dispH = cssVp.height;
    Annotate.renderAnnotations(overlay, page);
    Annotate.attachOverlay(overlay, page);
  }

  // Re-render just the overlays (e.g. after annotation change) without re-rasterizing.
  Viewer.refreshOverlay = function (pageId) {
    const wrap = viewport().querySelector('.page-wrap[data-page-id="' + pageId + '"]');
    if (!wrap) return;
    const overlay = wrap.querySelector('.page-overlay');
    const page = state.getPage(pageId);
    Annotate.renderAnnotations(overlay, page);
  };

  Viewer.getPageCanvas = function (pageId) {
    const wrap = viewport().querySelector('.page-wrap[data-page-id="' + pageId + '"]');
    return wrap ? wrap.querySelector('.page-canvas') : null;
  };

  Viewer.refreshAllOverlays = function () {
    state.pages.forEach(p => Viewer.refreshOverlay(p.id));
  };

  Viewer.updateToolCursor = function () {
    Util.$$('.page-overlay').forEach(o => {
      o.className = 'page-overlay tool-' + state.activeTool;
    });
  };

  Viewer.setZoom = function (z) {
    state.fitWidth = false;
    state.zoom = Util.clamp(z, 0.2, 5);
    Viewer.renderAll();
    UI.updateZoomLabel();
  };
  Viewer.zoomBy = function (d) { Viewer.setZoom((state.fitWidth ? 1 : state.zoom) + d); };
  Viewer.fit = function () { state.fitWidth = true; state.zoom = 1; Viewer.renderAll(); UI.updateZoomLabel(); };

  Viewer.scrollToPage = function (pageId) {
    const wrap = viewport().querySelector('.page-wrap[data-page-id="' + pageId + '"]');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.Viewer = Viewer;
})();
