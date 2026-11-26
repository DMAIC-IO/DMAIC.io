/**
 * Tests for modules/triz-sufield/domain/model.js — Schema und Vorgaben (fünf
 * Texte bzw. Auswahlen, Notizen und Vormerkungen je Standardlösung, zwei
 * Ansichtsfelder), gespeicherte Stände '1.0' ohne Migrationsschritt,
 * Versionsprüfung, die Invarianten `knownNotes`, `knownSelections` und
 * `validExpandedClasses`, Reparatur einzelner Einträge, die Kommandos
 * `setStandardNote`, `setStandardSelected` und `setExpandedClasses`, Schreiben
 * der Felder, `hasContent`, die Ableitungen `diagnosis` und `standards`, die
 * Lesefläche und der Agentenkatalog.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/triz-sufield/domain/model.js';
import { STANDARDS } from '../../../js/modules/triz-sufield/domain/standards.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'triz-sufield');

const SCHEMA = { _schema: { name: 'triz-sufield', version: '1.0' } };
const EMPTY_STATE = {
  s1: '', s2: '', field: '', link: '', problemNote: '', notes: {}, selected: {}, filterMode: 'auto', expandedClasses: [],
};
const EMPTY = { ...SCHEMA, ...EMPTY_STATE };

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema`. */
const LEGACY_STATE = {
  s1: 'Öl & Späne <Größe "M3"> im Kühlschmierstoff',
  s2: 'Fräser',
  field: 'E',
  link: 'excessive',
  problemNote: 'Funkenerosion greift die Schneide an.\nStrom zu hoch — Schneide überhitzt & bricht.',
  notes: {
    '2.2.5': 'Gepulster Strom statt Dauerstrom.\nSpitzen < 40 A & Pausen "kurz".',
    '5.3.1': 'Phasenwechsel im Kühlmittel nutzen —\nVerdampfung führt Wärme ab.',
  },
  selected: { '2.2.5': true, '4.2.1': true },
  filterMode: 'all',
  expandedClasses: [5, 2],
};
/** Derselbe Stand, wie ihn die Fixture speichert (mit `_schema` '1.0'). */
const LEGACY = { ...SCHEMA, ...LEGACY_STATE };

const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);
/** Die gespeicherten Felder ohne `_schema`. @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };

/** Stub-Übersetzer: macht den Schlüssel sichtbar. @param {string} key */
const T = (key) => `T:${key}`;
/** @param {object} m @param {string[]} [names] */
const derived = (m, names) => evaluateDerived(m, /** @type {any} */ (undefined), names, T);

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

/** Der Altstand mit geänderten Feldern. @param {object} patch */
const legacyWith = (patch) => ({ ...plain(LEGACY), ...patch });

suite('triz-sufield Model — Schema und Vorgaben', () => {
  test('sieben Felder in gespeicherter Reihenfolge, zwei Ansichtsfelder, drei Kommandos, drei Invarianten, zwei Ableitungen', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['s1', 's2', 'field', 'link', 'problemNote', 'notes', 'selected']);
    assertDeepEqual(Object.keys(State.schema.view), ['filterMode', 'expandedClasses']);
    assertDeepEqual(Object.keys(State.schema.commands), ['setStandardNote', 'setStandardSelected', 'setExpandedClasses']);
    assertDeepEqual(Object.keys(State.schema.invariants), ['knownNotes', 'knownSelections', 'validExpandedClasses']);
    for (const inv of Object.values(State.schema.invariants)) assertEqual(typeof inv.repair, 'function');
    assertDeepEqual([...State.schema.invariants.knownNotes.fields], ['notes']);
    assertDeepEqual([...State.schema.invariants.knownSelections.fields], ['selected']);
    assertDeepEqual([...State.schema.invariants.validExpandedClasses.fields], ['expandedClasses']);
    assertDeepEqual(Object.keys(State.schema.derived), ['diagnosis', 'standards']);
    assertDeepEqual([...State.schema.derivedBulk], ['standards']);
  });
  test('Feldarten: Texte ohne trim/nonEmpty, Auswahlen mit leerem Text, zwei Maps', () => {
    const f = State.schema.fields;
    for (const k of ['s1', 's2', 'problemNote']) {
      assertEqual(f[k].kind, 'text', k);
      assertEqual(f[k].trim, undefined, k);
      assertEqual(f[k].nonEmpty, undefined, k);
    }
    assertEqual(f.field.kind, 'oneOf');
    assertEqual(f.link.kind, 'oneOf');
    assertEqual(f.field.nullable, undefined);
    assertEqual(f.notes.kind, 'map');
    assertEqual(f.notes.key.kind, 'text');
    assertEqual(f.notes.value.kind, 'text');
    assertEqual(f.selected.kind, 'map');
    assertEqual(f.selected.value.kind, 'boolean');
    const v = State.schema.view;
    assertDeepEqual([...v.filterMode.values], ['auto', 'all']);
    assertEqual(v.expandedClasses.kind, 'list');
    assertEqual(v.expandedClasses.item.kind, 'number');
    assertEqual(v.expandedClasses.item.integer, true);
  });
  test('Vorgaben: alles leer, Filter auto, keine Klasse offen, kein Inhalt', () => {
    const m = new State();
    assertEqual(json(fieldsOf(m)), json(EMPTY_STATE));
    assertEqual(m.hasContent(), false);
  });
  test('toJSON eines neuen Models: _schema, dann die Felder in Reihenfolge der Altform', () => {
    assertEqual(json(new State().toJSON()), json(EMPTY));
  });
});

