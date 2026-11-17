// Only used for torrent streams (infoHash without a direct URL): those can be played
// through Stremio's local streaming server (Stremio Service / Stremio desktop).
const SERVER = 'http://127.0.0.1:11470';

function fetchWithTimeout(url, ms, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

const VIDEO_EXT = /\.(mkv|mp4|avi|m4v|mov|wmv|webm|ts|m2ts|flv|mpg|mpeg)$/i;

async function prepareTorrent({ infoHash, fileIdx, sources }) {
  try {
    await fetchWithTimeout(`${SERVER}/settings`, 1500);
  } catch {
    return { ok: false, reason: 'server-offline' };
  }

  // Ask the server to start the torrent (best effort, errors ignored).
  // Timeouts stay short: Chrome only lets the page open potplayer: links for ~5 s after the click.
  let files = null;
  try {
    const res = await fetchWithTimeout(`${SERVER}/${infoHash}/create`, 3000, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        torrent: { infoHash },
        peerSearch: { sources: [`dht:${infoHash}`, ...(Array.isArray(sources) ? sources : [])], min: 40, max: 200 },
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.files)) files = data.files;
    }
  } catch { /* ignore */ }

  let idx = Number.isInteger(fileIdx) ? fileIdx : null;
  if (idx === null && files && files.length) {
    // No fileIdx given by the addon: pick the largest video file.
    let best = -1;
    files.forEach((f, i) => {
      const name = String((f && (f.name || f.path)) || '');
      if (VIDEO_EXT.test(name) && (best < 0 || (f.length || 0) > (files[best].length || 0))) best = i;
    });
    idx = best >= 0 ? best : 0;
  }
  if (idx === null) idx = 0;

  return { ok: true, url: `${SERVER}/${infoHash}/${idx}` };
}

// ------------------------------------------------------------------ subtitles helper (optional)

// A small Windows program (subtitles-helper/ folder, installed with install.bat). When it is
// installed, videos are opened through it so the subtitles can be passed to PotPlayer.
// When it is not installed, Chrome answers "host not found" at once and the extension
// keeps using potplayer: links.
const HELPER = 'play_in_potplayer.subtitles';
const HELPER_CACHE_MS = 10 * 60 * 1000;
let helperState = null; // { ok, potplayer, time }

function callHelper(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(HELPER, msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          const notFound = /not found|forbidden/i.test(err.message || '');
          resolve({ ok: false, reason: notFound ? 'no-helper' : 'helper-error', detail: err.message });
        } else {
          resolve(res || { ok: false, reason: 'helper-error' });
        }
      });
    } catch (e) {
      resolve({ ok: false, reason: 'no-helper', detail: String(e && e.message) });
    }
  });
}

async function pingHelper() {
  if (helperState && helperState.ok && Date.now() - helperState.time < HELPER_CACHE_MS) return helperState;
  const res = await callHelper({ type: 'ping' });
  helperState = { ok: !!res.ok, potplayer: !!res.potplayer, reason: res.reason, time: Date.now() };
  return helperState;
}

async function playWithHelper({ url, subtitles }) {
  const res = await callHelper({ type: 'play', url, subtitles: Array.isArray(subtitles) ? subtitles : [] });
  if (!res.ok) helperState = null; // check again next time
  return res;
}

// ------------------------------------------------------------------ messages

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const reply = (p) => { p.then(sendResponse, () => sendResponse({ ok: false, reason: 'error' })); return true; };
  if (!msg) return false;
  if (msg.type === 'spp:torrent' && /^[0-9a-f]{40}$/i.test(msg.infoHash || '')) return reply(prepareTorrent(msg));
  if (msg.type === 'spp:helper-ping') return reply(pingHelper());
  if (msg.type === 'spp:helper-play' && typeof msg.url === 'string') return reply(playWithHelper(msg));
  if (msg.type === 'spp:notice-next') return reply(nextNotice());
  if (msg.type === 'spp:notice-action') return reply(noticeAction(msg));
  return false;
});

// ------------------------------------------------------------------ extra sites (settings page)

// web.stremio.com is covered by the manifest. Other addresses where the user
// runs Stremio Web (their own copy, a test build, ...) are added on the settings page; Chrome
// asks for permission for each one, and the content script is then registered for it here.
const SITES_SCRIPT_ID = 'spp-extra-sites';

// "https://host/path/..." → { match: "https://host/path/*", origin: "https://host/*" }
// Ports are left out: in Chrome a pattern without a port matches every port.
function sitePatterns(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const dir = u.pathname.replace(/[^/]*$/, '') || '/';
  return { match: `${u.protocol}//${u.hostname}${dir}*`, origin: `${u.protocol}//${u.hostname}/*` };
}

async function syncExtraSites() {
  const { sites } = await chrome.storage.local.get('sites');
  const matches = [];
  for (const site of Array.isArray(sites) ? sites : []) {
    const p = sitePatterns(site && site.url);
    if (p && await chrome.permissions.contains({ origins: [p.origin] })) matches.push(p.match);
  }
  try { await chrome.scripting.unregisterContentScripts({ ids: [SITES_SCRIPT_ID] }); } catch { /* not registered */ }
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([{
    id: SITES_SCRIPT_ID, matches: [...new Set(matches)], js: ['content.js', 'notice.js'], css: ['content.css'], runAt: 'document_idle',
  }]);
}

