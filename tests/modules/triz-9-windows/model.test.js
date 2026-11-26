/**
 * Tests for modules/triz-9-windows/domain/model.js — Schema und Vorgaben
 * (Titel, je drei Beschriftungen, 3×3 Fenster mit Text und Bild), Stände ohne
 * `_schema` über '0→1.0', gespeicherte Stände '1.0' ohne Migrationsschritt,
 * Versionsprüfung, die Invarianten `colLabelCount`, `rowLabelCount` und
 * `cellGrid`, Reparatur einzelner Fenster, die Kommandos `setCellText`,
 * `clearImage` und `setCellImage`, Schreiben der Felder, `hasContent`, die
 * Lesefläche (Bilder nur als Größe) und der Agentenkatalog.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, ROWS, COLS } from '../../../js/modules/triz-9-windows/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'triz-9-windows');

/** Das 40×40-PNG der Fixture als Daten-URL. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAMElEQVR42u3NQQkAAAgEsOtkScMZyhKCn8H+S/W8iFgsFovFYrFYLBaLxWKxWHxnAbNKjEj+a4EuAAAAAElFTkSuQmCC';
const OTHER_PNG = 'data:image/png;base64,AAAA';

const SCHEMA = { _schema: { name: 'triz-9-windows', version: '1.0' } };
const E = () => ({ text: '', image: null });
const EMPTY_ROW = () => [E(), E(), E()];
const EMPTY_STATE = { systemTitle: '', colLabels: ['', '', ''], rowLabels: ['', '', ''], cells: [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()] };
const EMPTY = { ...SCHEMA, ...EMPTY_STATE };

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema`. */
const LEGACY_STATE = {
  systemTitle: 'Lastenrad für Bäckerei & Café <Größe XL> "Typ Kurier"',
  colLabels: ['Früher', '', 'Morgen'],
  rowLabels: ['Bauteil', 'Gerät', ''],
  cells: [
    [
      { text: 'Handkurbel mit Holzgriff\nKette ohne Schutz', image: null },
      { text: 'Riemenantrieb & Nabenschaltung <8 Gänge>', image: null },
      { text: 'Mittelmotor „leise“ — Drehmoment > 90 Nm', image: PNG },
    ],
    [
      { text: 'Lastenrad ohne Motor; schwer am Hang', image: null },
      { text: 'E-Lastenrad mit Kühlbox\nReichweite ca. 60 km', image: null },
      { text: '', image: null },
    ],
    [
      { text: 'Lieferung zu Fuß in der Altstadt', image: null },
      { text: 'Ladezonen & Fahrradstraßen "nur Anlieger"', image: PNG },
      { text: 'Autofreie Innenstadt mit Mikro-Depots\nZustellung < 15 min', image: null },
    ],
  ],
};
/** Derselbe Stand, wie ihn die Fixture speichert (mit `_schema` '1.0'). */
const LEGACY = { ...SCHEMA, ...LEGACY_STATE };

const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);
/** Die gespeicherten Felder ohne `_schema`. @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };

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

/** Der Altstand mit geändertem Raster. @param {(cells: any[]) => void} edit */
function legacyWithCells(edit) {
  const j = plain(LEGACY);
  edit(j.cells);
  return j;
}

