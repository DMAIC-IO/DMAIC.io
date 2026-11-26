/**
 * Tests for modules/raci-matrix/domain/migrations.js — '0→1.0' übernimmt jeden
 * Stand des alten `State.fromJSON`: Namen als Objekte mit fester id aus der
 * Position, Rollen von `zeile:spalte` auf Id-Paare; verwaiste und fremd
 * geformte Schlüssel, fremde Rollen und Einträge, die weder Text noch Zahl
 * sind, entfallen. Dazu das Altprojekt, die goldenen Fixtures und das Beispiel
 * in der Form ohne `_schema` über das Model.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/raci-matrix/domain/migrations.js';
import { State } from '../../../js/modules/raci-matrix/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'raci-matrix');

const SCHEMA = { _schema: { name: 'raci-matrix', version: '1.0' } };
const EMPTY = { activities: [], stakeholders: [], assignments: {} };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const EXAMPLE = new URL('../../../examples/projects/raci-pizza-lieferprozess.json', import.meta.url);
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

/** @param {object} m */
const warnings = (m) => evaluateDerived(m, /** @type {any} */ (undefined), ['warnings']).warnings;

/** Alle RACI-Zustände eines Exports (Instanzen mit moduleId `raci-matrix`). @param {any} v @param {any[]} [acc] @returns {any[]} */
function raciStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => raciStates(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'raci-matrix') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    }
    Object.values(v).forEach((x) => raciStates(x, acc));
  }
  return acc;
}

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema`. */
const LEGACY_STATE = {
  activities: [
    'Anforderungen aufnehmen',
    'Lieferantenbewertung für alle Zulieferer der Baugruppe Getriebegehäuse durchführen',
    'Prüfplan für Öl & Späne <Größe "M3"> freigeben',
    'Abschlussbericht schreiben',
  ],
  stakeholders: ['Projektleitung', 'Qualitätssicherung Werk Süd (Leitung Messtechnik)', 'Einkauf'],
  assignments: {
    '2:2': 'A', '0:1': 'A', '1:2': 'I', '0:0': 'R', '2:0': 'R', '1:1': 'A', '0:2': 'C', '2:1': 'A',
  },
};
/** Derselbe Stand nach 0→1.0. */
const LEGACY_MIGRATED = {
  activities: [
    { id: 'a1', name: 'Anforderungen aufnehmen' },
    { id: 'a2', name: 'Lieferantenbewertung für alle Zulieferer der Baugruppe Getriebegehäuse durchführen' },
    { id: 'a3', name: 'Prüfplan für Öl & Späne <Größe "M3"> freigeben' },
    { id: 'a4', name: 'Abschlussbericht schreiben' },
  ],
  stakeholders: [
    { id: 's1', name: 'Projektleitung' },
    { id: 's2', name: 'Qualitätssicherung Werk Süd (Leitung Messtechnik)' },
    { id: 's3', name: 'Einkauf' },
  ],
  assignments: {
    'a3:s3': 'A', 'a1:s2': 'A', 'a2:s3': 'I', 'a1:s1': 'R', 'a3:s1': 'R', 'a2:s2': 'A', 'a1:s3': 'C', 'a3:s2': 'A',
  },
};

suite('raci-matrix Migration 0→1.0 — Altprojekt', () => {
  test('feste ids aus der Position, Rollen auf Id-Paare in der Reihenfolge der Quelle', () => {
    assertEqual(json(from0(plain(LEGACY_STATE))), json(LEGACY_MIGRATED));
  });
  test('lädt über das Model ohne Reparatur, toJSON = _schema + migrierter Stand', () => {
    const { m, fields } = repaired(plain(LEGACY_STATE));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, ...LEGACY_MIGRATED }));
  });
  test('zweimal migriert: dieselben ids (Lesen ohne Mount)', () => {
    assertEqual(json(State.fromJSON(plain(LEGACY_STATE)).toJSON()), json(State.fromJSON(plain(LEGACY_STATE)).toJSON()));
  });
  test('warnings: a2 ohne R, a3 mit zwei A, a4 ohne R und A', () => {
    assertDeepEqual(warnings(State.fromJSON(plain(LEGACY_STATE))), [
      { activityId: 'a2', issues: ['noR'] },
      { activityId: 'a3', issues: ['multiA'] },
      { activityId: 'a4', issues: ['noR', 'noA'] },
    ]);
  });
});

suite('raci-matrix Migration 0→1.0 — kein Objekt, fehlende Felder', () => {
  for (const [name, v] of [['null', null], ['undefined', undefined], ['{}', {}], ['Liste', []], ['Text', 'x'], ['Zahl', 7]]) {
    test(`${name} → Vorgabe`, () => {
      assertEqual(json(from0(v)), json(EMPTY));
    });
  }
  test('Listen und Rollen in falscher Form → leer (wie fromJSON)', () => {
    assertEqual(json(from0({ activities: 'nope', stakeholders: 42, assignments: 'x' })), json(EMPTY));
    assertEqual(json(from0({ activities: { 0: 'a' }, stakeholders: null, assignments: ['R'] })), json(EMPTY));
  });
  test('fremde Schlüssel entfallen, Ergebnis in gespeicherter Reihenfolge', () => {
    const out = from0({ assignments: {}, extra: 1, stakeholders: ['P'], activities: ['T'] });
    assertDeepEqual(Object.keys(out), ['activities', 'stakeholders', 'assignments']);
    assertEqual(json(out), json({ activities: [{ id: 'a1', name: 'T' }], stakeholders: [{ id: 's1', name: 'P' }], assignments: {} }));
  });
  test('Ergebnis ist ein einfaches Objekt ohne geteilte Bezüge', () => {
    const old = { activities: ['T'], stakeholders: ['P'], assignments: { '0:0': 'R' } };
    const out = from0(old);
    assertEqual(Object.getPrototypeOf(out), Object.prototype);
    assertTrue(out.activities !== old.activities && out.assignments !== old.assignments);
  });
});

suite('raci-matrix Migration 0→1.0 — Namen', () => {
  test('Texte bleiben wörtlich, auch leer und mit Leerzeichen', () => {
    const out = from0({ activities: ['  a  ', '', 'x\ny'], stakeholders: [' '] });
    assertEqual(json(out.activities), json([{ id: 'a1', name: '  a  ' }, { id: 'a2', name: '' }, { id: 'a3', name: 'x\ny' }]));
    assertEqual(json(out.stakeholders), json([{ id: 's1', name: ' ' }]));
  });
  test('Zahlen werden ihr Text', () => {
    assertEqual(json(from0({ activities: [7, 1.5, 0] }).activities),
      json([{ id: 'a1', name: '7' }, { id: 'a2', name: '1.5' }, { id: 'a3', name: '0' }]));
  });
  test('weder Text noch Zahl entfällt; die ids bleiben an der Altposition', () => {
    const out = from0({ activities: ['A', null, true, { n: 1 }, ['x'], 'F'], stakeholders: [undefined, 'Q'] });
    assertEqual(json(out.activities), json([{ id: 'a1', name: 'A' }, { id: 'a6', name: 'F' }]));
    assertEqual(json(out.stakeholders), json([{ id: 's2', name: 'Q' }]));
  });
  test('ein entfallener Eintrag nimmt seine Rollen mit', () => {
    const out = from0({ activities: ['A', null, 'C'], stakeholders: ['P'], assignments: { '0:0': 'R', '1:0': 'A', '2:0': 'C' } });
    assertEqual(json(out.assignments), json({ 'a1:s1': 'R', 'a3:s1': 'C' }));
    assertDeepEqual(repaired(out).fields, []);
  });
});

suite('raci-matrix Migration 0→1.0 — Rollen', () => {
  const base = { activities: ['A0', 'A1'], stakeholders: ['P0', 'P1'] };
  test('alle vier Rollen bleiben', () => {
    const out = from0({ ...base, assignments: { '0:0': 'R', '0:1': 'A', '1:0': 'C', '1:1': 'I' } });
    assertEqual(json(out.assignments), json({ 'a1:s1': 'R', 'a1:s2': 'A', 'a2:s1': 'C', 'a2:s2': 'I' }));
  });
  for (const [name, key] of [
    ['Unterstrich 0_0', '0_0'], ['führende Null 01:1', '01:1'], ['Zeile außerhalb 9:0', '9:0'],
    ['Spalte außerhalb 0:2', '0:2'], ['negativ -1:0', '-1:0'], ['Leerzeichen 0: 1', '0: 1'],
    ['drei Teile 0:1:1', '0:1:1'], ['leer', ''], ['id-Paar a1:s1', 'a1:s1'],
  ]) {
    test(`Schlüssel ${name} entfällt`, () => {
      const out = from0({ ...base, assignments: { [key]: 'R', '1:1': 'A' } });
      assertEqual(json(out.assignments), json({ 'a2:s2': 'A' }));
    });
  }
  for (const v of ['X', 'r', '', null, 1, ['R'], { R: 1 }]) {
    test(`Wert ${json(v)} entfällt`, () => {
      const out = from0({ ...base, assignments: { '0:0': v, '1:1': 'A' } });
      assertEqual(json(out.assignments), json({ 'a2:s2': 'A' }));
    });
  }
  test('Reihenfolge der Quelle bleibt', () => {
    const out = from0({ ...base, assignments: { '1:1': 'I', '0:0': 'R', '1:0': 'C' } });
    assertDeepEqual(Object.keys(out.assignments), ['a2:s2', 'a1:s1', 'a2:s1']);
  });
});

suite('raci-matrix Migration — goldene Fixtures', () => {
  const FILES = ['v0.2.0_single_project.json', 'v0.3.0_single_project.json', 'v0.3.0_all_projects.json', 'v0.5.0_8d_project.json'];
  for (const file of FILES) {
    test(`${file}: genau eine RACI-Instanz; Namen bleiben, die Rollen unter "0_0" entfallen; lädt ohne Reparatur`, async () => {
      const states = raciStates(await fetchJSON(new URL(file, FIXTURES)));
      assertEqual(states.length, 1);
      const old = states[0];
      assertTrue(Object.keys(old.assignments).length > 0 && Object.keys(old.assignments).every((k) => /^\d+_\d+$/.test(k)));
      const out = from0(plain(old));
      assertDeepEqual(out.activities.map((a) => a.name), old.activities);
      assertDeepEqual(out.stakeholders.map((s) => s.name), old.stakeholders);
      assertDeepEqual(out.activities.map((a) => a.id), old.activities.map((_, i) => `a${i + 1}`));
      assertDeepEqual(out.stakeholders.map((s) => s.id), old.stakeholders.map((_, i) => `s${i + 1}`));
      assertEqual(json(out.assignments), '{}');
      const { m, fields } = repaired(plain(old));
      assertDeepEqual(fields, []);
      assertEqual(json(m.toJSON()), json({ ...SCHEMA, ...out }));
    });
  }
});

suite('raci-matrix Migration — Beispiel ohne _schema', () => {
  test('raci-pizza-lieferprozess lädt über 0→1.0 ohne Reparatur: a1–a8, s1–s6, 20 Rollen', async () => {
    const file = await fetchJSON(EXAMPLE);
    assertEqual(file._schema, undefined);
    const { m, fields } = repaired(plain(file));
    assertDeepEqual(fields, []);
    assertDeepEqual(m.activities.map((a) => a.id), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
    assertDeepEqual(m.activities.map((a) => a.name), file.activities);
    assertDeepEqual(m.stakeholders.map((s) => s.id), ['s1', 's2', 's3', 's4', 's5', 's6']);
    assertDeepEqual(m.stakeholders.map((s) => s.name), file.stakeholders);
    assertEqual(json(m.assignments), json({
      'a1:s3': 'R', 'a1:s2': 'A', 'a1:s6': 'I',
      'a2:s3': 'R', 'a2:s4': 'I',
      'a3:s4': 'R', 'a3:s2': 'A',
      'a4:s4': 'R', 'a4:s2': 'A',
      'a5:s5': 'R', 'a5:s2': 'A', 'a5:s6': 'C',
      'a6:s2': 'R', 'a6:s3': 'C', 'a6:s1': 'I',
      'a7:s2': 'R', 'a7:s1': 'A',
      'a8:s6': 'R', 'a8:s2': 'C', 'a8:s1': 'A',
    }));
    assertDeepEqual(warnings(m), [{ activityId: 'a2', issues: ['noA'] }, { activityId: 'a6', issues: ['noA'] }]);
  });
});
