/**
 * Direktive x-file-drop — Eingabe, Öffnen, Ziehen, Ablegen, Aufräumen.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFileDropDirective } from '../../js/core/file-drop-directive.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const got = [];
const gotArgs = [];

function ensure() {
  Alpine.data('fileDropTest', () => ({ handleFile(f, a) { got.push(f); gotArgs.push(a); } }));
  registerFileDropDirective(Alpine);
}

async function mount(extra = '') {
  ensure();
  got.length = 0;
  gotArgs.length = 0;
  const root = document.createElement('div');
  root.innerHTML = `<div class="zone" x-data="fileDropTest" x-file-drop="handleFile" data-file-drop-accept=".csv,.txt" ${extra}>
    <span class="open" role="button" tabindex="0" data-file-drop-open>wählen</span>
    <button class="btn" data-file-drop-open>wählen</button>
  </div>`;
  document.body.append(root);
  await flush();
  const zone = root.querySelector('.zone');
  if (!zone._x_dataStack) Alpine.initTree(zone);
  const input = zone.querySelector('input[type=file]');
  let clicks = 0;
  input.click = () => { clicks += 1; };
  return { root, zone, input, clicks: () => clicks };
}

const key = (el, k) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};
const drag = (el, type, files) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.dataTransfer = { files };
  el.dispatchEvent(e);
  return e;
};

suite('x-file-drop', () => {
  test('ein verstecktes Dateifeld mit accept', async () => {
    const { root, zone, input } = await mount();
    assertEqual(zone.querySelectorAll('input[type=file]').length, 1);
    assertEqual(input.getAttribute('data-ref'), 'file-input');
    assertTrue(input.hidden);
    assertEqual(input.getAttribute('accept'), '.csv,.txt');
    root.remove();
  });

  test('Klick auf data-file-drop-open öffnet die Auswahl', async () => {
    const { root, zone, clicks } = await mount();
    zone.querySelector('.open').click();
    assertEqual(clicks(), 1);
    zone.click();
    assertEqual(clicks(), 1);
    root.remove();
  });

  test('Enter und Leertaste öffnen, Tab nicht; Schaltfläche bleibt dem Browser', async () => {
    const { root, zone, clicks } = await mount();
    const open = zone.querySelector('.open');
    assertTrue(key(open, 'Enter').defaultPrevented);
    assertTrue(key(open, ' ').defaultPrevented);
    assertEqual(clicks(), 2);
    assertEqual(key(open, 'Tab').defaultPrevented, false);
    assertEqual(clicks(), 2);
    key(zone.querySelector('.btn'), 'Enter');
    assertEqual(clicks(), 2);
    root.remove();
  });

  test('Ziehen setzt data-file-drop-over, Verlassen und Ablegen entfernen es', async () => {
    const { root, zone } = await mount();
    assertTrue(drag(zone, 'dragover', []).defaultPrevented);
    assertTrue(zone.hasAttribute('data-file-drop-over'));
    drag(zone, 'dragleave', []);
    assertEqual(zone.hasAttribute('data-file-drop-over'), false);
    drag(zone, 'dragover', []);
    drag(zone, 'drop', []);
    assertEqual(zone.hasAttribute('data-file-drop-over'), false);
    root.remove();
  });

  test('Ablegen ruft die Methode mit der Datei, ohne Datei nicht', async () => {
    const { root, zone } = await mount();
    const f = new File(['a'], 'a.csv');
    drag(zone, 'drop', []);
    assertEqual(got.length, 0);
    drag(zone, 'drop', [f]);
    assertEqual(got.length, 1);
    assertTrue(got[0] === f);
    root.remove();
  });

  test('change ruft die Methode und leert das Feld', async () => {
    const { root, input } = await mount();
    const f = new File(['a'], 'b.csv');
    const dt = new DataTransfer();
    dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(got.length, 1);
    assertEqual(got[0].name, 'b.csv');
    assertEqual(input.value, '');
    root.remove();
  });

  test('ohne data-file-drop-multiple: einzelne Auswahl, nur die erste Datei', async () => {
    const { root, zone, input } = await mount();
    assertEqual(input.multiple, false);
    const a = new File(['a'], 'a.csv');
    drag(zone, 'drop', [a, new File(['b'], 'b.csv')]);
    assertTrue(got[0] === a);
    assertEqual(JSON.stringify(gotArgs[0]), '{}');
    root.remove();
  });

  test('data-file-drop-multiple: Mehrfachauswahl, die Methode bekommt alle Dateien als Liste', async () => {
    const { root, zone, input } = await mount('data-file-drop-multiple');
    assertTrue(input.multiple);
    const a = new File(['a'], 'a.csv');
    const b = new File(['b'], 'b.csv');
    drag(zone, 'drop', [a, b]);
    assertEqual(got.length, 1);
    assertTrue(Array.isArray(got[0]));
    assertTrue(got[0][0] === a && got[0][1] === b);
    const dt = new DataTransfer();
    dt.items.add(a);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(got[1].length, 1);
    assertEqual(got[1][0].name, 'a.csv');
    root.remove();
  });

  test('data-arg-* kommen als zweites Argument, beim Ereignis gelesen', async () => {
    const { root, zone } = await mount('data-arg-scope="inScope" data-arg-gallery-name="x"');
    drag(zone, 'drop', [new File(['a'], 'a.csv')]);
    assertEqual(JSON.stringify(gotArgs[0]), JSON.stringify({ scope: 'inScope', galleryName: 'x' }));
    zone.setAttribute('data-arg-scope', 'outScope');
    drag(zone, 'drop', [new File(['a'], 'a.csv')]);
    assertEqual(gotArgs[1].scope, 'outScope');
    root.remove();
  });

  test('nach destroy keine Listener mehr', async () => {
    const { root, zone, clicks } = await mount();
    const open = zone.querySelector('.open');
    Alpine.destroyTree(zone);
    open.click();
    drag(zone, 'drop', [new File(['a'], 'c.csv')]);
    assertEqual(clicks(), 0);
    assertEqual(got.length, 0);
    root.remove();
  });
});
