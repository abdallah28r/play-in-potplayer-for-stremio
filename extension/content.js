// Play in PotPlayer for Stremio
// Adds "Play in PotPlayer" under "Play" in the right-click menu of every stream on Stremio Web.
// Clicking it decodes the stream from the row's #/player/... link and opens potplayer:<url>,
// the link type PotPlayer registers on Windows when it is installed.
(() => {
  'use strict';
  if (window.__stremioPotPlayerLoaded) return;
  window.__stremioPotPlayerLoaded = true;

  const LABEL = 'Play in PotPlayer';
  const OPT_ATTR = 'data-spp-option';
  const MAX_URI_LENGTH = 2000;   // Chrome drops external-protocol links longer than ~2046 chars on Windows
  const CONTEXT_TTL_MS = 5000;   // how long a right-click on a stream counts as "recent"

  // Verified on web.stremio.com (2026-09-30). Class names carry build hashes
  // (e.g. context-menu-content-Xe_lN), so they are matched by prefix only. If Stremio
  // renames them, the heuristics further down still find the menu.
  const MENU_SELECTORS = ['[class*="context-menu-content"]', '[role="menu"]'];
  const OPTION_SELECTORS = ['[class*="context-menu-option-container"]', '[class*="menu-option"]', '[role="menuitem"]'];
  const LABEL_SELECTORS = ['[class*="option-label"]', '[class*="label"]:not(svg)'];
  const PLAY_WORDS = /^(play|تشغيل|شغل|reproducir|jouer|lire|abspielen|wiedergeben|riproduci|reproduzir|oynat|воспроизвести|смотреть|播放|재생|再生)$/i;

  const TEXT = {
    sending: 'Opening in PotPlayer',
    noResponse: 'PotPlayer did not open? Make sure PotPlayer is installed. If Chrome asks, tick "Always allow" and click Open.',
    notStream: 'Could not identify this stream. Close the menu and open it again.',
    decodeFailed: 'Could not read this stream. Use "Copy stream link", then press Ctrl+U in PotPlayer and paste it.',
    external: 'This option opens a web page, not a video file, so it cannot play in PotPlayer.',
    archive: 'This stream (NZB or archive) needs the Stremio streaming server, so it cannot play in PotPlayer.',
    noUrl: 'This stream has no video link that PotPlayer can play.',
    unsupportedScheme: (s) => `This link type (${s}) is not supported by PotPlayer.`,
    torrentPreparing: 'Preparing stream',
    torrentOffline: 'This stream needs Stremio Service running on your PC. Start it and try again.',
    tooLongCopied: 'This link is too long to open directly, so it was copied. Press Ctrl+U in PotPlayer and paste it.',
    tooLongNoCopy: 'This link is too long to open directly. Use "Copy stream link", then press Ctrl+U in PotPlayer and paste it.',
    headersNote: 'This stream needs custom connection headers, which PotPlayer cannot receive through a link, so it may not play.',
    noExtension: 'The extension was updated. Reload this page (F5) and try again.',
  };

  // ------------------------------------------------------------------ stream rows

  // "#/player/<STREAM>/<addon>/<meta>/<type>/<id>/<videoId>" → "<STREAM>"
  function streamSegment(href) {
    const m = /(?:^|[#/])player\/([^/?#]+)/.exec(href || '');
    return m ? m[1] : null;
  }

  function isStreamAnchor(el) {
    if (!el || el.tagName !== 'A') return false;
    const href = el.getAttribute('href');
    if (!href || !streamSegment(href)) return false;
    try { return new URL(el.href, location.href).origin === location.origin; } catch { return false; }
  }

  function findStreamAnchor(node) {
    for (let el = node && node.nodeType === 1 ? node : node && node.parentElement; el; el = el.parentElement) {
      if (isStreamAnchor(el)) return el;
    }
    return null;
  }

  // Last right-click on a stream row; used when the menu is not rendered inside the row.
  let lastContext = null;
  function recentContext() {
    if (lastContext && Date.now() - lastContext.time < CONTEXT_TTL_MS && lastContext.anchor.isConnected) return lastContext;
    return null;
  }

  // ------------------------------------------------------------------ decoding

  function base64ToBytes(b64) {
    let s = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function inflate(bytes, format) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Response(stream).text();
  }

  // STREAM = encodeURIComponent(base64(zlib-deflate(JSON(stream))))  (verified 2026-09-30).
  // Other encodings are tried too, in case Stremio changes it.
  async function decodeStream(segment) {
    const raw = decodeURIComponent(segment);
    const attempts = [];
    try {
      const bytes = base64ToBytes(raw);
      for (const format of ['deflate', 'deflate-raw', 'gzip']) attempts.push(() => inflate(bytes, format));
      attempts.push(() => new TextDecoder().decode(bytes));
    } catch { /* not base64 */ }
    attempts.push(() => raw);

    for (const attempt of attempts) {
      try {
        const obj = JSON.parse(await attempt());
        if (obj && typeof obj === 'object') return obj;
      } catch { /* try next */ }
    }
    throw new Error('Unrecognised stream encoding');
  }

  // → { ok:true, kind:'url'|'torrent', url?, infoHash?, fileIdx?, sources?, headers? } | { ok:false, message }
  function analyzeStream(stream) {
    const hints = stream.behaviorHints || {};
    const headers = hints.proxyHeaders && hints.proxyHeaders.request;

    if (typeof stream.url === 'string' && stream.url.trim()) {
      const url = stream.url.trim();
      if (/^https?:\/\//i.test(url)) return { ok: true, kind: 'url', url, headers };
      const magnet = /^magnet:\?.*xt=urn:btih:([0-9a-f]{40})/i.exec(url);
      if (magnet) return { ok: true, kind: 'torrent', infoHash: magnet[1].toLowerCase(), fileIdx: stream.fileIdx, sources: stream.sources };
      return { ok: false, message: TEXT.unsupportedScheme((url.split(':')[0] || '?').slice(0, 20)) };
    }
    if (typeof stream.infoHash === 'string' && /^[0-9a-f]{40}$/i.test(stream.infoHash)) {
      return { ok: true, kind: 'torrent', infoHash: stream.infoHash.toLowerCase(), fileIdx: stream.fileIdx, sources: stream.sources };
    }
    if (typeof stream.ytId === 'string' && stream.ytId) {
      return { ok: true, kind: 'url', url: `https://www.youtube.com/watch?v=${encodeURIComponent(stream.ytId)}` };
    }
    if (stream.externalUrl) return { ok: false, message: TEXT.external };
    if (stream.nzbUrl || stream.rarUrls || stream.zipUrls || stream['7zipUrls'] || stream.tgzUrls || stream.tarUrls) {
      return { ok: false, message: TEXT.archive };
    }
    return { ok: false, message: TEXT.noUrl };
  }

  // Decoding is started as soon as the menu opens, so the click can launch PotPlayer
  // immediately (inside the user's click gesture).
  const decodeCache = new Map();
  function resolveHref(href) {
    if (decodeCache.has(href)) return decodeCache.get(href);
    const entry = { result: null };
    const segment = streamSegment(href);
    entry.promise = (segment
      ? decodeStream(segment).then(analyzeStream)
      : Promise.resolve({ ok: false, message: TEXT.notStream })
    ).catch((err) => {
      console.warn('[Stremio→PotPlayer] could not decode stream:', err && err.message);
      return { ok: false, message: TEXT.decodeFailed };
    }).then((result) => (entry.result = result));
    decodeCache.set(href, entry);
    if (decodeCache.size > 100) decodeCache.delete(decodeCache.keys().next().value);
    return entry;
  }

  // ------------------------------------------------------------------ potplayer: link

  // potplayer:<url> goes straight to PotPlayer's own link handler. Without "//" Chrome leaves
  // the URL as it is; PotPlayer does not decode it, so it must not be percent-encoded as a whole.
  function buildPotPlayerUri(url) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const uri = 'potplayer:' + parsed.href;
    return uri.length > MAX_URI_LENGTH ? null : uri;
  }

  function openExternal(uri) {
    const link = document.createElement('a');
    link.href = uri;
    link.style.display = 'none';
    (document.body || document.documentElement).appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 0);
  }

  // Chrome gives no feedback when a protocol has no handler. If the page keeps focus
  // (no Chrome prompt, no PotPlayer window), show a hint.
  function watchLaunch(seq) {
    let lostFocus = false;
    const onBlur = () => { lostFocus = true; };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
      if (!lostFocus && seq === activationSeq && document.hasFocus()) toast(TEXT.noResponse, 'warn', 10000);
    }, 3500);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  function askTorrentUrl(result) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'spp:torrent', infoHash: result.infoHash, fileIdx: result.fileIdx, sources: result.sources },
          (res) => resolve(chrome.runtime.lastError ? { ok: false, reason: 'no-extension' } : res),
        );
      } catch {
        resolve({ ok: false, reason: 'no-extension' });
      }
    });
  }

  let lastActivation = 0;
  let activationSeq = 0; // a newer click cancels hints still pending from an older one
  async function activate(opt) {
    const now = Date.now();
    if (now - lastActivation < 800) return;
    lastActivation = now;
    const seq = ++activationSeq;

    const anchor = optionAnchors.get(opt) || findStreamAnchor(opt) || (recentContext() || {}).anchor;
    closeMenu(opt);
    if (!anchor) { toast(TEXT.notStream, 'error'); return; }

    const entry = resolveHref(anchor.getAttribute('href'));
    let result = entry.result || (await entry.promise);
    if (!result.ok) { toast(result.message, 'error', 9000); return; }

    if (result.kind === 'torrent') {
      toast(TEXT.torrentPreparing, 'info', 6000);
      const res = await askTorrentUrl(result);
      if (!res || !res.ok) {
        toast(res && res.reason === 'no-extension' ? TEXT.noExtension : TEXT.torrentOffline, 'error', 10000);
        return;
      }
      result = { ...result, url: res.url };
    }

    const uri = buildPotPlayerUri(result.url);
    if (!uri) {
      const copied = await copyText(result.url);
      toast(copied ? TEXT.tooLongCopied : TEXT.tooLongNoCopy, 'warn', 12000);
      return;
    }

    openExternal(uri);
    if (result.headers && Object.keys(result.headers).length) toast(TEXT.headersNote, 'warn', 7000);
    else toast(TEXT.sending, 'info', 4000);
    watchLaunch(seq);
  }

  // ------------------------------------------------------------------ menu injection

  function outermost(list) {
    return list.filter((el) => !list.some((other) => other !== el && other.contains(el)));
  }

  function isOurs(el) {
    return !!(el.closest && el.closest(`[${OPT_ATTR}]`));
  }

  function looksLikeOption(el) {
    if (!(el instanceof HTMLElement) || isOurs(el)) return false;
    if (!el.querySelector('svg')) return false;
    const text = (el.textContent || '').trim();
    if (!text || text.length > 60) return false;
    return el.hasAttribute('tabindex') || el.tagName === 'BUTTON' || el.tagName === 'A'
      || /^(button|menuitem)$/i.test(el.getAttribute('role') || '')
      || /button|option|item/i.test(typeof el.className === 'string' ? el.className : '');
  }

  function menuOptions(menu) {
    for (const selector of OPTION_SELECTORS) {
      const list = outermost([...menu.querySelectorAll(selector)].filter((el) => !isOurs(el)));
      if (list.length) return list;
    }
    return [...menu.children].filter(looksLikeOption);
  }

  // Fallback when the known class names are gone: any container whose children look like
  // menu options (icon + short text + focusable), found inside the right-clicked row.
  function heuristicMenus(root) {
    if (!(root instanceof HTMLElement)) return [];
    const found = [];
    for (const el of [root, ...root.querySelectorAll('div, ul, nav, section, menu')]) {
      if (el.children.length >= 2 && !isOurs(el) && [...el.children].filter(looksLikeOption).length >= 2) found.push(el);
    }
    return found;
  }

  function labelText(option) {
    for (const selector of LABEL_SELECTORS) {
      const el = option.querySelector(selector);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return (option.textContent || '').trim();
  }

  function setLabel(option, text) {
    for (const selector of LABEL_SELECTORS) {
      const el = option.querySelector(selector);
      if (el && el.textContent.trim() && !el.querySelector('svg')) { el.textContent = text; return; }
    }
    // Generic: put the text in the first visible text node, clear the others.
    const walker = document.createTreeWalker(option, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() && !(n.parentElement && n.parentElement.closest('svg'))
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    let first = true;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      n.nodeValue = first ? text : '';
      first = false;
    }
    if (first) option.appendChild(document.createTextNode(text));
  }

  // Clone "Play" so the new option gets exactly the same look and play icon.
  function buildOption(template) {
    const opt = template.cloneNode(true);
    opt.setAttribute(OPT_ATTR, '');
    opt.removeAttribute('id');
    opt.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    for (const attr of ['href', 'target', 'download', 'aria-selected', 'aria-checked', 'aria-current', 'aria-disabled', 'disabled']) {
      opt.removeAttribute(attr);
    }
    opt.classList.remove('active', 'selected', 'focused', 'focus', 'disabled');
    opt.setAttribute('title', LABEL);
    if (!opt.hasAttribute('tabindex')) opt.tabIndex = 0;
    setLabel(opt, LABEL);
    return opt;
  }

  const optionAnchors = new WeakMap();

  function inject(menu, anchor) {
    if (!menu.isConnected) return;
    const options = menuOptions(menu);
    if (!options.length) return;
    const play = options.find((o) => PLAY_WORDS.test(labelText(o))) || options[0];
    if (!play.parentNode) return;

    let opt = menu.querySelector(`[${OPT_ATTR}]`);
    if (opt && play.nextElementSibling === opt) return; // already in place
    if (!opt) {
      opt = buildOption(play);
      resolveHref(anchor.getAttribute('href')); // start decoding now
    }
    optionAnchors.set(opt, anchor);
    play.parentNode.insertBefore(opt, play.nextSibling);
  }

  function scan(addedNodes) {
    const ctx = recentContext();
    const candidates = new Set();

    for (const selector of MENU_SELECTORS) {
      document.querySelectorAll(selector).forEach((m) => candidates.add(m));
    }
    if (ctx) {
      heuristicMenus(ctx.anchor).forEach((m) => candidates.add(m));
      for (const node of addedNodes) {
        if (node.isConnected && !ctx.anchor.contains(node)) heuristicMenus(node).forEach((m) => candidates.add(m));
      }
    }

    for (const menu of candidates) {
      if (isOurs(menu)) continue;
      // Normal case: the menu is rendered inside the stream row (<a href="#/player/...">).
      let anchor = findStreamAnchor(menu);
      // Portal case: menu rendered elsewhere right after a right-click on a stream row.
      if (!anchor && ctx && !menu.closest('a') && addedNodes.some((n) => n === menu || n.contains(menu) || menu.contains(n))) {
        anchor = ctx.anchor;
      }
      if (anchor) inject(menu, anchor);
    }
  }

  function closeMenu(opt) {
    if (opt && opt.blur) opt.blur();
    const fire = (target, type, Ctor, extra) => {
      try { target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, view: window, ...extra })); } catch { /* ignore */ }
    };
    // Stremio closes its popup menus on a mouse press outside the row.
    const body = document.body;
    fire(body, 'pointerdown', PointerEvent, { pointerType: 'mouse', isPrimary: true });
    fire(body, 'mousedown', MouseEvent);
    fire(body, 'pointerup', PointerEvent, { pointerType: 'mouse', isPrimary: true });
    fire(body, 'mouseup', MouseEvent);

    setTimeout(() => {
      if (!opt.isConnected) return;
      // …or on Escape.
      fire(body, 'keydown', KeyboardEvent, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 });
      fire(body, 'keyup', KeyboardEvent, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 });
      setTimeout(() => {
        if (!opt.isConnected) return;
        // Last resort: just hide it; Stremio removes it on the next click anyway.
        const menu = opt.parentElement;
        if (menu) (findMenuRoot(menu) || menu).style.visibility = 'hidden';
      }, 80);
    }, 30);
  }

  function findMenuRoot(el) {
    const anchor = findStreamAnchor(el);
    let root = el;
    while (root.parentElement && root.parentElement !== anchor && root.parentElement !== document.body) root = root.parentElement;
    return anchor ? root : null;
  }

  // ------------------------------------------------------------------ events

  // The menu lives INSIDE the stream's <a href="#/player/...">, so any click on our option
  // would bubble up and start playback in Stremio. Every pointer/mouse/key event aimed at our
  // option is stopped at the very top (window, capture phase) before Stremio/React sees it.
  const BLOCKED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'touchstart', 'touchend'];
  for (const type of BLOCKED) {
    window.addEventListener(type, (e) => {
      const target = e.target;
      const opt = target && target.closest ? target.closest(`[${OPT_ATTR}]`) : null;
      if (!opt) return;
      e.stopImmediatePropagation();
      if (!type.startsWith('touch') && e.cancelable) e.preventDefault(); // cancels the <a> navigation
      if (type === 'click' && e.button === 0) activate(opt);
    }, { capture: true });
  }

  window.addEventListener('keydown', (e) => {
    const opt = e.target && e.target.closest ? e.target.closest(`[${OPT_ATTR}]`) : null;
    if (!opt) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.stopImmediatePropagation();
      e.preventDefault();
      activate(opt);
    }
  }, { capture: true });

  // Remember which stream row was right-clicked (never blocks Stremio's own handling).
  window.addEventListener('contextmenu', (e) => {
    const anchor = findStreamAnchor(e.target);
    lastContext = anchor ? { anchor, time: Date.now() } : null; // a right-click elsewhere resets it
    if (anchor) resolveHref(anchor.getAttribute('href'));
  }, { capture: true });

  // Stremio Web is a single-page React app: menus are created and destroyed without page
  // loads, so watch the DOM and inject whenever a stream menu appears (inject before paint).
  const observer = new MutationObserver((mutations) => {
    const added = [];
    for (const m of mutations) {
      for (const n of m.addedNodes) if (n.nodeType === 1 && !isOurs(n)) added.push(n);
    }
    if (added.length) scan(added);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan([]);

  // ------------------------------------------------------------------ toast

  // Success/progress ("info"): small light capsule at the bottom.
  // Warnings and errors: full-colour card at the top (Stremio style).
  const ICONS = {
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 23 21H1z" fill="currentColor"/><path d="M11 9h2v7h-2zM11 17h2v2h-2z" fill="#b07800"/></svg>',
    error: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" fill="currentColor"/><path d="M11 6h2v8h-2zM11 16h2v2h-2z" fill="#c0392b"/></svg>',
  };

  const toasts = {}; // 'pill' | 'card' → { el, text, icon, timer }
  function toastBox(type) {
    let t = toasts[type];
    if (t && t.el.isConnected) return t;
    const el = document.createElement('div');
    el.className = `spp-toast spp-${type}`;
    el.setAttribute('role', type === 'card' ? 'alert' : 'status');
    const icon = document.createElement('span');
    icon.className = 'spp-icon';
    const text = document.createElement('span');
    text.className = 'spp-text';
    el.append(icon, text);
    el.addEventListener('click', () => el.classList.remove('spp-show'));
    document.documentElement.appendChild(el);
    t = toasts[type] = { el, icon, text, timer: 0 };
    return t;
  }

  function hideToast(type) {
    const t = toasts[type];
    if (t) { clearTimeout(t.timer); t.el.classList.remove('spp-show'); }
  }

  function toast(message, kind = 'info', ms = 5000) {
    const type = kind === 'info' ? 'pill' : 'card';
    hideToast(type === 'pill' ? 'card' : 'pill');
    const t = toastBox(type);
    t.icon.innerHTML = ICONS[kind] || ICONS.info;
    t.text.textContent = message;
    t.el.classList.remove('spp-show', 'spp-kind-info', 'spp-kind-warn', 'spp-kind-error');
    t.el.classList.add(`spp-kind-${kind}`);
    void t.el.offsetWidth; // restart the transition
    t.el.classList.add('spp-show');
    clearTimeout(t.timer);
    t.timer = setTimeout(() => t.el.classList.remove('spp-show'), ms);
  }

  // For the offline test page only.
  window.__stremioPotPlayerTest = { decodeStream, analyzeStream, buildPotPlayerUri, streamSegment };
})();
