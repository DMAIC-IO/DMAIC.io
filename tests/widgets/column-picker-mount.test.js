/**
 * Tests für das Widget column-picker — Eingaben `exclude` und `sameSheetAs`
 * filtern die angebotenen Spalten, schreiben aber nie in den gebundenen Wert.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { defineModel, columnRef, list } from '../../js/core/model.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const col = (id, name) => ({ id, shortName: name, type: 'numeric', values: [1, 2, 3] });
const sheet = (id, a, b) => ({ id, name: id, state: { rowCount: 3, columns: [col(a, a), col(b, b)] } });
const worksheet = { sheets: [sheet('sA', 'A1', 'A2'), sheet('sB', 'B1', 'B2')] };
const phases = { data: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
const ref = (c) => ({ instanceId: 'ws-1', sheetId: c.startsWith('A') ? 'sA' : 'sB', columnId: c });

const stateManager = withStoredWorksheetReader({
  get(path) {
    if (path === 'phases') return phases;
    if (path.startsWith('phases.')) return phases[path.slice(7)] ?? [];
    return undefined;
  },
  getModuleState: (id) => (id === 'ws-1' ? worksheet : null),
});

const i18n = { t: (k) => k, exists: () => false, getLanguage: () => 'de' };
let registered = false;
let n = 0;

/** Hängt den Picker über `x-field` ein; `bind` nennt die gebundenen Eingaben (Attribut → Pfad). */
async function mountPicker(bind, state) {
  if (!registered) { registerFieldDirective(Alpine, { i18n, widgets: WIDGETS }); registered = true; }
  if (!Alpine.version) Alpine.start();
  const name = `cpMount${++n}`;
  const M = defineModel({ fields: {
    value: columnRef(), exclude: list(columnRef({ nullable: false }), { nullable: true }), same: columnRef(),
  } });
  const m = new M();
  for (const [k, v] of Object.entries(state)) m[k] = v;
  Alpine.data(name, () => {
    const comp = { model: m };
    Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { services: { eventBus: { on() {}, off() {} }, stateManager, i18n, moduleId: 'demo' } }; } });
    return comp;
  });
  const attrs = Object.entries(bind).map(([a, p]) => `${a}="${p}"`).join(' ');
  const host = document.createElement('div');
  host.innerHTML = `<div x-data="${name}"><div x-field="model.value" ${attrs}></div></div>`;
  document.body.append(host);
  Alpine.initTree(host);
  await flush();
  const keys = () => [...host.querySelectorAll('select option')].map((o) => o.value).filter((v) => v.includes('|')).map((v) => v.split('|')[2]);
  return { host, m: () => Alpine.$data(host.firstElementChild).model, keys };
}

suite('Widget column-picker — exclude und sameSheetAs', () => {
  test('ohne Eingaben: alle vier Spalten', async () => {
    const { host, keys } = await mountPicker({}, { value: null });
    assertDeepEqual(keys(), ['A1', 'A2', 'B1', 'B2']);
    host.remove();
  });

  test('exclude blendet die genannte Spalte aus', async () => {
    const { host, keys } = await mountPicker({ 'x-widget-exclude': 'model.exclude' }, { value: null, exclude: [ref('A1')] });
    assertDeepEqual(keys(), ['A2', 'B1', 'B2']);
    host.remove();
  });

  test('sameSheetAs lässt nur das Blatt der Bezugsspalte zu', async () => {
    const { host, keys } = await mountPicker({ 'x-widget-same-sheet-as': 'model.same' }, { value: null, same: ref('A1') });
    assertDeepEqual(keys(), ['A1', 'A2']);
    host.remove();
  });

  test('beide zusammen: nur A2', async () => {
    const { host, keys } = await mountPicker(
      { 'x-widget-exclude': 'model.exclude', 'x-widget-same-sheet-as': 'model.same' },
      { value: null, exclude: [ref('A1')], same: ref('A1') });
    assertDeepEqual(keys(), ['A2']);
    host.remove();
  });

  test('sameSheetAs gebunden und null: keine Spalte', async () => {
    const { host, keys } = await mountPicker({ 'x-widget-same-sheet-as': 'model.same' }, { value: null, same: null });
    assertDeepEqual(keys(), []);
    host.remove();
  });

  test('Wechsel von sameSheetAs: Liste folgt, der Wert bleibt', async () => {
    const { host, m: model, keys } = await mountPicker({ 'x-widget-same-sheet-as': 'model.same' }, { value: ref('A2'), same: ref('A1') });
    assertDeepEqual(keys(), ['A1', 'A2']);
    const m = model();
    m.same = ref('B1');
    await flush();
    assertDeepEqual(keys(), ['B1', 'B2']);
    assertEqual(m.value.columnId, 'A2');
    host.remove();
  });

  test('Eingabe und Wert wechseln im selben Takt: Wert bleibt B2', async () => {
    const { host, m: model, keys } = await mountPicker({ 'x-widget-same-sheet-as': 'model.same' }, { value: ref('A2'), same: ref('A1') });
    const m = model();
    m.same = ref('B1');
    m.value = ref('B2');
    await flush();
    assertEqual(m.value.columnId, 'B2');
    assertDeepEqual(keys(), ['B1', 'B2']);
    assertEqual(host.querySelector('select').value.split('|')[2], 'B2');
    host.remove();
  });
});
