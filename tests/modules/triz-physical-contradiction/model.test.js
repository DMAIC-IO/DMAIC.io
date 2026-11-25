/**
 * Tests for modules/triz-physical-contradiction/domain/model.js — Schema und
 * Vorgaben (vier Texte, ein record aus Text, eine nullbare Wahl), gespeicherte
 * Stände '1.0' ohne Migrationsschritt (zeichengleich zurück), Stände ohne
 * `_schema` über '0→1.0', das Kommando `swap`, Schreiben der Wahl und aller
 * Notizen, Versionsprüfung, Reparatur unlesbarer Stände, `hasContent` und
 * das Beispiel am bisherigen Ort.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/triz-physical-contradiction/domain/model.js';
import { PRINCIPLES } from '../../../js/modules/triz-physical-contradiction/domain/principles.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';

setModelName(State, 'triz-physical-contradiction');

const PRINC = ['time', 'space', 'condition', 'system'];
const FIELDS = ['parameter', 'requirementA', 'requirementNotA', 'problemNote', 'principleNotes', 'selectedPrinciple', 'solutionNote'];
const SCHEMA = { _schema: { name: 'triz-physical-contradiction', version: '1.0' } };
const EMPTY_NOTES = { time: '', space: '', condition: '', system: '' };
const EMPTY = {
  ...SCHEMA,
  parameter: '', requirementA: '', requirementNotA: '', problemNote: '',
  principleNotes: EMPTY_NOTES, selectedPrinciple: null, solutionNote: '',
};

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`). */
const LEGACY = {
  _schema: { name: 'triz-physical-contradiction', version: '1.0' },
  parameter: 'Spaltmaß der Tür & Dichtung <Typ "B">',
  requirementA: 'groß — leichtes Schließen bei Kälte & Eis (> 4 mm)',
  requirementNotA: 'klein — dicht gegen Zugluft "ohne Pfeifen" (< 2 mm)',
  problemNote: 'Beschwerden über Zugluft im Winter.\nMessung: Spalt 3,5 mm ± 0,5 — „zu groß“ laut Kunde.',
  principleNotes: {
    time: 'Spalt nur beim Schließen groß: Dichtung fährt erst nach dem Einrasten aus.\nAktor oder Feder?',
    space: '',
    condition: 'Dichtung aus Formgedächtnis-Elastomer: weich < 0 °C, quillt bei Nässe & schließt den Spalt.\nTest „Kältekammer“ geplant.',
    system: 'Zweite Dichtlippe im Rahmen <Supersystem>;\nTür bleibt "wie sie ist".',
  },
  selectedPrinciple: 'condition',
  solutionNote: 'Quellende Dichtung als Lösungsrichtung.\nMuster bestellen & Zugluft messen (Ziel < 0,2 m/s).',
};

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Die gespeicherten Felder ohne `_schema`. @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };
const LEGACY_FIELDS = (() => { const { _schema, ...rest } = plain(LEGACY); return rest; })();

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} json */
function repaired(json) {
  const fields = [];
  const m = State.fromJSON(json, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

suite('triz-physical-contradiction Model — Schema und Vorgaben', () => {
  test('sieben Felder in gespeicherter Reihenfolge, kein Ansichtsfeld, ein Kommando swap ohne Parameter', () => {
    assertDeepEqual(Object.keys(State.schema.fields), FIELDS);
    for (const f of ['parameter', 'requirementA', 'requirementNotA', 'problemNote', 'solutionNote']) {
      assertEqual(State.schema.fields[f].kind, 'text', f);
    }
    assertEqual(State.schema.fields.principleNotes.kind, 'record');
    assertEqual(State.schema.fields.principleNotes.value.kind, 'text');
    assertEqual(State.schema.fields.selectedPrinciple.kind, 'oneOf');
    assertEqual(State.schema.fields.selectedPrinciple.nullable, true);
    assertDeepEqual(Object.keys(State.schema.view), []);
    assertDeepEqual(Object.keys(State.schema.commands), ['swap']);
    assertDeepEqual(Object.keys(State.schema.commands.swap.params), []);
  });
  test('PRINCIPLES gleicht beiden Literalen im Schema und ist eingefroren', () => {
    assertDeepEqual([...PRINCIPLES], PRINC);
    assertDeepEqual([...State.schema.fields.principleNotes.keys], PRINC);
    assertDeepEqual([...State.schema.fields.selectedPrinciple.values], PRINC);
    assertTrue(Object.isFrozen(PRINCIPLES));
  });
  test('Vorgaben: Texte leer, vier leere Notizen, keine Wahl, kein Inhalt', () => {
    const m = new State();
    for (const f of ['parameter', 'requirementA', 'requirementNotA', 'problemNote', 'solutionNote']) assertEqual(m[f], '', f);
    assertDeepEqual(plain(m.principleNotes), EMPTY_NOTES);
    assertEqual(m.selectedPrinciple, null);
    assertEqual(m.hasContent(), false);
  });
  test('toJSON eines neuen Models: _schema und sieben Felder in Reihenfolge der Altform', () => {
    assertEqual(JSON.stringify(new State().toJSON()), JSON.stringify(EMPTY));
  });
});

suite('triz-physical-contradiction Model — gespeicherter Stand 1.0', () => {
  test('Altprojekt lädt streng und ohne Reparatur', () => {
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY))), null);
    const { m, fields } = repaired(plain(LEGACY));
    assertDeepEqual(fields, []);
    assertDeepEqual(fieldsOf(m), LEGACY_FIELDS);
  });
  test('toJSON des Altprojekts ist zeichengleich mit der Eingabe', () => {
    assertEqual(JSON.stringify(State.fromJSON(plain(LEGACY)).toJSON()), JSON.stringify(LEGACY));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(JSON.stringify(loadModel(State, plain(LEGACY)).toJSON()), JSON.stringify(LEGACY));
  });
  test('Schlüssel in fremder Reihenfolge kommen in Schema-Reihenfolge heraus', () => {
    const j = Object.fromEntries(Object.entries(plain(LEGACY)).reverse());
    j.principleNotes = Object.fromEntries(Object.entries(LEGACY.principleNotes).reverse());
    assertEqual(JSON.stringify(State.fromJSON(j).toJSON()), JSON.stringify(LEGACY));
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei', () => {
    const m = State.fromJSON(plain(LEGACY));
    assertDeepEqual(State.fromJSON(plain(m.toJSON())).toJSON(), m.toJSON());
  });
  test('Wahl null wird gelesen und zurückgeschrieben', () => {
    const j = { ...plain(LEGACY), selectedPrinciple: null };
    assertEqual(JSON.stringify(State.fromJSON(plain(j)).toJSON()), JSON.stringify(j));
  });
});

