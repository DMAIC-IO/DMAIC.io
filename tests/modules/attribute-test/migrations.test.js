/**
 * Attributtest: Migration '0→1.0' (domain/migrations.js) — jeder Fall des
 * alten `State.fromJSON`, fehlendes gegen gespeichertes `null` bei α,
 * Rohtext → Zahl, Altprojekt und die sechs Beispiele ohne Reparatur.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/attribute-test/domain/migrations.js';
import { State } from '../../../js/modules/attribute-test/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'attribute-test');

const CTX = { cycle: 'dmaic', confidenceLevel: 90, power: 80 };
const plain = (v) => JSON.parse(JSON.stringify(v));
const EXAMPLES = ['attribute-scrap-before-after', 'attribute-reklamation-one', 'attribute-shift-pass-fail',
  'attribute-paint-defects-rates', 'attribute-supplier-equivalence', 'attribute-before-after-paired'];
const NO_REFS = { response: null, group: null, rowVar: null, colVar: null, counts: null, before: null, after: null };

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(plain(j), { repair: true, onRepair: (f) => fields.push(f), context: CTX });
  return { m, fields };
}

/** Die beiden Instanzen des Altprojekts aus den E2E-Fixtures (Task 0). */
export const LEGACY_A = {
  testKind: 'assoc', inputMode: 'summary', direction: 'less', alpha: 0.01, p0: '0.5', pooled: false, ratePooled: false,
  equiv: { samples: 2, symmetric: true, delta: '', lower: '', upper: '' }, exposurePerRow: '1',
  summary: {
    x: '', n: '', x1: '', n1: '', x2: '', n2: '', t: '', t1: '', t2: '', lambda0: '', diff0: '0',
    pairs: { labels: { before: '', after: '' }, counts: [['', ''], ['', '']] },
    table: { rows: ['Früh', 'Spät', 'Nacht'], cols: ['gut', 'Nacharbeit', 'Ausschuss'], counts: [['1 200', '40', '12'], ['980', '55', '20'], ['700', '80', '35']] },
  },
  colRefs: NO_REFS, eventValue: null, exampleWorksheetId: null,
};
export const LEGACY_B = {
  testKind: 'mcnemar', inputMode: 'columns', direction: 'two-sided', alpha: null, p0: 'abc', pooled: false, ratePooled: false,
  equiv: { samples: 2, symmetric: true, delta: '', lower: '', upper: '' }, exposurePerRow: '1',
  summary: {
    x: '', n: '', x1: '', n1: '', x2: '', n2: '', t: '', t1: '2,5', t2: '', lambda0: '', diff0: '0',
    pairs: { labels: { before: '', after: '' }, counts: [['', ''], ['', '']] },
    table: { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [['', ''], ['', '']] },
  },
  colRefs: {
    ...NO_REFS,
    before: { instanceId: '7d2a9c41-3e5b-4f68-9a1c-2b4d6e8f0a13', sheetId: 'sheet_1', columnId: 'col_at_vorher' },
    after: { instanceId: '7d2a9c41-3e5b-4f68-9a1c-2b4d6e8f0a13', sheetId: 'sheet_1', columnId: 'col_at_nachher' },
  },
  eventValue: 'defekt', exampleWorksheetId: null,
};