suite('triz-sufield Model — gespeicherter Stand 1.0 (Altprojekt)', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich mit der Fixture', () => {
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY))), null);
    const { m, fields } = repaired(plain(LEGACY));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json(LEGACY));
  });
  test('Klassen bleiben in gespeicherter Reihenfolge [5, 2]', () => {
    assertDeepEqual([...State.fromJSON(plain(LEGACY)).expandedClasses], [5, 2]);
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(LEGACY)).toJSON()), json(LEGACY));
  });
  test('läuft ohne Migrationsschritt: ein Notizwert, den 0→1.0 verwarf, bleibt streng ungültig', () => {
    const j = legacyWith({ notes: { ...LEGACY_STATE.notes, '1.1.1': 7 } });
    assertTrue(thrown(() => State.fromJSON(j)) instanceof Error);
  });
  test('Schlüssel in fremder Reihenfolge kommen in Schema-Reihenfolge heraus', () => {
    const j = Object.fromEntries(Object.entries(plain(LEGACY)).reverse());
    assertEqual(json(State.fromJSON(j).toJSON()), json(LEGACY));
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei, auch für den leeren Stand', () => {
    for (const j of [LEGACY, EMPTY]) {
      assertEqual(json(State.fromJSON(plain(State.fromJSON(plain(j)).toJSON())).toJSON()), json(j));
    }
  });
  test('Altprojekt ohne _schema lädt über 0→1.0 ohne Reparatur', () => {
    const { m, fields } = repaired(plain(LEGACY_STATE));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json(LEGACY));
  });
  test('{} lädt als leeres Model', () => {
    const m = State.fromJSON({});
    assertEqual(json(m.toJSON()), json(EMPTY));
    assertEqual(m.hasContent(), false);
  });
});

suite('triz-sufield Model — Versionsprüfung', () => {
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'triz-sufield', version: '2.0' } };
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