suite('triz-physical-contradiction Model — Reparatur einzelner Felder in 1.0', () => {
  test('Text 42 wirft streng; mit Reparatur wird nur dieses Feld leer', () => {
    for (const f of ['parameter', 'requirementA', 'requirementNotA', 'problemNote', 'solutionNote']) {
      const j = { ...plain(LEGACY), [f]: 42 };
      assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error, f);
      const { m, fields } = repaired(j);
      assertDeepEqual(fields, [f]);
      assertDeepEqual(fieldsOf(m), { ...LEGACY_FIELDS, [f]: '' }, f);
    }
  });
  test('Wahl "zeit" wirft streng; mit Reparatur wird sie null, der Rest bleibt', () => {
    const j = { ...plain(LEGACY), selectedPrinciple: 'zeit' };
    assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['selectedPrinciple']);
    assertDeepEqual(fieldsOf(m), { ...LEGACY_FIELDS, selectedPrinciple: null });
  });
});

/*
 * Bekannte Abweichung von der Altform: record repariert nicht je Schlüssel.
 * Ein unlesbarer Eintrag in einem von Hand erzeugten Stand 1.0 setzt darum
 * alle vier Notizen zurück; die Altform heilte je Prinzip. Kein Schreiber
 * der Altform erzeugte solche Stände. Die übrigen Felder bleiben.
 */
