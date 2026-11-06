/**
 * Tests for core/field-directive.js — x-field bindet ein Formularfeld an ein
 * Feld des deklarativen Models, mit Attributen und Prüfanzeige aus dem Schema.
 */
import { suite, test, assertEqual, assertTrue, assertThrows, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective, registerFieldWidget } from '../../js/core/field-directive.js';
import { defineModel, defineState, text, number, oneOf, boolean, list, object, command, idOf, date, columnRef } from '../../js/core/model.js';

const M = defineModel({
  fields: {
    alpha: number({ exclusiveMin: 0, exclusiveMax: 1, default: 0.05 }),
    beta: number({ min: 0, max: 10, nullable: true, default: null }),
    count: number({ min: 1, integer: true, default: 1 }),
    title: text(),
    on: boolean(),
  },
  view: { mode: oneOf(['a', 'b']) },
});

const Ui = defineState({
  level: number({ min: 0, max: 5, integer: true, default: 2 }),
  label: text(),
});

const I18N = { t: (k, p) => (p ? `${k}|${p.range}` : k), getLanguage: () => 'de' };
const flush = () => new Promise(r => setTimeout(r, 0));

let n = 0;
async function mount() {
  registerFieldDirective(Alpine, { i18n: I18N });
  if (!Alpine.version) Alpine.start();
  const name = `fieldTest${++n}`;
  const model = new M();
  Alpine.data(name, () => ({ model, state: Ui.create(), moduleId: 'ft' }));
  const host = document.createElement('div');
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  const add = (tag, attrs) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); root.append(el); return el; };
  const els = {
    alpha: add('input', { 'x-field': 'model.alpha' }),
    alphaText: add('input', { type: 'text', 'x-field': 'model.alpha' }),
    beta: add('input', { 'x-field': 'model.beta' }),
    count: add('input', { 'x-field': 'model.count' }),
    title: add('input', { 'x-field': 'model.title', 'data-help-key': 'eigener.schluessel' }),
    on: add('input', { type: 'checkbox', 'x-field': 'model.on' }),
    mode: add('select', { 'x-field': 'model.mode' }),
    level: add('input', { 'x-field': 'state.level' }),
    label: add('input', { 'x-field': 'state.label' }),
  };
  for (const v of ['a', 'b']) { const o = document.createElement('option'); o.value = v; o.textContent = v; els.mode.append(o); }
  host.append(root);
  document.body.append(host);
  Alpine.initTree(host);
  await flush();
  const vm = Alpine.$data(root);
  return { model: vm.model, state: vm.state, els };
}

const change = (el, value) => { el.value = value; el.dispatchEvent(new Event('change')); };
const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input')); };

suite('x-field — Attribute aus dem Schema', () => {
  test('Zahl: type, min/max (auch offene Grenze als Hinweis), step', async () => {
    const { els } = await mount();
    assertEqual(els.alpha.type, 'number');
    assertEqual(els.alpha.getAttribute('min'), '0');
    assertEqual(els.alpha.getAttribute('max'), '1');
    assertEqual(els.alpha.getAttribute('step'), 'any');
    assertEqual(els.count.getAttribute('step'), '1');
    assertEqual(els.alphaText.type, 'text', 'ausdrücklicher type bleibt');
  });

  test('data-help-key aus dem Feldnamen, vorhandener bleibt', async () => {
    const { els } = await mount();
    assertEqual(els.alpha.getAttribute('data-help-key'), 'modules.ft.fields.alpha.help');
    assertEqual(els.title.getAttribute('data-help-key'), 'eigener.schluessel');
  });
});

suite('x-field — Bindung', () => {
  test('Model → Feld', async () => {
    const { model, els } = await mount();
    assertEqual(els.alpha.value, '0.05');
    model.alpha = 0.1;
    await flush();
    assertEqual(els.alpha.value, '0.1');
  });

  test('gültige Eingabe mit Dezimalkomma', async () => {
    const { model, els } = await mount();
    change(els.alphaText, '0,2');
    assertEqual(model.alpha, 0.2);
  });

  test('ungültige Eingabe: Model bleibt, Feld zurück, markiert mit Bereich', async () => {
    const { model, els } = await mount();
    change(els.alphaText, '2');
    assertEqual(model.alpha, 0.05);
    assertEqual(els.alphaText.value, '0.05');
    assertEqual(els.alphaText.getAttribute('aria-invalid'), 'true');
    assertTrue(els.alphaText.title.startsWith('common.inputRejected|'), els.alphaText.title);
    change(els.alphaText, '0,3');
    assertEqual(els.alphaText.getAttribute('aria-invalid'), null, 'gültige Eingabe löscht die Marke');
  });

  test('beim Tippen: gültig übernehmen, ungültig still', async () => {
    const { model, els } = await mount();
    type(els.alphaText, '0,4');
    assertEqual(model.alpha, 0.4);
    type(els.alphaText, '0,');
    assertEqual(els.alphaText.getAttribute('aria-invalid'), null);
    assertEqual(els.alphaText.value, '0,', 'halbe Eingabe bleibt stehen');
  });

  test('leeres Feld bei nullable → null', async () => {
    const { model, els } = await mount();
    change(els.beta, '5');
    assertEqual(model.beta, 5);
    change(els.beta, '');
    assertEqual(model.beta, null);
  });

  test('Text, Checkbox, Auswahl', async () => {
    const { model, els } = await mount();
    type(els.title, 'Hallo');
    assertEqual(model.title, 'Hallo');
    els.on.checked = true; els.on.dispatchEvent(new Event('change'));
    assertEqual(model.on, true);
    change(els.mode, 'b');
    assertEqual(model.mode, 'b');
  });
});

