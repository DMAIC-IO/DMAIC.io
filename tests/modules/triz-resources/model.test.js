/**
 * Tests for modules/triz-resources/domain/model.js — Schema und Vorgaben
 * (ein record in einem record), gespeicherte Stände '1.0' ohne
 * Migrationsschritt (zeichengleich zurück), Stände ohne `_schema` über
 * '0→1.0', die Kommandos `cycleStatus` und `setCellStatus`, Schreiben des
 * ganzen Rasters, Versionsprüfung, Reparatur unlesbarer Stände und
 * `hasContent`. Das Beispiel prüft examples.test.js.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/triz-resources/domain/model.js';
import { CATEGORIES, LEVELS, STATUSES, nextStatus } from '../../../js/modules/triz-resources/domain/resources.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';

setModelName(State, 'triz-resources');

const CATS = ['substance', 'field', 'space', 'time', 'info', 'function'];
const LVLS = ['sub', 'sys', 'super'];
const STATS = ['unknown', 'unused', 'partial', 'full'];
const SCHEMA = { _schema: { name: 'triz-resources', version: '1.0' } };
const emptyCells = () => Object.fromEntries(CATS.map((c) => [c, Object.fromEntries(LVLS.map((l) => [l, { notes: '', status: 'unknown' }]))]));
const EMPTY_CELLS = emptyCells();

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`). */
const LEGACY = {
  _schema: { name: 'triz-resources', version: '1.0' },
  system: 'Gurtförderer für Schüttgut & Späne <Linie "Süd">',
  cells: {
    substance: {
      sub: { notes: 'Gurt aus EP-Gewebe & Gummi; Abrieb < 0,5 mm/Jahr.', status: 'full' },
      sys: { notes: 'Schüttgut selbst (Körnung 0–32 mm)\nFeuchte Anteile kleben.', status: 'partial' },
      super: { notes: '', status: 'unused' },
    },
    field: {
      sub: { notes: 'Schwerkraft auf das Gut — „kostenlos“.', status: 'full' },
      sys: { notes: 'Reibung Gurt/Trommel', status: 'unknown' },
      super: { notes: 'Magnetfeld des Abscheiders (Halle 3)\nnur tagsüber in Betrieb.', status: 'unused' },
    },
    space: {
      sub: { notes: 'Hohlraum unter dem Obertrum', status: 'partial' },
      sys: { notes: '', status: 'full' },
      super: { notes: 'Freiraum über der Strecke: 2,40 m "lichte Höhe".', status: 'unknown' },
    },
    time: {
      sub: { notes: 'Rücklauf des Untertrums ≈ 40 % der Umlaufzeit.', status: 'unused' },
      sys: { notes: 'Stillstand nachts 22:00–06:00\nWartungsfenster.', status: 'partial' },
      super: { notes: '', status: 'unknown' },
    },
    info: {
      sub: { notes: 'Geräusch der Tragrollen <Lager defekt?>', status: 'full' },
      sys: { notes: 'Stromaufnahme des Antriebs → Beladung', status: 'unused' },
      super: { notes: '', status: 'unknown' },
    },
    function: {
      sub: { notes: 'Abstreifer reinigt & dosiert zugleich.', status: 'partial' },
      sys: { notes: '', status: 'unknown' },
      super: { notes: 'Druckluftring der Nachbaranlage: könnte als Klopfer dienen.\nÜbergabe prüfen.', status: 'unused' },
    },
  },
};

const plain = (v) => JSON.parse(JSON.stringify(v));

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

suite('triz-resources Model — Schema und Vorgaben', () => {
  test('Felder system und cells, kein Ansichtsfeld, zwei Kommandos', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['system', 'cells']);
    assertEqual(State.schema.fields.system.kind, 'text');
    assertEqual(State.schema.fields.cells.kind, 'record');
    assertEqual(State.schema.fields.cells.value.kind, 'record');
    assertEqual(State.schema.fields.cells.value.value.kind, 'object');
    assertDeepEqual(Object.keys(State.schema.view), []);
    assertDeepEqual(Object.keys(State.schema.commands), ['cycleStatus', 'setCellStatus']);
  });
  test('CATEGORIES, LEVELS, STATUSES gleichen den Literalen im Schema und in den Kommandos', () => {
    const cells = State.schema.fields.cells;
    assertDeepEqual([...CATEGORIES], CATS);
    assertDeepEqual([...LEVELS], LVLS);
    assertDeepEqual([...STATUSES], STATS);
    assertDeepEqual([...cells.keys], CATS);
    assertDeepEqual([...cells.value.keys], LVLS);
    assertDeepEqual([...cells.value.value.shape.status.values], STATS);
    for (const name of ['cycleStatus', 'setCellStatus']) {
      const p = State.schema.commands[name].params;
      assertDeepEqual([...p.catKey.values], CATS, name);
      assertDeepEqual([...p.lvlKey.values], LVLS, name);
    }
    assertDeepEqual([...State.schema.commands.setCellStatus.params.status.values], STATS);
  });
  test('nextStatus läuft unknown → unused → partial → full → unknown', () => {
    assertDeepEqual(STATS.map(nextStatus), ['unused', 'partial', 'full', 'unknown']);
  });
  test('Vorgabe aller 18 Zellen { notes: "", status: "unknown" }, System leer, kein Inhalt', () => {
    const m = new State();
    assertEqual(m.system, '');
    assertDeepEqual(plain(m.cells), EMPTY_CELLS);
    assertEqual(m.hasContent(), false);
  });
  test('toJSON eines neuen Models: _schema, system, cells in Reihenfolge, je Zelle notes vor status', () => {
    assertEqual(JSON.stringify(new State().toJSON()), JSON.stringify({ ...SCHEMA, system: '', cells: EMPTY_CELLS }));
  });
});

