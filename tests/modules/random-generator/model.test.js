/**
 * Tests for modules/random-generator/domain/model.js — Vorgaben und
 * gespeicherte Form, strenges Laden '1.0', die Invarianten (M5 und
 * eindeutige ids: beim Schreiben abgelehnt, beim Laden mit Reparatur geheilt),
 * die Kommandos samt Ablehnungen, die Ableitungen `generated`,
 * `activeParams` und `targetColumns`, `hasContent` und die Lesefläche.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State, MAX_COUNT } from '../../../js/modules/random-generator/domain/model.js';
import { requireTarget, parseTarget } from '../../../js/core/worksheet-targets.js';
import { setModelName, setFields } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { storedSource } from '../../helpers/stored-source.js';

setModelName(State, 'random-generator');

const SCHEMA = { _schema: { name: 'random-generator', version: '1.0' } };
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
/** Gespeicherter Stand mit geänderten Parametern einer Verteilung. */
function withParams(dist, values, over = {}) {
  const j = plain(new State().toJSON());
  j.params[dist] = { ...j.params[dist], ...values };
  return { ...j, ...over };
}
/** @param {object} m @param {any} [src] */
const derived = (m, src) => evaluateDerived(m, src);

suite('random-generator Model — Vorgaben und Form', () => {
  test('neues Model: keine Verteilung, Vorgaben wie die Altform, Kategorien A/B/C mit festen ids', () => {
    const m = new State();
    assertEqual(m.currentDist, null);
    assertEqual(m.count, 1000);
    assertEqual(m.seed, 42);
    assertEqual(m.attrCount, 50);
    assertEqual(m.attrSeed, 42);
    assertDeepEqual(plain(m.attributes), [
      { id: 'a1', name: 'A', weight: 1 }, { id: 'a2', name: 'B', weight: 2 }, { id: 'a3', name: 'C', weight: 7 },
    ]);
    assertDeepEqual(plain(m.params.normal), { mu: 0, sigma: 1, epsilon: 0, delta: 1 });
    assertEqual(Object.keys(m.params).length, 25);
    assertEqual(m.hasContent(), false);
    assertEqual(MAX_COUNT, 100000);
  });

  test('toJSON → fromJSON ist verlustfrei, streng geladen', () => {
    const m = new State();
    setFields(m, { currentDist: 'triangular', seed: null, count: 12, attrSeed: 0 });
    const j = plain(m.toJSON());
    assertDeepEqual(j._schema, SCHEMA._schema);
    const r = State.fromJSON(plain(j));
    assertDeepEqual(plain(r.toJSON()), j);
    assertEqual(r.seed, null);
    assertEqual(r.hasContent(), true);
  });

  test('Feldgrenzen: Umfang 1–100 000 ganz, Startwert ganz oder leer, Gewicht ab 0', () => {
    const m = new State();
    for (const [values, param] of [
      [{ count: 0 }, 'count'], [{ count: 100001 }, 'count'], [{ count: 2.5 }, 'count'],
      [{ seed: 1.5 }, 'seed'], [{ attrCount: 0 }, 'attrCount'], [{ currentDist: 'nope' }, 'currentDist'],
    ]) {
      const err = thrown(() => setFields(m, values));
      assertTrue(err !== null, JSON.stringify(values));
      assertEqual(err.param, param, JSON.stringify(values));
    }
    setFields(m, { seed: -7, attrSeed: null, count: 100000 });
    assertEqual(m.seed, -7);
    assertEqual(m.attrSeed, null);
    const sigma = thrown(() => setFields(m, { params: { ...plain(m.params), normal: { mu: 0, sigma: 0, epsilon: 0, delta: 1 } } }));
    assertEqual(sigma?.param, 'params');
    assertTrue(/params\.normal\.sigma/.test(sigma.message), sigma?.message);
  });
});

