/**
 * Tests for core/field-errors.js — `fieldError(path)` liest im Template die
 * letzte Ablehnung eines `x-field`; jede gültige Änderung des Felds oder
 * eines Invariantenpartners löscht sie.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { createFieldErrors } from '../../js/core/field-errors.js';
import { registerFieldDirective, rejectionHint } from '../../js/core/field-directive.js';
import { defineModel, number } from '../../js/core/model.js';

const Limits = defineModel({
  fields: {
    lsl: number({ nullable: true, default: null }),
    usl: number({ nullable: true, default: null }),
    sigma: number({ nullable: true, exclusiveMin: 0, default: null }),
  },
  invariants: { order: { fields: ['lsl', 'usl'], test(m) { return m.lsl === null || m.usl === null || m.lsl < m.usl; } } },
});

const ID = 'field-error-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;
const I18N = { t: (k, p) => (p ? `${k}|${p.range}` : k), tf: () => (k) => k, getLanguage: () => 'de' };
const flush = () => new Promise((r) => setTimeout(r, 0));

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = `<div x-data="fieldErrorTest">
    <input class="fe-lsl" x-field="model.lsl">
    <input class="fe-usl" x-field="model.usl">
    <input class="fe-sigma" x-field="model.sigma">
    <span class="fe-msg" x-text="fieldError('model.lsl')"></span>
  </div>`;
  document.body.append(tpl);
}

function fakeContext() {
  return {
    instanceId: 'fe-1',
    stateManager: { getModuleState: () => null, setModuleState: () => {}, getProjectCycle: () => 'dmaic', get: () => undefined },
    i18n: I18N,
    eventBus: { on: () => {}, off: () => {}, emit: () => {} },
    notify: () => {},
    dialog: { confirm: async () => true },
    theme: 'light',
    language: 'de',
  };
}

const makeModule = () => createModule({
  config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
  Model: Limits,
  view() { return {}; },
});

let current = null;

async function mount() {
  registerFieldDirective(Alpine, { i18n: I18N });
  ensureTemplate();
  if (current) { await current.mod.destroy(); current.container.remove(); }
  const mod = makeModule();
  const container = document.createElement('div');
  document.body.append(container);
  await mod.init(container, fakeContext());
  await flush();
  const q = (sel) => container.querySelector(sel);
  current = { mod, container };
  return {
    mod, container,
    vm: () => Alpine.$data(q('[x-data]')),
    els: { lsl: q('.fe-lsl'), usl: q('.fe-usl'), sigma: q('.fe-sigma'), msg: q('.fe-msg') },
  };
}

const change = (el, value) => { el.value = value; el.dispatchEvent(new Event('change')); };
const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input')); };
const sigmaHint = () => rejectionHint(Limits.schema.fields.sigma, I18N);

suite('createFieldErrors', () => {
  test('ohne Eintrag leer; set/clear; abweichender Wert löscht', () => {
    const errors = createFieldErrors(Alpine);
    const model = Alpine.reactive({ a: 1, b: 2 });
    assertEqual(errors.message('model.a'), '');
    errors.set('model.a', { message: 'nein', model, fields: ['a', 'b'] });
    assertEqual(errors.message('model.a'), 'nein');
    model.b = 3;
    assertEqual(errors.message('model.a'), '', 'Partnerwert weicht ab');
    errors.set('model.a', { message: 'nein', model, fields: ['a'] });
    errors.clear('model.a');
    assertEqual(errors.message('model.a'), '');
  });
});

suite('fieldError(path) — Feldregel', () => {
  test('Ablehnung bei change: Meldung = rejectionHint, Feld zeigt den alten Wert', async () => {
    const { vm, els } = await mount();
    change(els.sigma, '0');
    assertEqual(vm().fieldError('model.sigma'), sigmaHint());
    assertEqual(els.sigma.value, '');
    assertEqual(vm().model.sigma, null);
  });

  test('beim Tippen entsteht keine Meldung', async () => {
    const { vm, els } = await mount();
    type(els.sigma, '0');
    assertEqual(vm().fieldError('model.sigma'), '');
  });

  test('gültige Eingabe danach löscht', async () => {
    const { vm, els } = await mount();
    change(els.sigma, '0');
    change(els.sigma, '0.5');
    assertEqual(vm().fieldError('model.sigma'), '');
    assertEqual(vm().model.sigma, 0.5);
  });

  test('derselbe alte Wert über dasselbe Feld löscht', async () => {
    const { vm, els } = await mount();
    change(els.sigma, '2');
    change(els.sigma, '0');
    assertEqual(vm().fieldError('model.sigma'), sigmaHint());
    change(els.sigma, '2');
    assertEqual(vm().fieldError('model.sigma'), '');
  });

  test('Schreiben über den Model-Setter löscht', async () => {
    const { vm, els } = await mount();
    change(els.sigma, '0');
    vm().model.sigma = 3;
    assertEqual(vm().fieldError('model.sigma'), '');
  });
});

suite('fieldError(path) — Invariante', () => {
  test('LSL ≥ USL: Meldung der Invariante, im Template sichtbar', async () => {
    const { vm, els } = await mount();
    change(els.usl, '5');
    change(els.lsl, '7');
    assertEqual(vm().model.lsl, null);
    assertEqual(vm().fieldError('model.lsl'), `modules.${ID}.invariants.order`);
    await flush();
    assertEqual(els.msg.textContent, `modules.${ID}.invariants.order`);
  });

  test('Partner direkt ins Model geschrieben löscht, auch im Template', async () => {
    const { vm, els } = await mount();
    change(els.usl, '5');
    change(els.lsl, '7');
    vm().model.usl = 9;
    assertEqual(vm().fieldError('model.lsl'), '');
    await flush();
    assertEqual(els.msg.textContent, '');
  });
});

suite('fieldError(path) — Lebensdauer', () => {
  test('nach Abbau und Neuaufbau leer', async () => {
    const first = await mount();
    change(first.els.sigma, '0');
    assertEqual(first.vm().fieldError('model.sigma'), sigmaHint());
    const second = await mount();
    assertEqual(second.vm().fieldError('model.sigma'), '');
  });

  test('fieldError ist nicht aufzählbar', async () => {
    const { vm } = await mount();
    assertEqual(Object.keys(vm()).includes('fieldError'), false);
  });
});