suite('triz-resources Model — gespeicherter Stand 1.0', () => {
  test('Altprojekt lädt streng und ohne Reparatur', () => {
    const { m, fields } = repaired(plain(LEGACY));
    assertDeepEqual(fields, []);
    assertEqual(m.system, LEGACY.system);
    assertDeepEqual(plain(m.cells), LEGACY.cells);
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY))), null);
  });
  test('toJSON des Altprojekts ist zeichengleich mit der Eingabe', () => {
    assertEqual(JSON.stringify(State.fromJSON(plain(LEGACY)).toJSON()), JSON.stringify(LEGACY));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(JSON.stringify(loadModel(State, plain(LEGACY)).toJSON()), JSON.stringify(LEGACY));
  });
  test('Zellen in fremder Reihenfolge kommen in Schema-Reihenfolge heraus', () => {
    const j = plain(LEGACY);
    j.cells = Object.fromEntries(Object.entries(j.cells).reverse()
      .map(([c, lv]) => [c, Object.fromEntries(Object.entries(lv).reverse()
        .map(([l, cell]) => [l, { status: cell.status, notes: cell.notes }]))]));
    assertEqual(JSON.stringify(State.fromJSON(j).toJSON()), JSON.stringify(LEGACY));
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei', () => {
    const m = State.fromJSON(plain(LEGACY));
    assertDeepEqual(State.fromJSON(plain(m.toJSON())).toJSON(), m.toJSON());
  });
});

suite('triz-resources Model — cycleStatus', () => {
  test('Zyklus über alle vier Füllstände und zurück, andere Zellen unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    const seen = [];
    for (let i = 0; i < 4; i++) {
      m.cycleStatus({ catKey: 'field', lvlKey: 'sys' });
      seen.push(m.cells.field.sys.status);
    }
    assertDeepEqual(seen, ['unused', 'partial', 'full', 'unknown']);
    assertDeepEqual(plain(m.cells), LEGACY.cells);
  });
  test('die Notiz bleibt', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.cycleStatus({ catKey: 'substance', lvlKey: 'sys' });
    assertDeepEqual(plain(m.cells.substance.sys), { notes: LEGACY.cells.substance.sys.notes, status: 'full' });
  });
  test('über execute', () => {
    const m = new State();
    m.execute({ type: 'cycleStatus', catKey: 'function', lvlKey: 'super' });
    assertEqual(m.cells.function.super.status, 'unused');
  });
  test('unbekannte Kategorie oder Ebene wird mit param abgelehnt, Zustand unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    for (const [cmd, param] of [
      [{ catKey: 'energy', lvlKey: 'sys' }, 'catKey'],
      [{ catKey: 'field', lvlKey: 'mid' }, 'lvlKey'],
    ]) {
      const err = thrown(() => m.cycleStatus(/** @type {any} */ (cmd)));
      assertTrue(err instanceof Error, param);
      assertEqual(err.param, param);
    }
    assertDeepEqual(plain(m.cells), LEGACY.cells);
  });
});

suite('triz-resources Model — setCellStatus', () => {
  test('jeder der vier Füllstände wird gesetzt, Notiz und andere Zellen bleiben', () => {
    const m = State.fromJSON(plain(LEGACY));
    for (const status of STATS) {
      m.setCellStatus({ catKey: 'time', lvlKey: 'sub', status: /** @type {any} */ (status) });
      const expected = plain(LEGACY.cells);
      expected.time.sub.status = status;
      assertDeepEqual(plain(m.cells), expected, status);
    }
  });
  test('über execute', () => {
    const m = new State();
    m.execute({ type: 'setCellStatus', catKey: 'info', lvlKey: 'sub', status: 'partial' });
    assertEqual(m.cells.info.sub.status, 'partial');
  });
  test('unbekannte Kategorie, Ebene oder Status wird mit param abgelehnt, Zustand unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    for (const [cmd, param] of [
      [{ catKey: 'energy', lvlKey: 'sys', status: 'full' }, 'catKey'],
      [{ catKey: 'field', lvlKey: 'mid', status: 'full' }, 'lvlKey'],
      [{ catKey: 'field', lvlKey: 'sys', status: 'halb' }, 'status'],
    ]) {
      const err = thrown(() => m.setCellStatus(/** @type {any} */ (cmd)));
      assertTrue(err instanceof Error, param);
      assertEqual(err.param, param);
    }
    assertDeepEqual(plain(m.cells), LEGACY.cells);
  });
});