suite('random-generator Model — Invarianten (M5)', () => {
  const CASES = [
    ['uniformOrder', 'uniform', { a: 3, b: 1 }, { a: 1, b: 3 }],
    ['triangularOrder', 'triangular', { a: 2, c: 5, b: 1 }, { a: 1, c: 2, b: 5 }],
    ['triangularOrder', 'triangular', { a: 0, c: -1, b: 1 }, { a: -1, c: 0, b: 1 }],
    ['hyperK', 'hypergeometric', { N: 20, K: 30, n: 10 }, { N: 20, K: 20, n: 10 }],
    ['hyperN', 'hypergeometric', { N: 5, K: 3, n: 8 }, { N: 5, K: 3, n: 5 }],
  ];
  for (const [name, dist, bad, fixed] of CASES) {
    test(`${name}: Schreiben abgelehnt, strenges Laden wirft, Reparatur minimal`, () => {
      const m = new State();
      const err = thrown(() => setFields(m, { params: { ...plain(m.params), [dist]: { ...plain(m.params[dist]), ...bad } } }));
      assertTrue(err !== null);
      assertEqual(err.invariant, name);
      assertDeepEqual(plain(m.params[dist]), plain(new State().params[dist]), 'nichts geschrieben');
      assertTrue(thrown(() => State.fromJSON(plain({ ...SCHEMA, ...withParams(dist, bad) }))) !== null);
      const { m: r, fields } = repaired({ ...SCHEMA, ...withParams(dist, bad) });
      assertTrue(fields.includes('params'), fields.join());
      assertDeepEqual(plain(r.params[dist]), fixed);
    });
  }

  test('Gleichheit ist erlaubt (schwache Ordnung)', () => {
    const m = new State();
    setFields(m, { params: { ...plain(m.params), uniform: { a: 2, b: 2 }, triangular: { a: 1, c: 1, b: 1 }, hypergeometric: { N: 4, K: 4, n: 4 } } });
    assertDeepEqual(plain(m.params.uniform), { a: 2, b: 2 });
  });

  test('doppelte Kategorie-ids: abgelehnt, Reparatur verwirft die spätere', () => {
    const m = new State();
    const err = thrown(() => setFields(m, { attributes: [{ id: 'x', name: 'A', weight: 1 }, { id: 'x', name: 'B', weight: 1 }] }));
    assertEqual(err?.invariant, 'uniqueAttributeIds');
    const j = { ...SCHEMA, ...plain(new State().toJSON()), attributes: [{ id: 'x', name: 'A', weight: 1 }, { id: 'x', name: 'B', weight: 2 }] };
    const { m: r } = repaired(j);
    assertDeepEqual(plain(r.attributes), [{ id: 'x', name: 'A', weight: 1 }]);
  });
});

suite('random-generator Model — Kommandos', () => {
  test('addAttribute legt mit leerem Namen und Gewicht 1 an und liefert die neue id', () => {
    const m = new State();
    const id = m.addAttribute({});
    assertEqual(typeof id, 'string');
    assertTrue(id.length > 0 && !['a1', 'a2', 'a3'].includes(id));
    assertDeepEqual(plain(m.attributes.at(-1)), { id, name: '', weight: 1 });
  });

  test('removeAttribute entfernt, auch die letzte; unbekannte id abgelehnt', () => {
    const m = new State();
    m.removeAttribute({ attrId: 'a2' });
    assertDeepEqual(m.attributes.map((a) => a.id), ['a1', 'a3']);
    const err = thrown(() => m.removeAttribute({ attrId: 'zz' }));
    assertEqual(err?.param, 'attrId');
    m.removeAttribute({ attrId: 'a1' });
    m.removeAttribute({ attrId: 'a3' });
    assertEqual(m.attributes.length, 0);
  });

  test('setAttribute setzt Name (leer erlaubt) und Gewicht ab 0; Ablehnungen', () => {
    const m = new State();
    m.setAttribute({ attrId: 'a2', key: 'name', value: '' });
    m.setAttribute({ attrId: 'a2', key: 'weight', value: 0 });
    assertDeepEqual(plain(m.attributes[1]), { id: 'a2', name: '', weight: 0 });
    assertEqual(thrown(() => m.setAttribute({ attrId: 'a2', key: 'weight', value: -1 }))?.param, 'value');
    assertEqual(thrown(() => m.setAttribute({ attrId: 'a2', key: 'name', value: 4 }))?.param, 'value');
    assertEqual(thrown(() => m.setAttribute({ attrId: 'a2', key: 'id', value: 'q' }))?.param, 'key');
    assertEqual(thrown(() => m.setAttribute({ attrId: 'nope', key: 'name', value: 'q' }))?.param, 'attrId');
    assertDeepEqual(plain(m.attributes[1]), { id: 'a2', name: '', weight: 0 });
    // Textzahlen nimmt das Gewicht an wie die Altform.
    m.setAttribute({ attrId: 'a2', key: 'weight', value: '3' });
    assertEqual(m.attributes[1].weight, 3);
  });
});

