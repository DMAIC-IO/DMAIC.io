/**
 * Makigami: Model (domain/model.js) — Schema und Vorgaben, Invarianten
 * (streng, mit Reparatur, beim Schreiben), jedes Kommando samt Ablehnung,
 * Rückfragen, letzter Eintrag, Umsortieren mit Endindex, Ableitungen und
 * Agentenkatalog.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State, MUDA_LABEL_KEYS } from '../../../js/modules/makigami/domain/model.js';
import { createDefaultMudaCategories, createDefaultTimeUnits } from '../../../js/modules/makigami/domain/defaults.js';
import { setModelName, confirmOf, defaultOf } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'makigami');

const SCHEMA = { _schema: { name: 'makigami', version: '1.0' } };
const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);
/** Die gespeicherten Felder ohne `_schema`. @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Ein gespeicherter Stand '1.0' mit zwei Rollen, drei Schritten und einer eigenen Art. */
const BASE = {
  title: 'Auftrag',
  roles: [{ id: 'r1', label: 'Kunde' }, { id: 'r2', label: '' }],
  steps: [
    { id: 's1', title: 'Anfrage', description: '', roleIds: ['r1'], processTime: '30min', waitTime: '1h', mudaIds: ['muda-waiting'], notes: '' },
    { id: 's2', title: '', description: '', roleIds: ['r1', 'r2'], processTime: '90min', waitTime: '', mudaIds: ['m-x'], notes: '' },
    { id: 's3', title: 'Ende', description: '', roleIds: [], processTime: '', waitTime: 'kaputt', mudaIds: [], notes: '' },
  ],
  mudaCategories: [...createDefaultMudaCategories(), { id: 'm-x', code: 'X', label: 'Eigen', color: '#123456' }],
  timeUnits: createDefaultTimeUnits(),
  collapsed: ['s2'],
  settingsOpen: false,
};
/** @returns {any} */
const base = () => State.fromJSON(plain({ ...SCHEMA, ...BASE }));
/** @param {object} m */
const derived = (m) => evaluateDerived(m, /** @type {any} */ (undefined), ['kpi', 'invalidTimes']);

suite('makigami Model — Schema und Vorgaben', () => {
  test('Felder, Ansichtsfelder, Kommandos, Invarianten, Ableitungen', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['title', 'roles', 'steps', 'mudaCategories', 'timeUnits']);
    assertDeepEqual(Object.keys(State.schema.view), ['collapsed', 'settingsOpen']);
    assertDeepEqual(Object.keys(State.schema.commands), [
      'addRole', 'addStep', 'addMudaCategory', 'addTimeUnit', 'setParticipation', 'setMuda', 'setRoleLabel',
      'setStepTitle', 'setStepDescription', 'setStepNotes', 'setStepProcessTime', 'setStepWaitTime',
      'normalizeStepTime', 'setMudaCategory', 'setTimeUnit', 'removeStep', 'removeRole', 'removeMudaCategory',
      'removeTimeUnit', 'moveStep', 'moveRole', 'resetSettingsToDefaults', 'toggleStepCollapsed', 'setSettingsOpen',
    ]);
    assertDeepEqual(Object.keys(State.schema.invariants), ['uniqueIds', 'mudaNotEmpty', 'unitsNotEmpty', 'knownRefs', 'knownCollapsed', 'mudaColorHex']);
    assertDeepEqual(Object.keys(State.schema.derived), ['kpi', 'invalidTimes']);
  });
  test('Schema-Vorgaben gleichen defaults.js, labelKey-Liste gleicht MUDA_LABEL_KEYS', () => {
    assertEqual(json(defaultOf(State.schema.fields.mudaCategories)), json(createDefaultMudaCategories()));
    assertEqual(json(defaultOf(State.schema.fields.timeUnits)), json(createDefaultTimeUnits()));
    assertDeepEqual([...State.schema.fields.mudaCategories.item.shape.labelKey.values], [...MUDA_LABEL_KEYS]);
    assertDeepEqual(createDefaultMudaCategories().map((c) => c.labelKey), [...MUDA_LABEL_KEYS]);
  });
  test('neue Instanz: leer, acht Arten, vier Einheiten, ohne Inhalt', () => {
    const m = new State();
    assertDeepEqual(fieldsOf(m), {
      title: '', roles: [], steps: [], mudaCategories: createDefaultMudaCategories(),
      timeUnits: createDefaultTimeUnits(), collapsed: [], settingsOpen: false,
    });
    assertEqual(m.hasContent(), false);
    m.addRole({});
    assertEqual(m.hasContent(), true);
  });
  test('Rundweg: gespeicherter Stand lädt ohne Reparatur unverändert', () => {
    const fields = [];
    const m = State.fromJSON(plain({ ...SCHEMA, ...BASE }), { repair: true, onRepair: (f) => fields.push(f) });
    assertDeepEqual(fields, []);
    assertEqual(json(fieldsOf(m)), json(BASE));
  });
});