suite('triz-physical-contradiction Model — unlesbare Notiz in 1.0 (alle vier Notizen fallen zurück)', () => {
  const cases = [
    ['fehlendes Prinzip', (j) => { delete j.principleNotes.space; }],
    ['fremdes Prinzip', (j) => { j.principleNotes.energy = 'x'; }],
    ['Notiz 7', (j) => { j.principleNotes.condition = 7; }],
    ['principleNotes als Liste', (j) => { j.principleNotes = ['a', 'b', 'c', 'd']; }],
    ['principleNotes null', (j) => { j.principleNotes = null; }],
  ];
  for (const [name, mutate] of cases) {
    test(`${name}: wirft streng; mit Reparatur vier leere Notizen, übrige Felder bleiben`, () => {
      const j = plain(LEGACY);
      mutate(j);
      assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
      const { m, fields } = repaired(j);
      assertDeepEqual(fields, ['principleNotes']);
      assertDeepEqual(fieldsOf(m), { ...LEGACY_FIELDS, principleNotes: EMPTY_NOTES });
    });
  }
});

suite('triz-physical-contradiction Model — Stand ohne _schema und Versionsprüfung', () => {
  test('ohne _schema läuft 0→1.0: Unlesbares wird leer bzw. null, nur die betroffene Notiz fällt zurück', () => {
    const { _schema, ...rest } = plain(LEGACY);
    rest.parameter = 42;
    rest.principleNotes.condition = 7;
    rest.principleNotes.energy = 'weg';
    rest.selectedPrinciple = 'zeit';
    rest.extra = 1;
    const expected = plain(LEGACY);
    expected.parameter = '';
    expected.principleNotes.condition = '';
    expected.selectedPrinciple = null;
    assertEqual(JSON.stringify(State.fromJSON(rest).toJSON()), JSON.stringify(expected));
  });
  test('Teildaten ohne _schema: genannte Werte bleiben, der Rest ist Vorgabe', () => {
    assertEqual(JSON.stringify(State.fromJSON({ parameter: 'test' }).toJSON()), JSON.stringify({ ...EMPTY, parameter: 'test' }));
  });
  test('{} lädt als leeres Model', () => {
    const m = State.fromJSON({});
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(EMPTY));
    assertEqual(m.hasContent(), false);
  });
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'triz-physical-contradiction', version: '2.0' } };
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

suite('triz-physical-contradiction Model — swap', () => {
  test('tauscht A und Nicht-A, die übrigen Felder bleiben', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.swap({});
    assertDeepEqual(fieldsOf(m), {
      ...LEGACY_FIELDS, requirementA: LEGACY.requirementNotA, requirementNotA: LEGACY.requirementA,
    });
    m.swap({});
    assertDeepEqual(fieldsOf(m), LEGACY_FIELDS);
  });
  test('mit leeren Werten bleibt alles leer', () => {
    const m = new State();
    m.swap({});
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(EMPTY));
  });
  test('gleiche Texte: nichts ändert sich', () => {
    const m = new State();
    m.requirementA = 'gleich';
    m.requirementNotA = 'gleich';
    m.swap({});
    assertEqual(m.requirementA, 'gleich');
    assertEqual(m.requirementNotA, 'gleich');
  });
  test('über execute', () => {
    const m = new State();
    m.requirementA = 'erste';
    m.requirementNotA = 'zweite';
    m.execute({ type: 'swap' });
    assertEqual(m.requirementA, 'zweite');
    assertEqual(m.requirementNotA, 'erste');
  });
  test('unbekannter Parameter wird abgelehnt, Zustand unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    assertTrue(thrown(() => m.swap(/** @type {any} */ ({ x: 1 }))) instanceof Error);
    assertDeepEqual(fieldsOf(m), LEGACY_FIELDS);
  });
});

