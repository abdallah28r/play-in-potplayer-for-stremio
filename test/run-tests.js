// Paste-able test driver for mock-stremio.html (run via the browser tool).
window.__runSppTests = async function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = {};
  async function openMenu(label) {
    const a = document.querySelector(`a[data-label="${label}"]`);
    a.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    await sleep(60);
  }
  function clickEl(el) {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const C = t.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new C(t, { bubbles: true, cancelable: true, button: 0, view: window }));
    }
  }
  const opt = () => document.querySelector('[data-spp-option]');

  window.__events.length = 0;
  await openMenu('http-url');
  const o = opt();
  results.injected = o ? { label: o.textContent.trim(), prev: o.previousElementSibling && o.previousElementSibling.textContent.trim(), hasIcon: !!o.querySelector('svg path') } : null;
  if (o) clickEl(o);
  await sleep(300);
  results.click = [...window.__events];

  await sleep(900);
  window.__events.length = 0;
  await openMenu('http-url');
  await openMenu('ad');
  results.adAfterStream = { events: [...window.__events], sppOption: !!opt() };
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

  await sleep(100);
  window.__events.length = 0;
  await openMenu('http-url');
  const play = [...document.querySelectorAll('[tabindex]')].find((el) => !el.closest('[data-spp-option]') && el.textContent.trim() === 'Play');
  clickEl(play);
  await sleep(200);
  results.originalPlay = [...window.__events];
  return results;
};
'loaded';
