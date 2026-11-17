// Settings page: extra sites where the content script runs (see syncExtraSites in background.js).
'use strict';

const BUILT_IN = ['https://web.stremio.com/'];
const $ = (id) => document.getElementById(id);

// Same rules as sitePatterns() in background.js.
function sitePatterns(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const dir = u.pathname.replace(/[^/]*$/, '') || '/';
  return { match: `${u.protocol}//${u.hostname}${dir}*`, origin: `${u.protocol}//${u.hostname}/*` };
}

// "example.com/app" → "https://example.com/app/"; "localhost:8080" → "http://localhost:8080/".
// The part after # (Stremio's own page address) is dropped.
function normalize(input) {
  let text = String(input || '').trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    const local = /^(localhost|127\.|\[::1\]|[^/]+\.(localhost|test))/i.test(text);
    text = (local ? 'http://' : 'https://') + text;
  }
  let u;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.hash = '';
  u.search = '';
  if (!u.pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(u.pathname)) u.pathname += '/';
  return u.href;
}

function isBuiltIn(url) {
  try { return BUILT_IN.some((b) => new URL(b).hostname === new URL(url).hostname); } catch { return false; }
}

async function loadSites() {
  const { sites } = await chrome.storage.local.get('sites');
  return Array.isArray(sites) ? sites.filter((s) => s && typeof s.url === 'string') : [];
}

function say(text, kind) {
  const m = $('message');
  m.textContent = text;
  m.className = `message ${kind || ''}`;
}

function siteRow(url, badge, actions) {
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.className = 'url';
  span.textContent = url;
  li.append(span);
  if (badge) {
    const b = document.createElement('span');
    b.className = `badge ${badge.kind || ''}`;
    b.textContent = badge.text;
    li.append(b);
  }
  for (const a of actions || []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `link ${a.danger ? 'danger' : ''}`;
    btn.textContent = a.label;
    btn.setAttribute('aria-label', `${a.label} ${url}`);
    btn.addEventListener('click', a.onClick);
    li.append(btn);
  }
  return li;
}

async function render() {
  const builtIn = $('built-in');
  builtIn.replaceChildren(...BUILT_IN.map((u) => siteRow(u, { text: 'Built in' })));

  const sites = await loadSites();
  const rows = [];
  for (const site of sites) {
    const p = sitePatterns(site.url);
    const allowed = p && await chrome.permissions.contains({ origins: [p.origin] });
    const actions = [];
    if (!allowed) actions.push({ label: 'Allow', onClick: () => allow(site.url) });
    actions.push({ label: 'Remove', danger: true, onClick: () => remove(site.url) });
    rows.push(siteRow(site.url, allowed ? { text: 'Allowed', kind: 'ok' } : { text: 'Not allowed', kind: 'warn' }, actions));
  }
  $('custom').replaceChildren(...rows);
  $('custom-empty').hidden = rows.length > 0;
}

// chrome.permissions.request must run straight from the click, before any other await.
async function allow(url) {
  const p = sitePatterns(url);
  if (!p) return;
  let granted = false;
  try { granted = await chrome.permissions.request({ origins: [p.origin] }); } catch (e) { say(e.message, 'error'); return; }
  say(granted ? 'Allowed. Reload that site\'s tab (F5).' : 'Chrome did not allow this site.', granted ? 'ok' : 'error');
  render();
}

async function add(event) {
  event.preventDefault();
  const url = normalize($('site-input').value);
  if (!url) { say('Enter a web address that starts with https:// or http://', 'error'); return; }
  if (isBuiltIn(url)) { say('This site is already built in.', 'ok'); return; }
  const p = sitePatterns(url);

  let granted = false;
  try { granted = await chrome.permissions.request({ origins: [p.origin] }); } catch (e) { say(e.message, 'error'); return; }
  if (!granted) { say('Chrome did not allow this site, so it was not added.', 'error'); return; }

  const sites = await loadSites();
  if (!sites.some((s) => s.url === url)) sites.push({ url });
  await chrome.storage.local.set({ sites });
  $('site-input').value = '';
  say(`Added ${url}. Reload that site's tab (F5).`, 'ok');
  render();
}

async function remove(url) {
  const sites = (await loadSites()).filter((s) => s.url !== url);
  await chrome.storage.local.set({ sites });
  // Give the permission back unless another saved site still needs the same host.
  const p = sitePatterns(url);
  if (p && !sites.some((s) => { const q = sitePatterns(s.url); return q && q.origin === p.origin; })) {
    try { await chrome.permissions.remove({ origins: [p.origin] }); } catch { /* ignore */ }
  }
  say(`Removed ${url}.`, 'ok');
  render();
}

$('version').textContent = chrome.runtime.getManifest().version;
$('add-form').addEventListener('submit', add);
chrome.permissions.onAdded.addListener(render);
chrome.permissions.onRemoved.addListener(render);
render();
