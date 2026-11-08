/**
 * Tests for core/field-directive.js — x-field bindet ein Formularfeld an ein
 * Feld des deklarativen Models, mit Attributen und Prüfanzeige aus dem Schema.
 */
import { suite, test, assertEqual, assertTrue, assertThrows, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { defineModel, defineWidget, defineState, text, number, oneOf, boolean, list, object, command, idOf, date, time, columnRef } from '../../js/core/model.js';

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


/** `Alpine.reactive` zählen (der Zugriff ist ein Getter, darum über den Deskriptor). */
function countReactive(fn) {
  const desc = Object.getOwnPropertyDescriptor(Alpine, 'reactive');
  const orig = Alpine.reactive;
  const box = { n: 0 };
  Object.defineProperty(Alpine, 'reactive', { configurable: true, value: (...a) => { box.n++; return orig(...a); } });
  return Promise.resolve(fn(box)).finally(() => Object.defineProperty(Alpine, 'reactive', desc));
}

suite('x-field: Registry, Kanal, x-set', () => {
  const Cols0 = defineModel({ fields: { pick: columnRef({ types: ['numeric'], minCount: 3 }), n: number({ min: 0, max: 9, default: 1 }), mode: oneOf(['a', 'b']), day: date(), hour: time() } });
  const I18N_B = { t: (k) => `B:${k}`, getLanguage: () => 'de' };
  /** Ersatz für Test-Widgets: passt auf keine Feldart. */
  const INERT = { schema: { forKind: null }, mount() {} };

  async function mountHtml(html) {
    if (!Alpine.version) Alpine.start();
    const name = `regTest${Math.random().toString(36).slice(2)}`;
    const model = new Cols0();
    const services = { eventBus: {}, stateManager: {}, i18n: {} };
    Alpine.data(name, () => {
      const comp = { model, moduleId: 'demo' };
      Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { services }; } });
      return comp;
    });
    const host = document.createElement('div');
    host.innerHTML = `<div x-data="${name}">${html}</div>`;
    document.body.append(host);
    Alpine.initTree(host);
    await flush();
    return host;
  }

  /** Fehler aus dem Einbau einsammeln (Alpine meldet sie als error-Ereignis). */
  async function caught(fn) {
    let err = null;
    const onErr = (e) => { err = e.error ?? e.reason; e.preventDefault?.(); };
    window.addEventListener('error', onErr);
    try { await fn(); } catch (e) { err = e; }
    window.removeEventListener('error', onErr);
    return err;
  }

  test('columnRef ohne registriertes Widget wirft beim Einbau', async () => {
    // Die Registry je Alpine-Instanz ist dauerhaft: ein früher registrierter Spalten-Picker wird still gelegt und danach wiederhergestellt.
    registerFieldDirective(Alpine, { i18n: I18N, widgets: { 'column-picker': INERT } });
    let err;
    try {
      err = await caught(() => mountHtml('<div x-field="model.pick"></div>'));
    } finally {
      registerFieldDirective(Alpine, { i18n: I18N, widgets: { 'column-picker': WIDGETS['column-picker'] } });
    }
    assertTrue(/x-field model\.pick: no widget registered for columnRef/.test(String(err?.message ?? err)), String(err));
  });

  test('zweite Registrierung behält die ersten Widgets und nimmt die neue i18n', async () => {
    const mk = (n, value, kind, log) => ({ schema: defineWidget({ name: n, value, forKind: kind }), mount: () => { log.push(n); return {}; } });
    const log = [];
    try {
      registerFieldDirective(Alpine, { i18n: I18N, widgets: { 'w-day': mk('w-day', date(), 'date', log) } });
      registerFieldDirective(Alpine, { i18n: I18N_B, widgets: { 'w-hour': mk('w-hour', time(), 'time', log) } });
      const host = await mountHtml('<div x-field="model.day"></div><div x-field="model.hour"></div><input x-field="model.n">');
      assertEqual(log.sort().join(','), 'w-day,w-hour');
      const input = host.querySelector('input');
      input.value = '99';
      input.dispatchEvent(new Event('change'));
      assertTrue(input.title.startsWith('B:common.inputRejected'), input.title);
      host.remove();
    } finally {
      registerFieldDirective(Alpine, { i18n: I18N, widgets: { 'w-day': INERT, 'w-hour': INERT } });
    }
  });

  test('genau ein openChannel je x-field mit Widget', async () => {
    registerFieldDirective(Alpine, { i18n: I18N, widgets: { 'w-day': { schema: defineWidget({ name: 'w-day', value: date(), forKind: 'date' }), mount: () => ({}) } } });
    const orig = Alpine.$data;
    let calls = 0;
    Alpine.$data = function (...a) { calls++; return orig.apply(this, a); };
    let widgetCalls;
    let inputCalls;
    try {
      calls = 0;
      (await mountHtml('<div x-field="model.day"></div>')).remove();
      widgetCalls = calls;
      calls = 0;
      (await mountHtml('<input x-field="model.n">')).remove();
      inputCalls = calls;
    } finally {
      Alpine.$data = orig;
      registerFieldDirective(Alpine, { i18n: I18N, widgets: { 'w-day': INERT } });
    }
    // Beide Zweige brauchen gleich viele `Alpine.$data`-Zugriffe (Handler + ein Kanal + Wirt/Anker); gemessen: Differenz 0.
    // Ein zweiter Kanal im Widget-Zweig brachte vorher +2.
    assertEqual(widgetCalls - inputCalls, 0);
  });

  test('x-set legt kein Alpine.reactive je Kanal an', async () => {
    registerFieldDirective(Alpine, { i18n: I18N });
    // Alpine ruft reactive selbst (x-data); darum den Unterschied zu einer Gruppe ohne x-set zählen.
    const base = await countReactive(async (box) => { (await mountHtml('<div><button role="radio" value="a"></button></div>')).remove(); return box.n; });
    const withSet = await countReactive(async (box) => { (await mountHtml('<div x-set="model.mode"><button role="radio" value="a"></button><button role="radio" value="b"></button></div>')).remove(); return box.n; });
    assertEqual(withSet, base);
    const host = await mountHtml('<div x-set="model.mode"><button role="radio" value="a"></button><button role="radio" value="b"></button></div>');
    const first = host.querySelector('button[value="a"]');
    assertEqual(first.getAttribute('aria-checked'), 'true');
    host.remove();
  });
});

