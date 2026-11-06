/**
 * Tests for core/field-directive.js — x-field bindet ein Formularfeld an ein
 * Feld des deklarativen Models, mit Attributen und Prüfanzeige aus dem Schema.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { defineModel, defineState, text, number, oneOf, boolean } from '../../js/core/model.js';

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