suite('triz-resources Model — Schreiben des ganzen Rasters', () => {
  test('gültiges Raster wird übernommen', () => {
    const m = new State();
    m.cells = plain(LEGACY.cells);
    assertDeepEqual(plain(m.cells), LEGACY.cells);
  });
  const bad = [
    ['Status außerhalb der Liste', (c) => { c.space.sys.status = 'halb'; }],
    ['fehlende Zelle', (c) => { delete c.info.super; }],
    ['fehlende Kategorie', (c) => { delete c.time; }],
    ['fremde Ebene', (c) => { c.field.mid = { notes: '', status: 'unknown' }; }],
    ['Notiz kein Text', (c) => { c.field.sub.notes = 7; }],
  ];
  for (const [name, mutate] of bad) {
    test(`${name}: abgelehnt mit param cells, Zustand unverändert`, () => {
      const m = State.fromJSON(plain(LEGACY));
      const next = plain(LEGACY.cells);
      mutate(next);
      const err = thrown(() => { m.cells = next; });
      assertTrue(err instanceof Error);
      assertEqual(err.param, 'cells');
      assertDeepEqual(plain(m.cells), LEGACY.cells);
    });
  }
});

suite('triz-resources Model — Stand ohne _schema und Versionsprüfung', () => {
  test('ohne _schema läuft 0→1.0: Status außerhalb → unknown, Notiz kein Text → leer, Fremdes entfällt', () => {
    const { _schema, ...rest } = plain(LEGACY);
    rest.cells.space.sys.status = 'halb';
    rest.cells.field.sub.notes = 42;
    rest.cells.energy = { sub: { notes: 'weg', status: 'full' } };
    delete rest.cells.info.super;
    const m = State.fromJSON(rest);
    const expected = plain(LEGACY);
    expected.cells.space.sys.status = 'unknown';
    expected.cells.field.sub.notes = '';
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(expected));
  });
  test('{} lädt als leeres Model', () => {
    const m = State.fromJSON({});
    assertDeepEqual(plain(m.cells), EMPTY_CELLS);
    assertEqual(m.hasContent(), false);
  });
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'triz-resources', version: '2.0' } };
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

/*
 * Bekannte Abweichung von der Altform: record repariert nicht je Schlüssel.
 * Ein unlesbarer Eintrag in einem von Hand erzeugten Stand 1.0 setzt darum
 * das ganze Raster (alle 18 Zellen) auf die Vorgabe; die Altform heilte je
 * Zelle. Kein Schreiber der Altform erzeugte solche Stände.
 */
suite('triz-resources Model — unlesbare Einträge in 1.0 (ganzes Feld cells fällt zurück)', () => {
  const cases = [
    ['fehlende Ebene in einer Kategorie', (j) => { delete j.cells.time.sys; }],
    ['Status "halb"', (j) => { j.cells.space.sys.status = 'halb'; }],
    ['fehlende Kategorie', (j) => { delete j.cells.function; }],
    ['fremde Kategorie', (j) => { j.cells.energy = { sub: { notes: '', status: 'unknown' } }; }],
    ['fremde Ebene', (j) => { j.cells.field.mid = { notes: '', status: 'unknown' }; }],
    ['fehlende Notiz', (j) => { delete j.cells.info.sub.notes; }],
    ['fehlender Status', (j) => { delete j.cells.info.sub.status; }],
    ['Notiz kein Text', (j) => { j.cells.substance.sub.notes = 42; }],
    ['Zelle null', (j) => { j.cells.substance.sub = null; }],
  ];
  for (const [name, mutate] of cases) {
    test(`${name}: wirft streng; mit Reparatur wird cells Vorgabe, system bleibt`, () => {
      const j = plain(LEGACY);
      mutate(j);
      assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
      const { m, fields } = repaired(j);
      assertDeepEqual(fields, ['cells']);
      assertDeepEqual(plain(m.cells), EMPTY_CELLS);
      assertEqual(m.system, LEGACY.system);
    });
  }
});

suite('triz-resources Model — hasContent', () => {
  test('System gesetzt → true', () => {
    assertEqual(State.fromJSON({ ...SCHEMA, system: 'X' }).hasContent(), true);
  });
  test('eine Notiz → true', () => {
    const m = new State();
    const cells = emptyCells();
    cells.info.super.notes = 'x';
    m.cells = cells;
    assertEqual(m.hasContent(), true);
  });
  test('ein Status ≠ unknown → true', () => {
    const m = new State();
    m.setCellStatus({ catKey: 'space', lvlKey: 'sub', status: 'unused' });
    assertEqual(m.hasContent(), true);
  });
  test('alle Zellen unknown ohne Notiz, System leer → false', () => {
    const m = new State();
    m.setCellStatus({ catKey: 'space', lvlKey: 'sub', status: 'unknown' });
    assertEqual(m.hasContent(), false);
  });
  test('Altprojekt → true', () => {
    assertEqual(State.fromJSON(plain(LEGACY)).hasContent(), true);
  });
});
