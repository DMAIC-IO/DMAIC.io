/** Tests für die Kerndirektive x-fit — skaliert Inhalt in den Container (wie xMidYMid meet). */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFitDirective } from '../../js/core/fit-directive.js';

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
let n = 0;
async function mountFit(cw, ch, iw, ih) {
  registerFitDirective(Alpine);
  if (!Alpine.version) Alpine.start();
  const host = document.createElement('div');
  host.style.cssText = `width:${cw}px;height:${ch}px;position:relative`;
  host.innerHTML = `<div x-data="fitT${++n}" id="inner" x-fit style="width:${iw}px;height:${ih}px"></div>`;
  Alpine.data(`fitT${n}`, () => ({}));
  document.body.append(host);
  Alpine.initTree(host);
  await wait();
  return host;
}

suite('Direktive x-fit', () => {
  test('600x300 in 300x300: scale(0.5), zentriert', async () => {
    const host = await mountFit(300, 300, 600, 300);
    const el = host.querySelector('#inner');
    assertEqual(el.style.transformOrigin, '0px 0px');
    assertTrue(/scale\(0\.5\)/.test(el.style.transform), el.style.transform);
    assertTrue(/translate\(0px, 75px\)/.test(el.style.transform), el.style.transform);
    host.remove();
  });

  test('Container wächst auf 1200x1200: scale(2)', async () => {
    const host = await mountFit(300, 300, 600, 300);
    host.style.width = '1200px'; host.style.height = '1200px';
    await wait(150);
    const el = host.querySelector('#inner');
    assertTrue(/scale\(2\)/.test(el.style.transform), el.style.transform);
    assertTrue(/translate\(0px, 300px\)/.test(el.style.transform), el.style.transform);
    host.remove();
  });

  test('nach dem Entfernen keine ResizeObserver-Rückrufe mehr', async () => {
    const Orig = window.ResizeObserver;
    let disconnected = 0;
    window.ResizeObserver = class extends Orig { disconnect() { disconnected++; super.disconnect(); } };
    try {
      const host = await mountFit(300, 300, 600, 300);
      host.remove();
      Alpine.destroyTree(host);
      await wait();
      assertTrue(disconnected >= 1, 'disconnect');
    } finally { window.ResizeObserver = Orig; }
  });
});