suite('makigami Model — Invarianten', () => {
  test('doppelte ids: streng abgelehnt, mit Reparatur entfällt die spätere', () => {
    const dup = { ...SCHEMA, ...plain(BASE), roles: [{ id: 'r1', label: 'A' }, { id: 'r2', label: 'B' }, { id: 'r1', label: 'C' }] };
    assertEqual(thrown(() => State.fromJSON(plain(dup)))?.invariant, 'uniqueIds');
    const m = State.fromJSON(plain(dup), { repair: true });
    assertDeepEqual(m.roles.map((r) => r.label), ['A', 'B']);
  });
  test('leere Arten bzw. Einheiten (Stand 1.0): mit Reparatur die Vorgaben', () => {
    const m = State.fromJSON({ ...SCHEMA, ...plain(BASE), steps: [], collapsed: [], mudaCategories: [], timeUnits: [] }, { repair: true });
    assertEqual(json(m.mudaCategories), json(createDefaultMudaCategories()));
    assertEqual(json(m.timeUnits), json(createDefaultTimeUnits()));
  });
  test('verwaiste Bezüge (Stand 1.0): streng abgelehnt, mit Reparatur entfallen nur sie', () => {
    const orphan = { ...SCHEMA, ...plain(BASE), roles: [{ id: 'r2', label: '' }] };
    assertTrue(thrown(() => State.fromJSON(plain(orphan))) instanceof Error, 'streng');
    const m = State.fromJSON(plain(orphan), { repair: true });
    assertDeepEqual(m.steps.map((s) => [s.id, plain(s.roleIds)]), [['s1', []], ['s2', ['r2']], ['s3', []]]);
    assertEqual(m.steps[0].processTime, '30min');
  });
  test('zugeklappte Karte ohne Schritt heilt still, auch streng', () => {
    const m = State.fromJSON({ ...SCHEMA, ...plain(BASE), collapsed: ['s2', 'weg'] });
    assertDeepEqual(plain(m.collapsed), ['s2']);
  });
  test('Farbe einer Art: nicht #rrggbb streng abgelehnt, mit Reparatur die Vorgabe #888888, gültige bleiben', () => {
    const bad = { ...SCHEMA, ...plain(BASE), mudaCategories: [
      ...createDefaultMudaCategories(), { id: 'm-x', code: 'X', label: 'Eigen', color: 'red' },
      { id: 'm-y', code: 'Y', label: '', color: '#ABCDEF' },
    ] };
    assertEqual(thrown(() => State.fromJSON(plain(bad)))?.invariant, 'mudaColorHex');
    const m = State.fromJSON(plain(bad), { repair: true });
    assertDeepEqual(m.mudaCategories.slice(-2).map((c) => c.color), ['#888888', '#ABCDEF']);
    assertEqual(json(m.mudaCategories.slice(0, -2)), json(createDefaultMudaCategories()));
  });
  test('Farbe einer Art: Schreiben mit ungültigem Format abgelehnt (Kommando und instance.set), alter Wert bleibt', () => {
    const m = base();
    const before = json(fieldsOf(m));
    for (const color of ['', 'red', '#123', '#1234567', '123456', '#12345g', 'rgba(0,0,0,1)']) {
      assertEqual(thrown(() => m.setMudaCategory({ mudaId: 'm-x', color }))?.invariant, 'mudaColorHex', color);
    }
    const cats = plain(m.mudaCategories);
    cats[0].color = 'blau';
    assertEqual(thrown(() => { m.mudaCategories = cats; })?.invariant, 'mudaColorHex');
    assertEqual(json(fieldsOf(m)), before);
    m.setMudaCategory({ mudaId: 'm-x', color: '#A0b1C2' });
    assertEqual(m.mudaCategories.at(-1).color, '#A0b1C2');
  });
  test('Schreiben (instance.set): doppelte id, leere Liste, verwaiste Bezüge abgelehnt, alter Wert bleibt', () => {
    const m = base();
    const before = json(fieldsOf(m));
    assertEqual(thrown(() => { m.steps = [BASE.steps[0], BASE.steps[0]]; })?.invariant, 'uniqueIds');
    assertEqual(thrown(() => { m.mudaCategories = []; })?.invariant, 'mudaNotEmpty');
    assertEqual(thrown(() => { m.timeUnits = []; })?.invariant, 'unitsNotEmpty');
    assertEqual(thrown(() => { m.roles = [{ id: 'r2', label: '' }]; })?.invariant, 'knownRefs');
    assertEqual(thrown(() => { m.mudaCategories = createDefaultMudaCategories(); })?.invariant, 'knownRefs');
    assertTrue(thrown(() => { m.steps = [{ ...BASE.steps[0], roleIds: ['r-weg'] }]; }) instanceof Error, 'unbekannte Rolle');
    assertTrue(thrown(() => { m.roles = [{ id: '', label: 'x' }]; }) instanceof Error, 'leere id');
    assertEqual(thrown(() => { m.collapsed = ['weg']; })?.invariant, 'knownCollapsed');
    assertEqual(json(fieldsOf(m)), before);
  });
  test('Schreiben: gültige Werte werden angenommen', () => {
    const m = base();
    m.title = 'Neu';
    m.collapsed = [];
    m.settingsOpen = true;
    m.timeUnits = [{ id: 'u', label: 'h', factorSeconds: 3600 }];
    assertEqual(m.title, 'Neu');
    assertDeepEqual(derived(m).invalidTimes.length, 3);
  });
});