suite('x-field — UI-State (state.<name>)', () => {
  test('Attribute und Anker aus der State-Spec', async () => {
    const { els } = await mount();
    assertEqual(els.level.type, 'number');
    assertEqual(els.level.getAttribute('min'), '0');
    assertEqual(els.level.getAttribute('max'), '5');
    assertEqual(els.level.getAttribute('step'), '1');
    assertEqual(els.level.getAttribute('data-help-key'), 'modules.ft.state.level.help');
    assertEqual(els.label.getAttribute('data-help-key'), 'modules.ft.state.label.help');
  });

  test('State → Feld', async () => {
    const { state, els } = await mount();
    assertEqual(els.level.value, '2');
    state.level = 3;
    await flush();
    assertEqual(els.level.value, '3');
  });

  test('gültige Eingabe wird geprüft geschrieben (Zahl, nicht Text)', async () => {
    const { state, els } = await mount();
    change(els.level, '4');
    assertEqual(state.level, 4);
    type(els.label, 'Hallo');
    assertEqual(state.label, 'Hallo');
  });

  test('ungültige Eingabe: State bleibt, Feld zurück, markiert', async () => {
    const { state, els } = await mount();
    change(els.level, '9');
    assertEqual(state.level, 2);
    assertEqual(els.level.value, '2');
    assertEqual(els.level.getAttribute('aria-invalid'), 'true');
    change(els.level, '1');
    assertEqual(state.level, 1);
    assertEqual(els.level.getAttribute('aria-invalid'), null);
  });
});

suite('x-field — Invarianten', () => {
  test('x-field: Ablehnung durch eine Invariante zeigt deren Text', async () => {
    registerFieldDirective(Alpine, { i18n: I18N });
    if (!Alpine.version) Alpine.start();
    const Range = defineModel({
      view: { from: number({ integer: true, min: 0, max: 23, default: 6 }), to: number({ integer: true, min: 1, max: 24, default: 22 }) },
      invariants: { order: { fields: ['from', 'to'], test(m) { return m.from < m.to; } } },
    });
    const model = new Range();
    const name = `fieldInv${Date.now()}`;
    Alpine.data(name, () => ({ model, moduleId: 'fx' }));
    const host = document.createElement('div');
    host.innerHTML = `<div x-data="${name}"><input x-field="model.from"></div>`;
    document.body.append(host);
    Alpine.initTree(host);
    await flush();
    const input = host.querySelector('input');
    input.value = '23';
    input.dispatchEvent(new Event('change'));
    assertEqual(model.from, 6);
    assertEqual(input.value, '6');
    assertEqual(input.getAttribute('aria-invalid'), 'true');
    assertEqual(input.title, 'modules.fx.invariants.order');
    host.remove();
  });
});

const Plan = defineModel({
  fields: {
    items: list(object({ id: text(), text: text({ trim: true, nonEmpty: true }), due: date({ empty: true }) })),
    risks: list(object({ id: text(), actions: list(object({ id: text(), owner: text() })) })),
  },
  view: { mode: oneOf(['a', 'b']) },
  commands: { removeItem: command({ params: { id: idOf('items') }, run({ id }) { this.items = this.items.filter((x) => x.id !== id); } }) },
});

async function mountList(html, json) {
  registerFieldDirective(Alpine, { i18n: I18N });
  if (!Alpine.version) Alpine.start();
  const name = `fieldList${++n}`;
  const model = Plan.fromJSON(json);
  Alpine.data(name, () => ({ model, moduleId: 'fl', modes: ['a', 'b'] }));
  const host = document.createElement('div');
  host.innerHTML = `<div x-data="${name}">${html}</div>`;
  document.body.append(host);
  Alpine.initTree(host);
  await flush();
  return { host, model: Alpine.$data(host.firstElementChild).model, $$: (s) => [...host.querySelectorAll(s)] };
}