chrome.runtime.onInstalled.addListener((details) => { syncExtraSites().catch(() => {}); noticeOnInstalled(details).catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { syncExtraSites().catch(() => {}); });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.sites) syncExtraSites().catch(() => {}); });
chrome.permissions.onRemoved.addListener(() => { syncExtraSites().catch(() => {}); });
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// ------------------------------------------------------------------ update notice and "What's new"

// "What's new": whats-new.json in this folder, shown once after the extension is updated
// (not after a first install).
// "New version" notice: notice.json (and its picture) attached to the latest GitHub release.
// Only releases/latest is read, so drafts and pre-releases never show. Shown on two different
// days per version; closing it counts as one of them; "Download" ends it for that version.
// Nothing is sent to GitHub except the request itself (no user data, no identifiers).
const RELEASES_API = 'https://api.github.com/repos/abdallah28r/play-in-potplayer-for-stremio/releases/latest';
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const NOTICE_DAYS = 2;

function versionParts(v) { return String(v || '').replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0); }
function isNewer(a, b) {
  const x = versionParts(a); const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}
function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
const installed = () => chrome.runtime.getManifest().version;

async function noticeOnInstalled(details) {
  if (details.reason === 'update' && isNewer(installed(), details.previousVersion || '0')) {
    await chrome.storage.local.set({ whatsNewPending: installed() });
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function fetchAsset(url, asJson) {
  const res = await fetchWithTimeout(url, 15000, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asJson ? res.json() : res.blob();
}

// → { version, url, data, image } of the latest release's notice, or null. Cached for 12 hours.
async function latestNotice() {
  const { noticeCache } = await chrome.storage.local.get('noticeCache');
  if (noticeCache && Date.now() - noticeCache.checkedAt < CHECK_EVERY_MS) return noticeCache.notice;

  let notice = null;
  try {
    const res = await fetchWithTimeout(RELEASES_API, 10000, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', cache: 'no-store' });
    if (res.ok) {
      const release = await res.json();
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const find = (name) => assets.find((a) => a && a.name === name);
      const json = find('notice.json');
      if (json && isNewer(release.tag_name, installed())) {
        const data = await fetchAsset(json.browser_download_url, true);
        data.version = String(data.version || release.tag_name).replace(/^v/i, '');
        let image = null;
        const pic = data.image && find(String(data.image));
        if (pic && pic.size <= MAX_IMAGE_BYTES && /^image\//.test(pic.content_type || 'image/')) {
          try { image = await blobToDataUrl(await fetchAsset(pic.browser_download_url, false)); } catch { /* text only */ }
        }
        notice = { version: data.version, url: release.html_url, data, image };
      }
    }
  } catch (e) {
    console.warn('[Stremio→PotPlayer] update check failed:', e && e.message);
    if (noticeCache) return noticeCache.notice; // keep the last answer, try again next time
  }
  await chrome.storage.local.set({ noticeCache: { checkedAt: Date.now(), notice } });
  return notice;
}

async function whatsNew() {
  const res = await fetch(chrome.runtime.getURL('whats-new.json'));
  const data = await res.json();
  data.version = String(data.version || installed()).replace(/^v/i, '');
  // Passed as a data: URL, so Stremio's page can show it without exposing extension files.
  let image = null;
  if (data.image) { try { image = await blobToDataUrl(await (await fetch(chrome.runtime.getURL(String(data.image)))).blob()); } catch { /* text only */ } }
  return { data, image };
}

// → { kind: 'whatsnew'|'update', data, image } or { kind: null }. Counts the showing.
async function nextNotice() {
  const store = await chrome.storage.local.get(['whatsNewPending', 'noticeDays']);

  if (store.whatsNewPending === installed()) {
    await chrome.storage.local.remove('whatsNewPending');
    try { return { kind: 'whatsnew', ...(await whatsNew()) }; } catch { /* no file: nothing to show */ }
  }

  const notice = await latestNotice();
  if (!notice || !isNewer(notice.version, installed())) return { kind: null };
  const days = (store.noticeDays && store.noticeDays.version === notice.version) ? store.noticeDays : { version: notice.version, days: [], done: false };
  if (days.done || days.days.length >= NOTICE_DAYS || days.days.includes(today())) return { kind: null };
  days.days.push(today());
  await chrome.storage.local.set({ noticeDays: days });
  return { kind: 'update', data: notice.data, image: notice.image };
}

async function noticeAction({ kind, version, action }) {
  if (kind !== 'update' || action !== 'download') return { ok: true };
  const { noticeCache, noticeDays } = await chrome.storage.local.get(['noticeCache', 'noticeDays']);
  const notice = noticeCache && noticeCache.notice;
  if (noticeDays && noticeDays.version === version) await chrome.storage.local.set({ noticeDays: { ...noticeDays, done: true } });
  const url = notice && notice.version === version && /^https:\/\/github\.com\//.test(notice.url) ? notice.url : 'https://github.com/abdallah28r/play-in-potplayer-for-stremio/releases/latest';
  await chrome.tabs.create({ url });
  return { ok: true };
}
