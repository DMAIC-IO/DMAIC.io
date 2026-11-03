/**
 * Tests for core/field-directive.js — x-field bindet ein Formularfeld an ein
 * Feld des deklarativen Models, mit Attributen und Prüfanzeige aus dem Schema.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { defineModel, text, number, oneOf, boolean } from '../../js/core/model.js';

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

const I18N = { t: (k, p) => (p ? `${k}|${p.range}` : k), getLanguage: () => 'de' };
const flush = () => new Promise(r => setTimeout(r, 0));

let n = 0;
async function mount() {
  registerFieldDirective(Alpine, { i18n: I18N });
  if (!Alpine.version) Alpine.start();
  const name = `fieldTest${++n}`;
  const model = new M();
  Alpine.data(name, () => ({ model, moduleId: 'ft' }));
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
  };
  for (const v of ['a', 'b']) { const o = document.createElement('option'); o.value = v; o.textContent = v; els.mode.append(o); }
  host.append(root);
  document.body.append(host);
  Alpine.initTree(host);
  await flush();
  return { model: Alpine.$data(root).model, els };
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
