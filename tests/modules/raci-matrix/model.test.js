/**
 * Tests for modules/raci-matrix/domain/model.js — Schema und Vorgaben,
 * gespeicherte Stände '1.0', Versionsprüfung, die Invarianten `activityIds`,
 * `stakeholderIds` und `knownCells` (streng, mit Reparatur, beim Schreiben),
 * alle Kommandos samt Ablehnungen, Rollen bleiben beim Entfernen und
 * Verschieben an ihrer Zeile, `hasContent`, die Ableitung `warnings`, die
 * Lesefläche und der Agentenkatalog.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, ROLES } from '../../../js/modules/raci-matrix/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'raci-matrix');

const SCHEMA = { _schema: { name: 'raci-matrix', version: '1.0' } };
const EMPTY_STATE = { activities: [], stakeholders: [], assignments: {} };
const EMPTY = { ...SCHEMA, ...EMPTY_STATE };

/** Das Altprojekt (`legacy-project.json`) nach 0→1.0, mit `_schema` '1.0'. */
const LEGACY_STATE = {
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
const LEGACY = { ...SCHEMA, ...LEGACY_STATE };

const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);
/** Die gespeicherten Felder ohne `_schema`. @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };
/** @param {object} m @returns {any} */
const warnings = (m) => evaluateDerived(m, /** @type {any} */ (undefined), ['warnings']).warnings;
/** @returns {any} */
const legacy = () => State.fromJSON(plain(LEGACY));

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Der gespeicherte Stand mit geänderten Feldern. @param {object} patch */
const legacyWith = (patch) => ({ ...plain(LEGACY), ...patch });

/** Eine Matrix mit Zeilen und Spalten, deren ids die Namen sind. @param {string[]} acts @param {string[]} shs @param {Record<string, string>} [assignments] */
const matrix = (acts, shs, assignments = {}) => State.fromJSON({
  ...SCHEMA,
  activities: acts.map((id) => ({ id, name: id })),
  stakeholders: shs.map((id) => ({ id, name: id })),
  assignments,
});

suite('raci-matrix Model — Schema und Vorgaben', () => {
  test('drei Felder in gespeicherter Reihenfolge, keine Ansichtsfelder, neun Kommandos, drei Invarianten, eine Ableitung', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['activities', 'stakeholders', 'assignments']);
    assertDeepEqual(Object.keys(State.schema.view), []);
    assertDeepEqual(Object.keys(State.schema.commands), [
      'addActivity', 'addStakeholder', 'renameActivity', 'renameStakeholder',
      'removeActivity', 'removeStakeholder', 'moveActivity', 'setRole', 'cycleRole',
    ]);
    assertDeepEqual(Object.keys(State.schema.invariants), ['activityIds', 'stakeholderIds', 'knownCells']);
    for (const inv of Object.values(State.schema.invariants)) assertEqual(typeof inv.repair, 'function');
    assertDeepEqual([...State.schema.invariants.activityIds.fields], ['activities']);
    assertDeepEqual([...State.schema.invariants.stakeholderIds.fields], ['stakeholders']);
    assertDeepEqual([...State.schema.invariants.knownCells.fields], ['assignments', 'activities', 'stakeholders']);
    assertDeepEqual(Object.keys(State.schema.derived), ['warnings']);
  });
  test('Feldarten: Listen von { id, name } ohne trim/nonEmpty, Rollen als map auf R/A/C/I', () => {
    const f = State.schema.fields;
    for (const k of ['activities', 'stakeholders']) {
      assertEqual(f[k].kind, 'list', k);
      assertEqual(f[k].item.kind, 'object', k);
      assertDeepEqual(Object.keys(f[k].item.shape), ['id', 'name'], k);
      for (const p of ['id', 'name']) assertEqual(f[k].item.shape[p].nonEmpty, undefined, `${k}.${p}`);
    }
    assertEqual(f.assignments.kind, 'map');
    assertEqual(f.assignments.key.kind, 'text');
    assertDeepEqual([...f.assignments.value.values], [...ROLES]);
  });
  test('Vorgaben: alles leer, kein Inhalt; toJSON mit _schema', () => {
    const m = new State();
    assertEqual(json(fieldsOf(m)), json(EMPTY_STATE));
    assertEqual(json(m.toJSON()), json(EMPTY));
    assertEqual(m.hasContent(), false);
  });
});

