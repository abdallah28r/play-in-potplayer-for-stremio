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
  return false;
});
