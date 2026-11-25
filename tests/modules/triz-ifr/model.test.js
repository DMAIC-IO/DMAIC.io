/**
 * Tests for modules/triz-ifr/domain/model.js — Vorgaben, gespeicherte Stände
 * '1.0' ohne Migrationsschritt (zeichengleich zurück), Stände ohne `_schema`
 * über '0→1.0', Reparatur beim Laden, Versionsprüfung, `hasContent` und
 * Rundweg. Das Beispiel prüft examples.test.js.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/triz-ifr/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';

setModelName(State, 'triz-ifr');

const FIELDS = ['system', 'usefulFunction', 'harmfulEffect', 'ifr1', 'ifr2', 'ifr3', 'obstacles'];
const SCHEMA = { _schema: { name: 'triz-ifr', version: '1.0' } };

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`). */
const LEGACY = {
  _schema: { name: 'triz-ifr', version: '1.0' },
  system: 'Kühlmittelpumpe für Fräszentrum',
  usefulFunction: 'fördert Kühlschmierstoff an die Schneide',
  harmfulEffect: 'Späne & Öl verstopfen den Ansaugfilter <täglich>',
  ifr1: 'Die Pumpe hält ihren Filter von selbst frei — „ohne Wartung“.',
  ifr2: 'Es gibt keinen Filter, der verstopfen könnte.',
  ifr3: 'Der Kühlmittelstrom selbst spült die Späne aus dem "Sumpf".',
  obstacles: '• Späne sind länger als die Maschenweite\n• Öl & Emulsion trennen sich im Becken\n• Füllstand < Mindestmaß bei Schichtende',
};

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

suite('triz-ifr Model — Schema und Vorgaben', () => {
  test('sieben Textfelder in gespeicherter Reihenfolge, kein Ansichtsfeld, kein Kommando', () => {
    assertDeepEqual(Object.keys(State.schema.fields), FIELDS);
    for (const f of FIELDS) assertEqual(State.schema.fields[f].kind, 'text', f);
    assertDeepEqual(Object.keys(State.schema.view), []);
    assertDeepEqual(Object.keys(State.schema.commands), []);
  });
  test('ein neues Model hat sieben leere Texte und keinen Inhalt', () => {
    const m = new State();
    for (const f of FIELDS) assertEqual(m[f], '', f);
    assertEqual(m.hasContent(), false);
  });
  test('toJSON eines neuen Models: _schema mit Name und Version, sieben leere Texte', () => {
    assertDeepEqual(new State().toJSON(), {
      _schema: { name: 'triz-ifr', version: '1.0' },
      system: '', usefulFunction: '', harmfulEffect: '', ifr1: '', ifr2: '', ifr3: '', obstacles: '',
    });
  });
  test('toJSON gibt eine Kopie von _schema heraus', () => {
    const m = new State();
    const j = m.toJSON();
    j._schema.version = 'hacked';
    assertEqual(m.toJSON()._schema.version, '1.0');
  });
});

suite('triz-ifr Model — gespeicherter Stand 1.0', () => {
  test('Altprojekt lädt streng und ohne Reparatur', () => {
    const { m, fields } = repaired(JSON.parse(JSON.stringify(LEGACY)));
    assertDeepEqual(fields, []);
    for (const f of FIELDS) assertEqual(m[f], LEGACY[f], f);
    assertEqual(thrown(() => State.fromJSON(JSON.parse(JSON.stringify(LEGACY)))), null);
  });
  test('toJSON des Altprojekts ist zeichengleich mit der Eingabe', () => {
    const m = State.fromJSON(JSON.parse(JSON.stringify(LEGACY)));
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(LEGACY));
  });
  test('Leerzeichen und Zeilenumbrüche bleiben unverändert', () => {
    const m = State.fromJSON({ ...SCHEMA, system: '  A  ', obstacles: '\n• x\n\n' });
    assertEqual(m.system, '  A  ');
    assertEqual(m.obstacles, '\n• x\n\n');
  });
  test('ifr2: 42 wirft streng und wird mit Reparatur leer, die übrigen Felder bleiben', () => {
    const bad = { ...LEGACY, ifr2: 42 };
    assertTrue(thrown(() => State.fromJSON(bad)) instanceof Error);
    const { m, fields } = repaired(bad);
    assertDeepEqual(fields, ['ifr2']);
    assertEqual(m.ifr2, '');
    for (const f of FIELDS.filter((x) => x !== 'ifr2')) assertEqual(m[f], LEGACY[f], f);
  });
  test('Laden wie beim Einhängen: null und Objekt werden leer', () => {
    const m = loadModel(State, { ...LEGACY, system: null, obstacles: { a: 1 } });
    assertEqual(m.system, '');
    assertEqual(m.obstacles, '');
    assertEqual(m.ifr1, LEGACY.ifr1);
  });
  test('fehlende Felder bekommen die Vorgabe, fremde Schlüssel entfallen', () => {
    const m = State.fromJSON({ ...SCHEMA, system: 'S', extra: 'weg' });
    assertEqual(m.system, 'S');
    assertEqual(m.ifr3, '');
    assertDeepEqual(Object.keys(m.toJSON()), ['_schema', ...FIELDS]);
  });
});

suite('triz-ifr Model — Stand ohne _schema und Versionsprüfung', () => {
  test('ohne _schema läuft 0→1.0: Texte bleiben, Nicht-Text wird leer', () => {
    const { _schema, ...plain } = LEGACY;
    const m = State.fromJSON({ ...plain, ifr2: 42, extra: 1 });
    assertEqual(m.system, LEGACY.system);
    assertEqual(m.ifr2, '');
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify({ ...LEGACY, ifr2: '' }));
  });
  test('{} lädt als leeres Model', () => {
    const m = State.fromJSON({});
    for (const f of FIELDS) assertEqual(m[f], '', f);
    assertEqual(m.hasContent(), false);
  });
  test('höhere Version 2.0 wird abgewiesen, auch beim Laden wie beim Einhängen', () => {
    assertThrows(() => State.fromJSON({ ...LEGACY, _schema: { name: 'triz-ifr', version: '2.0' } }), /_schema\.version/);
    assertThrows(() => loadModel(State, { ...LEGACY, _schema: { name: 'triz-ifr', version: '2.0' } }), /_schema\.version/);
  });
  test('unlesbare Version wird abgewiesen', () => {
    assertThrows(() => State.fromJSON({ ...LEGACY, _schema: { version: 'x' } }), /_schema\.version/);
  });
});

suite('triz-ifr Model — hasContent und Rundweg', () => {
  for (const f of FIELDS) {
    test(`hasContent: nur ${f} gefüllt → true`, () => {
      const m = State.fromJSON({ ...SCHEMA, [f]: 'x' });
      assertEqual(m.hasContent(), true);
    });
  }
  test('Rundweg toJSON → fromJSON ist verlustfrei', () => {
    const m = State.fromJSON(JSON.parse(JSON.stringify(LEGACY)));
    const again = State.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
    assertDeepEqual(again.toJSON(), m.toJSON());
  });
});