suite('triz-9-windows Model — Schema und Vorgaben', () => {
  test('vier Felder in gespeicherter Reihenfolge, keine Ansichtsfelder, drei Kommandos, drei Invarianten', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['systemTitle', 'colLabels', 'rowLabels', 'cells']);
    assertDeepEqual(Object.keys(State.schema.view), []);
    assertDeepEqual(Object.keys(State.schema.commands), ['setCellText', 'clearImage', 'setCellImage']);
    assertDeepEqual(Object.keys(State.schema.invariants), ['colLabelCount', 'rowLabelCount', 'cellGrid']);
    assertEqual(State.schema.invariants.colLabelCount.repair, undefined);
    assertEqual(State.schema.invariants.rowLabelCount.repair, undefined);
    assertEqual(typeof State.schema.invariants.cellGrid.repair, 'function');
  });
  test('Feldarten: Texte ohne trim/nonEmpty, cells als Massenfeld mit nullbarem Bild', () => {
    const f = State.schema.fields;
    assertEqual(f.systemTitle.kind, 'text');
    assertEqual(f.systemTitle.trim, undefined);
    assertEqual(f.systemTitle.nonEmpty, undefined);
    for (const k of ['colLabels', 'rowLabels']) {
      assertEqual(f[k].kind, 'list', k);
      assertEqual(f[k].item.kind, 'text', k);
    }
    assertEqual(f.cells.kind, 'list');
    assertEqual(f.cells.bulk, true);
    assertEqual(f.cells.item.kind, 'list');
    const cell = f.cells.item.item;
    assertEqual(cell.kind, 'object');
    assertDeepEqual(Object.keys(cell.shape), ['text', 'image']);
    assertEqual(cell.shape.text.kind, 'text');
    assertEqual(cell.shape.image.kind, 'image');
    assertEqual(cell.shape.image.nullable, true);
    assertEqual(cell.shape.image.omitOnRead, true);
    assertEqual(cell.shape.image.agentWrite, false);
  });
  test('Grenzen: ROWS×COLS = 3×3, die Vorgaben haben diese Größe, Indexparameter 0 bis ROWS−1/COLS−1', () => {
    assertEqual(ROWS, 3);
    assertEqual(COLS, 3);
    const m = new State();
    assertEqual(m.colLabels.length, COLS);
    assertEqual(m.rowLabels.length, ROWS);
    assertEqual(m.cells.length, ROWS);
    for (const row of m.cells) assertEqual(row.length, COLS);
    for (const [name, def] of Object.entries(State.schema.commands)) {
      assertEqual(def.params.row.min, 0, name);
      assertEqual(def.params.row.max, ROWS - 1, name);
      assertEqual(def.params.col.min, 0, name);
      assertEqual(def.params.col.max, COLS - 1, name);
      assertEqual(def.params.row.integer, true, name);
      assertEqual(def.params.col.integer, true, name);
    }
  });
  test('Vorgaben: leerer Titel, leere Beschriftungen, neun leere Fenster ohne Bild, kein Inhalt', () => {
    const m = new State();
    assertEqual(json(fieldsOf(m)), json(EMPTY_STATE));
    assertEqual(m.hasContent(), false);
  });
  test('jedes Fenster der Vorgabe ist ein eigenes Objekt', () => {
    const m = new State();
    m.setCellText({ row: 0, col: 0, text: 'x' });
    assertEqual(m.cells[1][1].text, '');
    assertEqual(new State().cells[0][0].text, '');
  });
  test('toJSON eines neuen Models: _schema, dann die Felder in Reihenfolge der Altform', () => {
    assertEqual(json(new State().toJSON()), json(EMPTY));
  });
});

suite('triz-9-windows Model — gespeicherter Stand 1.0 (Altprojekt)', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich mit der Fixture', () => {
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY))), null);
    const { m, fields } = repaired(plain(LEGACY));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json(LEGACY));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(LEGACY)).toJSON()), json(LEGACY));
  });
  test('läuft ohne Migrationsschritt: ein Bildtext, den 0→1.0 auf null setzte, bleibt streng ungültig', () => {
    const j = legacyWithCells((c) => { c[0][0].image = 'http://x/y.png'; });
    assertTrue(thrown(() => State.fromJSON(j)) instanceof Error);
  });
  test('Schlüssel in fremder Reihenfolge kommen in Schema-Reihenfolge heraus, auch je Fenster', () => {
    const j = Object.fromEntries(Object.entries(plain(LEGACY)).reverse());
    j.cells = j.cells.map((row) => row.map((c) => ({ image: c.image, text: c.text })));
    assertEqual(json(State.fromJSON(j).toJSON()), json(LEGACY));
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei, auch für den leeren Stand', () => {
    for (const j of [LEGACY, EMPTY]) {
      assertEqual(json(State.fromJSON(plain(State.fromJSON(plain(j)).toJSON())).toJSON()), json(j));
    }
  });
});

