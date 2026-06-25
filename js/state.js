/* state.js — central application state */
(function () {
  'use strict';

  /*
    Document model
    --------------
    state.srcDocs : { [docId]: { bytes:Uint8Array, libDoc:PDFLibDocument|null, pdfjsDoc, name } }
    state.pages   : ordered array of page descriptors:
        { id, docId, srcIndex, rotation(0/90/180/270), annotations:[...] }
    Annotation (normalized to the DISPLAYED, i.e. rotation-applied, page, origin = top-left):
        common: { id, type, color, opacity }
        text      : { type:'text', x,y, w, text, size, color, font, bold, italic, align }
        draw      : { type:'draw', points:[[x,y]...], color, size, opacity }      // freehand, normalized
        highlight : { type:'highlight', x,y,w,h, color, opacity }
        rect      : { type:'rect', x,y,w,h, color, fill, stroke }
        ellipse   : { type:'ellipse', x,y,w,h, color, fill, stroke }
        line      : { type:'line', x1,y1,x2,y2, color, size, arrow }
        image     : { type:'image', x,y,w,h, dataUrl, fmt }
        whiteout  : { type:'whiteout', x,y,w,h, color }
    All x,y,w,h, points are FRACTIONS (0..1) of the displayed page box.
  */

  const state = {
    srcDocs: {},
    pages: [],
    activeTool: 'select',
    selectedPageIds: new Set(),
    selectedAnno: null,         // { pageId, annoId }
    zoom: 1,                    // render scale multiplier
    baseScale: 1,               // fit-to-width scale
    fitWidth: true,
    history: [],
    future: [],
    seq: 0,
    primaryName: 'document.pdf',
    // current tool options
    opt: {
      color: '#2f6df6',
      highlightColor: '#ffeb3b',
      strokeWidth: 3,
      opacity: 1,
      fill: false,
      arrow: false,
      // live text-formatting defaults (anno-compatible keys)
      text: {
        size: 16, color: '#1c2230', font: 'Helvetica', banglaFont: 'SolaimanLipi',
        bold: false, italic: false, underline: false, strike: false,
        align: 'left', bg: null, lineSpacing: 1.25,
      },
      // table defaults
      table: { rows: 3, cols: 3, borderColor: '#333333', borderWidth: 1, color: '#1c2230', fontSize: 12, font: 'Helvetica' },
    },
    signatureDataUrl: null,
    avroOn: false,        // Bengali phonetic typing
    autoBg: false,        // off by default: new text boxes are transparent (use the PDF background)
  };

  state.uid = function (p) { return (p || 'id') + '_' + (++state.seq) + '_' + Math.floor(performance.now()); };

  state.getPage = function (id) { return state.pages.find(p => p.id === id); };
  state.pageIndex = function (id) { return state.pages.findIndex(p => p.id === id); };
  state.hasDoc = function () { return state.pages.length > 0; };

  // ---- History (undo/redo) : snapshot of page structure + annotations ----
  function snapshot() {
    return JSON.stringify(state.pages.map(p => ({
      id: p.id, docId: p.docId, srcIndex: p.srcIndex, rotation: p.rotation,
      annotations: p.annotations
    })));
  }
  state.pushHistory = function () {
    state.history.push(snapshot());
    if (state.history.length > 60) state.history.shift();
    state.future.length = 0;
    if (window.UI) UI.refreshHistoryButtons();
  };
  function restore(snap) {
    const arr = JSON.parse(snap);
    state.pages = arr.map(p => ({
      id: p.id, docId: p.docId, srcIndex: p.srcIndex, rotation: p.rotation,
      annotations: p.annotations || []
    }));
  }
  state.undo = function () {
    if (!state.history.length) return;
    state.future.push(snapshot());
    restore(state.history.pop());
    state.selectedAnno = null;
    Viewer.renderAll();
    if (window.UI) { UI.refreshThumbs(); UI.refreshHistoryButtons(); UI.updateStatus(); }
  };
  state.redo = function () {
    if (!state.future.length) return;
    state.history.push(snapshot());
    restore(state.future.pop());
    state.selectedAnno = null;
    Viewer.renderAll();
    if (window.UI) { UI.refreshThumbs(); UI.refreshHistoryButtons(); UI.updateStatus(); }
  };

  window.state = state;
})();