suite('x-field auf columnRef', () => {
  const Cols = defineModel({ fields: {
    colRef1: columnRef({ types: ['numeric'], minCount: 3 }),
    colRefsK: list(columnRef({ types: ['numeric'], minCount: 3, nullable: false })),
  } });
  const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
  const I18N_COLS = { t: (k) => k, getLanguage: () => 'de' };
  const TEST_WIDGETS = {};

  /** Stub-Widget: merkt sich Wert, Dienste, Effect-Läufe und den Abbau. */
  const mounted = [];
  const stubMount = (root, { value, services, effect }) => {
    const w = { root, value, services, seen: [], destroyed: false, destroy() { this.destroyed = true; } };
    effect(() => w.seen.push(JSON.parse(JSON.stringify(value.get() ?? null))));
    mounted.push(w);
    return w;
  };

  async function mountCols(html, Model = Cols) {
    mounted.length = 0;
    TEST_WIDGETS['column-picker'] = {
      schema: defineWidget({ name: 'column-picker', value: columnRef(), forKind: 'columnRef' }),
      mount: stubMount,
    };
    registerFieldDirective(Alpine, { i18n: I18N_COLS, widgets: TEST_WIDGETS });
    if (!Alpine.version) Alpine.start();
    const name = `colsTest${Math.random().toString(36).slice(2)}`;
    const model = new Model();
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

  test('Ablehnung durch eine Invariante im Widget-Zweig zeigt deren Hinweis', async () => {
    const Pair = defineModel({
      fields: { a: columnRef({ types: ['numeric'] }), b: columnRef({ types: ['numeric'] }) },
      invariants: { distinct: { fields: ['a', 'b'], test(m) { return !m.a || !m.b || m.a.columnId !== m.b.columnId; } } },
    });
    const { host } = await mountCols('<div class="a" x-field="model.a"></div><div class="b" x-field="model.b"></div>', Pair);
    assertTrue(mounted[0].value.set(ref('c1')));
    assertTrue(mounted[1].value.set(ref('c1')) === false);
    assertEqual(mounted[1].value.rejected.message, 'modules.demo.invariants.distinct');
    const b = host.querySelector('.b');
    assertEqual(b.getAttribute('aria-invalid'), 'true');
    assertEqual(b.title, 'modules.demo.invariants.distinct');
    host.remove();
  });

  test('Widget eingehängt, Dienste übergeben, Hilfe-Anker gesetzt, vorhandener Anker bleibt', async () => {
    const { host, services } = await mountCols('<div class="pick" x-field="model.colRef1"></div><div class="own" data-help-key="" x-field="model.colRefsK"></div>');
    assertEqual(mounted.length, 2);
    assertTrue(mounted[0].services.eventBus === services.eventBus);
    assertEqual(mounted[0].value.spec.kind, 'columnRef');
    assertEqual(mounted[1].value.spec.kind, 'list');
    assertTrue(host.querySelector('.pick > .widget-root') !== null);
    assertEqual(host.querySelector('.pick').getAttribute('data-help-key'), 'modules.demo.fields.colRef1.help');
    assertEqual(host.querySelector('.own').getAttribute('data-help-key'), '');
    host.remove();
  });

  test('Setzen landet geprüft im Model, Ablehnung markiert den Wirt', async () => {
    const { host, data } = await mountCols('<div x-field="model.colRef1"></div>');
    assertTrue(mounted[0].value.set(ref('c1')) === true);
    assertDeepEqual(data().model.colRef1, ref('c1'));
    assertTrue(mounted[0].value.set('kaputt') === false);
    assertEqual(host.querySelector('[x-field]').getAttribute('aria-invalid'), 'true');
    assertTrue(mounted[0].value.rejected.message.startsWith('common.inputRejected'), mounted[0].value.rejected.message);
    assertDeepEqual(data().model.colRef1, ref('c1'));
    mounted[0].value.set(ref('c2'));
    assertTrue(host.querySelector('[x-field]').getAttribute('aria-invalid') === null);
    host.remove();
  });

  test('Model-Änderung läuft in den Effect des Widgets', async () => {
    const { host, data } = await mountCols('<div x-field="model.colRefsK"></div>');
    data().model.colRefsK = [ref('a'), ref('b')];
    await flush();
    assertDeepEqual(mounted[0].seen.at(-1), [ref('a'), ref('b')]);
    host.remove();
  });

  test('Abbau mit dem Element', async () => {
    const { host, data } = await mountCols('<template x-if="box.show"><div x-field="model.colRef1"></div></template>');
    data().box.show = false;
    await flush();
    assertTrue(mounted[0].destroyed);
    host.remove();
  });

  test('list(columnRef) nimmt dasselbe Widget', async () => {
    const { host } = await mountCols('<div x-field="model.colRefsK"></div>');
    assertEqual(mounted.length, 1);
    assertEqual(mounted[0].value.spec.item.kind, 'columnRef');
    host.remove();
  });

  test('auf <select> wirft beim Einbau', async () => {
    let caught = null;
    const onErr = (e) => { caught = e.error ?? e.reason; e.preventDefault?.(); };
    window.addEventListener('error', onErr);
    try { await mountCols('<select x-field="model.colRef1"></select>'); } catch (err) { caught = err; }
    window.removeEventListener('error', onErr);
    assertTrue(/a columnRef field needs a host element \(div\), not <select>/.test(String(caught?.message ?? caught)), String(caught));
  });
});
