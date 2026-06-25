/* ai.js — AI assistant engine (Google Gemini, free tier) with PDF editing tools */
(function () {
  'use strict';
  const AI = {};
  const LS = 'mpe-ai-config';

  const PROVIDERS = {
    gemini: { label: 'Google Gemini', kind: 'gemini', defaultModel: 'gemini-2.0-flash', models: [['gemini-2.0-flash', 'Gemini 2.0 Flash'], ['gemini-2.5-flash', 'Gemini 2.5 Flash'], ['gemini-1.5-flash', 'Gemini 1.5 Flash']], keyUrl: 'https://aistudio.google.com/apikey', keyHelp: 'aistudio.google.com/apikey (free tier may be unavailable in some regions)' },
    groq: { label: 'Groq', kind: 'openai', endpoint: 'https://api.groq.com/openai/v1/chat/completions', defaultModel: 'llama-3.3-70b-versatile', models: [['llama-3.3-70b-versatile', 'Llama 3.3 70B'], ['llama-3.1-8b-instant', 'Llama 3.1 8B (fast)']], keyUrl: 'https://console.groq.com/keys', keyHelp: 'console.groq.com/keys — free, no credit card' },
    openrouter: { label: 'OpenRouter', kind: 'openai', endpoint: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'meta-llama/llama-3.3-70b-instruct:free', models: [['meta-llama/llama-3.3-70b-instruct:free', 'Llama 3.3 70B (free)'], ['google/gemini-2.0-flash-exp:free', 'Gemini 2.0 Flash (free)'], ['deepseek/deepseek-chat-v3.1:free', 'DeepSeek V3.1 (free)']], keyUrl: 'https://openrouter.ai/keys', keyHelp: 'openrouter.ai/keys — free, works in most regions' },
  };
  AI.providers = PROVIDERS;
  AI.cfg = (function () {
    let c; try { c = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { c = {}; }
    c.provider = c.provider || 'gemini';
    c.keys = c.keys || {}; c.models = c.models || {};
    if (c.key && !c.keys[c.provider]) c.keys[c.provider] = c.key;             // migrate old single-key config
    if (typeof c.model === 'string' && !c.models[c.provider]) c.models[c.provider] = c.model;
    delete c.key;
    return c;
  })();
  function persist() { localStorage.setItem(LS, JSON.stringify(AI.cfg)); }
  AI.provider = () => PROVIDERS[AI.cfg.provider] || PROVIDERS.gemini;
  AI.curKey = () => (AI.cfg.keys[AI.cfg.provider] || '').trim();
  AI.curModel = () => AI.cfg.models[AI.cfg.provider] || AI.provider().defaultModel;
  AI.hasKey = () => !!AI.curKey();
  AI.saveProviderConfig = function (provider, key, model) { AI.cfg.provider = provider; AI.cfg.keys[provider] = (key || '').trim(); AI.cfg.models[provider] = model || PROVIDERS[provider].defaultModel; persist(); };

  /* ---------- executor helpers ---------- */
  const clampF = v => Math.max(0, Math.min(1, +v || 0));
  function reqDoc() { if (!state.hasDoc()) throw new Error('No document is open — call create_document first.'); }
  function reqPage(n) { reqDoc(); const p = state.pages[(n | 0) - 1]; if (!p) throw new Error('Page ' + n + ' does not exist; the document has ' + state.pages.length + ' page(s).'); return p; }
  function afterEdit() { try { Viewer.renderAll(); UI.refreshThumbs(); UI.updateStatus(); if (UI.refreshHistoryButtons) UI.refreshHistoryButtons(); } catch (e) {} }

  /* ---------- Gemini schema helpers (types are UPPERCASE) ---------- */
  const S = (d, e) => Object.assign({ type: 'STRING', description: d }, e);
  const N = (d) => ({ type: 'NUMBER', description: d });
  const I = (d) => ({ type: 'INTEGER', description: d });
  const B = (d) => ({ type: 'BOOLEAN', description: d });
  const OBJ = (props, required) => ({ type: 'OBJECT', properties: props, required: required || [] });
  const POS = 'fraction of the page from 0 to 1 (0,0 = top-left corner, 1,1 = bottom-right)';

  /* ---------- tools ---------- */
  const TOOLS = [
    {
      name: 'get_document',
      description: 'Inspect the currently open document: page count and a text preview of each page. Call this before editing an existing document so you know what is there.',
      parameters: OBJ({}),
      run: async () => {
        if (!state.hasDoc()) return { open: false, message: 'No document is open.' };
        const pages = [];
        for (let i = 0; i < state.pages.length; i++) {
          const p = state.pages[i]; let text = '';
          try { const src = state.srcDocs[p.docId]; const pj = await src.pdfjsDoc.getPage(p.srcIndex + 1); const tc = await pj.getTextContent(); text = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 500); } catch (e) {}
          pages.push({ page: i + 1, rotation: p.rotation, added_elements: p.annotations.length, text_preview: text });
        }
        return { open: true, total_pages: state.pages.length, name: state.primaryName, pages };
      }
    },
    {
      name: 'create_document',
      description: 'Create a new blank PDF document to start designing. Replaces any open document.',
      parameters: OBJ({ page_size: S('A4 (default), Letter, Legal, or A3', { enum: ['A4', 'Letter', 'Legal', 'A3'] }), orientation: S('portrait (default) or landscape', { enum: ['portrait', 'landscape'] }) }),
      run: async (a) => {
        const sizes = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008], A3: [841.89, 1190.55] };
        let [w, h] = sizes[a.page_size] || sizes.A4;
        if (a.orientation === 'landscape') { const t = w; w = h; h = t; }
        await Loader.createBlank(w, h);
        UI.enterEditor(); Viewer.renderAll(); UI.updateStatus(); state.pushHistory();
        return 'Created a blank ' + (a.page_size || 'A4') + ' ' + (a.orientation || 'portrait') + ' document.';
      }
    },
    {
      name: 'add_text',
      description: 'Add a text box (heading, paragraph, label, etc.) to a page. Use a larger size for headings. Coordinates are fractions of the page.',
      parameters: OBJ({
        page: I('1-based page number'), x: N('left position, ' + POS), y: N('top position, ' + POS),
        text: S('the text content (newlines allowed; Bengali/বাংলা supported)'),
        size: N('font size in points (e.g. 28 for a title, 14 for body). Default 16'),
        color: S('hex color like #1c2230. Default dark'),
        bold: B('bold'), italic: B('italic'),
        align: S('left (default), center, or right', { enum: ['left', 'center', 'right'] }),
        width: N('text box width as a fraction of page width (default 0.6)'),
        font: S('Helvetica, Arial, Calibri, Times-Roman, Courier, Georgia, or a Bengali font (SolaimanLipi, Kalpurush). Default Helvetica')
      }, ['page', 'x', 'y', 'text']),
      run: (a) => {
        const p = reqPage(a.page);
        p.annotations.push({ id: state.uid('a'), type: 'text', x: clampF(a.x), y: clampF(a.y), w: a.width != null ? clampF(a.width) : 0.6, text: String(a.text == null ? '' : a.text), size: +a.size || 16, color: a.color || '#1c2230', font: a.font || 'Helvetica', banglaFont: 'SolaimanLipi', bold: !!a.bold, italic: !!a.italic, underline: false, strike: false, align: a.align || 'left', bg: null, lineSpacing: 1.3 });
        state.pushHistory(); afterEdit(); return 'Added text to page ' + a.page + '.';
      }
    },
    {
      name: 'add_table',
      description: 'Add a table with rows and columns to a page. Provide cell text as a 2D array (rows of columns).',
      parameters: OBJ({
        page: I('page number'), x: N('left, ' + POS), y: N('top, ' + POS),
        width: N('table width as fraction of page (default 0.7)'), height: N('table height as fraction of page (default 0.3)'),
        rows: I('number of rows'), cols: I('number of columns'),
        cells: { type: 'ARRAY', description: 'rows of cell text, e.g. [["Name","Qty"],["Apple","3"]]', items: { type: 'ARRAY', items: { type: 'STRING' } } },
        font_size: N('cell font size in points (default 12)')
      }, ['page', 'x', 'y', 'rows', 'cols']),
      run: (a) => {
        const p = reqPage(a.page); const rows = Math.max(1, a.rows | 0), cols = Math.max(1, a.cols | 0);
        let cells = a.cells;
        if (Array.isArray(cells) && cells.length && !Array.isArray(cells[0])) { const flat = cells; cells = []; for (let r = 0; r < rows; r++) cells.push(flat.slice(r * cols, (r + 1) * cols)); }
        const grid = []; for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push((cells && cells[r] && cells[r][c] != null) ? String(cells[r][c]) : ''); grid.push(row); }
        p.annotations.push({ id: state.uid('a'), type: 'table', x: clampF(a.x), y: clampF(a.y), w: clampF(a.width || 0.7), h: clampF(a.height || 0.3), rows, cols, cells: grid, borderColor: a.color || '#333333', borderWidth: 1, color: '#1c2230', fontSize: +a.font_size || 12, font: 'Helvetica' });
        state.pushHistory(); afterEdit(); return 'Added a ' + cols + '×' + rows + ' table to page ' + a.page + '.';
      }
    },
    {
      name: 'add_shape',
      description: 'Draw a rectangle, ellipse, or line on a page (useful for dividers, boxes, underlines, borders).',
      parameters: OBJ({
        page: I('page number'), shape: S('rectangle, ellipse, or line', { enum: ['rectangle', 'ellipse', 'line'] }),
        x: N('left/start, ' + POS), y: N('top/start, ' + POS),
        width: N('width (or x-length for a line) as fraction of page'), height: N('height (or y-length for a line) as fraction of page'),
        color: S('hex color (default #2f6df6)'), fill: B('fill the shape (rectangle/ellipse)'), stroke_width: N('line/border thickness in points (default 2)'), arrow: B('add an arrow head (line only)')
      }, ['page', 'shape', 'x', 'y']),
      run: (a) => {
        const p = reqPage(a.page); const shape = a.shape || 'rectangle'; const id = state.uid('a'); let an;
        if (shape === 'line') an = { id, type: 'line', x1: clampF(a.x), y1: clampF(a.y), x2: clampF((+a.x || 0) + (a.width != null ? +a.width : 0.2)), y2: clampF((+a.y || 0) + (a.height != null ? +a.height : 0)), color: a.color || '#2f6df6', size: +a.stroke_width || 2, arrow: !!a.arrow };
        else an = { id, type: shape === 'ellipse' ? 'ellipse' : 'rect', x: clampF(a.x), y: clampF(a.y), w: clampF(a.width || 0.2), h: clampF(a.height || 0.12), color: a.color || '#2f6df6', size: +a.stroke_width || 2, fill: !!a.fill };
        p.annotations.push(an); state.pushHistory(); afterEdit(); return 'Added a ' + shape + ' to page ' + a.page + '.';
      }
    },
    {
      name: 'add_watermark',
      description: 'Stamp a large faint watermark text across every page.',
      parameters: OBJ({ text: S('watermark text (default CONFIDENTIAL)'), color: S('hex color (default light gray)'), size: N('font size in points (default 60)') }),
      run: (a) => {
        reqDoc(); const text = String(a.text || 'CONFIDENTIAL'), size = +a.size || 60, color = a.color || '#c8c8c8';
        state.pages.forEach(p => p.annotations.push({ id: state.uid('a'), type: 'text', x: 0.1, y: 0.44, w: 0.8, text, size, color, font: 'Helvetica', banglaFont: 'SolaimanLipi', bold: true, italic: false, underline: false, strike: false, align: 'center', bg: null, lineSpacing: 1.2 }));
        state.pushHistory(); afterEdit(); return 'Added a watermark to all ' + state.pages.length + ' page(s).';
      }
    },
    {
      name: 'replace_text',
      description: 'Find existing text on a page and replace it (covers the original and writes the new text in the matching style). Use for editing the document\'s real text.',
      parameters: OBJ({ page: I('page number'), find: S('exact text to find'), replace_with: S('replacement text (empty to delete)') }, ['page', 'find', 'replace_with']),
      run: async (a) => {
        const p = reqPage(a.page); const n = await TextEdit.aiReplace(p.id, String(a.find || ''), String(a.replace_with == null ? '' : a.replace_with));
        state.pushHistory(); afterEdit();
        return n ? ('Replaced ' + n + ' occurrence(s) of "' + a.find + '" on page ' + a.page + '.') : ('No occurrences of "' + a.find + '" were found on page ' + a.page + '.');
      }
    },
    {
      name: 'erase_area',
      description: 'Cover/erase a rectangular area of a page (hides whatever is under it, matched to the page background).',
      parameters: OBJ({ page: I('page number'), x: N('left, ' + POS), y: N('top, ' + POS), width: N('width as fraction of page'), height: N('height as fraction of page') }, ['page', 'x', 'y', 'width', 'height']),
      run: (a) => {
        const p = reqPage(a.page); const box = { x: clampF(a.x), y: clampF(a.y), w: clampF(a.width), h: clampF(a.height) }; let pt = { bg: '#ffffff', img: null };
        try { const c = Viewer.getPageCanvas(p.id); if (c && window.TextEdit && TextEdit.erasePatch) pt = TextEdit.erasePatch(c, box); } catch (e) {}
        p.annotations.push({ id: state.uid('a'), type: 'whiteout', x: box.x, y: box.y, w: box.w, h: box.h, color: pt.bg, img: pt.img });
        state.pushHistory(); afterEdit(); return 'Erased an area on page ' + a.page + '.';
      }
    },
    {
      name: 'recognize_text', description: 'Run OCR on a scanned / image PDF to turn the printed text into editable text boxes. Use this before trying to read or edit text that is baked into a scanned image.',
      parameters: OBJ({ scope: S('"current" page or "all" pages (default all)', { enum: ['current', 'all'] }), language: S('eng (default), ben (Bengali), or eng+ben', { enum: ['eng', 'ben', 'eng+ben'] }) }),
      run: async (a) => { if (!window.OCR || !OCR.available()) throw new Error('OCR engine is not available.'); reqDoc(); const n = await OCR.run({ scope: a.scope || 'all', lang: a.language || 'eng' }); return 'OCR recognized ' + n + ' text line(s); they are now editable text boxes.'; }
    },
    { name: 'add_page', description: 'Insert a new blank page after the given page (or at the end).', parameters: OBJ({ after_page: I('insert after this page number (default: last page)') }), run: async (a) => { reqDoc(); const after = a.after_page || state.pages.length; const ref = state.pages[after - 1] || state.pages[state.pages.length - 1]; await Pages.insertBlankAfter(ref.id); return 'Added a blank page after page ' + after + '.'; } },
    { name: 'delete_page', description: 'Delete a page.', parameters: OBJ({ page: I('page number') }, ['page']), run: async (a) => { reqPage(a.page); if (state.pages.length <= 1) throw new Error('Cannot delete the only page.'); await Pages.delete(state.pages[a.page - 1].id); return 'Deleted page ' + a.page + '.'; } },
    { name: 'duplicate_page', description: 'Duplicate a page (copy appears right after it).', parameters: OBJ({ page: I('page number') }, ['page']), run: (a) => { const p = reqPage(a.page); Pages.duplicate(p.id); return 'Duplicated page ' + a.page + '.'; } },
    { name: 'rotate_page', description: 'Rotate a page to an absolute angle (0, 90, 180, or 270 degrees).', parameters: OBJ({ page: I('page number'), degrees: I('0, 90, 180, or 270') }, ['page', 'degrees']), run: (a) => { const p = reqPage(a.page); p.rotation = (((a.degrees | 0) % 360) + 360) % 360; state.pushHistory(); afterEdit(); return 'Rotated page ' + a.page + ' to ' + p.rotation + '°.'; } },
    { name: 'set_metadata', description: 'Set document properties (title, author, subject, keywords); applied when the PDF is saved.', parameters: OBJ({ title: S('title'), author: S('author'), subject: S('subject'), keywords: S('comma-separated keywords') }), run: (a) => { state.aiMetadata = Object.assign(state.aiMetadata || {}, { title: a.title, author: a.author, subject: a.subject, keywords: a.keywords }); return 'Document properties saved; they apply when you save the PDF.'; } },
    { name: 'save_pdf', description: 'Save and download the current document as a PDF file.', parameters: OBJ({}), run: async () => { reqDoc(); await Export.downloadCurrent(); return 'Saved and downloaded the PDF.'; } },
  ];

  const RUN = {}; TOOLS.forEach(t => RUN[t.name] = t.run);
  AI.toolDeclarations = () => TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
  AI.runTool = async (name, args) => { const fn = RUN[name]; if (!fn) throw new Error('Unknown tool: ' + name); return await fn(args || {}); };

  /* ---------- system prompt ---------- */
  const SYSTEM = [
    'You are the AI assistant built into "TJ AI PDF Editor", a browser-based PDF tool. You help users create, design, edit, organize and save PDF documents by calling the provided tools — you actually perform the actions, you do not just describe them.',
    '',
    'COORDINATES: x and y are fractions of the page from 0 to 1. (0,0) is the TOP-LEFT corner, (1,1) is the bottom-right. Widths/heights for text boxes, tables and shapes are also fractions of the page. Font sizes are in points (an A4 page is ~595×842 points).',
    '',
    'HOW TO WORK:',
    '- To start something new, call create_document first. To edit an existing document, call get_document first to see its contents.',
    '- Design thoughtfully: keep ~0.08–0.12 margins, put a title near the top at a large size (e.g. 26–34pt), use clear spacing between elements (increment y), align text, and use add_table for tabular data and add_shape for dividers/boxes.',
    '- To change existing text use replace_text; to remove content use erase_area or delete_page.',
    '- You may call several tools in sequence to build a whole page or document. After finishing, give a short (1–2 sentence) summary of what you did and offer to save with save_pdf.',
    '',
    'STYLE: Be concise and friendly. Do not narrate your internal reasoning — act via tools, then summarize briefly. If a request is genuinely ambiguous (missing key details), ask one short clarifying question instead of guessing. Bengali/বাংলা text is fully supported — use it directly when asked.'
  ].join('\n');

  /* ---------- request adapters ---------- */
  function lc(s) { if (!s || typeof s !== 'object') return s; const o = Array.isArray(s) ? [] : {}; for (const k in s) { let v = s[k]; if (k === 'type' && typeof v === 'string') v = v.toLowerCase(); else v = lc(v); o[k] = v; } return o; }
  AI.openaiTools = () => TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: lc(t.parameters) } }));

  async function safeFetch(url, opts, label) {
    try { return await fetch(url, opts); }
    catch (e) { throw new Error('Could not reach ' + label + ' from the browser (network or CORS). If this keeps happening, switch to the OpenRouter provider in settings.'); }
  }
  async function readErr(res) { try { const j = await res.json(); return (j.error && (j.error.message || j.error.status || JSON.stringify(j.error))) || JSON.stringify(j); } catch (e) { try { return await res.text(); } catch (e2) { return 'HTTP ' + res.status; } } }
  function apiError(res, msg) { const e = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)); e.status = res.status; return e; }

  async function geminiGenerate(contents) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(AI.curModel()) + ':generateContent?key=' + encodeURIComponent(AI.curKey());
    const body = { system_instruction: { parts: [{ text: SYSTEM }] }, contents, tools: [{ function_declarations: AI.toolDeclarations() }], tool_config: { function_calling_config: { mode: 'AUTO' } }, generationConfig: { temperature: 0.6, maxOutputTokens: 4096 } };
    const res = await safeFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 'Google Gemini');
    if (!res.ok) throw apiError(res, await readErr(res));
    return res.json();
  }
  async function openaiGenerate(messages) {
    const p = AI.provider();
    const headers = { 'content-type': 'application/json', 'authorization': 'Bearer ' + AI.curKey() };
    if (AI.cfg.provider === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'TJ AI PDF Editor'; }
    const body = { model: AI.curModel(), messages, tools: AI.openaiTools(), tool_choice: 'auto', temperature: 0.5, max_tokens: 2048 };
    const res = await safeFetch(p.endpoint, { method: 'POST', headers, body: JSON.stringify(body) }, p.label);
    if (!res.ok) throw apiError(res, await readErr(res));
    return res.json();
  }

  AI.buildRequestBody = (contents) => ({ system_instruction: { parts: [{ text: SYSTEM }] }, contents, tools: [{ function_declarations: AI.toolDeclarations() }] }); // (exposed for testing)

  /* ---------- agentic loops ---------- */
  AI._contents = []; AI._oa = null; AI._lastProvider = null;
  AI.reset = () => { AI._contents = []; AI._oa = null; };

  async function geminiLoop(userText, hooks) {
    AI._contents.push({ role: 'user', parts: [{ text: userText }] });
    let finalText = '', guard = 0;
    while (guard++ < 16) {
      if (hooks.status) hooks.status('thinking');
      const data = await geminiGenerate(AI._contents);
      const cand = data.candidates && data.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      AI._contents.push({ role: 'model', parts });
      const text = parts.filter(p => p.text).map(p => p.text).join('').trim();
      if (text) { finalText = text; if (hooks.text) hooks.text(text); }
      const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);
      if (!calls.length) break;
      const responses = [];
      for (const call of calls) {
        if (hooks.tool) hooks.tool(call.name, call.args, 'running');
        let result; try { result = await AI.runTool(call.name, call.args); } catch (e) { result = { error: String(e && e.message || e) }; }
        if (hooks.tool) hooks.tool(call.name, call.args, result);
        responses.push({ functionResponse: { name: call.name, response: (result && typeof result === 'object' && !Array.isArray(result)) ? result : { result: result } } });
      }
      AI._contents.push({ role: 'user', parts: responses });
    }
    return finalText;
  }

  async function openaiLoop(userText, hooks) {
    if (!AI._oa) AI._oa = [{ role: 'system', content: SYSTEM }];
    AI._oa.push({ role: 'user', content: userText });
    let finalText = '', guard = 0;
    while (guard++ < 16) {
      if (hooks.status) hooks.status('thinking');
      const data = await openaiGenerate(AI._oa);
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) throw new Error('Empty response from the AI provider.');
      AI._oa.push(msg);
      if (msg.content) { finalText = msg.content; if (hooks.text) hooks.text(msg.content); }
      const calls = msg.tool_calls || [];
      if (!calls.length) break;
      for (const call of calls) {
        const name = call.function && call.function.name; let args = {};
        try { args = JSON.parse((call.function && call.function.arguments) || '{}'); } catch (e) {}
        if (hooks.tool) hooks.tool(name, args, 'running');
        let result; try { result = await AI.runTool(name, args); } catch (e) { result = { error: String(e && e.message || e) }; }
        if (hooks.tool) hooks.tool(name, args, result);
        AI._oa.push({ role: 'tool', tool_call_id: call.id, content: (typeof result === 'string' ? result : JSON.stringify(result)) });
      }
    }
    return finalText;
  }

  AI.chat = async function (userText, hooks) {
    if (!AI.hasKey()) throw new Error('NO_KEY');
    hooks = hooks || {};
    if (AI._lastProvider && AI._lastProvider !== AI.cfg.provider) AI.reset();
    AI._lastProvider = AI.cfg.provider;
    return AI.provider().kind === 'gemini' ? geminiLoop(userText, hooks) : openaiLoop(userText, hooks);
  };

  window.AI = AI;
})();