suite('triz-9-windows Model — Stand ohne _schema', () => {
  test('Altprojekt ohne _schema lädt über 0→1.0 ohne Reparatur, toJSON = _schema + Altstand', () => {
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY_STATE))), null);
    const { m, fields } = repaired(plain(LEGACY_STATE));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json(LEGACY));
    assertEqual(json(loadModel(State, plain(LEGACY_STATE)).toJSON()), json(LEGACY));
  });
  test('heilt je Fenster und je Eintrag wie das alte fromJSON', () => {
    const m = State.fromJSON({
      systemTitle: 7,
      colLabels: ['a', 7, 'c'],
      rowLabels: ['x'],
      cells: [[{ text: 7, image: 'kein Bild' }, 'x'], 'keine Zeile', [E(), E(), E(), { text: 'zu viel', image: null }]],
      extra: 1,
    });
    assertEqual(json(m.toJSON()), json({ ...EMPTY, colLabels: ['a', '', 'c'] }));
  });
  test('{} lädt als leeres Model', () => {
    const m = State.fromJSON({});
    assertEqual(json(m.toJSON()), json(EMPTY));
    assertEqual(m.hasContent(), false);
  });
});

suite('triz-9-windows Model — Versionsprüfung', () => {
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'triz-9-windows', version: '2.0' } };
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

suite('triz-9-windows Model — Invarianten der Beschriftungen (ohne repair)', () => {
  for (const [key, inv] of [['colLabels', 'colLabelCount'], ['rowLabels', 'rowLabelCount']]) {
    for (const [name, v] of [['Länge 2', ['a', 'b']], ['Länge 4', ['a', 'b', 'c', 'd']], ['leer', []]]) {
      test(`${key} ${name}: streng wirft mit ${inv}; mit Reparatur drei leere, der Rest bleibt`, () => {
        const j = { ...plain(LEGACY), [key]: v };
        const err = thrown(() => State.fromJSON(plain(j)));
        assertTrue(err instanceof Error);
        assertEqual(err.invariant, inv);
        assertEqual(err.param, key);
        const { m, fields } = repaired(j);
        assertDeepEqual(fields, [key]);
        assertDeepEqual(fieldsOf(m), { ...LEGACY_STATE, [key]: ['', '', ''] });
      });
    }
    test(`${key} mit Eintrag 7 (A7): der Eintrag entfällt, die Liste fällt auf drei leere`, () => {
      const j = { ...plain(LEGACY), [key]: ['a', 7, 'c'] };
      assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
      const { m, fields } = repaired(j);
      assertTrue(fields.length > 0 && fields.every((f) => f === key));
      assertDeepEqual(fieldsOf(m), { ...LEGACY_STATE, [key]: ['', '', ''] });
    });
  }
});