suite('random-generator Model — Ableitungen', () => {
  test('generated: ohne Verteilung null; normal 5/2, n 200, Startwert 7 wie die Altform', () => {
    assertEqual(derived(new State()).generated, null);
    const { m } = repaired({ ...SCHEMA, ...withParams('normal', { mu: 5, sigma: 2 }, { currentDist: 'normal', count: 200, seed: 7 }) });
    const g = derived(m).generated;
    assertEqual(g.n, 200);
    const shown = ['mean', 'sd', 'median', 'min', 'max', 'skewness', 'kurtosis'].map((k) => g[k].toFixed(4));
    assertDeepEqual(shown, ['4.9574', '1.9468', '5.0713', '-0.3602', '8.6928', '-0.2218', '-0.5634']);
  });

  test('generated attributiv: n und Häufigkeit; ohne gültige Kategorie null', () => {
    const m = new State();
    setFields(m, { currentDist: 'attributive' });
    const g = derived(m).generated;
    assertEqual(g.n, 50);
    assertEqual(g.frequency.reduce((s, r) => s + r.share, 0).toFixed(6), '1.000000');
    setFields(m, { attributes: [{ id: 'q', name: '', weight: 5 }] });
    assertEqual(derived(m).generated, null);
  });

  test('generated: ein einzelner Wert hat keine Streuung (null statt NaN)', () => {
    const m = new State();
    setFields(m, { currentDist: 'normal', count: 1 });
    const g = derived(m).generated;
    assertEqual(g.n, 1);
    assertEqual(g.sd, null);
  });

  test('activeParams: Pfade der gewählten Verteilung, dann Umfang und Startwert', () => {
    const m = new State();
    assertDeepEqual(derived(m).activeParams, []);
    setFields(m, { currentDist: 'hypergeometric' });
    assertDeepEqual(derived(m).activeParams,
      ['params.hypergeometric.N', 'params.hypergeometric.K', 'params.hypergeometric.n', 'count', 'seed']);
    setFields(m, { currentDist: 'attributive' });
    assertDeepEqual(derived(m).activeParams, ['attrCount', 'attrSeed']);
  });

  test('targetColumns: je Blatt mit leerer Spalte die leeren Spalten, dann „neue Spalte“', () => {
    const ws = {
      sheets: [
        { id: 's1', name: 'Blatt 1', state: { columns: [{ id: 'c1', name: 'Voll', values: [1, 2] }, { id: 'c2', name: 'Leer', values: [] }, { id: 'c3', name: '', values: [null] }] } },
        { id: 's2', name: 'Blatt 2', state: { columns: [{ id: 'c4', name: 'X', values: [3] }] } },
      ],
    };
    const src = storedSource({ w1: ws });
    const targets = derived(new State(), src).targetColumns;
    assertDeepEqual(targets.map((t) => t.key), ['w1|s1|c2', 'w1|s1|c3', 'w1|s1|__new__']);
    assertEqual(targets[0].name, 'Leer');
    assertEqual(targets[2].name, 'Blatt 1');
    assertDeepEqual(derived(new State(), storedSource({})).targetColumns, []);
    requireTarget('w1|s1|c2', targets);
    assertEqual(thrown(() => requireTarget('w1|s1|c1', targets))?.param, 'target');
    assertDeepEqual(parseTarget('w1|s1|__new__'), { instanceId: 'w1', sheetId: 's1', columnId: '__new__' });
  });
});

suite('random-generator Model — Lesefläche', () => {
  const entry = schemaAgentEntry(State);
  const read = (m) => readSchemaModel(entry, m, undefined, evaluateDerived(m, storedSource({})));

  test('read(): die Felder und Ableitungen, ohne errorMsg, distributions, activeDistParams', () => {
    const m = new State();
    setFields(m, { currentDist: 'uniform' });
    const out = read(m);
    assertDeepEqual(Object.keys(out), [
      'currentDist', 'params', 'count', 'seed', 'attributes', 'attrCount', 'attrSeed',
      'generated', 'activeParams', 'targetColumns',
    ]);
    assertEqual(out.generated.n, 1000);
  });

  test('der Katalog nennt die drei Kommandos mit Objekt-Argument', () => {
    const names = Object.keys(State.schema.commands);
    assertDeepEqual(names, ['addAttribute', 'removeAttribute', 'setAttribute']);
  });
});
