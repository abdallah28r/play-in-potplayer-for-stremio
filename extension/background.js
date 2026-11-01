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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'spp:torrent' && /^[0-9a-f]{40}$/i.test(msg.infoHash || '')) {
    prepareTorrent(msg).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
    return true; // async response
  }
  return false;
});
