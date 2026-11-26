/**
 * Tests for modules/pairwise-comparison/domain/migrations.js — '0→1.0'
 * übernimmt jeden Stand des alten `State.fromJSON`: Kriterien nur Texte,
 * Matrix und Paare als Listen von Listen (Nichtzahlen → 0, Länge bleibt,
 * Zahlen wörtlich), `currentPair` nur ganzzahlig ab 0, `viewPhase` aus den drei
 * Reitern; unbekannte Schlüssel entfallen. Dazu die goldenen Fixtures (AHP-
 * Matrix wörtlich), das Altprojekt aus den E2E-Fixtures und beide Beispiele
 * in der Form ohne `_schema` über das Model.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/pairwise-comparison/domain/migrations.js';
import { State } from '../../../js/modules/pairwise-comparison/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'pairwise-comparison');

const SCHEMA = { _schema: { name: 'pairwise-comparison', version: '1.0' } };
const EMPTY = { criteria: [], matrix: [], pairs: [], currentPair: 0, viewPhase: 'input' };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const EXAMPLES = new URL('../../../js/modules/pairwise-comparison/resources/examples/projects/', import.meta.url);
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Lesefläche ohne Mount. @param {object} m */
const read = (m) => readSchemaModel(schemaAgentEntry(State), m, undefined, evaluateDerived(m, /** @type {any} */ (undefined)));

/** Alle Paarvergleich-Zustände eines Exports. @param {any} v @param {any[]} [acc] @returns {any[]} */
function pairwiseStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => pairwiseStates(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'pairwise-comparison') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    }
    Object.values(v).forEach((x) => pairwiseStates(x, acc));
  }
  return acc;
}

/** Zustand der Instanz aus der E2E-Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY_STATE = {
  criteria: ['Kosten', 'Prüfaufwand; Stufe "B"', 'Lieferzeit', 'Service'],
  matrix: [[0, 1, 0.5, 1], [0, 0, 0, 1], [0.5, 1, 0, 0], [0, 0, 1, 0]],
  pairs: [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]],
  currentPair: 6,
  viewPhase: 'results',
};
/** Zustand der Instanz aus der E2E-Fixture `legacy-compare.json` (ohne `_schema`). */
const COMPARE_STATE = {
  ...LEGACY_STATE,
  matrix: [[0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 1, 0]],
  currentPair: 2,
  viewPhase: 'compare',
};

suite('pairwise-comparison Migration 0→1.0 — Fälle des alten fromJSON', () => {
  test('null, undefined, Nicht-Objekt und {} → Vorgaben', () => {
    for (const v of [null, undefined, 'x', 3, [], {}]) assertEqual(json(from0(v)), json(EMPTY), json(v));
  });

  test('ein vollständiger Stand bleibt wörtlich', () => {
    assertEqual(json(from0(plain(LEGACY_STATE))), json(LEGACY_STATE));
    assertEqual(json(from0(plain(COMPARE_STATE))), json(COMPARE_STATE));
  });

  test('Kriterien: nur Texte bleiben (auch leer), Reihenfolge bleibt', () => {
    assertDeepEqual(from0({ criteria: ['A', 1, null, '', { x: 1 }, 'B'] }).criteria, ['A', '', 'B']);
    assertDeepEqual(from0({ criteria: 'A' }).criteria, []);
  });

  test('Matrix: Nicht-Liste → [], Zeile als Nicht-Liste → [], Nichtzahl → 0, Länge bleibt', () => {
    assertDeepEqual(from0({ matrix: 'x' }).matrix, []);
    assertDeepEqual(from0({ matrix: [[1, 'a', null, 0.5], 3, [Infinity, NaN, true]] }).matrix, [[1, 0, 0, 0.5], [], [0, 0, 0]]);
  });

  test('Matrix: AHP-Zahlen bleiben wörtlich', () => {
    const m = [[1, 3, 5, 0.33], [0.33, 1, 3, 0.2], [0.2, 0.33, 1, 0.14], [3, 5, 7, 1]];
    assertDeepEqual(from0({ matrix: plain(m) }).matrix, m);
  });

  test('Paare: Nicht-Liste → [], Nicht-Ganzzahl → 0, Länge bleibt', () => {
    assertDeepEqual(from0({ pairs: {} }).pairs, []);
    assertDeepEqual(from0({ pairs: [[0, 1.5], 'x', [2, '3', 4]] }).pairs, [[0, 0], [], [2, 0, 4]]);
  });

  test('currentPair: nur eine Ganzzahl ab 0, sonst 0; nach oben keine Klemmung', () => {
    assertEqual(from0({ currentPair: 1.5 }).currentPair, 0);
    assertEqual(from0({ currentPair: '2' }).currentPair, 0);
    assertEqual(from0({ currentPair: 99 }).currentPair, 99);
    assertEqual(from0({ currentPair: -1 }).currentPair, 0);
  });

  test('viewPhase: einer der drei Reiter, sonst input', () => {
    for (const p of ['input', 'compare', 'results']) assertEqual(from0({ viewPhase: p }).viewPhase, p);
    for (const p of ['bogus', '', null, 1]) assertEqual(from0({ viewPhase: p }).viewPhase, 'input');
  });

  test('unbekannte Schlüssel entfallen', () => {
    assertDeepEqual(Object.keys(from0({ ...plain(LEGACY_STATE), inputValue: 'x', foo: 1 })),
      ['criteria', 'matrix', 'pairs', 'currentPair', 'viewPhase']);
  });
});

