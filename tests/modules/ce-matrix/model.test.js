/**
 * Tests for modules/ce-matrix/domain/model.js — Schema und Vorgaben,
 * gespeicherte Stände '1.0', Versionsprüfung, die Invarianten `inputIds`,
 * `outputIds` und `knownCells` (streng, mit Reparatur, beim Schreiben), alle
 * Kommandos samt Ablehnungen, Bewertungen bleiben beim Entfernen an ihrer
 * Zeile, `hasContent`, die Ableitungen und die Lesefläche.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/ce-matrix/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'ce-matrix');

const SCHEMA = { _schema: { name: 'ce-matrix', version: '1.0' } };

/** Das Altprojekt (`legacy-project.json`) nach 0→1.0, mit `_schema` '1.0'. */
const LEGACY_STATE = {
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
  paretoEdits: {},
};
const LEGACY = { ...SCHEMA, ...LEGACY_STATE };
const DEFAULT_STATE = {
  inputs: [{ id: 'i1', name: 'Input 1' }, { id: 'i2', name: 'Input 2' }, { id: 'i3', name: 'Input 3' }],
  outputs: [
    { id: 'o1', name: 'Output 1', weight: 1 }, { id: 'o2', name: 'Output 2', weight: 1 },
    { id: 'o3', name: 'Output 3', weight: 1 },
  ],
  scores: {},
  scale: '0-10',
  paretoEdits: {},
};

const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);
/** Die gespeicherten Felder ohne `_schema`. @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };
/** @param {object} m @returns {any} */
const derived = (m) => evaluateDerived(m, /** @type {any} */ (undefined), ['allowedScores', 'rowSums']);
/** @returns {any} */
const legacy = () => State.fromJSON(plain(LEGACY));
/** Der gespeicherte Stand mit geänderten Feldern. @param {object} patch */
const legacyWith = (patch) => ({ ...plain(LEGACY), ...patch });

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

suite('ce-matrix Model — Schema und Vorgaben', () => {
  test('vier Felder, ein Ansichtsfeld, acht Kommandos, drei Invarianten, zwei Ableitungen', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['inputs', 'outputs', 'scores', 'scale']);
    assertDeepEqual(Object.keys(State.schema.view), ['paretoEdits']);
    assertDeepEqual(Object.keys(State.schema.commands), [
      'addInput', 'addOutput', 'removeInput', 'removeOutput', 'setScore', 'setWeight', 'setInputName', 'setOutputName',
    ]);
    assertDeepEqual(Object.keys(State.schema.invariants), ['inputIds', 'outputIds', 'knownCells']);
    for (const inv of Object.values(State.schema.invariants)) assertEqual(typeof inv.repair, 'function');
    assertDeepEqual([...State.schema.invariants.inputIds.fields], ['inputs']);
    assertDeepEqual([...State.schema.invariants.outputIds.fields], ['outputs']);
    assertDeepEqual([...State.schema.invariants.knownCells.fields], ['scores', 'inputs', 'outputs']);
    assertDeepEqual(Object.keys(State.schema.derived), ['allowedScores', 'rowSums']);
  });
  test('Feldarten: Namen ohne trim/nonEmpty, Gewicht ganzzahlig 1..10, Bewertungen als map auf Zahlen', () => {
    const f = State.schema.fields;
    assertDeepEqual(Object.keys(f.inputs.item.shape), ['id', 'name']);
    assertDeepEqual(Object.keys(f.outputs.item.shape), ['id', 'name', 'weight']);
    for (const k of ['inputs', 'outputs']) {
      for (const p of ['id', 'name']) {
        assertEqual(f[k].item.shape[p].nonEmpty, undefined, `${k}.${p}`);
        assertEqual(f[k].item.shape[p].trim, undefined, `${k}.${p}`);
      }
    }
    const w = f.outputs.item.shape.weight;
    assertEqual(w.kind, 'number');
    assertEqual(w.integer, true);
    assertEqual(w.min, 1);
    assertEqual(w.max, 10);
    assertEqual(f.scores.kind, 'map');
    assertEqual(f.scores.value.kind, 'number');
  });
  test('Vorgabe: drei Zeilen, drei Spalten mit festen ids, kein Inhalt', () => {
    const m = new State();
    assertEqual(json(fieldsOf(m)), json(DEFAULT_STATE));
    assertEqual(m.hasContent(), false);
  });
});

