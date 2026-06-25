/* chat.js — AI assistant chat drawer UI */
(function () {
  'use strict';
  const Chat = {};
  const el = Util.el, $ = Util.$;
  let drawer, msgs, input, sendBtn, built = false;

  Chat.init = function () {
    if (built) return; built = true;
    drawer = el('div', { class: 'ai-drawer', id: 'aiDrawer', hidden: true });
    drawer.appendChild(el('div', { class: 'ai-head' }, [
      el('div', { class: 'ai-title', html: '<span class="ai-spark">✦</span> AI Assistant' }),
      el('div', { class: 'ai-head-actions' }, [
        el('button', { class: 'btn ghost icon-only sm', title: 'New chat', html: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-3.3-6.5L14 8h6V2l-2.2 2.2A10 10 0 0 0 12 2z"/></svg>', onclick: () => { AI.reset(); msgs.innerHTML = ''; greet(); } }),
        el('button', { class: 'btn ghost icon-only sm', title: 'Settings', html: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4l-2.1 1.2.2 2.4-2.3.7-1.2 2.1L12 19l-2.6.1-1.2-2.1-2.3-.7.2-2.4L4 12l2.1-1.2-.2-2.4 2.3-.7L9.4 5 12 5l2.6-.1 1.2 2.1 2.3.7-.2 2.4z" opacity=".25"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>', onclick: openSettings }),
        el('button', { class: 'btn ghost icon-only sm', title: 'Close', html: '<svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>', onclick: () => Chat.toggle(false) }),
      ])
    ]));
    msgs = el('div', { class: 'ai-msgs', id: 'aiMsgs' });
    drawer.appendChild(msgs);
    input = el('textarea', { class: 'ai-text', id: 'aiInput', placeholder: 'Ask me to create or edit a PDF…', rows: 1 });
    sendBtn = el('button', { class: 'ai-send', title: 'Send', html: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg>' });
    const bar = el('div', { class: 'ai-input' }, [input, sendBtn]);
    drawer.appendChild(bar);
    document.body.appendChild(drawer);

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    input.addEventListener('input', autosize);

    const btn = $('#btnAI');
    if (btn) btn.addEventListener('click', () => Chat.toggle());
    greet();
  };

  Chat.toggle = function (force) {
    const open = force == null ? drawer.hidden : force;
    drawer.hidden = !open;
    $('#btnAI') && $('#btnAI').classList.toggle('active', open);
    if (open) setTimeout(() => input.focus(), 60);
  };

  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; }
  function scroll() { msgs.scrollTop = msgs.scrollHeight; }

  function greet() {
    addBot('Hi! I can **create, edit, design and organize PDFs** for you. Try:\n• "Create an A4 invoice for 3 items"\n• "Add a title \'Annual Report 2026\' centered at the top"\n• "Replace \'Draft\' with \'Final\' on page 1"\n• "Make a 3×4 table of sample data"', true);
    if (!AI.hasKey()) {
      const note = addBot('To start, pick a provider and paste a **free API key** in settings (the ⚙ gear) — **Groq** or **OpenRouter** are free and work in most regions. It stays on your device.', true);
      note.querySelector('.ai-bubble').appendChild(el('div', { class: 'ai-cta' }, [el('button', { class: 'btn primary sm', text: 'Open settings', onclick: openSettings })]));
    }
  }

  function addUser(text) {
    const m = el('div', { class: 'ai-msg user' }, [el('div', { class: 'ai-bubble', text })]);
    msgs.appendChild(m); scroll(); return m;
  }
  function addBot(text, md) {
    const bubble = el('div', { class: 'ai-bubble' });
    if (md) bubble.innerHTML = mdLite(text); else bubble.textContent = text;
    const m = el('div', { class: 'ai-msg bot' }, [el('div', { class: 'ai-avatar', text: '✦' }), el('div', { class: 'ai-body' }, [el('div', { class: 'ai-tools' }), bubble])]);
    msgs.appendChild(m); scroll(); return m;
  }
  function mdLite(s) {
    return Util.el('span', { html: (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>') }).innerHTML;
  }

  function toolLabel(name, args) {
    const a = args || {};
    const detail = a.page != null ? ' · p' + a.page : (a.page_size ? ' · ' + a.page_size : (a.find ? ' · "' + a.find + '"' : ''));
    return name.replace(/_/g, ' ') + detail;
  }

  async function send() {
    const text = input.value.trim(); if (!text) return;
    if (!AI.hasKey()) { addBot('Add your free Gemini API key in settings first — it stays on your device.', true); openSettings(); return; }
    input.value = ''; autosize();
    addUser(text);
    const bot = addBot('', false);
    const toolsEl = bot.querySelector('.ai-tools');
    const bubble = bot.querySelector('.ai-bubble');
    bubble.classList.add('typing'); bubble.textContent = '';
    sendBtn.disabled = true;
    try {
      const final = await AI.chat(text, {
        text: (t) => { bubble.classList.remove('typing'); bubble.innerHTML = mdLite(t); scroll(); },
        tool: (name, args, result) => {
          if (result === 'running') {
            const chip = el('div', { class: 'ai-tool running', text: '⚙ ' + toolLabel(name, args) });
            toolsEl.appendChild(chip);
          } else {
            const running = toolsEl.querySelectorAll('.ai-tool.running');
            const chip = running[running.length - 1];
            if (chip) {
              chip.classList.remove('running');
              const errd = result && result.error;
              chip.classList.add(errd ? 'err' : 'ok');
              chip.textContent = (errd ? '⚠ ' : '✓ ') + toolLabel(name, args);
              if (errd) chip.title = result.error;
            }
          }
          scroll();
        }
      });
      bubble.classList.remove('typing');
      if (!bubble.textContent.trim()) bubble.innerHTML = mdLite(final || 'Done.');
    } catch (e) {
      bubble.classList.remove('typing');
      const msg = String(e && e.message || e);
      if (msg === 'NO_KEY') { bubble.textContent = 'Please add your API key in settings.'; openSettings(); }
      else { bubble.classList.add('err'); bubble.textContent = 'Error: ' + msg + (/key|invalid|permission|denied|API_KEY|400|401|403/i.test(msg) ? '  (check your API key in settings)' : ''); }
    } finally { sendBtn.disabled = false; scroll(); }
  }

  /* ---------- settings ---------- */
  function openSettings() {
    const body = el('div');
    body.appendChild(el('div', { class: 'modal-head' }, [el('h3', { text: 'AI Assistant settings' }), el('p', { text: 'Choose a provider and paste a free API key. The key is stored only in this browser.' })]));
    const provSel = el('select', {}, Object.keys(AI.providers).map(id => el('option', { value: id, text: AI.providers[id].label + ((id === 'groq' || id === 'openrouter') ? ' — free' : ''), selected: AI.cfg.provider === id })));
    const keyIn = el('input', { type: 'password', placeholder: 'Paste your API key', style: { width: '100%' } });
    const modelSel = el('select', {});
    const help = el('div', { class: 'note' });
    function refresh() {
      const id = provSel.value, p = AI.providers[id];
      keyIn.value = AI.cfg.keys[id] || '';
      modelSel.innerHTML = '';
      p.models.forEach(([v, t]) => modelSel.appendChild(el('option', { value: v, text: t, selected: (AI.cfg.models[id] || p.defaultModel) === v })));
      help.innerHTML = 'Get a free key at <b>' + p.keyHelp + '</b> &nbsp;<a href="' + p.keyUrl + '" target="_blank" rel="noopener" style="color:var(--brand)">Open ↗</a>';
    }
    provSel.addEventListener('change', refresh); refresh();
    body.appendChild(el('div', { class: 'modal-body' }, [
      el('div', { class: 'field' }, [el('label', { text: 'AI provider' }), provSel]),
      el('div', { class: 'field' }, [el('label', { text: 'API key' }), keyIn]),
      help,
      el('div', { class: 'field', style: { marginTop: '12px' } }, [el('label', { text: 'Model' }), modelSel]),
      el('div', { class: 'note warn', style: { marginTop: '10px' }, text: 'Your key stays only in this browser (localStorage) — fine for personal use. For a public site, route requests through a small backend proxy instead.' }),
    ]));
    const save = el('button', { class: 'btn primary', text: 'Save' });
    body.appendChild(el('div', { class: 'modal-foot' }, [el('button', { class: 'btn ghost', text: 'Cancel', onclick: () => m.close() }), save]));
    const m = Util.modal(body);
    save.onclick = () => { AI.saveProviderConfig(provSel.value, keyIn.value.trim(), modelSel.value); m.close(); Util.toast('Saved — using ' + AI.providers[provSel.value].label, 'ok'); };
    setTimeout(() => keyIn.focus(), 50);
  }

  window.Chat = Chat;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Chat.init());
  else Chat.init();
})();
