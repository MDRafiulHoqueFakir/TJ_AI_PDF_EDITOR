/* util.js — small shared helpers */
(function () {
  'use strict';

  const Util = {};

  Util.$ = (sel, root) => (root || document).querySelector(sel);
  Util.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  Util.el = function (tag, props, children) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'class') e.className = props[k];
      else if (k === 'html') e.innerHTML = props[k];
      else if (k === 'text') e.textContent = props[k];
      else if (k === 'style' && typeof props[k] === 'object') Object.assign(e.style, props[k]);
      else if (k.startsWith('on') && typeof props[k] === 'function') e.addEventListener(k.slice(2), props[k]);
      else if (k === 'dataset') Object.assign(e.dataset, props[k]);
      else if (props[k] === true) e.setAttribute(k, '');
      else if (props[k] !== false && props[k] != null) e.setAttribute(k, props[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };

  let toastTimer;
  Util.toast = function (msg, kind, ms) {
    const host = document.getElementById('toasts');
    const t = Util.el('div', { class: 'toast ' + (kind || ''), text: msg });
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; }, (ms || 2600) - 250);
    setTimeout(() => t.remove(), ms || 2600);
  };

  Util.busy = function (on, msg) {
    const b = document.getElementById('busy');
    document.getElementById('busyMsg').textContent = msg || 'Working…';
    b.hidden = !on;
  };

  Util.hex2rgb = function (hex) {
    hex = (hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  };

  Util.download = function (bytes, filename, mime) {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = Util.el('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  Util.readFile = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });

  Util.readDataUrl = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  Util.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  Util.baseName = function (name) {
    return (name || 'document').replace(/\.[^.]+$/, '');
  };

  // simple confirm modal -> Promise<boolean>
  Util.confirm = function (opts) {
    return new Promise(resolve => {
      const host = document.getElementById('modalHost');
      host.hidden = false;
      host.innerHTML = '';
      const modal = Util.el('div', { class: 'modal' }, [
        Util.el('div', { class: 'modal-head' }, [
          Util.el('h3', { text: opts.title || 'Are you sure?' }),
          opts.message ? Util.el('p', { text: opts.message }) : null
        ]),
        Util.el('div', { class: 'modal-foot' }, [
          Util.el('button', { class: 'btn ghost', text: opts.cancel || 'Cancel', onclick: () => done(false) }),
          Util.el('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), text: opts.ok || 'Confirm', onclick: () => done(true) })
        ])
      ]);
      host.appendChild(modal);
      function done(v) { host.hidden = true; host.innerHTML = ''; resolve(v); }
    });
  };

  // generic modal host helper -> returns {host, close}
  Util.modal = function (node, wide) {
    const host = document.getElementById('modalHost');
    host.hidden = false; host.innerHTML = '';
    const modal = Util.el('div', { class: 'modal' + (wide ? ' wide' : '') });
    modal.appendChild(node);
    host.appendChild(modal);
    const close = () => { host.hidden = true; host.innerHTML = ''; };
    host.onclick = (e) => { if (e.target === host) close(); };
    return { host, modal, close };
  };

  window.Util = Util;
})();