suite('pairwise-comparison Migration — über das Model', () => {
  test('Altprojekt (Ergebnis) lädt ohne Reparatur, read() wie die Altform', () => {
    const { m, fields } = repaired(plain(LEGACY_STATE));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, ...LEGACY_STATE }));
    const out = read(m);
    assertDeepEqual(Object.keys(out), ['criteria', 'matrix', 'pairs', 'currentPair', 'result']);
    assertEqual(json(out.result), json({
      scores: [2.5, 1, 1.5, 1],
      maxScore: 2.5,
      ranking: [
        { name: 'Kosten', score: 2.5, idx: 0 },
        { name: 'Lieferzeit', score: 1.5, idx: 2 },
        { name: 'Prüfaufwand; Stufe "B"', score: 1, idx: 1 },
        { name: 'Service', score: 1, idx: 3 },
      ],
    }));
  });

  test('Altprojekt (laufender Vergleich) lädt ohne Reparatur, result null', () => {
    const { m, fields } = repaired(plain(COMPARE_STATE));
    assertDeepEqual(fields, []);
    assertEqual(m.viewPhase, 'compare');
    assertEqual(read(m).result, null);
  });

  test('Nichtzahlen in Matrix und Paaren werden 0, unerreichbarer Reiter wird input', () => {
    const { m } = repaired({ criteria: ['A', 'B', 'C'], matrix: [[0, 'x', 1]], pairs: [], currentPair: 0, viewPhase: 'results' });
    assertDeepEqual(plain(m.matrix), [[0, 0, 1]]);
    assertEqual(m.viewPhase, 'input');
  });
});

suite('pairwise-comparison Migration — goldene Fixtures', () => {
  const CASES = [
    ['v0.3.0_single_project.json', ['Lieferzeit', 'Cpk', 'Kundenzufriedenheit', 'Kosten', 'Umsetzungsdauer']],
    ['v0.3.0_all_projects.json', ['TTC', 'Fehlerrate', 'Aufwand', 'Compliance']],
  ];
  for (const [file, criteria] of CASES) {
    test(`${file}: eine Instanz, AHP-Matrix wörtlich, lädt ohne Reparatur`, async () => {
      const states = pairwiseStates(await fetchJSON(new URL(file, FIXTURES)));
      assertEqual(states.length, 1);
      const old = states[0];
      assertDeepEqual(old.criteria, criteria);
      const out = from0(plain(old));
      assertEqual(json(out), json(old));
      const { m, fields } = repaired(plain(old));
      assertDeepEqual(fields, []);
      assertEqual(json(m.toJSON()), json({ ...SCHEMA, ...old }));
      assertEqual(m.viewPhase, 'results');
    });
  }

  test('die übrigen Fixtures enthalten keinen Paarvergleich', async () => {
    for (const file of ['v0.2.0_single_project.json', 'v0.5.0_8d_project.json']) {
      assertEqual(pairwiseStates(await fetchJSON(new URL(file, FIXTURES))).length, 0, file);
    }
  });
});

suite('pairwise-comparison Migration — Beispiele ohne _schema', () => {
  test('pairwise-projektauswahl lädt ohne Reparatur: fünf Kriterien, kein Lauf', async () => {
    const file = await fetchJSON(new URL('pairwise-projektauswahl.json', EXAMPLES));
    assertEqual(file._schema, undefined);
    const { m, fields } = repaired(plain(file));
    assertDeepEqual(fields, []);
    const out = read(m);
    assertEqual(json(out), json({
      criteria: ['Lieferzeit', 'Pizzaqualität', 'Preis', 'Mitarbeiterzufriedenheit', 'Reklamationsquote'],
      matrix: [], pairs: [], currentPair: 0, result: null,
    }));
  });

  test('pairwise-projektauswahl-abgeschlossen lädt ohne Reparatur: Punkte [3, 4, 1.5, 0, 1.5], Gleichstand stabil', async () => {
    const file = await fetchJSON(new URL('pairwise-projektauswahl-abgeschlossen.json', EXAMPLES));
    assertEqual(file._schema, undefined);
    const { m, fields } = repaired(plain(file));
    assertDeepEqual(fields, []);
    assertEqual(m.viewPhase, 'results');
    const out = read(m);
    assertEqual(json(out.result), json({
      scores: [3, 4, 1.5, 0, 1.5],
      maxScore: 4,
      ranking: [
        { name: 'Pizzaqualität', score: 4, idx: 1 },
        { name: 'Lieferzeit', score: 3, idx: 0 },
        { name: 'Preis', score: 1.5, idx: 2 },
        { name: 'Reklamationsquote', score: 1.5, idx: 4 },
        { name: 'Mitarbeiterzufriedenheit', score: 0, idx: 3 },
      ],
    }));
    assertEqual(json(out.criteria), json(file.criteria));
    assertEqual(json(out.matrix), json(file.matrix));
    assertEqual(json(out.pairs), json(file.pairs));
    assertEqual(out.currentPair, 10);
  });
});
