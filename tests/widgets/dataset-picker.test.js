/**
 * Tests für das Widget dataset-picker — Einhängen über x-field, Setzen,
 * Model → Picker ohne Fokusverlust, Texte, Farbmarken.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { defineModel, datasets, columnRef } from '../../js/core/model.js';
import { mount as mountColumnPicker } from '../../js/widgets/column-picker/mount.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

const worksheet = { sheets: [{ id: 's1', name: 'Eins', state: { columns: [
  { id: 'a', shortName: 'C1', type: 'numeric', values: [1, 2, 3] },
  { id: 'b', shortName: 'C2', type: 'numeric', values: [4, 5, 6] },
  { id: 'g', shortName: 'C3', type: 'text', values: ['x', 'y', 'x'] },
] } }] };
const phases = { data: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
const ref = (c) => ({ instanceId: 'ws-1', sheetId: 's1', columnId: c });

const stateManager = {
  get(path) {
    if (path === 'phases') return phases;
    if (path.startsWith('phases.')) return phases[path.slice(7)] ?? [];
    return undefined;
  },
  getModuleState: (id) => (id === 'ws-1' ? worksheet : null),
};

const Slots = { valueRef: columnRef({ types: ['numeric'], required: true }), groupRef: columnRef({ group: true }) };
const Multi = defineModel({ fields: { datasets: datasets(Slots, { multi: true, colors: ['#ff0000', '#00ff00'] }) } });
const Single = defineModel({ fields: { datasets: datasets(Slots) } });

let n = 0;
let texts = {};
const i18n = {
  t: (k) => (k in texts ? texts[k] : k),
  exists: (k) => k in texts,
  getLanguage: () => 'de',
};
let directiveRegistered = false;
async function mountPicker(Model, { texts: own = {} } = {}) {
  texts = own;
  if (!directiveRegistered) { registerFieldDirective(Alpine, { i18n, widgets: WIDGETS }); directiveRegistered = true; }
  if (!Alpine.version) Alpine.start();
  const name = `dsWidget${++n}`;
  const model = new Model();
  const services = { eventBus: { on() {}, off() {} }, stateManager, i18n, moduleId: 'demo' };
  Alpine.data(name, () => {
    const comp = { model, moduleId: 'demo' };
    Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { services }; } });
    return comp;
  });
  const host = document.createElement('div');
  host.innerHTML = `<div x-data="${name}"><div class="pick" x-field="model.datasets"></div></div>`;
  document.body.append(host);
  Alpine.initTree(host);
  await flush();
  return { host, model: () => Alpine.$data(host.firstElementChild).model };
}

const choose = (sel, columnId) => {
  const opt = [...sel.options].find((o) => o.value && o.value.includes(columnId));
  sel.value = opt.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
};

suite('Widget dataset-picker', () => {
  test('hängt Selects je Slot und den Hinzufügen-Knopf mit Anker ein', async () => {
    const { host } = await mountPicker(Multi);
    assertTrue(host.querySelector('select[data-slot="valueRef"]') !== null);
    assertTrue(host.querySelector('select[data-slot="groupRef"]') !== null);
    assertEqual(host.querySelector('[data-action="add-dataset"]').getAttribute('data-help-key'), 'modules.demo.fields.datasets.help');
    host.remove();
  });

  test('Auswahl im Select landet im Model', async () => {
    const { host, model } = await mountPicker(Multi);
    choose(host.querySelector('select[data-slot="valueRef"]'), 'b');
    assertDeepEqual(model().datasets[0].valueRef, ref('b'));
    host.remove();
  });

  test('Model-Änderung wird angezeigt; gleicher Wert baut nicht neu, Fokus bleibt', async () => {
    const { host, model } = await mountPicker(Multi);
    const sel = host.querySelector('select[data-slot="valueRef"]');
    sel.focus();
    model().datasets = [{ valueRef: null, groupRef: null }];
    await flush();
    assertTrue(document.activeElement === sel, 'Fokus bleibt');
    assertTrue(host.querySelector('select[data-slot="valueRef"]') === sel, 'nicht neu gezeichnet');
    sel.blur();
    model().datasets = [{ valueRef: ref('a'), groupRef: null }];
    await flush();
    const now = host.querySelector('select[data-slot="valueRef"]');
    assertTrue(now.value.includes('a'), now.value);
    host.remove();
  });

  test('ohne multi kein Hinzufügen-Knopf', async () => {
    const { host } = await mountPicker(Single);
    assertTrue(host.querySelector('[data-action="add-dataset"]') === null);
    assertTrue(host.querySelector('select[data-slot="valueRef"]') !== null);
    host.remove();
  });

  test('Texte: Feldschlüssel vor gemeinsamem Rückfall', async () => {
    const { host } = await mountPicker(Single, { texts: { 'modules.demo.fields.datasets.valueRef.label': 'W', 'ui.datasetPicker.slotV': 'V', 'ui.datasetPicker.slotG': 'G' } });
    const labels = [...host.querySelectorAll('.ds-picker__slot-label')].map((l) => l.textContent);
    assertDeepEqual(labels, ['W', 'G']);
    host.remove();
  });

  test('Farben der Beschreibung erscheinen als Marke je Zeile', async () => {
    const { host, model } = await mountPicker(Multi);
    model().datasets = [{ valueRef: null, groupRef: null }, { valueRef: null, groupRef: null }];
    await flush();
    const marks = [...host.querySelectorAll('.ds-picker__color')];
    assertEqual(marks.length, 2);
    assertTrue(marks[1].getAttribute('style').includes('#00ff00') || marks[1].style.background.includes('0, 255, 0'));
    host.remove();
  });
  test('abgelehnte Eingabe: Picker zeigt trotz Fokus wieder den Wert des Models', async () => {
    const { host, model } = await mountPicker(Multi);
    const m = model();
    const proto = Object.getPrototypeOf(m);
    const desc = Object.getOwnPropertyDescriptor(proto, 'datasets');
    Object.defineProperty(m, 'datasets', { configurable: true, get: () => desc.get.call(m), set() { throw new Error('abgelehnt'); } });
    const sel = host.querySelector('select[data-slot="valueRef"]');
    sel.focus();
    choose(sel, 'b');
    await flush();
    const now = host.querySelector('select[data-slot="valueRef"]');
    assertEqual(now.value, '', 'abgelehnter Wert wird nicht angezeigt');
    host.remove();
  });
});

suite('Widget dataset-picker und column-picker — maxCount', () => {
  test('dataset-picker: maxCount des Slots filtert Spalten', async () => {
    const Capped = defineModel({ fields: { datasets: datasets({ valueRef: columnRef({ types: ['numeric'], maxCount: 2 }) }) } });
    const { host } = await mountPicker(Capped);
    const sel = host.querySelector('select[data-slot="valueRef"]');
    assertEqual([...sel.options].filter((o) => o.hasAttribute('value') && o.value).length, 0);
    host.remove();
    const Open = defineModel({ fields: { datasets: datasets({ valueRef: columnRef({ types: ['numeric'], maxCount: 3 }) }) } });
    const r = await mountPicker(Open);
    assertEqual([...r.host.querySelector('select[data-slot="valueRef"]').options].filter((o) => o.hasAttribute('value') && o.value).length, 2);
    r.host.remove();
  });

  test('column-picker mount reicht maxCount an den Spaltenfilter', () => {
    const count = (spec) => {
      const root = document.createElement('div');
      document.body.append(root);
      const services = { eventBus: { on() {}, off() {} }, stateManager, i18n: { t: (k) => k } };
      const value = { spec, get: () => null, set: () => true };
      const w = mountColumnPicker(root, { value, services, effect: () => {} });
      const n = [...root.querySelectorAll('option')].filter((o) => o.hasAttribute('value') && o.value).length;
      w.destroy(); root.remove();
      return n;
    };
    assertEqual(count({ kind: 'columnRef', types: ['numeric'], minCount: 0 }), 2);
    assertEqual(count({ kind: 'columnRef', types: ['numeric'], minCount: 0, maxCount: 2 }), 0);
    assertEqual(count({ kind: 'columnRef', types: ['numeric'], minCount: 0, maxCount: 3 }), 2);
  });
});
