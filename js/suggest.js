/* suggest.js — predictive word suggestions for English + Bangla:
   frequency-ranked prefix completion + next-word prediction (learned bigrams). */
(function () {
  'use strict';
  const Suggest = {};

  const EN = ('the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us document please thank hello name address email phone date signature project report invoice total amount price quantity description page section chapter summary introduction conclusion details information contact company customer client product service order payment delivery account number reference title author subject create edit delete download upload export import save open close print share send receive message note comment review approve confirm cancel submit continue previous next finish start begin complete update change modify remove insert table image picture file folder text font color size bold italic underline align left right center paragraph heading list bullet margin border background header footer column row cell merge split rotate regards sincerely dear sir madam best kind').split(/\s+/);

  const BN = ('আমি আমার আমরা আমাদের আমাকে তুমি তোমার তোমরা তোমাকে আপনি আপনার আপনারা সে তাকে তার তারা তাদের এই ওই সেই এটা ওটা সেটা এটি ইহা এবং কিন্তু অথবা তাই যেহেতু সেহেতু যে যা যিনি যারা যখন তখন যদি তবে তাহলে কারণ জন্য দিয়ে থেকে পর্যন্ত মধ্যে ভিতরে বাইরে উপরে নিচে পাশে সাথে ছাড়া কি কী কেন কখন কোথায় কীভাবে কেমন কে কাকে কোন কত কতটা হ্যাঁ না জি নাই হয় নয় হলো হবে হয়েছে হচ্ছে ছিল থাকা থাকে আছে নেই ভালো খারাপ ভালোই মন্দ বড় ছোট মাঝারি লম্বা খাটো নতুন পুরাতন পুরনো বেশি কম অল্প বেশ অনেক কিছু কয়েক সব সবাই সকল প্রতিটি প্রত্যেক বাংলা বাংলাদেশ বাঙালি ঢাকা চট্টগ্রাম খুলনা রাজশাহী সিলেট বরিশাল রংপুর ময়মনসিংহ মানুষ লোক জনগণ দেশ জাতি ভাষা সংস্কৃতি ইতিহাস স্বাধীনতা মুক্তিযুদ্ধ পতাকা দিবস মা বাবা ভাই বোন ছেলে মেয়ে স্বামী স্ত্রী সন্তান দাদা দাদি নানা নানি বন্ধু বান্ধবী পরিবার আত্মীয় প্রতিবেশী স্কুল কলেজ মাদ্রাসা বিশ্ববিদ্যালয় ক্লাস ছাত্র ছাত্রী শিক্ষক শিক্ষিকা পরীক্ষা ফলাফল বই কলম খাতা পেন্সিল ব্যাগ চেয়ার টেবিল দরজা জানালা ঘর বাড়ি রাস্তা গাড়ি পানি খাবার ভাত মাছ মাংস ডাল সবজি ফল আম কাঁঠাল কলা চা দুধ ডিম রুটি সকাল দুপুর বিকাল সন্ধ্যা রাত আজ আগামীকাল গতকাল পরশু সময় বছর মাস সপ্তাহ দিন ঘণ্টা মিনিট সেকেন্ড তারিখ ধন্যবাদ স্বাগতম দুঃখিত ক্ষমা অভিনন্দন শুভেচ্ছা সালাম নমস্কার নাম ঠিকানা ফোন ইমেইল কাজ চাকরি ব্যবসা অফিস টাকা মূল্য দাম হিসাব সংখ্যা মোট যোগ বিয়োগ করা যাওয়া আসা খাওয়া দেখা শোনা বলা পড়া লেখা চাওয়া দেওয়া নেওয়া পাওয়া রাখা ধরা ছাড়া চলা ওঠা বসা ঘুমানো জাগা হাঁটা দৌড়ানো ভালোবাসা ভালোবাসি পছন্দ ঘৃণা আনন্দ দুঃখ কষ্ট সুখ শান্তি রাগ ভয় আশা স্বপ্ন সুন্দর সুন্দরী জীবন মৃত্যু সরকার রাজনীতি অর্থনীতি সমাজ পরিবেশ প্রকৃতি আকাশ নদী সাগর পাহাড় গাছ ফুল পাখি প্রথম দ্বিতীয় তৃতীয় শেষ শুরু আবার সবসময় কখনো প্রায় হঠাৎ ধীরে তাড়াতাড়ি একসাথে আলাদা এখন তখন এখানে সেখানে কোনো প্রতি খুব ভীষণ একটু একদম মোটেও নিশ্চয়ই অবশ্যই হয়তো সম্ভবত').split(/\s+/);

  // dict: Map(word -> rank). lower rank = more common.
  const dict = { en: new Map(), bn: new Map() };
  EN.forEach((w, i) => dict.en.set(w.toLowerCase(), i));
  BN.forEach((w, i) => dict.bn.set(w, i));
  const used = new Map();              // word -> usage count (boosts ranking)
  const bigram = new Map();            // prevWord -> Map(nextWord -> count)

  const isBn = w => /[ঀ-৿]/.test(w);
  const norm = w => (isBn(w) ? w : w.toLowerCase());

  function addWord(w, rank) {
    if (!w || w.length < 2) return;
    const d = isBn(w) ? dict.bn : dict.en; const k = norm(w);
    if (!d.has(k) || rank < d.get(k)) d.set(k, rank);
  }
  function learnPair(prev, next) {
    if (!prev || !next) return;
    let m = bigram.get(prev); if (!m) { m = new Map(); bigram.set(prev, m); }
    m.set(next, (m.get(next) || 0) + 1);
  }
  Suggest.learn = function (text) {
    const toks = (text || '').match(/[A-Za-z]+|[ঀ-৿]+/g) || [];
    let prev = null;
    toks.forEach(t => { const k = norm(t); if (k.length >= 2) { addWord(t, 5000); if (prev) learnPair(prev, k); } prev = k; });
  };

  // seed a few common next-word pairs so prediction is useful immediately
  [['thank', 'you'], ['best', 'regards'], ['kind', 'regards'], ['dear', 'sir'], ['please', 'find'], ['looking', 'forward'],
   ['yours', 'sincerely'], ['to', 'the'], ['of', 'the'], ['in', 'the'], ['for', 'the'], ['on', 'the'],
   ['আমার', 'নাম'], ['শুভ', 'সকাল'], ['ধন্যবাদ', 'আপনাকে'], ['বাংলাদেশ', 'একটি'], ['আমি', 'একজন'], ['আপনার', 'নাম']]
    .forEach(([a, b]) => { learnPair(norm(a), norm(b)); addWord(b, 4000); });

  function score(word, rank, prev) {
    let s = rank - (used.get(word) || 0) * 6000;
    if (prev) { const m = bigram.get(prev); if (m && m.get(word)) s -= 200000 + m.get(word) * 1000; }
    return s;
  }
  function complete(prefix, prev) {
    const bn = isBn(prefix), d = bn ? dict.bn : dict.en, w = norm(prefix);
    const res = [];
    d.forEach((rank, cand) => { if (cand !== w && cand.startsWith(w)) res.push(cand); });
    res.sort((a, b) => (score(a, d.get(a), prev) - score(b, d.get(b), prev)) || (a.length - b.length));
    return res.slice(0, 6);
  }
  function nextWords(prev) {
    const m = bigram.get(prev); if (!m) return [];
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 6);
  }

  let pop = null, items = [], active = 0, target = null, curWord = '', curPrev = null, mode = 'complete';
  function close() { if (pop) { pop.remove(); pop = null; items = []; } }
  Suggest.close = close;

  function textBeforeCaret(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer)) return null;
    const pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString();
  }

  Suggest.update = function (el) {
    if (!el) return;
    const before = textBeforeCaret(el);
    if (before == null) { close(); return; }
    const toks = before.match(/[A-Za-z]+|[ঀ-৿]+/g) || [];
    const endsSpace = before === '' || /[\s‌‍]$/.test(before) || /[।,.!?;:]$/.test(before);
    if (endsSpace) {
      curWord = ''; curPrev = toks.length ? norm(toks[toks.length - 1]) : null;
      if (!curPrev) { close(); return; }
      mode = 'next'; items = nextWords(curPrev);
    } else {
      const m = before.match(/([A-Za-z]+|[ঀ-৿]+)$/);
      if (!m) { close(); return; }
      curWord = m[1]; curPrev = toks.length >= 2 ? norm(toks[toks.length - 2]) : null;
      mode = 'complete'; items = complete(curWord, curPrev);
    }
    if (!items.length) { close(); return; }
    target = el; active = 0; render(el);
  };

  function render(el) {
    if (!pop) { pop = Util.el('div', { class: 'suggest-pop' }); document.body.appendChild(pop); }
    pop.innerHTML = '';
    if (mode === 'next') pop.appendChild(Util.el('div', { class: 'suggest-head', text: 'next word' }));
    items.forEach((w, i) => {
      const b = Util.el('div', { class: 'suggest-item' + (i === active ? ' active' : ''), text: w });
      b.addEventListener('pointerdown', e => { e.preventDefault(); accept(i); });
      pop.appendChild(b);
    });
    const sel = window.getSelection(); let rect = null;
    try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch (e) {}
    if (!rect || (!rect.width && !rect.height && !rect.left)) rect = el.getBoundingClientRect();
    pop.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
  }

  function accept(i) {
    if (!target || !items[i]) return;
    const word = items[i];
    const sel = window.getSelection();
    if (!sel.rangeCount) { close(); return; }
    const r = sel.getRangeAt(0);
    try {
      const ins = r.cloneRange();
      if (curWord) ins.setStart(r.startContainer, Math.max(0, r.startOffset - curWord.length));
      else ins.setStart(r.startContainer, r.startOffset);
      ins.setEnd(r.startContainer, r.startOffset);
      ins.deleteContents();
      const tn = document.createTextNode(word + ' ');
      ins.insertNode(tn);
      const nr = document.createRange(); nr.setStartAfter(tn); nr.collapse(true);
      sel.removeAllRanges(); sel.addRange(nr);
    } catch (e) { close(); return; }
    if (target._avCommit !== undefined) { target._avCommit = target.textContent; target._avBuf = ''; }
    const nk = norm(word);
    used.set(nk, (used.get(nk) || 0) + 1); addWord(word, 4000);
    if (curPrev) learnPair(curPrev, nk);
    close();
  }

  Suggest.attach = function (el) {
    if (el._sugAttached) return; el._sugAttached = true;
    el.addEventListener('keydown', (e) => {
      if (!pop) return;
      if (e.key === 'ArrowDown') { active = (active + 1) % items.length; render(el); e.preventDefault(); e.stopImmediatePropagation(); }
      else if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; render(el); e.preventDefault(); e.stopImmediatePropagation(); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); accept(active); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    }, true);
    el.addEventListener('input', () => { if (!state.avroOn) Suggest.update(el); });
    el.addEventListener('blur', () => { Suggest.learn(el.innerText || ''); setTimeout(close, 150); });
  };

  /* ---- larger dictionaries from CDN (best-effort, cached, offline-safe) ---- */
  Suggest.loadExtra = async function () {
    try {
      const res = await fetch('https://cdn.jsdelivr.net/gh/first20hours/google-10000-english@master/google-10000-english.txt');
      if (!res.ok) return;
      const lines = (await res.text()).split(/\s+/);
      lines.forEach((w, i) => { if (w && w.length > 2) addWord(w, i); });
      console.info('Suggest: +' + lines.length + ' English words');
    } catch (e) { }
  };
  Suggest.loadExtraBangla = async function () {
    const urls = [
      'https://cdn.jsdelivr.net/gh/LibreOffice/dictionaries@master/bn_BD/bn_BD.dic',
      'https://cdn.jsdelivr.net/gh/MinhasKamal/BengaliDictionary@master/BengaliWordList/bengali_words.txt',
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url); if (!res.ok) continue;
        const text = await res.text();
        let n = 0;
        text.split(/\r?\n/).forEach((line, i) => {
          if (i === 0 && /^\d+$/.test(line.trim())) return; // hunspell count line
          const w = line.split('/')[0].split('\t')[0].trim();
          if (w && /[ঀ-৿]/.test(w) && w.length >= 2 && n < 40000) { addWord(w, 1000 + i); n++; }
        });
        if (n) { console.info('Suggest: +' + n + ' Bangla words'); return; }
      } catch (e) { }
    }
  };

  window.Suggest = Suggest;
})();
