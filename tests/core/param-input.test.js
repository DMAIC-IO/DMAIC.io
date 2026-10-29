import { suite, test, assertEqual, assertThrows } from '../test-utils.js';
import { paramInputMixin, numberCheck, describeRange } from '../../js/core/param-input.js';

const SPECS = { k: { min: 0.1, max: 10, step: 0.1 }, n: { min: 1, integer: true, nullable: true } };
const t = (key, vars) => (key === 'common.rangeAnd' ? 'und' : key === 'common.inputRejected' ? `nein: ${vars.range}` : key === 'common.rangeInteger' ? 'ganzzahlig' : key);

function vm(specs = SPECS, extra = {}) {
  const checks = {};
  for (const k of Object.keys(specs)) checks[k] = numberCheck(specs[k]);
  const o = { model: { k: 1, n: null }, written: [], setParam(key, v) { this.written.push([key, v]); this.model[key] = checks[key](v); } };
  return Object.assign(o, paramInputMixin({ specs, checks, t, ...extra }));
}
function input(value) {
  const attrs = {};
  return {
    value, title: '', dataset: {}, classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
    setAttribute(n, v) { attrs[n] = v; }, removeAttribute(n) { delete attrs[n]; }, getAttribute(n) { return attrs[n] ?? null; },
  };
}

suite('paramInputMixin', () => {
  test('gültige Eingabe geht an setParam und hebt eine frühere Ablehnung auf', () => {
    const v = vm(); const el = input('5');
    el.classList.add('field--error'); el.setAttribute('aria-invalid', 'true');
    v.onParamInput('k', { target: el });
    assertEqual(JSON.stringify(v.written), JSON.stringify([['k', '5']]));
    assertEqual(el.classList.contains('field--error'), false);
    assertEqual(el.getAttribute('aria-invalid'), null);
  });

  test('ungültige Eingabe wird abgewiesen: Feld zurück auf den Modellwert, markiert, kein Schreiben', () => {
    const v = vm(); const el = input('25');
    v.onParamInput('k', { target: el });
    assertEqual(v.written.length, 0);
    assertEqual(el.value, '1');
    assertEqual(el.classList.contains('field--error'), true);
    assertEqual(el.getAttribute('aria-invalid'), 'true');
    assertEqual(el.title.startsWith('nein: '), true);
  });

  test('leere Eingabe: bei nullable null, sonst Ablehnung', () => {
    const v = vm();
    v.onParamInput('n', { target: input('') });
    assertEqual(JSON.stringify(v.written), JSON.stringify([['n', null]]));
    const el = input('');
    v.onParamInput('k', { target: el });
    assertEqual(el.value, '1');
    assertEqual(el.getAttribute('aria-invalid'), 'true');
  });

  test('paramMin/Max/Step lesen die Spec; fehlende Grenze ist leer', () => {
    const v = vm();
    assertEqual(v.paramMin('k'), 0.1);
    assertEqual(v.paramMax('k'), 10);
    assertEqual(v.paramStep('k'), 0.1);
    assertEqual(v.paramMax('n'), null);
    assertEqual(v.paramStep('n'), 1);
  });

  test('Spec als Funktion des Viewmodels wird für Grenzen und Prüfung ausgewertet', () => {
    const v = vm({ s: (m) => ({ min: 2, max: m.model.k * 10, integer: true }) });
    assertEqual(v.paramMax('s'), 10);
    assertEqual(v.paramStep('s'), 1);
    const el = input('11');
    v.model.s = 4;
    v.onParamInput('s', { target: el });
    assertEqual(v.written.length, 0);
    assertEqual(el.value, '4');
    assertEqual(el.title, 'nein: ≥ 2 und ≤ 10, ganzzahlig');
  });

  test('Schlüssel ohne Spec: Hinweis ohne Bereichstext', () => {
    const v = vm({ x: { } });
    const el = input('abc');
    v.model.x = 3;
    v.onParamInput('x', { target: el });
    assertEqual(el.value, '3');
    assertEqual(el.getAttribute('aria-invalid'), 'true');
    assertEqual(el.title, 'common.inputRejectedPlain');
  });

  test('paramValue liest Punktpfade unter root; fehlender Wert wird zu leerem Text', () => {
    const v = vm(SPECS, { root: (m) => m.model });
    v.model.p = { q: 7 };
    assertEqual(v.paramValue('p.q'), 7);
    const el = input('abc');
    v.model.k = undefined;
    v.onParamInput('k', { target: el });
    assertEqual(el.value, '');
  });

  test('numberCheck wertet eine Funktions-Spec mit dem Viewmodel aus', () => {
    const check = numberCheck((m) => ({ min: 1, max: m.max }));
    assertThrows(() => check('9', { max: 5 }), /allowed/);
    assertEqual(check('4', { max: 5 }), 4);
  });

  test('fehlender Prüfer und Programmierfehler werden nicht als Ablehnung verschluckt', () => {
    const v = vm();
    assertThrows(() => v.onParamInput('zz', { target: input('1') }), /zz/);
    v.setParam = () => {};
    const bad = paramInputMixin({ specs: {}, checks: { a: () => { null.x; } }, t });
    assertThrows(() => bad.onParamInput.call({ paramValue: () => 1 }, 'a', { target: input('1') }), /null|undefined|Cannot/);
  });

  test('ein von der Vorlage gesetzter title wird gemerkt und wiederhergestellt', () => {
    const v = vm(); const el = input('25'); el.title = 'Vorlage';
    v.onParamInput('k', { target: el });
    assertEqual(el.title.startsWith('nein'), true);
    el.value = '3';
    v.onParamInput('k', { target: el });
    assertEqual(el.title, 'Vorlage');
  });

  test('numberCheck klemmt nicht', () => {
    assertThrows(() => numberCheck(SPECS.k)('25'), /allowed/);
    assertEqual(numberCheck(SPECS.k)('2.5'), 2.5);
  });

  test('describeRange beschreibt offene und geschlossene Grenzen', () => {
    assertEqual(describeRange({ min: 0.1, max: 10 }, 'de', t), '≥ 0,1 und ≤ 10');
    assertEqual(describeRange({ exclusiveMin: 0, exclusiveMax: 1 }, 'en', t), '> 0 und < 1');
    assertEqual(describeRange({ min: 1, integer: true }, 'de', t), '≥ 1, ganzzahlig');
  });
});