suite('triz-9-windows Model — Invariante cellGrid (mit repair)', () => {
  test('Zeile mit zwei Fenstern: streng wirft mit cellGrid; mit Reparatur am Ende aufgefüllt', () => {
    const j = legacyWithCells((c) => { c[0] = c[0].slice(0, 2); });
    const err = thrown(() => State.fromJSON(plain(j)));
    assertEqual(err?.invariant, 'cellGrid');
    assertEqual(err?.param, 'cells');
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['cells']);
    assertEqual(json(m.cells[0]), json([...LEGACY_STATE.cells[0].slice(0, 2), E()]));
    assertEqual(json(m.cells.slice(1)), json(LEGACY_STATE.cells.slice(1)));
  });
  test('Zeile mit vier Fenstern: mit Reparatur gekürzt', () => {
    const j = legacyWithCells((c) => { c[2].push({ text: 'zu viel', image: null }); });
    assertEqual(thrown(() => State.fromJSON(plain(j)))?.invariant, 'cellGrid');
    const { m } = repaired(j);
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('leere Zeile: mit Reparatur drei leere Fenster', () => {
    const { m } = repaired(legacyWithCells((c) => { c[1] = []; }));
    assertEqual(json(m.cells[1]), json(EMPTY_ROW()));
    assertEqual(json(m.cells[0]), json(LEGACY_STATE.cells[0]));
  });
  for (const [name, edit] of [
    ['zwei Zeilen', (c) => { c.pop(); }],
    ['vier Zeilen', (c) => { c.push(EMPTY_ROW()); }],
  ]) {
    test(`${name}: streng wirft; mit Reparatur fällt das Raster auf die Vorgabe, der Rest bleibt`, () => {
      const j = legacyWithCells(edit);
      assertEqual(thrown(() => State.fromJSON(plain(j)))?.invariant, 'cellGrid');
      const { m, fields } = repaired(j);
      assertDeepEqual(fields, ['cells']);
      assertEqual(json(fieldsOf(m)), json({ ...LEGACY_STATE, cells: EMPTY_STATE.cells }));
    });
  }
});

suite('triz-9-windows Model — Reparatur einzelner Fenster (A7)', () => {
  for (const [name, bad] of [
    ['text 7', { text: 7, image: null }],
    ['kein Objekt', 'x'],
    ['ohne text', { image: null }],
    ['ohne image', { text: 'a' }],
    ['fremder Schlüssel', { text: 'a', image: null, note: 'x' }],
    ['image keine Daten-URL', { text: 'a', image: 'http://x/y.png' }],
  ]) {
    test(`Fenster ${name}: streng wirft; mit Reparatur entfällt es, die Zeile rückt nach links und wird aufgefüllt`, () => {
      const j = legacyWithCells((c) => { c[2][0] = bad; });
      assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
      const { m, fields } = repaired(j);
      assertTrue(fields.length > 0 && fields.every((f) => f === 'cells'));
      assertEqual(json(m.cells[2]), json([...LEGACY_STATE.cells[2].slice(1), E()]));
      assertEqual(json(m.cells.slice(0, 2)), json(LEGACY_STATE.cells.slice(0, 2)));
      assertEqual(json({ ...fieldsOf(m), cells: null }), json({ ...LEGACY_STATE, cells: null }));
    });
  }
  test('Zeile keine Liste: entfällt, das Raster hat zwei Zeilen und fällt auf die Vorgabe', () => {
    const { m, fields } = repaired(legacyWithCells((c) => { c[1] = 'x'; }));
    assertTrue(fields.length > 0 && fields.every((f) => f === 'cells'));
    assertEqual(json(m.cells), json(EMPTY_STATE.cells));
    assertEqual(m.systemTitle, LEGACY_STATE.systemTitle);
  });
  test('Titel 7: mit Reparatur nur dieses Feld leer', () => {
    const { m, fields } = repaired({ ...plain(LEGACY), systemTitle: 7 });
    assertDeepEqual(fields, ['systemTitle']);
    assertEqual(json(fieldsOf(m)), json({ ...LEGACY_STATE, systemTitle: '' }));
  });
});

suite('triz-9-windows Model — setCellText', () => {
  test('setzt den Text eines Fensters, Bild und die übrigen acht bleiben', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setCellText({ row: 0, col: 2, text: 'neu & <b>\n"x"' });
    const want = plain(LEGACY_STATE);
    want.cells[0][2].text = 'neu & <b>\n"x"';
    assertEqual(json(fieldsOf(m)), json(want));
    assertEqual(m.cells[0][2].image, PNG);
  });
  test('leerer Text wird angenommen', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setCellText({ row: 1, col: 0, text: '' });
    assertEqual(m.cells[1][0].text, '');
  });
  test('über execute, an den Rändern 0 und 2', () => {
    const m = new State();
    m.execute({ type: 'setCellText', row: 0, col: 0, text: 'a' });
    m.execute({ type: 'setCellText', row: 2, col: 2, text: 'b' });
    assertEqual(m.cells[0][0].text, 'a');
    assertEqual(m.cells[2][2].text, 'b');
  });
  test('text kein Text: abgelehnt mit param text, Zustand unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    const err = thrown(() => m.setCellText(/** @type {any} */ ({ row: 0, col: 0, text: 7 })));
    assertEqual(err?.param, 'text');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
});

suite('triz-9-windows Model — clearImage', () => {
  test('entfernt das Bild, der Text und die übrigen Fenster bleiben', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.clearImage({ row: 2, col: 1 });
    const want = plain(LEGACY_STATE);
    want.cells[2][1].image = null;
    assertEqual(json(fieldsOf(m)), json(want));
    assertEqual(m.cells[0][2].image, PNG);
  });
  test('ein Fenster ohne Bild bleibt unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.clearImage({ row: 1, col: 1 });
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('kein confirm am Kommando (die Oberfläche fragt allgemein)', () => {
    assertEqual(State.schema.commands.clearImage.confirm, undefined);
  });
});

