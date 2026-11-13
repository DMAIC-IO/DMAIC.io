/** Tests für die Kerndirektive x-rich-text — nur lesende Anzeige eines Markdown-Werts. */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerRichTextDirective } from '../../js/core/rich-text-directive.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
let n = 0;
async function mountView(markup, data = {}) {
  registerRichTextDirective(Alpine);
  if (!Alpine.version) Alpine.start();
  const name = `rtDirective${++n}`;
  Alpine.data(name, () => ({ ...data }));
  const host = document.createElement('div');
  host.innerHTML = `<div x-data="${name}">${markup}</div>`;
  document.body.append(host);
  Alpine.initTree(host);
  await flush();
  return host;
}

suite('Direktive x-rich-text', () => {
  test('Literal wird als Markdown gerendert', async () => {
    const host = await mountView(`<p x-rich-text="'**a**'"></p>`);
    assertEqual(host.querySelector('p').innerHTML, '<strong>a</strong>');
    host.remove();
  });

  test('Wertwechsel rendert neu', async () => {
    const host = await mountView(`<p x-rich-text="text"></p>`, { text: 'eins' });
    const p = host.querySelector('p');
    assertEqual(p.textContent, 'eins');
    Alpine.$data(host.firstElementChild).text = '*zwei*\nunten';
    await flush();
    assertEqual(p.innerHTML, '<em>zwei</em><br>unten');
    host.remove();
  });

  test('kein Wert: leeres Element; Markup im Wert bleibt Text', async () => {
    const host = await mountView(`<p x-rich-text="text"></p>`, { text: '<img src=x onerror=alert(1)>' });
    const p = host.querySelector('p');
    assertTrue(p.querySelector('img') === null);
    assertEqual(p.textContent, '<img src=x onerror=alert(1)>');
    Alpine.$data(host.firstElementChild).text = null;
    await flush();
    assertEqual(p.childNodes.length, 0);
    host.remove();
  });

  test('Quelltext benutzt kein innerHTML', async () => {
    const src = await (await fetch(new URL('../../js/core/rich-text-directive.js', import.meta.url))).text();
    assertTrue(!/innerHTML|insertAdjacentHTML|outerHTML/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  });
});