suite('makigami Model — Anlegen', () => {
  test('addRole/addStep/addMudaCategory/addTimeUnit liefern die neue id mit Präfix', () => {
    const m = new State();
    const r = m.addRole({});
    const s = m.addStep({});
    const c = m.addMudaCategory({});
    const u = m.addTimeUnit({});
    assertTrue(/^r-/.test(r) && /^s-/.test(s) && /^muda-/.test(c) && /^unit-/.test(u), json([r, s, c, u]));
    assertDeepEqual(plain(m.roles.at(-1)), { id: r, label: '' });
    assertDeepEqual(plain(m.steps.at(-1)), {
      id: s, title: '', description: '', roleIds: [], processTime: '', waitTime: '', mudaIds: [], notes: '',
    });
    assertDeepEqual(plain(m.mudaCategories.at(-1)), { id: c, code: '', label: '', color: '#888888' });
    assertDeepEqual(plain(m.timeUnits.at(-1)), { id: u, label: '', factorSeconds: 1 });
    assertTrue(m.addStep({}) !== s, 'zwei verschiedene ids');
    assertDeepEqual(plain(m.collapsed), []);
  });
});

suite('makigami Model — Mitwirkung, Verschwendung, Texte', () => {
  test('setParticipation setzt und nimmt zurück, ohne Doppel', () => {
    const m = base();
    m.setParticipation({ stepId: 's3', roleId: 'r2', participates: true });
    m.setParticipation({ stepId: 's3', roleId: 'r2', participates: true });
    assertDeepEqual(plain(m.steps[2].roleIds), ['r2']);
    m.setParticipation({ stepId: 's2', roleId: 'r1', participates: false });
    assertDeepEqual(plain(m.steps[1].roleIds), ['r2']);
  });
  test('setMuda setzt und nimmt zurück', () => {
    const m = base();
    m.setMuda({ stepId: 's3', mudaId: 'm-x', marked: true });
    assertDeepEqual(plain(m.steps[2].mudaIds), ['m-x']);
    m.setMuda({ stepId: 's1', mudaId: 'muda-waiting', marked: false });
    assertDeepEqual(plain(m.steps[0].mudaIds), []);
  });
  for (const [cmd, args, param] of [
    ['setParticipation', { stepId: 'weg', roleId: 'r1', participates: true }, 'stepId'],
    ['setParticipation', { stepId: 's1', roleId: 'weg', participates: true }, 'roleId'],
    ['setParticipation', { stepId: 's1', roleId: 'r1', participates: 'ja' }, 'participates'],
    ['setMuda', { stepId: 's1', mudaId: 'weg', marked: true }, 'mudaId'],
    ['setRoleLabel', { roleId: 'weg', label: 'x' }, 'roleId'],
    ['setStepTitle', { stepId: 's1', text: 5 }, 'text'],
    ['setStepProcessTime', { stepId: 'weg', text: '1h' }, 'stepId'],
    ['normalizeStepTime', { stepId: 's1', field: 'notes' }, 'field'],
    ['setTimeUnit', { unitId: 'unit-h', factorSeconds: 0 }, 'factorSeconds'],
    ['setTimeUnit', { unitId: 'unit-h', factorSeconds: -1 }, 'factorSeconds'],
    ['moveStep', { stepId: 's1', to: 3 }, 'to'],
    ['moveRole', { roleId: 'r1', to: -1 }, 'to'],
    ['removeStep', { stepId: 'weg' }, 'stepId'],
    ['removeRole', { roleId: 'weg' }, 'roleId'],
    ['removeMudaCategory', { mudaId: 'weg' }, 'mudaId'],
    ['removeTimeUnit', { unitId: 'weg' }, 'unitId'],
  ]) {
    test(`${cmd} ${json(args)}: abgelehnt mit param ${param}, Zustand unverändert`, () => {
      const m = base();
      const before = json(fieldsOf(m));
      assertEqual(thrown(() => m[cmd](args))?.param, param);
      assertEqual(json(fieldsOf(m)), before);
    });
  }
  test('Element-Setter: Rolle, Titel, Beschreibung, Notiz', () => {
    const m = base();
    m.setRoleLabel({ roleId: 'r2', label: 'Lager' });
    m.setStepTitle({ stepId: 's2', text: 'Mitte' });
    m.setStepDescription({ stepId: 's2', text: 'Tun' });
    m.setStepNotes({ stepId: 's2', text: 'Notiz' });
    assertEqual(m.roles[1].label, 'Lager');
    assertDeepEqual([m.steps[1].title, m.steps[1].description, m.steps[1].notes], ['Mitte', 'Tun', 'Notiz']);
  });
  test('setStepProcessTime/WaitTime speichern jeden Text und melden, ob er lesbar ist', () => {
    const m = base();
    assertEqual(m.setStepProcessTime({ stepId: 's3', text: '20 Minuten' }), false);
    assertEqual(m.steps[2].processTime, '20 Minuten');
    assertEqual(m.setStepWaitTime({ stepId: 's3', text: '2h' }), true);
    assertEqual(m.setStepWaitTime({ stepId: 's3', text: '' }), true);
    assertDeepEqual(derived(m).invalidTimes, [{ stepId: 's3', field: 'processTime' }]);
  });
  test('normalizeStepTime: lesbar → Normalform; leer, unlesbar oder schon normal → unverändert', () => {
    const m = base();
    m.normalizeStepTime({ stepId: 's2', field: 'processTime' });
    assertEqual(m.steps[1].processTime, '1h 30min');
    const after = json(fieldsOf(m));
    m.normalizeStepTime({ stepId: 's2', field: 'processTime' });
    m.normalizeStepTime({ stepId: 's2', field: 'waitTime' });
    m.normalizeStepTime({ stepId: 's3', field: 'waitTime' });
    assertEqual(json(fieldsOf(m)), after);
    assertEqual(m.steps[2].waitTime, 'kaputt');
  });
  test('setMudaCategory/setTimeUnit: nur die genannten Angaben; ohne Angabe abgelehnt', () => {
    const m = base();
    m.setMudaCategory({ mudaId: 'm-x', label: 'Neu' });
    assertDeepEqual(plain(m.mudaCategories.at(-1)), { id: 'm-x', code: 'X', label: 'Neu', color: '#123456' });
    m.setMudaCategory({ mudaId: 'm-x', code: 'Y', color: '#000000' });
    assertDeepEqual(plain(m.mudaCategories.at(-1)), { id: 'm-x', code: 'Y', label: 'Neu', color: '#000000' });
    assertTrue(thrown(() => m.setMudaCategory({ mudaId: 'm-x' })) instanceof Error, 'ohne Angabe');
    m.setTimeUnit({ unitId: 'unit-h', factorSeconds: 1800 });
    assertDeepEqual(plain(m.timeUnits[2]), { id: 'unit-h', label: 'h', factorSeconds: 1800 });
    m.setTimeUnit({ unitId: 'unit-h', label: 'hh' });
    assertEqual(m.timeUnits[2].label, 'hh');
    assertTrue(thrown(() => m.setTimeUnit({ unitId: 'unit-h' })) instanceof Error, 'ohne Angabe');
  });
  test('eine geänderte Einheit ändert, wie Dauertexte gelesen werden', () => {
    const m = base();
    assertEqual(derived(m).kpi.process, 1800 + 5400);
    m.setTimeUnit({ unitId: 'unit-min', factorSeconds: 1 });
    assertEqual(derived(m).kpi.process, 30 + 90);
    m.removeTimeUnit({ unitId: 'unit-min' });
    assertDeepEqual(derived(m).invalidTimes.map((i) => [i.stepId, i.field]), [['s1', 'processTime'], ['s2', 'processTime'], ['s3', 'waitTime']]);
  });
});

