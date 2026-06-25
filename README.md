# TJ AI PDF Editor

A free, **100% in-browser** PDF editor with a **Word / Google-Docs-style ribbon**. Open a PDF (or images), edit anything, and download — your files never leave your device. No server, no uploads, no account.

## Author

**Md. Rafiul Hoque Fakir**  
GitHub: [MDRafiulHoqueFakir](https://github.com/MDRafiulHoqueFakir)

Built with [pdf.js](https://mozilla.github.io/pdf.js/) for rendering and [pdf-lib](https://pdf-lib.js.org/) for editing, plus the [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib) fork for password encryption.

## AI Assistant (free — Groq / OpenRouter / Gemini)

Click **Assistant** in the top bar to open an AI chat that can *actually* create, design, edit and organize PDFs for you — it drives the editor through tool calls (e.g. "create an A4 invoice for 3 items", "add a centered title", "replace 'Draft' with 'Final' on page 1", "make a 3×4 table").

- **Free to run, pick a provider** (⚙ settings → API provider):
  - **Groq** — free, no credit card, works in most regions (incl. where Gemini's free tier isn't offered). Key: [console.groq.com/keys](https://console.groq.com/keys).
  - **OpenRouter** — free models, works in most regions. Key: [openrouter.ai/keys](https://openrouter.ai/keys).
  - **Google Gemini** — free *where the free tier is available* (some accounts/regions show a `limit: 0` quota). Key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
- All three are called **directly from the browser** (CORS-verified) — no backend needed. Your key is stored **only in your browser** (localStorage).
- **What it can do:** `create_document`, `add_text`, `add_table`, `add_shape`, `add_watermark`, `replace_text`, `erase_area`, `add_page` / `delete_page` / `duplicate_page` / `rotate_page`, `set_metadata`, `save_pdf`, and `get_document` (so it can read the page before editing).
- **Security note:** a browser-stored key is fine for personal/local use. For a public deployment, route requests through a small backend proxy (and that's also where a *free-tier limit → paid* metering layer + Stripe would live) — the app is structured so the assistant can point at a proxy URL instead of calling Gemini directly, without other changes.

## The ribbon

Every feature is organized into labeled groups under category tabs at the top, with a sliding tab indicator, button ripples, an active-tool glow, and a light/dark/auto theme toggle.

- **Home** — Tools (Select · Edit text · Erase), Font (family, size, **B** *I* <u>U</u> ~~S~~, text & highlight color), Paragraph (align left/center/right, bullet & numbered lists, line spacing), Draw (pen, marker, color, thickness).
- **Insert** — Text box, Table, Image, Signature, and Shapes & lines (box, ellipse, line, with fill/arrow/color/stroke).
- **Pages** — Arrange (rotate, duplicate, delete), Insert pages (blank, merge files), Organize (reorder, select all), Split & extract.
- **Review** — Protect (password, unlock), Modify (watermark, compress), Document (properties, form fields), Export (PNG, JPG, text).

Selecting a text box syncs the ribbon to its formatting and lets you restyle it live, just like a word processor (whole-box formatting per text element). Categories nest into **subcategory dropdowns** (Save as ▾, Shape ▾, Rotate ▾, Split ▾). The theme is a **radio menu** (Light / Dark / System) in the top bar.

## Fonts & Bengali typing

- **Fonts:** Helvetica, Arial, Calibri, Times New Roman, Courier New, Georgia, and **five Bengali faces** including the Bangladesh standards **SolaimanLipi** and **Kalpurush**, plus Hind Siliguri, Noto Sans Bengali and Tiro Bangla.
- **Bengali phonetic input (Avro-style):** toggle the **অ** button, then type Roman and it converts live — e.g. `amar nam rafiul` → আমার নাম রাফিউল.
- **Bengali on-screen keyboard (Avro/GBoard-style):** Insert → **Bangla keys** opens a draggable **QWERTY** keyboard. In বাং (Bangla) mode you type English letters and get বাংলা phonetically (e.g. `amar nam` → আমার নাম); a **EN/বাং** key switches to literal English, plus Shift, a number row, and Enter/Space/Backspace. Types into the focused text box or table cell.
- **Word suggestions:** as you type, an autocomplete popup suggests **English *and* Bangla** words (↑/↓ to choose, Enter/Tab to accept). Suggestions are **frequency-ranked** (most common first) and it **learns** the words and word-pairs you type. After you finish a word it also does **next-word prediction** (e.g. `thank ` → *you*). The dictionaries expand from a CDN on load — ~10k English (google-10000-english) and a large Bangla list (LibreOffice bn_BD), with an offline-safe fallback to the built-in lists.
- **Per-character formatting:** select part of the text inside a box and apply bold / italic / underline / strike / colour / size / font to just that selection (mixed formatting in one box). On export, **Latin runs stay selectable vector text** and only the Bengali / non-core-font runs are rasterized for exact shaping.
- **Automatic script→font detection:** every text box has a **Latin font** and a **Bengali font** (default SolaimanLipi, pick any in the ribbon). As you type, English renders in the Latin font and বাংলা automatically renders in the Bengali font — no manual switching, even mixed in one line. On export Latin stays selectable and Bengali bakes in its font.
- **Edit Text keeps the original font & size:** when you edit existing PDF text, the replacement keeps the original script's font (Bengali stays a Bengali font) and **auto-fits its size to the original line**, so you never have to grow/shrink it to make it fit.
- On export, Helvetica/Times/Courier/Arial stay **selectable vector text**; Calibri and Bengali text are **rasterized** so they look pixel-exact and Bengali conjuncts shape correctly (trade-off: that text isn't selectable in the PDF).
- **Auto background (▦):** new text boxes sample the page background so writing blends in and stays legible on coloured pages.

## Save as

PDF · **Word — editable text (.docx)** · **Word — page images (.docx)** · **Word (.doc)** · JPEG · PNG · plain text (.txt) · and an **editable project (.json)** that bundles the source PDF + all your edits so you can re-open and keep working later.

- *Editable text DOCX/DOC* — paragraphs + page breaks, fully editable in Word (layout not preserved).
- *Page-images DOCX* — each page embedded as an image, so it looks exactly like the PDF (text not editable in Word).

## Features

**Scanned / image PDFs (OCR)**
- Review → **OCR** recognizes the printed text in a scanned or image-only PDF (English / Bengali / both) and turns each line into an **editable text box over a background-matched cover** — so you can edit, restyle, or delete baked-in image text like normal text. (First run downloads the language model; OCR isn't perfect, fix any line by editing it.)

**Edit & delete existing content**
- **Edit text** tool: click any existing text in the PDF, retype it, or clear it to delete it — original font size and colour are detected and matched automatically
- **Erase** tool: drag over anything (text, images, logos) to remove it; the page background colour is sampled so the erased area blends in on white *or* coloured pages

**Add & annotate**
- Rich text boxes — font family, size, **bold**, *italic*, underline, strikethrough, text color, highlight color, alignment, bullet/numbered lists, line spacing, multi-line wrapping
- **Tables** — insert any rows×cols from a grid picker, double-click cells to type, resize & move; bakes into the PDF as real lines + text
- Freehand drawing, highlighter, rectangles, ellipses, lines/arrows
- Place images and signatures (draw / type / upload)
- Move, resize and delete any element; full undo/redo

**Organize pages**
- Reorder by drag-and-drop, rotate, duplicate, delete, insert blank pages
- Multi-select pages

**Merge / split / extract**
- Merge more PDFs or images via *Add files*
- Save a page range as a new PDF, extract selected pages, or split into one file per page

**Forms**
- Detect and fill interactive form fields (text, checkbox, dropdown, radio); optionally flatten

**Convert & secure**
- Compress (re-rasterize at chosen quality/resolution)
- Diagonal text/image watermarks
- Edit document properties (title, author, subject, keywords)
- Password-protect (encrypt with open/owner passwords + permissions) or remove protection
- Export pages as PNG/JPG, extract all text to `.txt`

## Run it

It's a static site — no build step.

```bash
# from this folder
python -m http.server 8753
# then open http://localhost:8753
```

Or just open `index.html` in a browser (loading via `http://` is recommended so the pdf.js web-worker can run).

## Keyboard shortcuts

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `V` | Select | `G` | Edit existing text |
| `T` | Add text box | `X` | Erase |
| `D` | Draw | `H` | Highlight |
| `R` | Rectangle | `E` | Ellipse |
| `L` | Line | `S` | Signature |
| `I` | Image | `Del` | Delete selected |
| `Ctrl+B/I/U` | Bold / Italic / Underline | `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo | `Ctrl+S` | Download PDF |
| `Esc` | Deselect | | |

## Project structure

```
index.html          markup + library/script tags
css/styles.css      all styling (light + dark)
js/
  libs.js           pdf.js worker config + capability checks
  state.js          central state, document model, undo/redo
  util.js           helpers (DOM, toast, modal, files)
  loader.js         open PDFs/images, build the page model
  viewer.js         render pages to canvas + host overlays
  annotate.js       create / render / manipulate annotations (incl. tables)
  textedit.js       edit & delete existing PDF text in place
  fonts.js          font registry (core vector vs. rasterized fonts)
  avro.js           Avro-style phonetic Bengali transliteration + input
  suggest.js        English + Bangla predictive word suggestions
  keyboard.js       draggable Bengali on-screen keyboard
  saveas.js         export to DOCX (text & images) / DOC / JSON, load projects
  format.js         live text formatting applied to the selected text box
  ribbon.js         Word-style ribbon: tabs, nested dropdowns, dialogs
  pages.js          page operations (rotate, delete, reorder…)
  operations.js     split, compress, watermark, metadata, forms, security
  export.js         bake the model + annotations into a final PDF
  ui.js             toolbars, option bar, side panels, signature pad
  main.js           bootstrap + global events (drag-drop, paste, keys)
```

## Notes & limits

- The **Edit text** tool replaces text by covering the original (with a background-matched box) and drawing your new text on top, so it isn't re-flowed like a word processor. The covered original text still technically exists in the file's data — to make a deletion truly unrecoverable (real redaction), run the result through **Compress**, which re-rasterizes the pages.
- Password encryption needs the `@cantoo/pdf-lib` script to load (it's pulled from a CDN). If you're fully offline, all other features still work; only *add password* is disabled (you can still *remove* protection).
- Very large or complex PDFs are limited by your browser's memory since everything runs locally.