suite('raci-matrix Model — gespeicherter Stand 1.0', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich', () => {
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY))), null);
    const { m, fields } = repaired(plain(LEGACY));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json(LEGACY));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(LEGACY)).toJSON()), json(LEGACY));
  });
  test('läuft ohne Migrationsschritt: Namen als Texte sind in 1.0 ungültig', () => {
    const j = legacyWith({ activities: ['A'] });
    assertTrue(thrown(() => State.fromJSON(j)) instanceof Error);
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei, auch für den leeren Stand', () => {
    for (const j of [LEGACY, EMPTY]) {
      assertEqual(json(State.fromJSON(plain(State.fromJSON(plain(j)).toJSON())).toJSON()), json(j));
    }
  });
  test('{} lädt als leeres Model', () => {
    assertEqual(json(State.fromJSON({}).toJSON()), json(EMPTY));
  });
});

suite('raci-matrix Model — Versionsprüfung', () => {
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'raci-matrix', version: '2.0' } };
    assertThrows(() => State.fromJSON(v2), /_schema\.version/);
    assertThrows(() => State.fromJSON(v2, { repair: true }), /_schema\.version/);
    assertThrows(() => loadModel(State, v2), /_schema\.version/);
  });
  test('unlesbare Version wird abgewiesen, auch mit Reparatur', () => {
    const bad = { ...plain(LEGACY), _schema: { version: 'x' } };
    assertThrows(() => State.fromJSON(bad), /_schema\.version/);
    assertThrows(() => State.fromJSON(bad, { repair: true }), /_schema\.version/);
  });
});