suite('makigami Model — Entfernen', () => {
  test('removeStep: Schritt und sein Eintrag in collapsed entfallen', () => {
    const m = base();
    m.removeStep({ stepId: 's2' });
    assertDeepEqual(m.steps.map((s) => s.id), ['s1', 's3']);
    assertDeepEqual(plain(m.collapsed), []);
  });
  test('removeRole: Rolle und ihre Mitwirkungen entfallen', () => {
    const m = base();
    m.removeRole({ roleId: 'r1' });
    assertDeepEqual(m.roles.map((r) => r.id), ['r2']);
    assertDeepEqual(m.steps.map((s) => plain(s.roleIds)), [[], ['r2'], []]);
  });
  test('removeMudaCategory: Art und ihre Kennzeichnungen entfallen', () => {
    const m = base();
    m.removeMudaCategory({ mudaId: 'm-x' });
    assertEqual(m.mudaCategories.length, 8);
    assertDeepEqual(plain(m.steps[1].mudaIds), []);
  });
  test('die letzte Art bzw. Einheit wird abgelehnt (param, hintKey), Zustand unverändert', () => {
    const m = base();
    for (const c of m.mudaCategories.slice(1).map((x) => x.id)) m.removeMudaCategory({ mudaId: c });
    for (const u of m.timeUnits.slice(1).map((x) => x.id)) m.removeTimeUnit({ unitId: u });
    const before = json(fieldsOf(m));
    const e = thrown(() => m.removeMudaCategory({ mudaId: 'muda-transport' }));
    assertEqual(e?.param, 'mudaId');
    assertEqual(e?.hintKey, 'hints.lastMuda');
    const f = thrown(() => m.removeTimeUnit({ unitId: 'unit-s' }));
    assertEqual(f?.param, 'unitId');
    assertEqual(f?.hintKey, 'hints.lastUnit');
    assertEqual(json(fieldsOf(m)), before);
  });
  test('Rückfragen: Schritt mit Titel bzw. Nummer, Rolle mit bzw. ohne Namen, Zurücksetzen; Entfernen der Arten ohne', () => {
    const m = base();
    assertDeepEqual(confirmOf(m, 'removeStep', { stepId: 's1' }), { key: 'confirm.removeStep', params: { title: 'Anfrage' } });
    assertDeepEqual(confirmOf(m, 'removeStep', { stepId: 's2' }), { key: 'confirm.removeStep', params: { title: 'S2' } });
    assertDeepEqual(confirmOf(m, 'removeRole', { roleId: 'r1' }), { key: 'confirm.removeRole', params: { label: 'Kunde' } });
    assertDeepEqual(confirmOf(m, 'removeRole', { roleId: 'r2' }), { key: 'confirm.removeRoleUnnamed' });
    assertDeepEqual(confirmOf(m, 'resetSettingsToDefaults', {}), { key: 'confirm.resetSettings' });
    assertEqual(confirmOf(m, 'removeMudaCategory', { mudaId: 'm-x' }), null);
    assertEqual(confirmOf(m, 'removeTimeUnit', { unitId: 'unit-s' }), null);
  });
  test('resetSettingsToDefaults: Vorgaben, Kennzeichnungen eigener Arten entfallen, vorgegebene bleiben', () => {
    const m = base();
    m.setTimeUnit({ unitId: 'unit-h', factorSeconds: 1 });
    m.setMudaCategory({ mudaId: 'muda-waiting', label: 'Liegezeit' });
    m.resetSettingsToDefaults({});
    assertEqual(json(m.mudaCategories), json(createDefaultMudaCategories()));
    assertEqual(json(m.timeUnits), json(createDefaultTimeUnits()));
    assertDeepEqual(m.steps.map((s) => plain(s.mudaIds)), [['muda-waiting'], [], []]);
  });
});