const LIST = { items: [{ id: 'a', text: 'eins', due: '' }, { id: 'b', text: 'zwei', due: '2026-03-01' }], risks: [{ id: 'r', actions: [{ id: 'x', owner: 'Ana' }] }] };

suite('x-field auf Listeneinträgen', () => {
  test('Form item.<feld>: lesen, schreiben, Anker', async () => {
    const { host, model, $$ } = await mountList('<template x-for="item in model.items" :key="item.id"><input class="t" x-field="item.text"></template>', LIST);
    const [a, b] = $$('input.t');
    assertEqual(a.value, 'eins');
    assertEqual(b.getAttribute('data-help-key'), 'modules.fl.fields.items.text.help');
    change(b, '  drei ');
    assertEqual(model.items[1].text, 'drei');
    host.remove();
  });

  test('Form model.<liste>[i].<feld>: Index frisch nach Umsortieren', async () => {
    const { host, model, $$ } = await mountList('<template x-for="(item, i) in model.items" :key="item.id"><input class="t" x-field="model.items[i].text"></template>', LIST);
    model.items = [model.items[1], model.items[0]];
    await flush();
    const [first] = $$('input.t');
    assertEqual(first.value, 'zwei');
    change(first, 'vier');
    assertEqual(model.items[0].text, 'vier');
    assertEqual(model.items[1].text, 'eins');
    host.remove();
  });

  test('verschachtelt: Anker ohne Index, Ablehnung setzt zurück', async () => {
    const { host, model, $$ } = await mountList(
      '<template x-for="r in model.risks" :key="r.id"><template x-for="act in r.actions" :key="act.id"><input class="o" x-field="act.owner"></template></template>', LIST);
    const [o] = $$('input.o');
    assertEqual(o.getAttribute('data-help-key'), 'modules.fl.fields.risks.actions.owner.help');
    change(o, 'Bo');
    assertEqual(model.risks[0].actions[0].owner, 'Bo');
    host.remove();
    const { host: h2, model: m2, $$: q2 } = await mountList('<template x-for="item in model.items" :key="item.id"><input class="t" x-field="item.text"></template>', LIST);
    const [t] = q2('input.t');
    change(t, '   ');
    assertEqual(m2.items[0].text, 'eins');
    assertEqual(t.value, 'eins');
    assertEqual(t.getAttribute('aria-invalid'), 'true');
    h2.remove();
  });

  test('date-Feld bekommt type=date', async () => {
    const { host, $$ } = await mountList('<template x-for="item in model.items" :key="item.id"><input class="d" x-field="item.due"></template>', LIST);
    assertEqual($$('input.d')[1].type, 'date');
    assertEqual($$('input.d')[1].value, '2026-03-01');
    host.remove();
  });

  test('Schlüsselfeld, fremder Eintrag und Schema-Fehler werfen beim Einbau', async () => {
    registerFieldDirective(Alpine, { i18n: I18N });
    const name = `fieldListErr${++n}`;
    const model = Plan.fromJSON(LIST);
    Alpine.data(name, () => ({ model, moduleId: 'fl', other: { text: 'x' } }));
    const build = (html) => { const h = document.createElement('div'); h.innerHTML = `<div x-data="${name}">${html}</div>`; return h; };
    // Direktes Element statt x-for-Klon: der Wurf kommt sicher synchron an.
    assertThrows(() => Alpine.initTree(build('<input x-field="model.items[0].id">')),
      /x-field="model\.items\[0\]\.id": id is the key of items and cannot be edited/);
    assertThrows(() => Alpine.initTree(build('<input x-field="other.text">')), /x-field="other\.text": other is not an entry of a list field of the model/);
    assertThrows(() => Alpine.initTree(build('<input x-field="model.items.text">')), /x-field="model\.items\.text": text does not match the schema/);
  });

  test('select mit Optionen aus x-for zeigt den Wert', async () => {
    const { host, $$ } = await mountList('<select class="s" x-field="model.mode"><template x-for="v in modes" :key="v"><option :value="v" x-text="v"></option></template></select>',
      { ...LIST, mode: 'b' });
    await flush();
    assertEqual($$('select.s')[0].value, 'b');
    host.remove();
  });

  test('select: sofort abgebaut, kein Fehler aus dem aufgeschobenen Abgleich', async () => {
    registerFieldDirective(Alpine, { i18n: I18N });
    if (!Alpine.version) Alpine.start();
    const name = `fieldSelectGone${++n}`;
    Alpine.data(name, () => ({ model: new M(), moduleId: 'ft' }));
    const host = document.createElement('div');
    host.innerHTML = `<div x-data="${name}"><select x-field="model.mode"><option value="a">a</option><option value="b">b</option></select></div>`;
    document.body.append(host);
    const errors = [];
    const onError = (ev) => { errors.push(ev.message); ev.preventDefault(); };
    window.addEventListener('error', onError);
    try {
      // Wie ein abgelöstes Modul: einbauen und im selben Takt wieder abbauen.
      Alpine.initTree(host);
      Alpine.destroyTree(host);
      host.replaceChildren();
      await flush();
      await flush();
    } finally {
      window.removeEventListener('error', onError);
      host.remove();
    }
    assertEqual(errors.join(' | '), '');
  });
});

