/* libs.js — third-party library setup & capability detection */
(function () {
  'use strict';

  // pdf.js worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // Expose handy references
  window.PDFLib = window.PDFLib || null;          // pdf-lib UMD global
  window.fontkit = window.fontkit || null;        // @pdf-lib/fontkit UMD global

  window.LIBS = {
    ready() { return !!(window.pdfjsLib && window.PDFLib); },
    missing() {
      const m = [];
      if (!window.pdfjsLib) m.push('pdf.js');
      if (!window.PDFLib) m.push('pdf-lib');
      return m;
    }
  };
})();
