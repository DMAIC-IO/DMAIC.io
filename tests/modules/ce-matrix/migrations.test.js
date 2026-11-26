/**
 * Tests for modules/ce-matrix/domain/migrations.js — '0→1.0' übernimmt jeden
 * Stand des alten `State.fromJSON`: Namen als Objekte mit fester id aus der
 * Position, das Gewicht in der Spalte (geklemmt, aufgefüllt), Bewertungen von
 * `zeile-spalte` auf Id-Paare; fremde und verwaiste Schlüssel und unlesbare
 * Werte entfallen, Werte außerhalb der Skala bleiben. Dazu das Altprojekt, die
 * goldenen Fixtures und das Beispiel in der Form ohne `_schema` über das Model.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/ce-matrix/domain/migrations.js';
import { State } from '../../../js/modules/ce-matrix/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'ce-matrix');

const SCHEMA = { _schema: { name: 'ce-matrix', version: '1.0' } };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const EXAMPLE = new URL('../../../examples/projects/ce-matrix-pizza-lieferzeit.json', import.meta.url);
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

/** @param {object} m @returns {any} */
const derived = (m) => evaluateDerived(m, /** @type {any} */ (undefined), ['allowedScores', 'rowSums']);

/** Alle C&E-Zustände eines Exports. @param {any} v @param {any[]} [acc] @returns {any[]} */
function ceStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => ceStates(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'ce-matrix') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    }
    Object.values(v).forEach((x) => ceStates(x, acc));
  }
  return acc;
}