suite('x-field auf columnRef', () => {
  const Cols = defineModel({ fields: {
    colRef1: columnRef({ types: ['numeric'], minCount: 3 }),
    colRefsK: list(columnRef({ types: ['numeric'], minCount: 3, nullable: false })),
  } });
  const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });

  /** Stub-Picker: zeichnet die Auswahl als Text, ruft onChange auf Zuruf. */
  const mounted = [];
  registerFieldWidget('columnRef', (el, target, services) => {
    const w = { el, target, services, synced: [], destroyed: false,
      sync(v) { this.synced.push(JSON.parse(JSON.stringify(v))); },
      destroy() { this.destroyed = true; } };
    mounted.push(w);
    return w;
  });

  async function mountCols(html) {
    mounted.length = 0;
    if (!Alpine.version) Alpine.start();
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => 'de' } });
    const name = `colsTest${Math.random().toString(36).slice(2)}`;
    const model = new Cols();
    const services = { eventBus: {}, stateManager: {}, i18n: {} };
    Alpine.data(name, () => {
      const comp = { model, moduleId: 'demo', box: { show: true } };
      Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { services }; } });
      return comp;
    });
    const host = document.createElement('div');
    host.innerHTML = `<div x-data="${name}">${html}</div>`;
    document.body.append(host);
    Alpine.initTree(host);
    await flush();
    return { host, services, data: () => Alpine.$data(host.firstElementChild) };
  }

  test('Picker eingehängt, Dienste und Spec übergeben, Hilfe-Anker gesetzt', async () => {
    const { host, services } = await mountCols('<div class="pick" x-field="model.colRef1"></div><div x-field="model.colRefsK"></div>');
    assertEqual(mounted.length, 2);
    assertTrue(mounted[0].services === services);
    assertEqual(mounted[0].target.spec.kind, 'columnRef');
    assertEqual(mounted[1].target.spec.kind, 'list');
    assertEqual(host.querySelector('.pick').getAttribute('data-help-key'), 'modules.demo.fields.colRef1.help');
    host.remove();
  });

  test('Wahl im Picker landet geprüft im Model', async () => {
    const { host, data } = await mountCols('<div x-field="model.colRef1"></div>');
    mounted[0].target.set(ref('c1'));
    assertDeepEqual(data().model.colRef1, ref('c1'));
    let caught = null;
    try { mounted[0].target.set({ instanceId: 'x' }); } catch (err) { caught = err; }
    assertTrue(caught === null, 'Ablehnung wirft nicht aus dem Picker heraus');
    assertTrue(host.querySelector('[x-field]').getAttribute('aria-invalid') === 'true');
    assertDeepEqual(data().model.colRef1, ref('c1'));
    host.remove();
  });

  test('Model-Änderung wird in den Picker gespiegelt', async () => {
    const { host, data } = await mountCols('<div x-field="model.colRefsK"></div>');
    data().model.colRefsK = [ref('a'), ref('b')];
    await flush();
    assertDeepEqual(mounted[0].synced.at(-1), [ref('a'), ref('b')]);
    host.remove();
  });

  test('Abbau mit dem Element', async () => {
    const { host, data } = await mountCols('<template x-if="box.show"><div x-field="model.colRef1"></div></template>');
    data().box.show = false;
    await flush();
    assertTrue(mounted[0].destroyed);
    host.remove();
  });

  test('auf <select> wirft beim Einbau', async () => {
    let caught = null;
    const onErr = (e) => { caught = e.error ?? e.reason; e.preventDefault?.(); };
    window.addEventListener('error', onErr);
    try { await mountCols('<select x-field="model.colRef1"></select>'); } catch (err) { caught = err; }
    window.removeEventListener('error', onErr);
    assertTrue(/needs a host element/.test(String(caught?.message ?? caught)), String(caught));
  });
});
