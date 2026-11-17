// Play in PotPlayer for Stremio: "new version" notice and the one-time "What's new" window.
// A small capsule rises at the bottom centre, then expands into a card whose picture fills the
// top. The card's size follows its picture and text, never exceeds the screen, and only the text
// scrolls, and only when it has to.
// Content comes from JSON files (see notices/README.md): { version, image?, en:{title,text}, ar:{title,text} }.
// The text is Arabic (right to left) when Stremio's interface language is Arabic, English otherwise.
(() => {
  'use strict';
  if (window.__stremioPotPlayerNotice) return;
  window.__stremioPotPlayerNotice = true;

  const UI = {
    en: {
      updatePill: (v) => `New version ${v} is available`,
      updateTag: (v) => `Update available · v${v}`,
      whatsNewPill: (v) => `What's new in ${v}`,
      whatsNewTag: (v) => `What's new · v${v}`,
      download: 'Download', later: 'Later', gotIt: 'Got it', close: 'Close',
    },
    ar: {
      updatePill: (v) => `يتوفر إصدار جديد ${v}`,
      updateTag: (v) => `تحديث جديد · v${v}`,
      whatsNewPill: (v) => `الجديد في الإصدار ${v}`,
      whatsNewTag: (v) => `الجديد · v${v}`,
      download: 'تحميل', later: 'لاحقًا', gotIt: 'تمام', close: 'إغلاق',
    },
  };

  // Stremio keeps its interface language in profile.settings.interfaceLanguage (e.g. "ar-AR").
  // Only that one field is read.
  function stremioLang() {
    try {
      const lang = String(((JSON.parse(localStorage.getItem('profile') || 'null') || {}).settings || {}).interfaceLanguage || '');
      return /^ar\b|^ara\b|^ar[-_]/i.test(lang) || lang.toLowerCase() === 'ar' ? 'ar' : 'en';
    } catch { return 'en'; }
  }

  // Arabic text when wanted and present, otherwise English.
  function pickText(data, lang) {
    const en = (data && data.en) || {};
    const ar = (data && data.ar) || {};
    if (lang === 'ar' && (ar.title || ar.text)) return { lang: 'ar', title: ar.title || en.title || '', text: ar.text || en.text || '' };
    return { lang: 'en', title: en.title || '', text: en.text || '' };
  }

  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap { position: fixed; left: 50%; bottom: 24px; z-index: 2147483646; transform: translateX(-50%);
    font: 400 14px/1.55 "PlusJakartaSans", "Segoe UI", Tahoma, Arial, sans-serif; color: rgba(255,255,255,.9);
    display: flex; justify-content: center; }
  .wrap.static { position: static; transform: none; }
  .pill { display: flex; align-items: center; gap: 10px; white-space: nowrap; padding: 9px 18px 9px 14px;
    border-radius: 999px; background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.08);
    -webkit-backdrop-filter: blur(15px); backdrop-filter: blur(15px); cursor: pointer; font-weight: 500; }
  .pill[dir="rtl"] { padding: 9px 14px 9px 18px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #a18cff; flex: none; }
  .card { display: flex; flex-direction: column; width: var(--w, 380px);
    max-width: calc(100vw - 32px); max-height: calc(100vh - 48px);
    border-radius: 16px; overflow: hidden; background: rgba(20,17,40,.95); border: 1px solid rgba(255,255,255,.08);
    -webkit-backdrop-filter: blur(15px); backdrop-filter: blur(15px); box-shadow: 0 18px 50px rgba(0,0,0,.55); }
  .media { position: relative; flex: none; background: #15122b; }
  .media img { display: block; width: 100%; height: auto; max-height: min(260px, 32vh); object-fit: contain; }
  .media img.small { width: auto; max-width: 100%; margin: 0 auto; }
  .close { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; border-radius: 50%; border: 0;
    background: rgba(0,0,0,.55); color: #fff; font: 16px/30px "Segoe UI", sans-serif; cursor: pointer; padding: 0; }
  .card[dir="rtl"] .close { right: auto; left: 10px; }
  .close:hover { background: rgba(0,0,0,.8); }
  .noimg .close { background: rgba(255,255,255,.08); }
  .body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 14px 18px 16px; }
  .noimg .body { padding-top: 16px; }
  .head { flex: none; }
  .noimg .head { padding-inline-end: 34px; }
  .tag { display: inline-block; font-size: 12px; font-weight: 500; padding: 2px 10px; border-radius: 999px;
    background: rgba(123,91,245,.22); color: #c4b5ff; margin-bottom: 8px; }
  h2 { margin: 0 0 6px; font-size: 16px; font-weight: 600; line-height: 1.4; color: #fff; overflow-wrap: anywhere; }
  .text { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
    color: rgba(255,255,255,.75); font-size: 13.5px; overflow-wrap: anywhere; }
  .text > :last-child { margin-bottom: 0; }
  .text p { margin: 0 0 8px; }
  .text ul { margin: 0 0 8px; padding-inline-start: 20px; }
  .text li { margin: 2px 0; }
  .text code { direction: ltr; unicode-bidi: isolate; font-family: Consolas, monospace; font-size: 12.5px; background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 4px; }
  .text a { color: #c4b5ff; }
  .text strong { color: #fff; font-weight: 600; }
  .actions { flex: none; display: flex; gap: 8px; margin-top: 14px; }
  .btn { border: 0; border-radius: 10px; padding: 8px 16px; font: 600 13.5px "PlusJakartaSans", "Segoe UI", Tahoma, sans-serif; cursor: pointer; }
  .primary { background: #7b5bf5; color: #fff; }
  .primary:hover { background: #8d71f7; }
  .ghost { background: rgba(255,255,255,.08); color: rgba(255,255,255,.85); }
  .ghost:hover { background: rgba(255,255,255,.14); }
  .btn:focus-visible, .close:focus-visible, .pill:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  `;

  // ---------------------------------------------------------------- text (small markdown subset)

  // **bold**, `code` and [text](https://...) as DOM nodes; nothing is parsed as HTML.
  function inline(parent, text) {
    const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let last = 0;
    for (let m; (m = re.exec(text));) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      if (m[1]) { const b = document.createElement('strong'); b.textContent = m[1]; parent.append(b); }
      else if (m[2]) { const c = document.createElement('code'); c.textContent = m[2]; parent.append(c); }
      else {
        const a = document.createElement('a');
        a.textContent = m[3]; a.href = m[4]; a.target = '_blank'; a.rel = 'noopener noreferrer';
        parent.append(a);
      }
      last = re.lastIndex;
    }
    if (last < text.length) parent.append(text.slice(last));
  }

  // Paragraphs are separated by a blank line; lines starting with "- " are a bullet list.
  function renderText(container, text) {
    const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).filter((b) => b.trim());
    for (const block of blocks) {
      const lines = block.split('\n').filter((l) => l.trim());
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const ul = document.createElement('ul');
        for (const l of lines) { const li = document.createElement('li'); inline(li, l.replace(/^\s*[-*]\s+/, '')); ul.append(li); }
        container.append(ul);
      } else {
        const p = document.createElement('p');
        inline(p, lines.join(' '));
        container.append(p);
      }
    }
  }

  // ---------------------------------------------------------------- window

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function animate(node, frames, ms, easing) {
    if (reduceMotion()) frames = [{ opacity: frames[0].opacity ?? 0 }, { opacity: 1 }];
    return node.animate(frames, { duration: ms, easing: easing || 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
  }

  // Wide pictures get a wider card; tall ones a narrower card so the picture is not tiny.
  // A small picture is never stretched: the card shrinks to it (but not below 340px).
  function cardWidth(img) {
    if (!img || !img.naturalWidth) return 380;
    const ratio = img.naturalWidth / img.naturalHeight;
    const width = ratio >= 1.5 ? 420 : ratio >= 1 ? 380 : 340;
    return Math.max(340, Math.min(width, img.naturalWidth + 2));
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.alt = '';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // a broken picture is left out, the text still shows
      img.src = src;
    });
  }

  let current = null;

  function onKey(e) { if (e.key === 'Escape' && current) { e.stopPropagation(); current.close(); } }

  // → the card element. opts: { kind:'update'|'whatsnew', data, image, lang, onAction(action),
  //   instant (skip the capsule), container (render in place, for the test page) }
  async function showNotice(opts) {
    const { kind, data } = opts;
    const t = pickText(data, opts.lang || stremioLang());
    const ui = UI[t.lang];
    const version = String((data && data.version) || '').replace(/^v/i, '');
    const img = await loadImage(opts.image);

    if (current && !opts.container) current.remove();
    const host = el('div');
    host.setAttribute('data-spp-notice', '');
    const root = host.attachShadow({ mode: 'open' });
    const style = el('style'); style.textContent = CSS;
    const wrap = el('div', opts.container ? 'wrap static' : 'wrap');
    root.append(style, wrap);
    (opts.container || document.documentElement).append(host);

    let closed = false;
    const finish = (action) => {
      if (closed) return;
      closed = true;
      if (current && current.host === host) { current = null; document.removeEventListener('keydown', onKey, true); }
      try { if (opts.onAction) opts.onAction(action); } catch { /* ignore */ }
      if (opts.container) { host.remove(); return; }
      animate(wrap, [{ opacity: 1 }, { opacity: 0 }], 180).finished.then(() => host.remove(), () => host.remove());
    };
    if (!opts.container) {
      current = { host, close: () => finish('close'), remove: () => { closed = true; host.remove(); } };
      document.addEventListener('keydown', onKey, true);
    }

    // card
    const card = el('div', img ? 'card' : 'card noimg');
    card.dir = t.lang === 'ar' ? 'rtl' : 'ltr';
    card.lang = t.lang;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', t.title || (kind === 'update' ? ui.updatePill(version) : ui.whatsNewPill(version)));
    card.style.setProperty('--w', `${cardWidth(img)}px`);
    if (img && img.naturalWidth < cardWidth(img) - 2) img.classList.add('small');
    const x = el('button', 'close', '✕');
    x.setAttribute('aria-label', ui.close);
    x.addEventListener('click', () => finish('close'));
    if (img) {
      const media = el('div', 'media');
      media.append(img, x);
      card.append(media);
    }
    const body = el('div', 'body');
    const head = el('div', 'head');
    head.append(el('span', 'tag', kind === 'update' ? ui.updateTag(version) : ui.whatsNewTag(version)));
    if (t.title) head.append(el('h2', '', t.title));
    if (!img) { card.style.position = 'relative'; x.style.zIndex = '1'; card.append(x); }
    const text = el('div', 'text');
    renderText(text, t.text);
    if (text.childNodes.length) text.tabIndex = 0; // scrollable text can be scrolled with the keyboard
    const actions = el('div', 'actions');
    if (kind === 'update') {
      const dl = el('button', 'btn primary', ui.download);
      dl.addEventListener('click', () => finish('download'));
      const later = el('button', 'btn ghost', ui.later);
      later.addEventListener('click', () => finish('later'));
      actions.append(dl, later);
    } else {
      const ok = el('button', 'btn primary', ui.gotIt);
      ok.addEventListener('click', () => finish('ok'));
      actions.append(ok);
    }
    body.append(head, text, actions);
    card.append(body);

    if (opts.instant) { wrap.append(card); return card; }

    // capsule first, then the card
    const pill = el('div', 'pill');
    pill.dir = card.dir;
    pill.lang = t.lang;
    pill.tabIndex = 0;
    pill.setAttribute('role', 'button');
    pill.append(el('span', 'dot'), el('span', '', kind === 'update' ? ui.updatePill(version) : ui.whatsNewPill(version)));
    wrap.append(pill);
    animate(pill, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], 320);

    let expanded = false;
    const expand = () => {
      if (expanded || closed) return;
      expanded = true;
      pill.replaceWith(card);
      animate(card, [
        { opacity: 0.4, transform: 'scale(.55, .2)', transformOrigin: '50% 100%' },
        { opacity: 1, transform: 'none', transformOrigin: '50% 100%' },
      ], 420);
      if (img) animate(img, [{ opacity: 0 }, { opacity: 1 }], 500, 'ease-out');
    };
    pill.addEventListener('click', expand);
    pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expand(); } });
    setTimeout(expand, 900);
    return card;
  }

  // For the test page (test/notice-preview.html).
  window.__stremioPotPlayerNoticeTest = { showNotice, pickText, stremioLang, renderText };

  // ---------------------------------------------------------------- when to show

  const hasExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  if (!hasExtension) return;

  function ask(msg) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage(msg, (res) => resolve(chrome.runtime.lastError ? null : res)); } catch { resolve(null); }
    });
  }

  const onPlayer = () => /^#\/player\//.test(location.hash);
  let asked = false;

  // Once per page load, a few seconds after Stremio has loaded, and never over the video player.
  async function maybeShow() {
    if (asked || onPlayer() || document.hidden) return;
    asked = true;
    const next = await ask({ type: 'spp:notice-next' });
    if (!next || !next.kind || !next.data) return;
    showNotice({
      kind: next.kind,
      data: next.data,
      image: next.image,
      onAction: (action) => ask({ type: 'spp:notice-action', kind: next.kind, version: next.data.version, action }),
    });
  }

  setTimeout(maybeShow, 4000);
  window.addEventListener('hashchange', () => setTimeout(maybeShow, 1500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(maybeShow, 1500); });
})();