suite('ce-matrix Model — gespeicherter Stand 1.0', () => {
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
    assertTrue(thrown(() => State.fromJSON(legacyWith({ inputs: ['A'] }))) instanceof Error);
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei', () => {
    assertEqual(json(State.fromJSON(plain(legacy().toJSON())).toJSON()), json(LEGACY));
  });
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'ce-matrix', version: '2.0' } };
    assertThrows(() => State.fromJSON(v2), /_schema\.version/);
    assertThrows(() => State.fromJSON(v2, { repair: true }), /_schema\.version/);
  });
  test('Gewicht außerhalb 1..10 ist in 1.0 ungültig; mit Reparatur entfällt die Spalte samt Bewertungen', () => {
    const outs = LEGACY_STATE.outputs.map((o) => (o.id === 'o3' ? { ...o, weight: 11 } : o));
    assertTrue(thrown(() => State.fromJSON(legacyWith({ outputs: outs }))) instanceof Error);
    const { m } = repaired(legacyWith({ outputs: outs }));
    assertDeepEqual(m.outputs.map((o) => o.id), ['o1', 'o2']);
    assertEqual(Object.keys(m.scores).some((k) => k.endsWith(':o3')), false);
  });
});

suite('ce-matrix Model — Invarianten beim Laden', () => {
  for (const [key, inv, prefix, extraItem] of [
    ['inputs', 'inputIds', 'i', {}], ['outputs', 'outputIds', 'o', { weight: 1 }],
  ]) {
    test(`${key}: doppelte id streng mit ${inv} abgewiesen; mit Reparatur entfällt nur die spätere`, () => {
      const j = legacyWith({ [key]: [...LEGACY_STATE[key], { id: `${prefix}1`, name: 'Doppelt', ...extraItem }] });
      const err = thrown(() => State.fromJSON(plain(j)));
      assertEqual(err?.invariant, inv);
      assertEqual(err?.param, key);
      const { m, fields } = repaired(j);
      assertDeepEqual(fields, [key]);
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
    test(`${key}: leere id und id mit Doppelpunkt bekommen eine neue`, () => {
      const list = [...LEGACY_STATE[key], { id: '', name: 'Leer', ...extraItem }, { id: `${prefix}:9`, name: 'Doppelpunkt', ...extraItem }];
      assertEqual(thrown(() => State.fromJSON(legacyWith({ [key]: list })))?.invariant, inv);
      const { m } = repaired(legacyWith({ [key]: list }));
      const items = m[key];
      assertEqual(items.length, LEGACY_STATE[key].length + 2);
      assertDeepEqual(items.map((x) => x.name).slice(-2), ['Leer', 'Doppelpunkt']);
      for (const x of items.slice(-2)) assertTrue(x.id !== '' && !x.id.includes(':') && x.id !== `${prefix}:9`, x.id);
      assertEqual(new Set(items.map((x) => x.id)).size, items.length);
      assertEqual(json(m.scores), json(LEGACY_STATE.scores));
    });
  }
  test('verwaiste Bewertung: streng mit knownCells abgewiesen; mit Reparatur entfällt nur sie', () => {
    const j = legacyWith({ scores: { ...LEGACY_STATE.scores, 'i9:o1': 1, 'i1:o9': 3, '0_0': 9 } });
    const err = thrown(() => State.fromJSON(plain(j)));
    assertEqual(err?.invariant, 'knownCells');
    assertEqual(err?.param, 'scores');
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['scores', 'inputs', 'outputs']);
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('keine Mindestzahl: ohne Zeilen und Spalten gültig', () => {
    const { m, fields } = repaired({ ...SCHEMA, inputs: [], outputs: [], scores: {}, scale: '0-10' });
    assertDeepEqual(fields, []);
    assertEqual(m.inputs.length + m.outputs.length, 0);
  });
});

suite('ce-matrix Model — Schreiben der Felder (instance.set)', () => {
  test('ganze Felder mit gültigen ids werden angenommen, auch Werte außerhalb der Skala', () => {
    const m = legacy();
    m.scores = { 'i3:o1': 7 };
    assertEqual(json(m.scores), json({ 'i3:o1': 7 }));
    m.scale = '0-10';
    assertEqual(m.scale, '0-10');
  });
  test('doppelte id und verwaiste Bewertung abgelehnt, alter Wert bleibt', () => {
    const m = legacy();
    assertEqual(thrown(() => { m.inputs = [{ id: 'x', name: 'a' }, { id: 'x', name: 'b' }]; })?.invariant, 'inputIds');
    assertEqual(thrown(() => { m.outputs = [{ id: '', name: 'a', weight: 1 }]; })?.invariant, 'outputIds');
    assertEqual(thrown(() => { m.scores = { 'i9:o1': 1 }; })?.invariant, 'knownCells');
    assertEqual(thrown(() => { m.inputs = LEGACY_STATE.inputs.slice(1); })?.invariant, 'knownCells');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('fremde Skala abgelehnt', () => {
    const m = legacy();
    assertTrue(thrown(() => { m.scale = '0-5'; }) instanceof Error);
    assertEqual(m.scale, '0-1-3-9');
  });
});

suite('ce-matrix Model — Anlegen', () => {
  test('addInput: Input <n+1>, liefert die neue id', () => {
    const m = new State();
    const id = m.addInput({});
    assertEqual(typeof id, 'string');
    assertDeepEqual(m.inputs.at(-1), { id, name: 'Input 4' });
    assertEqual(m.hasContent(), true);
  });
  test('addOutput: Output <n+1> mit Gewicht 1, liefert die neue id', () => {
    const m = new State();
    const id = m.addOutput({});
    assertDeepEqual(m.outputs.at(-1), { id, name: 'Output 4', weight: 1 });
  });
  test('zwei Einträge, zwei verschiedene ids; über execute', () => {
    const m = new State();
    const a = m.addInput({});
    const b = m.execute({ type: 'addInput' });
    assertTrue(a !== b);
    assertEqual(m.inputs.length, 5);
  });
});

suite('ce-matrix Model — Entfernen (Bewertungen bleiben an ihrer Zeile)', () => {
  test('removeInput: Zeile und nur ihre Bewertungen entfallen', () => {
    const m = legacy();
    m.removeInput({ inputId: 'i1' });
    assertDeepEqual(m.inputs.map((i) => i.id), ['i2', 'i3']);
    assertEqual(json(m.scores), json({ 'i2:o1': 3, 'i2:o2': 9, 'i3:o2': 5, 'i3:o3': 0 }));
    assertDeepEqual(derived(m).rowSums, [93, 35]);
  });
  test('removeOutput: Spalte, Gewicht und ihre Bewertungen entfallen', () => {
    const m = legacy();
    m.removeOutput({ outputId: 'o2' });
    assertDeepEqual(m.outputs.map((o) => [o.id, o.weight]), [['o1', 10], ['o3', 1]]);
    assertEqual(json(m.scores), json({ 'i1:o1': 9, 'i1:o3': 1, 'i2:o1': 3, 'i3:o3': 0 }));
  });
  test('ids mit gemeinsamem Anfang: nur die eigene id zählt', () => {
    const m = State.fromJSON({
      ...SCHEMA, inputs: [{ id: 'a', name: '' }, { id: 'ab', name: '' }], outputs: [{ id: 'b', name: '', weight: 1 }, { id: 'xb', name: '', weight: 1 }],
      scores: { 'a:b': 1, 'ab:b': 2, 'a:xb': 3, 'ab:xb': 4 }, scale: '0-10',
    });
    m.removeInput({ inputId: 'a' });
    m.removeOutput({ outputId: 'b' });
    assertEqual(json(m.scores), json({ 'ab:xb': 4 }));
  });
  test('die letzte Zeile bzw. Spalte wird abgelehnt (param, hintKey), Zustand unverändert', () => {
    const m = legacy();
    m.removeInput({ inputId: 'i1' });
    m.removeInput({ inputId: 'i2' });
    const before = json(fieldsOf(m));
    const e = thrown(() => m.removeInput({ inputId: 'i3' }));
    assertEqual(e?.param, 'inputId');
    assertEqual(e?.hintKey, 'lastInput');
    assertEqual(json(fieldsOf(m)), before);
    m.removeOutput({ outputId: 'o1' });
    m.removeOutput({ outputId: 'o2' });
    const f = thrown(() => m.removeOutput({ outputId: 'o3' }));
    assertEqual(f?.param, 'outputId');
    assertEqual(f?.hintKey, 'lastOutput');
    assertEqual(m.outputs.length, 1);
  });
  for (const [cmd, args, param] of [
    ['removeInput', { inputId: 'i9' }, 'inputId'], ['removeOutput', { outputId: 'o9' }, 'outputId'],
  ]) {
    test(`${cmd} ${json(args)}: abgelehnt mit param ${param}`, () => {
      const m = legacy();
      assertEqual(thrown(() => m[cmd](args))?.param, param);
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
  }
});

suite('ce-matrix Model — setScore', () => {
  test('setzt und ersetzt; null löscht', () => {
    const m = legacy();
    m.setScore({ inputId: 'i3', outputId: 'o1', value: 9 });
    assertEqual(m.scores['i3:o1'], 9);
    m.setScore({ inputId: 'i3', outputId: 'o1', value: 3 });
    assertEqual(m.scores['i3:o1'], 3);
    m.setScore({ inputId: 'i3', outputId: 'o1', value: null });
    assertEqual(Object.hasOwn(m.scores, 'i3:o1'), false);
  });
  test('ein vorhandener Eintrag behält seinen Platz', () => {
    const m = legacy();
    m.setScore({ inputId: 'i1', outputId: 'o1', value: 1 });
    assertEqual(Object.keys(m.scores)[0], 'i1:o1');
  });
  test('0-10 nimmt 10 an; außerhalb der Skala abgelehnt mit param value, Meldung nennt die Werte', () => {
    const m = new State();
    m.setScore({ inputId: 'i1', outputId: 'o1', value: 10 });
    assertEqual(m.scores['i1:o1'], 10);
    for (const v of [15, -5, 2.5]) {
      const e = thrown(() => m.setScore({ inputId: 'i1', outputId: 'o1', value: v }));
      assertEqual(e?.param, 'value');
      assertEqual(m.scores['i1:o1'], 10);
    }
    m.scale = '0-1-3-9';
    const e = thrown(() => m.setScore({ inputId: 'i1', outputId: 'o2', value: 5 }));
    assertTrue(/allowed: 0, 1, 3, 9/.test(e?.message ?? ''), e?.message);
    m.setScore({ inputId: 'i1', outputId: 'o2', value: 9 });
    assertEqual(m.scores['i1:o2'], 9);
  });
  test('fehlender Wert und fremde ids abgelehnt', () => {
    const m = legacy();
    assertTrue(thrown(() => m.setScore({ inputId: 'i1', outputId: 'o1' })) instanceof Error);
    assertEqual(thrown(() => m.setScore({ inputId: 'i9', outputId: 'o1', value: 3 }))?.param, 'inputId');
    assertEqual(thrown(() => m.setScore({ inputId: 'i1', outputId: 'o9', value: 3 }))?.param, 'outputId');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
});

suite('ce-matrix Model — setWeight, setInputName, setOutputName', () => {
  test('setWeight setzt das Gewicht der Spalte, die Summen folgen', () => {
    const m = legacy();
    m.setWeight({ outputId: 'o3', value: 10 });
    assertEqual(m.outputs[2].weight, 10);
    assertDeepEqual(derived(m).rowSums, [121, 93, 35]);
  });
  test('setWeight: Zahlentext wird Zahl (wie die Altform)', () => {
    const m = legacy();
    m.setWeight({ outputId: 'o1', value: /** @type {any} */ ('7') });
    assertEqual(m.outputs[0].weight, 7);
  });
  for (const v of [0, 11, 7.5, 'x', null]) {
    test(`setWeight ${json(v)} abgelehnt mit param value`, () => {
      const m = legacy();
      assertEqual(thrown(() => m.setWeight({ outputId: 'o1', value: v }))?.param, 'value');
      assertEqual(m.outputs[0].weight, 10);
    });
  }
  test('set…Name: Text wörtlich, auch leer; id und Bewertungen bleiben', () => {
    const m = legacy();
    m.setInputName({ inputId: 'i2', text: '  Neu  ' });
    m.setOutputName({ outputId: 'o1', text: '' });
    assertEqual(m.inputs[1].name, '  Neu  ');
    assertEqual(m.outputs[0].name, '');
    assertEqual(json(m.scores), json(LEGACY_STATE.scores));
  });
  test('fremde ids abgelehnt', () => {
    const m = legacy();
    assertEqual(thrown(() => m.setInputName({ inputId: 'o1', text: 'x' }))?.param, 'inputId');
    assertEqual(thrown(() => m.setOutputName({ outputId: 'i1', text: 'x' }))?.param, 'outputId');
    assertEqual(thrown(() => m.setWeight({ outputId: 'i1', value: 1 }))?.param, 'outputId');
  });
});

suite('ce-matrix Model — Ableitungen', () => {
  test('Altprojekt: Zeilensummen und erlaubte Bewertungen', () => {
    assertDeepEqual(derived(legacy()), { allowedScores: [0, 1, 3, 9], rowSums: [112, 93, 35] });
  });
  test('folgen Skala und Kommandos', () => {
    const m = legacy();
    m.scale = '0-3-7-10';
    m.setScore({ inputId: 'i3', outputId: 'o1', value: 7 });
    assertDeepEqual(derived(m), { allowedScores: [0, 3, 7, 10], rowSums: [112, 93, 105] });
  });
});

suite('ce-matrix Model — Lesefläche und Agentenkatalog', () => {
  const entry = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entry, m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('read() ohne Parameter: Felder und die zwei Ableitungen, ohne weights', () => {
    const out = read(legacy());
    assertDeepEqual(Object.keys(out), ['inputs', 'outputs', 'scores', 'scale', 'allowedScores', 'rowSums']);
    assertEqual(json(out.outputs), json(LEGACY_STATE.outputs));
    assertEqual(json(out.scores), json(LEGACY_STATE.scores));
    assertDeepEqual(out.rowSums, [112, 93, 35]);
    assertEqual(Object.hasOwn(out, 'weights'), false);
  });
  test('Katalog: read und die acht Kommandos mit Objekt-Argumenten', () => {
    assertDeepEqual(Object.keys(entry.actions), [
      'read', 'addInput', 'addOutput', 'removeInput', 'removeOutput', 'setScore', 'setWeight', 'setInputName', 'setOutputName',
    ]);
    assertDeepEqual(Object.keys(entry.actions.setScore.keys), ['inputId', 'outputId', 'value']);
    assertDeepEqual(Object.keys(entry.actions.setWeight.keys), ['outputId', 'value']);
    assertDeepEqual(Object.keys(entry.actions.setInputName.keys), ['inputId', 'text']);
    assertDeepEqual(Object.keys(entry.actions.removeOutput.keys), ['outputId']);
  });
  test('instance.set: die vier Felder; paretoEdits ist Ansichtsfeld; Ableitungen nur lesbar', () => {
    assertDeepEqual(entry.settable, ['inputs', 'outputs', 'scores', 'scale']);
    assertDeepEqual(entry.viewFields, ['paretoEdits']);
    assertDeepEqual(entry.invariants, ['inputIds', 'outputIds', 'knownCells']);
    assertEqual(entry.fields.rowSums.derived, true);
    assertEqual(entry.fields.allowedScores.derived, true);
  });
});