suite('triz-9-windows Model — setCellImage', () => {
  test('setzt das Bild eines Fensters, der Text bleibt; ersetzt ein vorhandenes', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setCellImage({ row: 1, col: 2, dataUrl: OTHER_PNG });
    m.setCellImage({ row: 0, col: 2, dataUrl: OTHER_PNG });
    const want = plain(LEGACY_STATE);
    want.cells[1][2].image = OTHER_PNG;
    want.cells[0][2].image = OTHER_PNG;
    assertEqual(json(fieldsOf(m)), json(want));
  });
  test('über execute', () => {
    const m = new State();
    m.execute({ type: 'setCellImage', row: 2, col: 0, dataUrl: PNG });
    assertEqual(m.cells[2][0].image, PNG);
    assertEqual(m.cells[2][0].text, '');
  });
  for (const v of ['x', '', 'http://x/y.png', 'data:text/plain;base64,AAAA', null, 7]) {
    test(`dataUrl ${json(v)}: abgelehnt mit param dataUrl, Zustand unverändert`, () => {
      const m = State.fromJSON(plain(LEGACY));
      const err = thrown(() => m.setCellImage(/** @type {any} */ ({ row: 1, col: 1, dataUrl: v })));
      assertTrue(err instanceof Error);
      assertEqual(err.param, 'dataUrl');
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
  }
});

suite('triz-9-windows Model — Indexparameter der Kommandos', () => {
  const calls = {
    setCellText: (row, col) => ({ row, col, text: 'x' }),
    clearImage: (row, col) => ({ row, col }),
    setCellImage: (row, col) => ({ row, col, dataUrl: OTHER_PNG }),
  };
  for (const [name, args] of Object.entries(calls)) {
    for (const v of [3, -1, 1.5, null, true]) {
      for (const param of ['row', 'col']) {
        test(`${name} ${param} ${json(v)}: abgelehnt mit param ${param}, Zustand unverändert`, () => {
          const m = State.fromJSON(plain(LEGACY));
          const cmd = param === 'row' ? args(v, 1) : args(1, v);
          const err = thrown(() => m[name](/** @type {any} */ (cmd)));
          assertTrue(err instanceof Error);
          assertEqual(err.param, param);
          assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
        });
      }
    }
    test(`${name} ohne col: abgelehnt`, () => {
      const m = new State();
      assertTrue(thrown(() => m[name](/** @type {any} */ ({ row: 1, text: 'x', dataUrl: OTHER_PNG }))) instanceof Error);
      assertEqual(m.hasContent(), false);
    });
  }
});

suite('triz-9-windows Model — Schreiben der Felder', () => {
  test('Titel nimmt jeden Text, auch leer; kein Text wird abgelehnt', () => {
    const m = new State();
    m.systemTitle = '  a & <b>\n';
    assertEqual(m.systemTitle, '  a & <b>\n');
    m.systemTitle = '';
    assertEqual(m.systemTitle, '');
    assertEqual(thrown(() => { m.systemTitle = /** @type {any} */ (7); })?.param, 'systemTitle');
  });
  for (const [key, inv] of [['colLabels', 'colLabelCount'], ['rowLabels', 'rowLabelCount']]) {
    test(`${key}: drei Texte werden angenommen`, () => {
      const m = new State();
      m[key] = ['a', '', 'c'];
      assertDeepEqual(m[key], ['a', '', 'c']);
    });
    for (const v of [['a', 'b'], ['a', 'b', 'c', 'd'], []]) {
      test(`${key} mit ${v.length} Einträgen: abgelehnt mit ${inv}, Zustand unverändert`, () => {
        const m = State.fromJSON(plain(LEGACY));
        const err = thrown(() => { m[key] = v; });
        assertTrue(err instanceof Error);
        assertEqual(err.invariant, inv);
        assertEqual(err.param, key);
        assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
      });
    }
    test(`${key} mit einem Eintrag, der kein Text ist: abgelehnt`, () => {
      const m = State.fromJSON(plain(LEGACY));
      assertTrue(thrown(() => { m[key] = /** @type {any} */ (['a', 7, 'c']); }) instanceof Error);
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    });
  }
  test('cells: ein Raster 3×3 wird angenommen, zwei Zeilen werden mit cellGrid abgelehnt', () => {
    const m = new State();
    m.cells = plain(LEGACY_STATE.cells);
    assertEqual(json(m.cells), json(LEGACY_STATE.cells));
    const err = thrown(() => { m.cells = [EMPTY_ROW(), EMPTY_ROW()]; });
    assertEqual(err?.invariant, 'cellGrid');
    assertEqual(json(m.cells), json(LEGACY_STATE.cells));
  });
  test('cells: eine Zeile mit vier Fenstern wird mit cellGrid abgelehnt', () => {
    const m = new State();
    const err = thrown(() => { m.cells = [EMPTY_ROW(), [...EMPTY_ROW(), E()], EMPTY_ROW()]; });
    assertEqual(err?.invariant, 'cellGrid');
    assertEqual(json(fieldsOf(m)), json(EMPTY_STATE));
  });
});

suite('triz-9-windows Model — hasContent', () => {
  test('Titel → true, zurückgenommen → false', () => {
    const m = new State();
    m.systemTitle = 'x';
    assertEqual(m.hasContent(), true);
    m.systemTitle = '';
    assertEqual(m.hasContent(), false);
  });
  test('ein Fenstertext → true, zurückgenommen → false', () => {
    const m = new State();
    m.setCellText({ row: 1, col: 2, text: 'x' });
    assertEqual(m.hasContent(), true);
    m.setCellText({ row: 1, col: 2, text: '' });
    assertEqual(m.hasContent(), false);
  });
  test('eine Beschriftung allein zählt jetzt (A2)', () => {
    for (const key of ['colLabels', 'rowLabels']) {
      const m = new State();
      m[key] = ['', 'x', ''];
      assertEqual(m.hasContent(), true, key);
    }
  });
  test('ein Bild allein zählt jetzt (A2), entfernt → false', () => {
    const m = new State();
    m.setCellImage({ row: 0, col: 0, dataUrl: PNG });
    assertEqual(m.hasContent(), true);
    m.clearImage({ row: 0, col: 0 });
    assertEqual(m.hasContent(), false);
  });
  test('Altprojekt → true', () => {
    assertEqual(State.fromJSON(plain(LEGACY)).hasContent(), true);
  });
});

suite('triz-9-windows Model — Lesefläche und Agentenkatalog', () => {
  const entry = schemaAgentEntry(State);

  test('read() ohne Parameter: vier Felder, cells als Tabellen-Deskriptor mit drei Zeilen', () => {
    const out = readSchemaModel(entry, State.fromJSON(plain(LEGACY)));
    assertDeepEqual(Object.keys(out), ['systemTitle', 'colLabels', 'rowLabels', 'cells']);
    assertEqual(out.systemTitle, LEGACY_STATE.systemTitle);
    assertDeepEqual(out.colLabels, LEGACY_STATE.colLabels);
    assertDeepEqual(out.rowLabels, LEGACY_STATE.rowLabels);
    assertEqual(out.cells.$bulk, true);
    assertEqual(out.cells.kind, 'table');
    assertEqual(out.cells.rowCount, 3);
  });
  test('read({ fields: [cells] }): Bilder als { $omitted, bytes }, ohne Bild null, Texte vollständig', () => {
    const out = readSchemaModel(entry, State.fromJSON(plain(LEGACY)), { fields: ['cells'] });
    // bytes: Länge des JSON-Texts der Daten-URL (samt Anführungszeichen).
    assertEqual(json(PNG).length, 164);
    const want = plain(LEGACY_STATE.cells).map((row) => row.map((c) => ({
      text: c.text,
      image: c.image === null ? null : { $omitted: true, bytes: 164 },
    })));
    assertEqual(json(out.cells), json(want));
    assertTrue(!json(out).includes('data:image/'));
  });
  test('Katalog: setCellText und clearImage, setCellImage fehlt (Bild nur über die Oberfläche)', () => {
    assertDeepEqual(Object.keys(entry.actions), ['read', 'setCellText', 'clearImage']);
  });
  test('instance.set: Titel und Beschriftungen schreibbar, cells nicht (Bildfeld)', () => {
    assertDeepEqual(entry.settable, ['systemTitle', 'colLabels', 'rowLabels']);
    assertDeepEqual(entry.fields.cells.omit, ['[][].image']);
    assertDeepEqual(entry.invariants, ['colLabelCount', 'rowLabelCount', 'cellGrid']);
  });
});
