// Notice tester: a panel of buttons on Stremio Web that shows the real notices
// (notice.json and whats-new.json, with their pictures) in English or Arabic, so their look
// can be checked in the browser. Uses the same notice.js as the extension.
(() => {
  'use strict';
  const api = window.__stremioPotPlayerNoticeTest;
  if (!api || window.__sppNoticeTester) return;
  window.__sppNoticeTester = true;

  const FILES = {
    update: { json: 'notice.json', base: '' },
    whatsnew: { json: 'whats-new.json', base: '' },
  };

  async function asDataUrl(path) {
    const blob = await (await fetch(chrome.runtime.getURL(path))).blob();
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
  }

  async function show(kind, lang) {
    const f = FILES[kind];
    const data = await (await fetch(chrome.runtime.getURL(f.json), { cache: 'no-store' })).json();
    const image = data.image ? await asDataUrl(f.base + data.image) : null;
    api.showNotice({ kind, data, image, lang, instant: !animate.checked, onAction: (a) => log(`${kind} ${lang}: ${a}`) });
  }

  // Live: the same rule as latestNotice() in background.js, reading GitHub right now,
  // as if version 1.2.0 were installed. Shows what users will get, or says why nothing shows.
  const REPO = 'abdallah28r/play-in-potplayer-for-stremio';
  const parts = (v) => String(v || '').replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const newer = (a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  async function showLive(lang) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) throw new Error(`releases/latest: HTTP ${res.status}`);
    const release = await res.json();
    const base = `https://raw.githubusercontent.com/${REPO}/main/notices/`;
    const nres = await fetch(base + 'notice.json', { cache: 'no-store', credentials: 'omit' });
    if (!nres.ok) throw new Error(`notices/notice.json: HTTP ${nres.status}`);
    const data = await nres.json();
    if (newer(data.version, release.tag_name) || newer(release.tag_name, data.version)) {
      throw new Error(`notice.json is ${data.version}, latest release is ${release.tag_name}: nothing would show`);
    }
    let image = null;
    if (data.image) {
      const blob = await (await fetch(base + data.image, { cache: 'no-store', credentials: 'omit' })).blob();
      image = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
    }
    logEl.textContent = `Live: release ${release.tag_name}, notice ${data.version}`;
    api.showNotice({ kind: 'update', data, image, lang, instant: !animate.checked, onAction: (a) => log(`live ${lang}: ${a}`) });
  }

  // ---------------------------------------------------------------- panel
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .panel { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; width: 250px;
        font: 13px/1.4 "Segoe UI", Tahoma, sans-serif; color: #eee; background: #1b1830f2;
        border: 1px dashed #f0b84a; border-radius: 12px; padding: 10px; box-shadow: 0 8px 24px #0008; }
      .title { display: flex; justify-content: space-between; align-items: center; font-weight: 600; color: #f0b84a; margin-bottom: 8px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .row-label { grid-column: 1 / -1; color: #aaa; font-size: 12px; margin-top: 4px; }
      button { font: 600 12.5px "Segoe UI", Tahoma, sans-serif; border: 0; border-radius: 8px; padding: 7px 8px;
        background: #ffffff14; color: #fff; cursor: pointer; }
      button:hover { background: #7b5bf5; }
      .small { background: transparent; color: #aaa; padding: 2px 6px; }
      label { display: flex; gap: 6px; align-items: center; margin-top: 8px; color: #ccc; }
      .log { margin-top: 6px; color: #9fd; font-size: 12px; min-height: 16px; }
      .collapsed .body { display: none; }
      .collapsed { width: auto; }
    </style>
    <div class="panel">
      <div class="title"><span>TEST: notices</span><button class="small" id="toggle" title="Hide">–</button></div>
      <div class="body">
        <div class="grid">
          <div class="row-label">New version (notice.json)</div>
          <button data-k="update" data-l="en">English</button>
          <button data-k="update" data-l="ar">العربية</button>
          <div class="row-label">What's new (whats-new.json)</div>
          <button data-k="whatsnew" data-l="en">English</button>
          <button data-k="whatsnew" data-l="ar">العربية</button>
          <div class="row-label">Live from GitHub (as if 1.2.0 is installed)</div>
          <button data-live="en">English</button>
          <button data-live="ar">العربية</button>
        </div>
        <label><input type="checkbox" id="anim" checked> With the capsule animation</label>
        <div class="log" id="log"></div>
      </div>
    </div>`;
  document.documentElement.append(host);

  const animate = root.getElementById('anim');
  const logEl = root.getElementById('log');
  function log(text) { logEl.textContent = `Clicked: ${text}`; }
  root.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
    logEl.textContent = '';
    show(b.dataset.k, b.dataset.l).catch((e) => { logEl.textContent = `Error: ${e.message}`; });
  }));
  root.querySelectorAll('[data-live]').forEach((b) => b.addEventListener('click', () => {
    logEl.textContent = 'Live: asking GitHub…';
    showLive(b.dataset.live).catch((e) => { logEl.textContent = `Live: ${e.message}`; });
  }));
  const panel = root.querySelector('.panel');
  root.getElementById('toggle').addEventListener('click', (e) => {
    panel.classList.toggle('collapsed');
    e.target.textContent = panel.classList.contains('collapsed') ? '+' : '–';
  });
})();