suite('raci-matrix Model — Invarianten beim Laden', () => {
  for (const [key, inv, prefix] of [['activities', 'activityIds', 'a'], ['stakeholders', 'stakeholderIds', 's']]) {
    test(`${key}: doppelte id streng mit ${inv} abgewiesen; mit Reparatur entfällt nur die spätere`, () => {
      const list = [...LEGACY_STATE[key], { id: `${prefix}1`, name: 'Doppelt' }];
      const j = legacyWith({ [key]: list });
      const err = thrown(() => State.fromJSON(plain(j)));
      assertEqual(err?.invariant, inv);
      assertEqual(err?.param, key);
      const { m, fields } = repaired(j);
      assertDeepEqual(fields, [key]);
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
    test(`${key}: leere id und id mit Doppelpunkt bekommen eine neue; Rollen unter der alten entfallen`, () => {
      const list = [...LEGACY_STATE[key], { id: '', name: 'Leer' }, { id: `${prefix}:9`, name: 'Doppelpunkt' }];
      assertEqual(thrown(() => State.fromJSON(legacyWith({ [key]: list })))?.invariant, inv);
      const extra = key === 'activities' ? { [`${prefix}:9:s1`]: 'R' } : { [`a1:${prefix}:9`]: 'R' };
      const { m } = repaired(legacyWith({ [key]: list, assignments: { ...LEGACY_STATE.assignments, ...extra } }));
      const items = m[key];
      assertEqual(items.length, LEGACY_STATE[key].length + 2);
      assertDeepEqual(items.map((x) => x.name).slice(-2), ['Leer', 'Doppelpunkt']);
      for (const x of items.slice(-2)) assertTrue(x.id !== '' && !x.id.includes(':') && x.id !== `${prefix}:9`, x.id);
      assertEqual(new Set(items.map((x) => x.id)).size, items.length);
      assertEqual(json(m.assignments), json(LEGACY_STATE.assignments));
    });
  }
  test('verwaiste Rolle: streng mit knownCells abgewiesen; mit Reparatur entfällt nur sie', () => {
    const j = legacyWith({ assignments: { ...LEGACY_STATE.assignments, 'a9:s1': 'R', 'a1:s9': 'A', 'a4:s1:x': 'C' } });
    const err = thrown(() => State.fromJSON(plain(j)));
    assertEqual(err?.invariant, 'knownCells');
    assertEqual(err?.param, 'assignments');
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['assignments', 'activities', 'stakeholders']);
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('fremder Rollenwert: mit Reparatur entfällt nur dieser Eintrag', () => {
    const j = legacyWith({ assignments: { ...LEGACY_STATE.assignments, 'a4:s1': 'X' } });
    assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
    const { m } = repaired(j);
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('eine doppelte Zeile behält die Rollen der ersten', () => {
    const j = legacyWith({ activities: [...LEGACY_STATE.activities, { id: 'a3', name: 'x' }] });
    assertDeepEqual(warnings(repaired(j).m), warnings(legacy()));
  });
});

suite('raci-matrix Model — Schreiben der Felder (instance.set)', () => {
  test('ganze Felder mit gültigen ids und Rollen werden angenommen', () => {
    const m = legacy();
    m.assignments = { 'a4:s1': 'R' };
    assertEqual(json(m.assignments), json({ 'a4:s1': 'R' }));
    m.stakeholders = [...LEGACY_STATE.stakeholders, { id: 'neu', name: 'Neu' }];
    assertEqual(m.stakeholders.length, 4);
  });
  test('doppelte id abgelehnt, alter Wert bleibt', () => {
    const m = legacy();
    const err = thrown(() => { m.activities = [{ id: 'x', name: 'a' }, { id: 'x', name: 'b' }]; });
    assertEqual(err?.invariant, 'activityIds');
    assertEqual(err?.param, 'activities');
    assertEqual(thrown(() => { m.stakeholders = [{ id: '', name: 'a' }]; })?.invariant, 'stakeholderIds');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('verwaiste Rolle abgelehnt, ebenso eine Zeile mit Rollen über activities entfernen', () => {
    const m = legacy();
    assertEqual(thrown(() => { m.assignments = { 'a9:s1': 'R' }; })?.invariant, 'knownCells');
    assertEqual(thrown(() => { m.activities = LEGACY_STATE.activities.slice(1); })?.invariant, 'knownCells');
    assertEqual(thrown(() => { m.stakeholders = []; })?.invariant, 'knownCells');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('fremder Rollenwert abgelehnt', () => {
    const m = legacy();
    assertTrue(thrown(() => { m.assignments = { 'a1:s1': 'X' }; }) instanceof Error);
    assertEqual(json(m.assignments), json(LEGACY_STATE.assignments));
  });
});

suite('raci-matrix Model — Anlegen', () => {
  for (const [cmd, key] of [['addActivity', 'activities'], ['addStakeholder', 'stakeholders']]) {
    test(`${cmd}: getrimmt angehängt, liefert die neue id`, () => {
      const m = legacy();
      const id = m[cmd]({ text: '  Neu  ' });
      assertEqual(typeof id, 'string');
      assertTrue(id !== '' && !id.includes(':'));
      assertDeepEqual(plain(m[key].at(-1)), { id, name: 'Neu' });
      assertEqual(m[key].length, LEGACY_STATE[key].length + 1);
      assertEqual(json(m.assignments), json(LEGACY_STATE.assignments));
    });
    test(`${cmd}: zwei Einträge, zwei verschiedene ids; über execute`, () => {
      const m = new State();
      const a = m[cmd]({ text: 'x' });
      const b = m.execute({ type: cmd, text: 'x' });
      assertTrue(a !== b);
      assertDeepEqual(m[key].map((x) => x.name), ['x', 'x']);
    });
    for (const [name, text] of [['leer', ''], ['nur Leerzeichen', '   '], ['kein Text', 7]]) {
      test(`${cmd}: ${name} abgelehnt mit param text, nichts angelegt`, () => {
        const m = legacy();
        assertEqual(thrown(() => m[cmd]({ text }))?.param, 'text');
        assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
      });
    }
  }
});

suite('raci-matrix Model — Umbenennen', () => {
  test('renameActivity: getrimmt, id und Rollen bleiben', () => {
    const m = legacy();
    m.renameActivity({ activityId: 'a2', value: '  Neu  ' });
    assertDeepEqual(plain(m.activities[1]), { id: 'a2', name: 'Neu' });
    assertEqual(json(m.assignments), json(LEGACY_STATE.assignments));
  });
  test('renameStakeholder: getrimmt, id bleibt', () => {
    const m = legacy();
    m.renameStakeholder({ stakeholderId: 's3', value: 'Beschaffung' });
    assertDeepEqual(plain(m.stakeholders[2]), { id: 's3', name: 'Beschaffung' });
  });
  for (const [cmd, idKey, id] of [['renameActivity', 'activityId', 'a1'], ['renameStakeholder', 'stakeholderId', 's1']]) {
    for (const [name, args, param] of [
      ['leer', { [idKey]: id, value: '' }, 'value'],
      ['nur Leerzeichen', { [idKey]: id, value: '   ' }, 'value'],
      ['fremde id', { [idKey]: 'x9', value: 'N' }, idKey],
    ]) {
      test(`${cmd}: ${name} abgelehnt mit param ${param}, Zustand unverändert`, () => {
        const m = legacy();
        assertEqual(thrown(() => m[cmd](args))?.param, param);
        assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
      });
    }
  }
});

suite('raci-matrix Model — Entfernen (Rollen bleiben an ihrer Zeile)', () => {
  test('removeActivity: Zeile und nur ihre Rollen entfallen, die übrigen bleiben unter ihren Schlüsseln', () => {
    const m = matrix(['A0', 'A1', 'A2'], ['S0'], { 'A0:S0': 'R', 'A2:S0': 'A' });
    m.removeActivity({ activityId: 'A1' });
    assertDeepEqual(m.activities.map((a) => a.id), ['A0', 'A2']);
    assertEqual(json(m.assignments), json({ 'A0:S0': 'R', 'A2:S0': 'A' }));
  });
  test('removeActivity: die Rollen der entfernten Zeile entfallen', () => {
    const m = matrix(['X', 'Y', 'Z'], ['S'], { 'X:S': 'R', 'Z:S': 'R' });
    m.removeActivity({ activityId: 'X' });
    assertDeepEqual(m.activities.map((a) => a.id), ['Y', 'Z']);
    assertEqual(json(m.assignments), json({ 'Z:S': 'R' }));
  });
  test('removeStakeholder: Spalte und nur ihre Rollen entfallen', () => {
    const m = matrix(['T'], ['S0', 'S1', 'S2'], { 'T:S0': 'R', 'T:S1': 'C', 'T:S2': 'A' });
    m.removeStakeholder({ stakeholderId: 'S1' });
    assertDeepEqual(m.stakeholders.map((s) => s.id), ['S0', 'S2']);
    assertEqual(json(m.assignments), json({ 'T:S0': 'R', 'T:S2': 'A' }));
  });
  test('ids mit gemeinsamem Anfang: nur die eigene id zählt', () => {
    const m = matrix(['a1', 'a10'], ['s1', 's11'], { 'a1:s1': 'R', 'a10:s1': 'A', 'a1:s11': 'C', 'a10:s11': 'I' });
    m.removeActivity({ activityId: 'a1' });
    assertEqual(json(m.assignments), json({ 'a10:s1': 'A', 'a10:s11': 'I' }));
    m.removeStakeholder({ stakeholderId: 's1' });
    assertEqual(json(m.assignments), json({ 'a10:s11': 'I' }));
  });
  test('Altprojekt: removeActivity a3 lässt die Befunde der übrigen Zeilen gleich', () => {
    const m = legacy();
    m.removeActivity({ activityId: 'a3' });
    assertDeepEqual(warnings(m), [{ activityId: 'a2', issues: ['noR'] }, { activityId: 'a4', issues: ['noR', 'noA'] }]);
  });
  for (const [cmd, args, param] of [
    ['removeActivity', { activityId: 'x9' }, 'activityId'],
    ['removeStakeholder', { stakeholderId: 'x9' }, 'stakeholderId'],
    ['removeActivity', { activityId: 1 }, 'activityId'],
  ]) {
    test(`${cmd} ${json(args)}: abgelehnt mit param ${param}, Zustand unverändert`, () => {
      const m = legacy();
      assertEqual(thrown(() => m[cmd](args))?.param, param);
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
  }
});

suite('raci-matrix Model — moveActivity (Endindex, Rollen wandern mit)', () => {
  const order = (m) => m.activities.map((a) => a.id);
  test('nach oben: Third, First, Second; Schlüssel unverändert', () => {
    const roles = { 'First:P': 'R', 'Second:P': 'A', 'Third:P': 'C' };
    const m = matrix(['First', 'Second', 'Third'], ['P'], roles);
    m.moveActivity({ activityId: 'Third', to: 0 });
    assertDeepEqual(order(m), ['Third', 'First', 'Second']);
    assertEqual(json(m.assignments), json(roles));
  });
  test('nach unten: A1, A2, A0', () => {
    const m = matrix(['A0', 'A1', 'A2'], ['P'], { 'A0:P': 'R', 'A1:P': 'A', 'A2:P': 'C' });
    m.moveActivity({ activityId: 'A0', to: 2 });
    assertDeepEqual(order(m), ['A1', 'A2', 'A0']);
    assertEqual(m.assignments['A0:P'], 'R');
  });
  test('ein Schritt in die Mitte', () => {
    const m = matrix(['A', 'B', 'C', 'D'], ['P']);
    m.moveActivity({ activityId: 'A', to: 1 });
    assertDeepEqual(order(m), ['B', 'A', 'C', 'D']);
    m.moveActivity({ activityId: 'D', to: 2 });
    assertDeepEqual(order(m), ['B', 'A', 'D', 'C']);
  });
  test('dieselbe Stelle lässt alles stehen', () => {
    const m = matrix(['A', 'B'], ['P'], { 'A:P': 'R' });
    m.moveActivity({ activityId: 'B', to: 1 });
    assertDeepEqual(order(m), ['A', 'B']);
    assertEqual(json(m.assignments), json({ 'A:P': 'R' }));
  });
  test('Grenze: to = Länge − 1 geht, to = Länge und −1 abgelehnt mit param to', () => {
    const m = matrix(['A', 'B', 'C'], ['P']);
    m.moveActivity({ activityId: 'A', to: 2 });
    assertDeepEqual(order(m), ['B', 'C', 'A']);
    for (const to of [3, -1, 1.5, '1']) {
      assertEqual(thrown(() => m.moveActivity({ activityId: 'A', to: /** @type {any} */ (to) }))?.param, 'to', json(to));
    }
    assertDeepEqual(order(m), ['B', 'C', 'A']);
  });
  test('fremde id abgelehnt mit param activityId', () => {
    const m = matrix(['A', 'B'], ['P']);
    assertEqual(thrown(() => m.moveActivity({ activityId: 'Z', to: 0 }))?.param, 'activityId');
    assertDeepEqual(order(m), ['A', 'B']);
  });
});

suite('raci-matrix Model — setRole und cycleRole', () => {
  test('setRole setzt und ersetzt; der leere Text löscht den Eintrag', () => {
    const m = legacy();
    m.setRole({ activityId: 'a4', stakeholderId: 's1', role: 'R' });
    assertEqual(m.assignments['a4:s1'], 'R');
    m.setRole({ activityId: 'a4', stakeholderId: 's1', role: 'I' });
    assertEqual(m.assignments['a4:s1'], 'I');
    m.setRole({ activityId: 'a4', stakeholderId: 's1', role: '' });
    assertTrue(!('a4:s1' in m.assignments));
    m.setRole({ activityId: 'a4', stakeholderId: 's2', role: '' });
    assertEqual(json(m.assignments), json(LEGACY_STATE.assignments));
  });
  test("cycleRole: '' → R → A → C → I → '' (Eintrag fehlt am Ende)", () => {
    const m = matrix(['T'], ['P']);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      m.cycleRole({ activityId: 'T', stakeholderId: 'P' });
      seen.push(m.assignments['T:P'] ?? '');
    }
    assertDeepEqual(seen, ['R', 'A', 'C', 'I', '']);
    assertEqual(json(m.assignments), '{}');
  });
  test('über execute', () => {
    const m = matrix(['T'], ['P']);
    m.execute({ type: 'setRole', activityId: 'T', stakeholderId: 'P', role: 'C' });
    m.execute({ type: 'cycleRole', activityId: 'T', stakeholderId: 'P' });
    assertEqual(m.assignments['T:P'], 'I');
  });
  for (const [name, cmd, args, param] of [
    ['setRole fremde Rolle', 'setRole', { activityId: 'a1', stakeholderId: 's1', role: 'X' }, 'role'],
    ['setRole kleine Rolle', 'setRole', { activityId: 'a1', stakeholderId: 's1', role: 'r' }, 'role'],
    ['setRole fremde Aktivität', 'setRole', { activityId: 'a9', stakeholderId: 's1', role: 'R' }, 'activityId'],
    ['setRole fremder Stakeholder', 'setRole', { activityId: 'a1', stakeholderId: 's9', role: 'R' }, 'stakeholderId'],
    ['cycleRole fremde Aktivität', 'cycleRole', { activityId: 'a9', stakeholderId: 's1' }, 'activityId'],
    ['cycleRole fremder Stakeholder', 'cycleRole', { activityId: 'a1', stakeholderId: 's9' }, 'stakeholderId'],
  ]) {
    test(`${name}: abgelehnt mit param ${param}, Zustand unverändert`, () => {
      const m = legacy();
      assertEqual(thrown(() => m[cmd](args))?.param, param);
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
  }
});

suite('raci-matrix Model — hasContent', () => {
  test('false, wenn leer', () => {
    assertEqual(new State().hasContent(), false);
  });
  test('true mit einer Aktivität', () => {
    const m = new State();
    m.addActivity({ text: 'Task' });
    assertEqual(m.hasContent(), true);
  });
  test('true mit einem Stakeholder', () => {
    const m = new State();
    m.addStakeholder({ text: 'Person' });
    assertEqual(m.hasContent(), true);
  });
  test('wieder entfernt → false', () => {
    const m = new State();
    const id = m.addActivity({ text: 'Task' });
    m.removeActivity({ activityId: id });
    assertEqual(m.hasContent(), false);
  });
});

suite('raci-matrix Model — Ableitung warnings', () => {
  test('Altprojekt: a2 ohne R, a3 mit zwei A, a4 ohne R und A', () => {
    assertDeepEqual(warnings(legacy()), [
      { activityId: 'a2', issues: ['noR'] },
      { activityId: 'a3', issues: ['multiA'] },
      { activityId: 'a4', issues: ['noR', 'noA'] },
    ]);
  });
  test('folgt den Kommandos', () => {
    const m = legacy();
    m.setRole({ activityId: 'a2', stakeholderId: 's1', role: 'R' });
    m.setRole({ activityId: 'a3', stakeholderId: 's3', role: '' });
    assertDeepEqual(warnings(m), [{ activityId: 'a4', issues: ['noR', 'noA'] }]);
  });
  test('ohne Beteiligte: jede Aktivität mit noR und noA; leer → []', () => {
    const m = new State();
    const id = m.addActivity({ text: 'T' });
    assertDeepEqual(warnings(m), [{ activityId: id, issues: ['noR', 'noA'] }]);
    assertDeepEqual(warnings(new State()), []);
  });
});

suite('raci-matrix Model — Lesefläche und Agentenkatalog', () => {
  const entry = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entry, m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('read() ohne Parameter: activities, stakeholders, assignments, warnings', () => {
    const out = read(legacy());
    assertDeepEqual(Object.keys(out), ['activities', 'stakeholders', 'assignments', 'warnings']);
    assertEqual(json(out.activities), json(LEGACY_STATE.activities));
    assertEqual(json(out.stakeholders), json(LEGACY_STATE.stakeholders));
    assertEqual(json(out.assignments), json(LEGACY_STATE.assignments));
    assertDeepEqual(out.warnings, warnings(legacy()));
  });
  test('Katalog: read und die neun Kommandos mit Objekt-Argumenten', () => {
    assertDeepEqual(Object.keys(entry.actions), [
      'read', 'addActivity', 'addStakeholder', 'renameActivity', 'renameStakeholder',
      'removeActivity', 'removeStakeholder', 'moveActivity', 'setRole', 'cycleRole',
    ]);
    assertDeepEqual(Object.keys(entry.actions.addActivity.keys), ['text']);
    assertDeepEqual(Object.keys(entry.actions.renameActivity.keys), ['activityId', 'value']);
    assertDeepEqual(Object.keys(entry.actions.renameStakeholder.keys), ['stakeholderId', 'value']);
    assertDeepEqual(Object.keys(entry.actions.moveActivity.keys), ['activityId', 'to']);
    assertDeepEqual(Object.keys(entry.actions.setRole.keys), ['activityId', 'stakeholderId', 'role']);
    assertDeepEqual(Object.keys(entry.actions.cycleRole.keys), ['activityId', 'stakeholderId']);
  });
  test('instance.set: die drei Felder; warnings ist abgeleitet', () => {
    assertDeepEqual(entry.settable, ['activities', 'stakeholders', 'assignments']);
    assertDeepEqual(entry.invariants, ['activityIds', 'stakeholderIds', 'knownCells']);
    assertEqual(entry.fields.warnings.derived, true);
  });
});