const DEFAULT = {
  inputs: [{ id: 'i1', name: 'Input 1' }, { id: 'i2', name: 'Input 2' }, { id: 'i3', name: 'Input 3' }],
  outputs: [
    { id: 'o1', name: 'Output 1', weight: 1 }, { id: 'o2', name: 'Output 2', weight: 1 },
    { id: 'o3', name: 'Output 3', weight: 1 },
  ],
  scores: {},
  scale: '0-10',
};

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema`. */
const LEGACY_STATE = {
  inputs: ['Ofentemperatur (°C)', 'Teig & Belag <"Spezial">', 'Fahrerverfügbarkeit'],
  outputs: ['Lieferzeit', 'Qualität „heiß“', 'Kosten/Stück'],
  scores: { '2-1': 5, '0-0': 9, '1-1': 9, '0-1': 3, '1-0': 3, '0-2': 1, '2-2': 0 },
  weights: [10, 7],
  scale: '0-1-3-9',
};
/** Derselbe Stand nach 0→1.0. */
const LEGACY_MIGRATED = {
  inputs: [
    { id: 'i1', name: 'Ofentemperatur (°C)' },
    { id: 'i2', name: 'Teig & Belag <"Spezial">' },
    { id: 'i3', name: 'Fahrerverfügbarkeit' },
  ],
  outputs: [
    { id: 'o1', name: 'Lieferzeit', weight: 10 },
    { id: 'o2', name: 'Qualität „heiß“', weight: 7 },
    { id: 'o3', name: 'Kosten/Stück', weight: 1 },
  ],
  scores: { 'i1:o1': 9, 'i1:o2': 3, 'i1:o3': 1, 'i2:o1': 3, 'i2:o2': 9, 'i3:o2': 5, 'i3:o3': 0 },
  scale: '0-1-3-9',
};

suite('ce-matrix Migration 0→1.0 — Altprojekt', () => {
  test('feste ids, Gewicht aufgefüllt, Bewertungen nach Zeile und Spalte geordnet, 5 bleibt', () => {
    assertEqual(json(from0(plain(LEGACY_STATE))), json(LEGACY_MIGRATED));
  });
  test('lädt über das Model ohne Reparatur, toJSON = _schema + migrierter Stand + paretoEdits', () => {
    const { m, fields } = repaired(plain(LEGACY_STATE));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, ...LEGACY_MIGRATED, paretoEdits: {} }));
  });
  test('Zeilensummen wie die Altform, erlaubte Bewertungen der Skala', () => {
    const d = derived(State.fromJSON(plain(LEGACY_STATE)));
    assertDeepEqual(d.rowSums, [112, 93, 35]);
    assertDeepEqual(d.allowedScores, [0, 1, 3, 9]);
  });
  test('zweimal migriert: dieselben ids (Lesen ohne Mount)', () => {
    assertEqual(json(State.fromJSON(plain(LEGACY_STATE)).toJSON()), json(State.fromJSON(plain(LEGACY_STATE)).toJSON()));
  });
});

suite('ce-matrix Migration 0→1.0 — kein Objekt, fehlende Felder', () => {
  for (const [name, v] of [['null', null], ['undefined', undefined], ['{}', {}], ['Liste', []], ['Text', 'x'], ['Zahl', 7]]) {
    test(`${name} → Altvorgabe (drei Zeilen, drei Spalten, Gewicht 1)`, () => {
      assertEqual(json(from0(v)), json(DEFAULT));
    });
  }
  test('die Altvorgabe ist die Vorgabe des Models (kein Inhalt)', () => {
    const m = State.fromJSON({});
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, ...DEFAULT, paretoEdits: {} }));
    assertEqual(m.hasContent(), false);
    assertEqual(json(new State().toJSON()), json(m.toJSON()));
  });
  test('Listen in falscher Form → Altvorgabe je Liste', () => {
    const out = from0({ inputs: 'nope', outputs: ['Y'], scores: 'x', weights: 'x' });
    assertEqual(json(out.inputs), json(DEFAULT.inputs));
    assertEqual(json(out.outputs), json([{ id: 'o1', name: 'Y', weight: 1 }]));
    assertEqual(json(out.scores), '{}');
  });
  test('leere Listen bleiben leer (wie fromJSON), lädt ohne Reparatur', () => {
    const out = from0({ inputs: [], outputs: [] });
    assertEqual(json(out), json({ inputs: [], outputs: [], scores: {}, scale: '0-10' }));
    assertDeepEqual(repaired(out).fields, []);
  });
  test('fremde Schlüssel entfallen, Ergebnis in gespeicherter Reihenfolge', () => {
    const out = from0({ scale: '0-10', extra: 1, weights: [2], outputs: ['Y'], inputs: ['X'], scores: {} });
    assertDeepEqual(Object.keys(out), ['inputs', 'outputs', 'scores', 'scale']);
  });
  test('Ergebnis ist ein einfaches Objekt ohne geteilte Bezüge', () => {
    const old = { inputs: ['X'], outputs: ['Y'], scores: { '0-0': 1 }, weights: [1] };
    const out = from0(old);
    assertEqual(Object.getPrototypeOf(out), Object.prototype);
    assertTrue(out.inputs !== old.inputs && out.scores !== old.scores);
  });
});

suite('ce-matrix Migration 0→1.0 — Namen', () => {
  test('Texte bleiben wörtlich, auch leer und mit Leerzeichen', () => {
    const out = from0({ inputs: ['  a  ', '', 'x\ny'], outputs: [' '] });
    assertEqual(json(out.inputs), json([{ id: 'i1', name: '  a  ' }, { id: 'i2', name: '' }, { id: 'i3', name: 'x\ny' }]));
    assertEqual(json(out.outputs), json([{ id: 'o1', name: ' ', weight: 1 }]));
  });
  test('Zahlen werden ihr Text, alles andere der leere Text — keine Zeile entfällt', () => {
    const out = from0({ inputs: [7, 1.5, null, true, { n: 1 }, ['x']], outputs: [undefined, 'Q'] });
    assertEqual(json(out.inputs.map((i) => i.name)), json(['7', '1.5', '', '', '', '']));
    assertEqual(json(out.inputs.map((i) => i.id)), json(['i1', 'i2', 'i3', 'i4', 'i5', 'i6']));
    assertEqual(json(out.outputs), json([{ id: 'o1', name: '', weight: 1 }, { id: 'o2', name: 'Q', weight: 1 }]));
  });
  test('eine Zeile ohne Text behält ihre Bewertungen', () => {
    const out = from0({ inputs: ['A', null], outputs: ['Y'], scores: { '1-0': 4 } });
    assertEqual(json(out.scores), json({ 'i2:o1': 4 }));
  });
});

suite('ce-matrix Migration 0→1.0 — Gewichte', () => {
  const outs = ['A', 'B', 'C'];
  test('geklemmt auf 1..10, parseInt, Unlesbares → 1', () => {
    const out = from0({ outputs: [...outs, 'D', 'E', 'F', 'G'], weights: [0, 11, '7', 7.9, 'x', null, -3] });
    assertDeepEqual(out.outputs.map((o) => o.weight), [1, 10, 7, 7, 1, 1, 1]);
  });
  test('fehlende Gewichte → 1 (aufgefüllt)', () => {
    assertDeepEqual(from0({ outputs: outs, weights: [5] }).outputs.map((o) => o.weight), [5, 1, 1]);
    assertDeepEqual(from0({ outputs: outs }).outputs.map((o) => o.weight), [1, 1, 1]);
  });
  test('überzählige Gewichte entfallen', () => {
    assertDeepEqual(from0({ outputs: ['A'], weights: [3, 9, 9] }).outputs.map((o) => o.weight), [3]);
  });
});

suite('ce-matrix Migration 0→1.0 — Bewertungen', () => {
  const base = { inputs: ['X0', 'X1'], outputs: ['Y0', 'Y1'] };
  test('Zeile vor Spalte geordnet', () => {
    const out = from0({ ...base, scores: { '1-1': 4, '0-1': 2, '1-0': 3, '0-0': 1 } });
    assertDeepEqual(Object.keys(out.scores), ['i1:o1', 'i1:o2', 'i2:o1', 'i2:o2']);
  });
  for (const [name, key] of [
    ['Unterstrich 0_0', '0_0'], ['führende Null 01-1', '01-1'], ['Zeile außerhalb 9-0', '9-0'],
    ['Spalte außerhalb 0-2', '0-2'], ['negativ -1-0', '-1-0'], ['Doppelpunkt 0:1', '0:1'],
    ['drei Teile 0-1-1', '0-1-1'], ['leer', ''], ['id-Paar i1:o1', 'i1:o1'],
  ]) {
    test(`Schlüssel ${name} entfällt`, () => {
      const out = from0({ ...base, scores: { [key]: 5, '1-1': 7 } });
      assertEqual(json(out.scores), json({ 'i2:o2': 7 }));
    });
  }
  test('Werte außerhalb der Skala und Brüche bleiben', () => {
    const out = from0({ ...base, scale: '0-1-3-9', scores: { '0-0': 5, '0-1': 2.5, '1-0': 15, '1-1': -1 } });
    assertEqual(json(out.scores), json({ 'i1:o1': 5, 'i1:o2': 2.5, 'i2:o1': 15, 'i2:o2': -1 }));
    assertDeepEqual(repaired(out).fields, []);
  });
  test('lesbarer Text wird Zahl', () => {
    const out = from0({ ...base, scores: { '0-0': '7', '0-1': ' 3 ', '1-0': '2.5' } });
    assertEqual(json(out.scores), json({ 'i1:o1': 7, 'i1:o2': 3, 'i2:o1': 2.5 }));
  });
  for (const v of ['x', '', '  ', null, true, [5], { v: 5 }, '7,5']) {
    test(`Wert ${json(v)} entfällt`, () => {
      const out = from0({ ...base, scores: { '0-0': v, '1-1': 7 } });
      assertEqual(json(out.scores), json({ 'i2:o2': 7 }));
    });
  }
});

suite('ce-matrix Migration 0→1.0 — Skala', () => {
  for (const s of ['0-10', '0-1-3-9', '0-3-7-10']) {
    test(`${s} bleibt`, () => assertEqual(from0({ scale: s }).scale, s));
  }
  for (const s of ['bogus', '0-5', 3, null]) {
    test(`${json(s)} → 0-10`, () => assertEqual(from0({ scale: s }).scale, '0-10'));
  }
});

suite('ce-matrix Migration — goldene Fixtures', () => {
  const FILES = ['v0.2.0_single_project.json', 'v0.2.0_all_projects.json', 'v0.3.0_single_project.json', 'v0.3.0_all_projects.json'];
  for (const file of FILES) {
    test(`${file}: Namen und Gewichte bleiben, die Bewertungen unter "r_c" entfallen; lädt ohne Reparatur`, async () => {
      const states = ceStates(await fetchJSON(new URL(file, FIXTURES)));
      assertTrue(states.length > 0, 'keine C&E-Instanz');
      for (const old of states) {
        assertTrue(Object.keys(old.scores).length > 0 && Object.keys(old.scores).every((k) => /^\d+_\d+$/.test(k)));
        const out = from0(plain(old));
        assertDeepEqual(out.inputs.map((i) => i.name), old.inputs);
        assertDeepEqual(out.outputs.map((o) => o.name), old.outputs);
        assertDeepEqual(out.outputs.map((o) => o.weight), old.weights);
        assertDeepEqual(out.inputs.map((i) => i.id), old.inputs.map((_, r) => `i${r + 1}`));
        assertEqual(json(out.scores), '{}');
        assertEqual(out.scale, '0-10');
        const { m, fields } = repaired(plain(old));
        assertDeepEqual(fields, []);
        assertEqual(json(m.toJSON()), json({ ...SCHEMA, ...out, paretoEdits: {} }));
      }
    });
  }
});

suite('ce-matrix Migration — Beispiel ohne _schema', () => {
  test('ce-matrix-pizza-lieferzeit lädt über 0→1.0 ohne Reparatur: i1–i7, o1–o4, 28 Bewertungen', async () => {
    const file = await fetchJSON(EXAMPLE);
    assertEqual(file._schema, undefined);
    const { m, fields } = repaired(plain(file));
    assertDeepEqual(fields, []);
    assertDeepEqual(m.inputs.map((i) => i.id), ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7']);
    assertDeepEqual(m.inputs.map((i) => i.name), file.inputs);
    assertDeepEqual(m.outputs.map((o) => o.id), ['o1', 'o2', 'o3', 'o4']);
    assertDeepEqual(m.outputs.map((o) => o.weight), [10, 9, 7, 8]);
    assertEqual(Object.keys(m.scores).length, 28);
    assertEqual(m.scale, '0-10');
    assertDeepEqual(derived(m).rowSums, [231, 187, 205, 174, 203, 172, 187]);
  });
});