suite('attribute-test: Migration 0→1.0', () => {
  test('leerer Stand: Vorgaben, α fehlt (Kontext greift), keine Reparatur', () => {
    const { m, fields } = repaired({});
    assertDeepEqual(fields, []);
    assertEqual(m.testKind, 'two');
    assertEqual(m.alpha, 0.1);
    assertEqual(m.p0, 0.5);
    assertEqual(m.exposurePerRow, 1);
    assertEqual(m.summary.diff0, 0);
    assertDeepEqual(plain(m.summary.table.counts), [[null, null], [null, null]]);
  });
  test('Aufzählungen außerhalb der Liste → Vorgabe; Schalter nur als Wahrheitswert', () => {
    const o = from0({ testKind: 'x', inputMode: 'y', direction: 'up', pooled: 'ja', ratePooled: 1, equiv: { samples: 3, symmetric: 'no' } });
    assertEqual(o.testKind, 'two');
    assertEqual(o.inputMode, 'summary');
    assertEqual(o.direction, 'two-sided');
    assertEqual('pooled' in o, false);
    assertEqual('ratePooled' in o, false);
    assertEqual(o.equiv.samples, 2);
    assertEqual(o.equiv.symmetric, true);
    assertEqual(from0({ equiv: { samples: 1, symmetric: false } }).equiv.samples, 1);
  });
  test('α: fehlt → entfällt; null, Text, außerhalb (0; 1) → 0,05; sonst bleibt', () => {
    assertEqual('alpha' in from0({}), false);
    for (const a of [null, '0.01', 0, 1, 1.5, NaN]) assertEqual(from0({ alpha: a }).alpha, 0.05, String(a));
    assertEqual(from0({ alpha: 0.01 }).alpha, 0.01);
  });
  test('Anzahlen: Leerzeichen entfernt, nur Ziffern → Zahl, sonst null', () => {
    const o = from0({ summary: { x: ' 12 ', n: '1 200', x1: '3.5', n1: '-1', x2: 'abc', n2: 7 } });
    assertDeepEqual([o.summary.x, o.summary.n, o.summary.x1, o.summary.n1, o.summary.x2, o.summary.n2], [12, 1200, null, null, null, 7]);
  });
  test('Umfänge, λ₀, Umfang je Zeile: positive Zahl mit Komma, sonst null; fehlt → Vorgabe', () => {
    const o = from0({ exposurePerRow: '2,5', summary: { t: '12,5', t1: '0', t2: 'x', lambda0: '1.234,5' } });
    assertDeepEqual([o.summary.t, o.summary.t1, o.summary.t2, o.summary.lambda0, o.exposurePerRow], [12.5, null, null, 1234.5, 2.5]);
    assertEqual('exposurePerRow' in from0({ exposurePerRow: null }), false);
    assertEqual(from0({ exposurePerRow: '-1' }).exposurePerRow, null);
  });
  test('p₀ in (0; 1), sonst null; fehlt oder kein Text → Vorgabe', () => {
    assertEqual(from0({ p0: '0,1' }).p0, 0.1);
    assertEqual(from0({ p0: 'abc' }).p0, null);
    assertEqual(from0({ p0: '1' }).p0, null);
    assertEqual('p0' in from0({ p0: null }), false);
    assertEqual('p0' in from0({}), false);
  });
  test('Δ₀ und Äquivalenzgrenzen: endliche Zahl, sonst null; Δ₀ ohne Text → 0', () => {
    const o = from0({ summary: { diff0: 'abc' }, equiv: { delta: '1,5', lower: '-0.5', upper: '' } });
    assertEqual(o.summary.diff0, null);
    assertDeepEqual([o.equiv.delta, o.equiv.lower, o.equiv.upper], [1.5, -0.5, null]);
    assertEqual(from0({ summary: {} }).summary.diff0, 0);
    assertEqual(from0({ summary: { diff0: '' } }).summary.diff0, null);
  });
  test('Kreuztabelle wie sanitizeTable: ungültige Form → Vorgabe, Namen als Text, Zellen als Anzahl', () => {
    const fallback = { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[null, null], [null, null]] };
    assertDeepEqual(from0({ summary: { table: { counts: 'no' } } }).summary.table, fallback);
    assertDeepEqual(from0({ summary: { table: { rows: ['A'], cols: ['X', 'Y'], counts: [['1', '2']] } } }).summary.table, fallback);
    assertDeepEqual(from0({ summary: { table: { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [['1', '2'], ['3']] } } }).summary.table, fallback);
    assertDeepEqual(from0({ summary: { table: { rows: ['A', 7], cols: ['X', null], counts: [['1 200', ''], ['x', 4]] } } }).summary.table,
      { rows: ['A', '7'], cols: ['X', ''], counts: [[1200, null], [null, 4]] });
  });
  test('McNemar-Tafel wie sanitizePairs: Bezeichnungen als Text, Anzahlen nur 2 × 2', () => {
    assertDeepEqual(from0({ summary: { pairs: { labels: { before: 'Alt', after: 3 }, counts: [['1', '2'], ['3']] } } }).summary.pairs,
      { labels: { before: 'Alt', after: '3' }, counts: [[null, null], [null, null]] });
    assertDeepEqual(from0({ summary: { pairs: { counts: [['10', ''], ['2', '20']] } } }).summary.pairs.counts, [[10, null], [2, 20]]);
  });
  test('Spaltenbezüge nur in Bezugsform, fremde Schlüssel entfallen; Ereigniswert und Beispielblatt', () => {
    const o = from0({
      colRefs: { response: { instanceId: 'w', sheetId: 's', columnId: 'c', extra: 1 }, group: { instanceId: 'w' }, before: 'x' },
      eventValue: 3, exampleWorksheetId: 'ws-1', foreign: true,
    });
    assertDeepEqual(o.colRefs, { ...NO_REFS, response: { instanceId: 'w', sheetId: 's', columnId: 'c' } });
    assertEqual(o.eventValue, null);
    assertEqual(o.exampleWorksheetId, 'ws-1');
    assertEqual('foreign' in o, false);
  });
  test('Altprojekt (a): Zusammenhang 3 × 3, „1 200“ wird 1200, α 0,01, ohne Reparatur', () => {
    const { m, fields } = repaired(LEGACY_A);
    assertDeepEqual(fields, []);
    assertEqual(m.testKind, 'assoc');
    assertEqual(m.direction, 'less');
    assertEqual(m.alpha, 0.01);
    assertDeepEqual(plain(m.summary.table.counts), [[1200, 40, 12], [980, 55, 20], [700, 80, 35]]);
    assertDeepEqual(plain(m.summary.table.rows), ['Früh', 'Spät', 'Nacht']);
  });
  test('Altprojekt (b): McNemar über Spalten, α null → 0,05, p₀ „abc“ → null, t1 „2,5“ → 2,5, Ereigniswert bleibt', () => {
    const { m, fields } = repaired(LEGACY_B);
    assertDeepEqual(fields, []);
    assertEqual(m.alpha, 0.05);
    assertEqual(m.p0, null);
    assertEqual(m.summary.t1, 2.5);
    assertEqual(m.eventValue, 'defekt');
    assertDeepEqual(plain(m.colRefs.before), LEGACY_B.colRefs.before);
  });
  test('die sechs Beispiele laden ohne Reparatur', async () => {
    for (const id of EXAMPLES) {
      const data = await fetchJSON(new URL(`../../../examples/projects/${id}.json`, import.meta.url));
      const { sourceWorksheetFile, ...state } = data;
      const { fields } = repaired(state);
      assertDeepEqual(fields, [], id);
      State.fromJSON(plain(state), { context: CTX });
    }
  });
});