suite('triz-physical-contradiction Model — Schreiben der Wahl', () => {
  test('jedes Prinzip und null werden angenommen', () => {
    const m = new State();
    for (const k of PRINC) {
      m.selectedPrinciple = /** @type {any} */ (k);
      assertEqual(m.selectedPrinciple, k);
    }
    m.selectedPrinciple = null;
    assertEqual(m.selectedPrinciple, null);
  });
  test('"zeit" wird mit param selectedPrinciple abgelehnt, Zustand unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    const err = thrown(() => { m.selectedPrinciple = /** @type {any} */ ('zeit'); });
    assertTrue(err instanceof Error);
    assertEqual(err.param, 'selectedPrinciple');
    assertDeepEqual(fieldsOf(m), LEGACY_FIELDS);
  });
});

suite('triz-physical-contradiction Model — Schreiben aller Notizen', () => {
  test('gültige vier Notizen werden übernommen', () => {
    const m = new State();
    m.principleNotes = plain(LEGACY.principleNotes);
    assertDeepEqual(plain(m.principleNotes), LEGACY.principleNotes);
  });
  const bad = [
    ['fehlendes Prinzip', (n) => { delete n.time; }],
    ['fremdes Prinzip', (n) => { n.energy = 'x'; }],
    ['Notiz kein Text', (n) => { n.space = 7; }],
  ];
  for (const [name, mutate] of bad) {
    test(`${name}: abgelehnt mit param principleNotes, Zustand unverändert`, () => {
      const m = State.fromJSON(plain(LEGACY));
      const next = plain(LEGACY.principleNotes);
      mutate(next);
      const err = thrown(() => { m.principleNotes = next; });
      assertTrue(err instanceof Error);
      assertEqual(err.param, 'principleNotes');
      assertDeepEqual(fieldsOf(m), LEGACY_FIELDS);
    });
  }
});

suite('triz-physical-contradiction Model — hasContent', () => {
  for (const f of ['parameter', 'requirementA', 'requirementNotA', 'problemNote', 'solutionNote']) {
    test(`${f} gesetzt → true`, () => {
      const m = new State();
      m[f] = 'x';
      assertEqual(m.hasContent(), true);
    });
  }
  test('eine Prinzipnotiz → true', () => {
    const m = new State();
    m.principleNotes = { ...EMPTY_NOTES, time: 'some note' };
    assertEqual(m.hasContent(), true);
  });
  test('eine Wahl → true, zurückgenommen → false', () => {
    const m = new State();
    m.selectedPrinciple = 'time';
    assertEqual(m.hasContent(), true);
    m.selectedPrinciple = null;
    assertEqual(m.hasContent(), false);
  });
  test('Altprojekt → true', () => {
    assertEqual(State.fromJSON(plain(LEGACY)).hasContent(), true);
  });
});

suite('triz-physical-contradiction Model — Beispiel am bisherigen Ort', () => {
  test('tragfluegel (ohne _schema) lädt über 0→1.0 ohne Reparatur, Werte wie in der Datei', async () => {
    const url = new URL('../../../examples/projects/triz-physical-contradiction-tragfluegel.json', import.meta.url);
    const res = await fetch(url, { cache: 'no-cache' });
    assertTrue(res.ok, `could not fetch example: HTTP ${res.status}`);
    const file = await res.json();
    assertEqual(file._schema, undefined);
    const { m, fields } = repaired(plain(file));
    assertDeepEqual(fields, []);
    assertEqual(m.selectedPrinciple, 'time');
    for (const k of PRINC) assertTrue(m.principleNotes[k].length > 0, k);
    assertDeepEqual(fieldsOf(m), file);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify({ ...SCHEMA, ...file }));
  });
});