suite('makigami Model — Umsortieren mit Endindex', () => {
  test('moveStep nach vorn, ans Ende und an denselben Platz', () => {
    const m = base();
    m.moveStep({ stepId: 's3', to: 0 });
    assertDeepEqual(m.steps.map((s) => s.id), ['s3', 's1', 's2']);
    m.moveStep({ stepId: 's3', to: 2 });
    assertDeepEqual(m.steps.map((s) => s.id), ['s1', 's2', 's3']);
    const before = json(fieldsOf(m));
    m.moveStep({ stepId: 's2', to: 1 });
    assertEqual(json(fieldsOf(m)), before);
  });
  test('moveRole hoch und runter', () => {
    const m = base();
    m.moveRole({ roleId: 'r2', to: 0 });
    assertDeepEqual(m.roles.map((r) => r.id), ['r2', 'r1']);
    m.moveRole({ roleId: 'r2', to: 1 });
    assertDeepEqual(m.roles.map((r) => r.id), ['r1', 'r2']);
  });
});

suite('makigami Model — Klappen (nur Oberfläche)', () => {
  test('toggleStepCollapsed schaltet die id in collapsed; unbekannte id abgelehnt', () => {
    const m = base();
    assertDeepEqual(plain(m.collapsed), ['s2']);
    m.toggleStepCollapsed({ stepId: 's1' });
    assertDeepEqual(plain(m.collapsed), ['s2', 's1']);
    m.toggleStepCollapsed({ stepId: 's2' });
    assertDeepEqual(plain(m.collapsed), ['s1']);
    let err = null;
    try { m.toggleStepCollapsed({ stepId: 'weg' }); } catch (e) { err = e; }
    assertTrue(err !== null, 'unbekannte id angenommen');
    assertDeepEqual(plain(m.collapsed), ['s1']);
  });
  test('setSettingsOpen setzt das Ansichtsfeld; ohne Wahrheitswert abgelehnt', () => {
    const m = base();
    m.setSettingsOpen({ open: true });
    assertEqual(m.settingsOpen, true);
    m.setSettingsOpen({ open: false });
    assertEqual(m.settingsOpen, false);
    let err = null;
    try { m.setSettingsOpen({ open: 'ja' }); } catch (e) { err = e; }
    assertTrue(err !== null, 'Text angenommen');
  });
});

