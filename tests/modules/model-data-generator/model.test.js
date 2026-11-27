/**
 * Tests for modules/model-data-generator/domain/model.js — Vorgaben und
 * gespeicherte Form, die Kommandos samt Ablehnungen und Rücksetzen der
 * Koeffizienten, die Invarianten (beim Schreiben abgelehnt, beim Laden
 * repariert), die Ableitungen `terms` und `generated`, `hasContent` und die
 * Lesefläche.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/model-data-generator/domain/model.js';
import { setModelName, setFields } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { storedSource } from '../../helpers/stored-source.js';

setModelName(State, 'model-data-generator');

const SCHEMA = { _schema: { name: 'model-data-generator', version: '1.1' } };
const plain = (v) => JSON.parse(JSON.stringify(v));
/** @param {() => any} fn @returns {any} */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}
/** @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(plain(j), { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}
const derived = (m) => evaluateDerived(m, storedSource({}));

suite('model-data-generator Model — Vorgaben und Form', () => {
  test('neues Model wie die Altform: drei Faktoren, β₀ 50, Y, random, 100, σε 2, Seed 42, keine β', () => {
    const m = new State();
    assertDeepEqual(plain(m.factors), [
      { name: 'Temperatur', min: 150, max: 250 }, { name: 'Druck', min: 1, max: 10 }, { name: 'Zeit', min: 5, max: 60 },
    ]);
    assertDeepEqual([m.maxOrder, m.intercept, m.yName, m.samplingMethod, m.sampleSize, m.noiseStd, m.seed],
      [3, 50, 'Y', 'random', 100, 2, 42]);
    assertDeepEqual(plain(m.betas), {});
    assertEqual(m.hasContent(), false);
  });

  test('toJSON trägt _schema 1.1; ein gespeicherter Stand lädt streng unverändert', () => {
    const m = new State();
    m.setBeta({ index: 1, value: 2.5 });
    const j = plain(m.toJSON());
    assertDeepEqual(j._schema, SCHEMA._schema);
    assertDeepEqual(j.betas, { 1: 2.5 });
    assertDeepEqual(plain(State.fromJSON(j).toJSON()), j);
  });

  test('Feldgrenzen: Umfang 10–100000 ganzzahlig, σε ≥ 0, Seed ganzzahlig, Verfahren aus der Liste', () => {
    const m = new State();
    for (const bad of [{ sampleSize: 9 }, { sampleSize: 100001 }, { sampleSize: 10.5 }, { noiseStd: -0.1 },
      { seed: 1.5 }, { samplingMethod: 'sobol' }, { maxOrder: -1 }]) {
      assertTrue(thrown(() => setFields(m, bad)) !== null, JSON.stringify(bad));
    }
    setFields(m, { sampleSize: 10, noiseStd: 0, seed: -3, samplingMethod: 'lhs', intercept: -1e7, yName: '' });
    assertDeepEqual([m.sampleSize, m.noiseStd, m.seed, m.samplingMethod, m.intercept, m.yName], [10, 0, -3, 'lhs', -1e7, '']);
  });
});

suite('model-data-generator Model — Kommandos', () => {
  test('addFactor hängt Faktor_<n+1> 0–100 an, liefert den Index und setzt alle β zurück', () => {
    const m = new State();
    m.setBeta({ index: 0, value: 3 });
    assertEqual(m.addFactor({}), 3);
    assertDeepEqual(plain(m.factors[3]), { name: 'Faktor_4', min: 0, max: 100 });
    assertDeepEqual(plain(m.betas), {});
  });

  test('removeFactor entfernt und setzt β zurück; der letzte Faktor wird abgelehnt', () => {
    const m = new State();
    m.setBeta({ index: 0, value: 3 });
    m.removeFactor({ index: 1 });
    assertDeepEqual(m.factors.map((f) => f.name), ['Temperatur', 'Zeit']);
    assertDeepEqual(plain(m.betas), {});
    m.removeFactor({ index: 0 });
    const err = thrown(() => m.removeFactor({ index: 0 }));
    assertEqual(err?.param, 'index');
    assertEqual(m.factors.length, 1);
    assertEqual(thrown(() => m.removeFactor({ index: 5 }))?.param, 'index');
  });

  test('setFactor: Name frei, nicht leer, kein anderer Faktor, nicht Y; β bleiben', () => {
    const m = new State();
    m.setBeta({ index: 0, value: 3 });
    m.setFactor({ index: 0, key: 'name', value: 'Temp' });
    assertEqual(m.factors[0].name, 'Temp');
    assertDeepEqual(plain(m.betas), { 0: 3 });
    for (const value of ['', '  ', 'Druck', 'Y', 7]) {
      assertEqual(thrown(() => m.setFactor({ index: 0, key: 'name', value }))?.param, 'value', JSON.stringify(value));
    }
    assertEqual(m.factors[0].name, 'Temp');
  });

  test('setFactor: Grenzen mit min ≤ max, Textzahlen angenommen', () => {
    const m = new State();
    m.setFactor({ index: 1, key: 'min', value: '2.5' });
    m.setFactor({ index: 1, key: 'max', value: 2.5 });
    assertDeepEqual(plain(m.factors[1]), { name: 'Druck', min: 2.5, max: 2.5 });
    assertEqual(thrown(() => m.setFactor({ index: 1, key: 'min', value: 3 }))?.param, 'value');
    assertEqual(thrown(() => m.setFactor({ index: 1, key: 'max', value: 2 }))?.param, 'value');
    assertEqual(thrown(() => m.setFactor({ index: 1, key: 'max', value: 'x' }))?.param, 'value');
    assertTrue(thrown(() => m.setFactor({ index: 1, key: 'unit', value: 1 })) !== null);
  });

  test('setBeta: Termindex der Terme, 0 löscht den Schlüssel, Textzahlen angenommen', () => {
    const m = new State();
    m.setBeta({ index: 6, value: '-1.5' });
    assertDeepEqual(plain(m.betas), { 6: -1.5 });
    m.setBeta({ index: 6, value: 0 });
    assertDeepEqual(plain(m.betas), {});
    assertEqual(thrown(() => m.setBeta({ index: 7, value: 1 }))?.param, 'index');
    assertEqual(thrown(() => m.setBeta({ index: 0, value: 'abc' }))?.param, 'value');
  });
});

suite('model-data-generator Model — Invarianten', () => {
  test('factorRange: min > max beim Schreiben abgelehnt, beim Laden getauscht', () => {
    const m = new State();
    const err = thrown(() => setFields(m, { factors: [{ name: 'A', min: 5, max: 1 }] }));
    assertEqual(err?.invariant, 'factorRange');
    const { m: r, fields } = repaired({ ...SCHEMA, factors: [{ name: 'A', min: 5, max: 1 }, { name: 'B', min: 0, max: 1 }] });
    assertDeepEqual(fields, ['factors']);
    assertDeepEqual(plain(r.factors), [{ name: 'A', min: 1, max: 5 }, { name: 'B', min: 0, max: 1 }]);
  });

  test('factorCount: leere Liste abgelehnt, beim Laden die Vorgaben', () => {
    assertEqual(thrown(() => setFields(new State(), { factors: [] }))?.invariant, 'factorCount');
    const { m } = repaired({ ...SCHEMA, factors: [] });
    assertEqual(m.factors.length, 3);
  });

  test('betaKeys: Schlüssel ≥ Termzahl oder β = 0 abgelehnt, beim Laden verworfen', () => {
    const m = new State();
    assertEqual(thrown(() => setFields(m, { betas: { 7: 1 } }))?.invariant, 'betaKeys');
    assertEqual(thrown(() => setFields(m, { betas: { 1: 0 } }))?.invariant, 'betaKeys');
    m.setBeta({ index: 6, value: 2 });
    assertEqual(thrown(() => setFields(m, { factors: plain(m.factors).slice(0, 2) }))?.invariant, 'betaKeys');
    const { m: r, fields } = repaired({ ...SCHEMA, betas: { 0: 1, 1: 0, 9: 4 } });
    assertDeepEqual(fields, ['betas', 'factors', 'maxOrder']);
    assertDeepEqual(plain(r.betas), { 0: 1 });
  });
});

suite('model-data-generator Model — Ableitungen, hasContent, Lesefläche', () => {
  test('terms: alle Terme mit Name, Ordnung und β, auch die Nullen', () => {
    const m = new State();
    m.setBeta({ index: 1, value: -0.8 });
    const t = derived(m).terms;
    assertEqual(t.length, 7);
    assertDeepEqual(t[1], { index: 1, label: 'Temperatur × Druck', order: 2, beta: -0.8 });
    assertDeepEqual(t[2], { index: 2, label: 'Temperatur × Druck × Zeit', order: 3, beta: 0 });
  });

  test('generated: nie null, folgt dem Model, gleiche Werte wie die Altform', () => {
    const m = new State();
    m.setBeta({ index: 0, value: 1.5 });
    m.setBeta({ index: 1, value: -0.8 });
    const g = derived(m).generated;
    assertEqual(g.n, 100);
    assertEqual(g.mean.toFixed(4), '50.3139');
    assertEqual(g.sd.toFixed(4), '2.0286');
    assertEqual(g.min.toFixed(4), '43.9179');
    assertEqual(g.max.toFixed(4), '55.0966');
    setFields(m, { sampleSize: 10 });
    assertEqual(derived(m).generated.n, 10);
  });

  test('hasContent wie die Altform: β₀, Y-Name, β, Faktoren; nicht Verfahren, Umfang, Rauschen, Seed', () => {
    const m = new State();
    setFields(m, { samplingMethod: 'lhs', sampleSize: 20, noiseStd: 0, seed: 1 });
    assertEqual(m.hasContent(), false);
    for (const change of [
      (x) => setFields(x, { intercept: 0 }), (x) => setFields(x, { yName: 'Z' }),
      (x) => x.setBeta({ index: 0, value: 1 }), (x) => x.addFactor({}),
      (x) => x.setFactor({ index: 0, key: 'max', value: 300 }),
    ]) {
      const n = new State();
      change(n);
      assertEqual(n.hasContent(), true);
    }
  });

  test('read(): Felder und Ableitungen; Kommandos mit Objekt-Argument', () => {
    const entry = schemaAgentEntry(State);
    const m = new State();
    const out = readSchemaModel(entry, m, undefined, derived(m));
    assertDeepEqual(Object.keys(out), [
      'factors', 'maxOrder', 'betas', 'intercept', 'yName', 'samplingMethod', 'sampleSize', 'noiseStd', 'seed',
      'terms', 'generated',
    ]);
    assertDeepEqual(Object.keys(State.schema.commands), ['addFactor', 'removeFactor', 'setFactor', 'setBeta']);
  });
});