suite('triz-sufield Model — Invarianten knownNotes und knownSelections', () => {
  for (const [key, inv, extra] of [['notes', 'knownNotes', { '9.9.9': 'fremd' }], ['selected', 'knownSelections', { '9.9.9': true }]]) {
    test(`${key} mit fremder id: streng wirft mit ${inv}; mit Reparatur entfällt nur sie`, () => {
      const j = legacyWith({ [key]: { ...LEGACY_STATE[key], ...extra } });
      const err = thrown(() => State.fromJSON(plain(j)));
      assertEqual(err?.invariant, inv);
      assertEqual(err?.param, key);
      const { m, fields } = repaired(j);
      assertDeepEqual(fields, [key]);
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
    test(`${key} mit Schlüssel „2.2“ (Gruppe statt Lösung) entfällt ebenso`, () => {
      const { m } = repaired(legacyWith({ [key]: { ...LEGACY_STATE[key], '2.2': extra['9.9.9'] } }));
      assertEqual(json(m[key]), json(LEGACY_STATE[key]));
    });
  }
});

suite('triz-sufield Model — Invariante validExpandedClasses (nur Ansichtsfeld)', () => {
  test('[2, 2, 7, 5] → [2, 5], auch streng still', () => {
    const j = legacyWith({ expandedClasses: [2, 2, 7, 5] });
    assertEqual(thrown(() => State.fromJSON(plain(j))), null);
    assertDeepEqual([...State.fromJSON(plain(j)).expandedClasses], [2, 5]);
    const { m } = repaired(plain(j));
    assertDeepEqual([...m.expandedClasses], [2, 5]);
    assertEqual(json({ ...fieldsOf(m), expandedClasses: null }), json({ ...LEGACY_STATE, expandedClasses: null }));
  });
  test('0 und 6 entfallen, die erste von Doppelten bleibt an ihrem Platz', () => {
    assertDeepEqual([...State.fromJSON(legacyWith({ expandedClasses: [0, 4, 6, 1, 4] })).expandedClasses], [4, 1]);
  });
});

suite('triz-sufield Model — Reparatur einzelner Einträge', () => {
  test('Notizwert kein Text: streng wirft; mit Reparatur entfällt nur dieser Eintrag', () => {
    const j = legacyWith({ notes: { ...LEGACY_STATE.notes, '1.1.1': 7 } });
    assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['notes']);
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('Auswahlwert kein Wahrheitswert: streng wirft; mit Reparatur entfällt nur dieser Eintrag', () => {
    const j = legacyWith({ selected: { ...LEGACY_STATE.selected, '1.1.1': 1 } });
    assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['selected']);
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('notes kein Objekt: mit Reparatur nur dieses Feld leer', () => {
    const { m, fields } = repaired(legacyWith({ notes: 'x' }));
    assertDeepEqual(fields, ['notes']);
    assertEqual(json(fieldsOf(m)), json({ ...LEGACY_STATE, notes: {} }));
  });
  test('field und link außerhalb der Liste fallen auf leer, der Rest bleibt', () => {
    const { m, fields } = repaired(legacyWith({ field: 'X', link: 'nutzlos' }));
    assertDeepEqual(fields, ['field', 'link']);
    assertEqual(json(fieldsOf(m)), json({ ...LEGACY_STATE, field: '', link: '' }));
  });
  test('filterMode außerhalb der Liste fällt auf auto', () => {
    const { m } = repaired(legacyWith({ filterMode: 'everything' }));
    assertEqual(m.filterMode, 'auto');
    assertEqual(json({ ...fieldsOf(m), filterMode: 'all' }), json(LEGACY_STATE));
  });
  test('s1 kein Text: mit Reparatur nur dieses Feld leer', () => {
    const { m, fields } = repaired(legacyWith({ s1: 42 }));
    assertDeepEqual(fields, ['s1']);
    assertEqual(json(fieldsOf(m)), json({ ...LEGACY_STATE, s1: '' }));
  });
});

suite('triz-sufield Model — setStandardNote', () => {
  test('setzt eine Notiz, die übrigen bleiben', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setStandardNote({ stdId: '1.1.1', text: 'neu & <b>\n"x"' });
    assertEqual(json(m.notes), json({ ...LEGACY_STATE.notes, '1.1.1': 'neu & <b>\n"x"' }));
  });
  test('ersetzt eine vorhandene Notiz', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setStandardNote({ stdId: '2.2.5', text: 'anders' });
    assertEqual(m.notes['2.2.5'], 'anders');
    assertEqual(m.notes['5.3.1'], LEGACY_STATE.notes['5.3.1']);
  });
  test('leerer Text löscht den Schlüssel; eine fehlende Notiz leeren ändert nichts', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setStandardNote({ stdId: '2.2.5', text: '' });
    assertEqual(json(m.notes), json({ '5.3.1': LEGACY_STATE.notes['5.3.1'] }));
    m.setStandardNote({ stdId: '1.1.1', text: '' });
    assertEqual(json(m.notes), json({ '5.3.1': LEGACY_STATE.notes['5.3.1'] }));
  });
  test('über execute', () => {
    const m = new State();
    m.execute({ type: 'setStandardNote', stdId: '2.2.5', text: 'a' });
    assertEqual(json(m.notes), json({ '2.2.5': 'a' }));
  });
  for (const [name, cmd, param] of [
    ['fremde id 9.9.9', { stdId: '9.9.9', text: 'x' }, 'stdId'],
    ['Gruppe 2.2', { stdId: '2.2', text: 'x' }, 'stdId'],
    ['stdId als Liste', { stdId: ['2.2.5'], text: 'x' }, 'stdId'],
    ['text kein Text', { stdId: '2.2.5', text: 7 }, 'text'],
  ]) {
    test(`${name}: abgelehnt mit param ${param}, Zustand unverändert`, () => {
      const m = State.fromJSON(plain(LEGACY));
      const err = thrown(() => m.setStandardNote(/** @type {any} */ (cmd)));
      assertEqual(err?.param, param);
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
  }
});

suite('triz-sufield Model — setStandardSelected', () => {
  test('true merkt vor, false nimmt die Vormerkung zurück', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setStandardSelected({ stdId: '1.1.1', selected: true });
    assertEqual(json(m.selected), json({ ...LEGACY_STATE.selected, '1.1.1': true }));
    m.setStandardSelected({ stdId: '2.2.5', selected: false });
    assertEqual(json(m.selected), json({ '4.2.1': true, '1.1.1': true }));
    m.setStandardSelected({ stdId: '3.1.1', selected: false });
    assertEqual(json(m.selected), json({ '4.2.1': true, '1.1.1': true }));
  });
  test('über execute', () => {
    const m = new State();
    m.execute({ type: 'setStandardSelected', stdId: '5.5.3', selected: true });
    assertEqual(json(m.selected), json({ '5.5.3': true }));
  });
  for (const [name, cmd, param] of [
    ['fremde id 9.9.9', { stdId: '9.9.9', selected: true }, 'stdId'],
    ['stdId als Liste', { stdId: ['2.2.5'], selected: true }, 'stdId'],
    ['selected kein Wahrheitswert', { stdId: '2.2.5', selected: 'ja' }, 'selected'],
  ]) {
    test(`${name}: abgelehnt mit param ${param}, Zustand unverändert`, () => {
      const m = State.fromJSON(plain(LEGACY));
      const err = thrown(() => m.setStandardSelected(/** @type {any} */ (cmd)));
      assertEqual(err?.param, param);
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
  }
});

suite('triz-sufield Model — setExpandedClasses', () => {
  test('schreibt die Liste in der gegebenen Reihenfolge, auch leer', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setExpandedClasses({ classes: [4, 1, 3] });
    assertDeepEqual([...m.expandedClasses], [4, 1, 3]);
    m.setExpandedClasses({ classes: [] });
    assertDeepEqual([...m.expandedClasses], []);
    assertEqual(json({ ...fieldsOf(m), expandedClasses: null }), json({ ...LEGACY_STATE, expandedClasses: null }));
  });
  test('über execute; die übergebene Liste wird nicht geteilt', () => {
    const m = new State();
    const classes = [2];
    m.execute({ type: 'setExpandedClasses', classes });
    classes.push(3);
    assertDeepEqual([...m.expandedClasses], [2]);
  });
  test('Parameter: ganze Zahlen 1 bis 5', () => {
    const p = State.schema.commands.setExpandedClasses.params.classes;
    assertEqual(p.kind, 'list');
    assertEqual(p.item.integer, true);
    assertEqual(p.item.min, 1);
    assertEqual(p.item.max, 5);
  });
  for (const [name, classes] of [['0', [0]], ['6', [6]], ['1.5', [1.5]], ['Doppelte', [2, 3, 2]], ['kein Zahlwert', ['zwei']], ['keine Liste', 2]]) {
    test(`${name}: abgelehnt mit param classes, Zustand unverändert`, () => {
      const m = State.fromJSON(plain(LEGACY));
      const err = thrown(() => m.setExpandedClasses(/** @type {any} */ ({ classes })));
      assertTrue(err instanceof Error);
      assertTrue(String(err?.param).startsWith('classes'), String(err?.param));
      assertDeepEqual([...m.expandedClasses], [5, 2]);
    });
  }
});

suite('triz-sufield Model — Schreiben der Felder (instance.set)', () => {
  test('Texte nehmen jeden Text, auch leer', () => {
    const m = new State();
    m.s1 = 'a'; m.s2 = ''; m.problemNote = 'x\ny';
    assertEqual(json([m.s1, m.s2, m.problemNote]), json(['a', '', 'x\ny']));
  });
  test('field und link aus der Liste oder leer; X und nutzlos abgelehnt', () => {
    const m = new State();
    m.field = 'Mg'; m.link = 'harmful';
    assertEqual(m.field, 'Mg');
    m.field = ''; m.link = '';
    assertEqual(json([m.field, m.link]), json(['', '']));
    assertEqual(thrown(() => { m.field = /** @type {any} */ ('X'); })?.param, 'field');
    assertEqual(thrown(() => { m.link = /** @type {any} */ ('nutzlos'); })?.param, 'link');
    assertEqual(json(fieldsOf(m)), json(EMPTY_STATE));
  });
  test('notes und selected als Ganzes; eine fremde id lehnt die Invariante ab', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.notes = { '1.1.1': 'a' };
    assertEqual(json(m.notes), json({ '1.1.1': 'a' }));
    const err = thrown(() => { m.notes = { '1.1.1': 'a', '9.9.9': 'b' }; });
    assertEqual(err?.invariant, 'knownNotes');
    assertEqual(json(m.notes), json({ '1.1.1': 'a' }));
    assertEqual(thrown(() => { m.selected = { x: true }; })?.invariant, 'knownSelections');
    assertEqual(json(m.selected), json(LEGACY_STATE.selected));
  });
  test('expandedClasses mit Doppelten lehnt die Invariante ab', () => {
    const m = new State();
    assertEqual(thrown(() => { m.expandedClasses = [2, 2]; })?.invariant, 'validExpandedClasses');
    assertDeepEqual([...m.expandedClasses], []);
  });
});

suite('triz-sufield Model — hasContent', () => {
  for (const [key, v] of [['s1', 'x'], ['s2', 'x'], ['field', 'M'], ['link', 'useful'], ['problemNote', 'x']]) {
    test(`${key} → true, zurückgenommen → false`, () => {
      const m = new State();
      m[key] = v;
      assertEqual(m.hasContent(), true);
      m[key] = '';
      assertEqual(m.hasContent(), false);
    });
  }
  test('eine Notiz → true, über das Kommando geleert → false', () => {
    const m = new State();
    m.setStandardNote({ stdId: '2.2.5', text: 'x' });
    assertEqual(m.hasContent(), true);
    m.setStandardNote({ stdId: '2.2.5', text: '' });
    assertEqual(m.hasContent(), false);
  });
  test('eine Vormerkung → true, zurückgenommen → false', () => {
    const m = new State();
    m.setStandardSelected({ stdId: '2.2.5', selected: true });
    assertEqual(m.hasContent(), true);
    m.setStandardSelected({ stdId: '2.2.5', selected: false });
    assertEqual(m.hasContent(), false);
  });
  test('eine leer getippte Notiz zählt', () => {
    const m = new State();
    m.notes = { '2.2.5': '' };
    assertEqual(m.hasContent(), true);
  });
  test('Ansichtsfelder zählen nicht', () => {
    const m = new State();
    m.filterMode = 'all';
    m.setExpandedClasses({ classes: [1, 2, 3] });
    assertEqual(m.hasContent(), false);
  });
  test('Altprojekt → true', () => {
    assertEqual(State.fromJSON(plain(LEGACY)).hasContent(), true);
  });
});

suite('triz-sufield Model — Ableitung diagnosis', () => {
  /** @param {object} patch */
  const diag = (patch) => {
    const m = new State();
    Object.assign(m, patch);
    return evaluateDerived(m, /** @type {any} */ (undefined), ['diagnosis']).diagnosis;
  };
  test('je Lage wie diagnose(), ohne Übersetzer', () => {
    assertDeepEqual(diag({}), { situation: 'partial', suggestedClasses: [1] });
    assertDeepEqual(diag({ s1: 'a', s2: '  ' }), { situation: 'partial', suggestedClasses: [1] });
    assertDeepEqual(diag({ s1: 'a', s2: 'b', link: 'useful' }), { situation: 'incomplete', suggestedClasses: [1] });
    assertDeepEqual(diag({ s1: 'a', s2: 'b', field: 'M', link: 'missing' }), { situation: 'incomplete', suggestedClasses: [1] });
    assertDeepEqual(diag({ s1: 'a', s2: 'b', field: 'M' }), { situation: 'incomplete', suggestedClasses: [1] });
    assertDeepEqual(diag({ s1: 'a', s2: 'b', field: 'M', link: 'useful' }), { situation: 'complete-useful', suggestedClasses: [2, 3] });
    assertDeepEqual(diag({ s1: 'a', s2: 'b', field: 'T', link: 'insufficient' }), { situation: 'complete-insufficient', suggestedClasses: [2] });
    assertDeepEqual(diag({ s1: 'a', s2: 'b', field: 'E', link: 'excessive' }), { situation: 'complete-excessive', suggestedClasses: [2, 5] });
    assertDeepEqual(diag({ s1: 'a', s2: 'b', field: 'C', link: 'harmful' }), { situation: 'complete-harmful', suggestedClasses: [1, 5] });
  });
  test('Altprojekt → complete-excessive mit Klassen 2 und 5', () => {
    assertDeepEqual(derived(State.fromJSON(plain(LEGACY)), ['diagnosis']).diagnosis, { situation: 'complete-excessive', suggestedClasses: [2, 5] });
  });
});

suite('triz-sufield Model — Ableitung standards', () => {
  test('78 Zeilen in Tabellenreihenfolge mit fünf Schlüsseln, Titel und Auslöser aus t', () => {
    const rows = derived(new State(), ['standards']).standards;
    assertEqual(rows.length, 78);
    rows.forEach((r, i) => {
      assertDeepEqual(Object.keys(r), ['id', 'class', 'group', 'title', 'trigger']);
      const s = STANDARDS[i];
      assertDeepEqual(r, { id: s.id, class: s.class, group: s.group, title: `T:standards.${s.id}.title`, trigger: `T:standards.${s.id}.trigger` });
    });
  });
  test('unabhängig vom Stand und vom Listenfilter', () => {
    assertEqual(json(derived(State.fromJSON(plain(LEGACY)), ['standards'])), json(derived(new State(), ['standards'])));
  });
  test('ohne t ein Fehlereintrag statt zu werfen', () => {
    const out = evaluateDerived(new State(), /** @type {any} */ (undefined), ['standards']);
    assertTrue(typeof out.standards.error === 'string');
  });
});

suite('triz-sufield Model — Lesefläche und Agentenkatalog', () => {
  const entry = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => {
    const values = derived(m);
    return readSchemaModel(entry, m, options, {
      ...values, standardsColumns: ['id', 'class', 'group', 'title', 'trigger'],
    });
  };

  test('read() ohne Parameter: sieben Felder, Diagnose, standards als Tabellen-Deskriptor mit 78 Zeilen, keine Ansichtsfelder', () => {
    const out = read(State.fromJSON(plain(LEGACY)));
    assertDeepEqual(Object.keys(out), ['s1', 's2', 'field', 'link', 'problemNote', 'notes', 'selected', 'diagnosis', 'standards']);
    for (const k of ['s1', 's2', 'field', 'link', 'problemNote']) assertEqual(out[k], LEGACY_STATE[k], k);
    assertEqual(json(out.notes), json(LEGACY_STATE.notes));
    assertEqual(json(out.selected), json(LEGACY_STATE.selected));
    assertDeepEqual(out.diagnosis, { situation: 'complete-excessive', suggestedClasses: [2, 5] });
    assertEqual(out.standards.$bulk, true);
    assertEqual(out.standards.kind, 'table');
    assertEqual(out.standards.rowCount, 78);
    assertDeepEqual(out.standards.columns, ['id', 'class', 'group', 'title', 'trigger']);
  });
  test('read({ fields: [standards], rows }): die Zeilen', () => {
    const out = read(new State(), { fields: ['standards'], rows: { from: 0, to: 2 } });
    assertEqual(json(out.standards), json(derived(new State(), ['standards']).standards.slice(0, 2)));
  });
  test('Katalog: read und die drei Kommandos', () => {
    assertDeepEqual(Object.keys(entry.actions), ['read', 'setStandardNote', 'setStandardSelected', 'setExpandedClasses']);
    assertDeepEqual(Object.keys(entry.actions.setStandardNote.keys), ['stdId', 'text']);
    assertDeepEqual(Object.keys(entry.actions.setStandardSelected.keys), ['stdId', 'selected']);
    assertDeepEqual(Object.keys(entry.actions.setExpandedClasses.keys), ['classes']);
  });
  test('instance.set: die sieben Felder, keine Ansichtsfelder; standards ist Massenfeld aus einer Ableitung', () => {
    assertDeepEqual(entry.settable, ['s1', 's2', 'field', 'link', 'problemNote', 'notes', 'selected']);
    assertDeepEqual(entry.invariants, ['knownNotes', 'knownSelections', 'validExpandedClasses']);
    assertEqual(entry.fields.standards.derived, true);
    assertEqual(entry.fields.standards.bulk, true);
    assertEqual(entry.fields.standards.bulkKind, 'table');
    assertEqual(entry.fields.diagnosis.derived, true);
  });
});