suite('makigami Model — Ableitungen und Agentenkatalog', () => {
  const entry = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entry, m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('kpi und invalidTimes', () => {
    const d = derived(base());
    assertDeepEqual(d.kpi, { process: 7200, wait: 3600, lead: 10800, pce: 7200 / 10800 });
    assertDeepEqual(d.invalidTimes, [{ stepId: 's3', field: 'waitTime' }]);
    assertEqual(derived(new State()).kpi.pce, null);
  });
  test('read(): Felder ohne Ansichtsfelder, steps als Umfang, mit Ableitungen', () => {
    const lean = read(base());
    assertDeepEqual(Object.keys(lean), ['title', 'roles', 'steps', 'mudaCategories', 'timeUnits', 'kpi', 'invalidTimes']);
    assertEqual(lean.steps.$bulk, true);
    const full = read(base(), { fields: ['steps'] });
    assertEqual(full.steps.length, 3);
    assertEqual(Object.hasOwn(full.steps[0], 'expanded'), false);
  });
  test('Katalog: Objekt-Argumente, Ansichtsfelder, Invarianten', () => {
    assertDeepEqual(Object.keys(entry.actions.moveStep.keys), ['stepId', 'to']);
    assertDeepEqual(Object.keys(entry.actions.setMudaCategory.keys), ['mudaId', 'code', 'label', 'color']);
    assertDeepEqual(Object.keys(entry.actions.setTimeUnit.keys), ['unitId', 'label', 'factorSeconds']);
    assertDeepEqual(entry.settable, ['title', 'roles', 'steps', 'mudaCategories', 'timeUnits']);
    assertDeepEqual(entry.viewFields, ['collapsed', 'settingsOpen']);
    assertDeepEqual(entry.invariants, ['uniqueIds', 'mudaNotEmpty', 'unitsNotEmpty', 'knownRefs', 'knownCollapsed', 'mudaColorHex']);
    assertEqual(entry.fields.kpi.derived, true);
    assertEqual(entry.fields.invalidTimes.derived, true);
    for (const old of ['setTitle', 'setStepExpanded', 'setSettingsOpen', 'toggleStepCollapsed', 'reorderSteps', 'reorderRoles']) {
      assertEqual(Object.hasOwn(entry.actions, old), false, old);
    }
  });
});
