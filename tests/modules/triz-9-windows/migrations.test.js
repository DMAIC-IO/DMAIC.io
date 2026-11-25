/**
 * Tests for modules/triz-9-windows/domain/migrations.js — Schritt '0→1.0' für
 * Stände ohne `_schema`: wie das alte `State.fromJSON` (Titel Text oder leer;
 * Beschriftungen nur als Liste der Länge 3, je Eintrag Text oder leer; Raster
 * nur mit drei Zeilen, je Zeile die ersten drei Fenster, fehlende leer; je
 * Fenster `text` Text oder leer, `image` nur als Daten-URL; Fremdes entfällt).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/triz-9-windows/domain/migrations.js';

/** Das 40×40-PNG der Fixture als Daten-URL. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAMElEQVR42u3NQQkAAAgEsOtkScMZyhKCn8H+S/W8iFgsFovFYrFYLBaLxWKxWHxnAbNKjEj+a4EuAAAAAElFTkSuQmCC';

const E = () => ({ text: '', image: null });
const EMPTY_ROW = () => [E(), E(), E()];
const EMPTY = { systemTitle: '', colLabels: ['', '', ''], rowLabels: ['', '', ''], cells: [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()] };

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema`. */
const LEGACY = {
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

const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);

suite('triz-9-windows Migration 0→1.0 — vollständige Stände', () => {
  test('Altprojekt bleibt zeichengleich, in gespeicherter Reihenfolge', () => {
    assertEqual(json(from0(plain(LEGACY))), json(LEGACY));
  });
  test('Schlüssel in fremder Reihenfolge kommen geordnet heraus, auch je Fenster', () => {
    const reversed = Object.fromEntries(Object.entries(plain(LEGACY)).reverse());
    reversed.cells = reversed.cells.map((row) => row.map((c) => ({ image: c.image, text: c.text })));
    assertEqual(json(from0(reversed)), json(LEGACY));
  });
  test('Ergebnis ist ein einfaches Objekt mit genau vier Schlüsseln', () => {
    const out = from0(plain(LEGACY));
    assertEqual(Object.getPrototypeOf(out), Object.prototype);
    assertDeepEqual(Object.keys(out), ['systemTitle', 'colLabels', 'rowLabels', 'cells']);
    assertDeepEqual(Object.keys(out.cells[0][0]), ['text', 'image']);
  });
  test('fremde Schlüssel entfallen, oben und je Fenster', () => {
    const j = { ...plain(LEGACY), extra: 1, _cache: [] };
    j.cells[1][1].note = 'x';
    assertEqual(json(from0(j)), json(LEGACY));
  });
});

suite('triz-9-windows Migration 0→1.0 — Titel und Beschriftungen', () => {
  for (const v of [42, null, ['a'], { a: 1 }, true]) {
    test(`Titel ${json(v)} wird leer`, () => {
      assertEqual(from0({ ...plain(LEGACY), systemTitle: v }).systemTitle, '');
    });
  }
  test('Titel mit Sonderzeichen und Zeilenumbruch bleibt', () => {
    assertEqual(from0({ systemTitle: 'a & <b> "c"\nd' }).systemTitle, 'a & <b> "c"\nd');
  });
  for (const key of ['colLabels', 'rowLabels']) {
    for (const [name, v] of [['Länge 2', ['a', 'b']], ['Länge 4', ['a', 'b', 'c', 'd']], ['leer', []], ['keine Liste', 'abc'], ['Objekt', { 0: 'a', 1: 'b', 2: 'c' }], ['null', null]]) {
      test(`${key} ${name} → drei leere`, () => {
        assertDeepEqual(from0({ [key]: v })[key], ['', '', '']);
      });
    }
    test(`${key}: Eintrag kein Text wird leer, die anderen bleiben`, () => {
      assertDeepEqual(from0({ [key]: ['a', 7, null] })[key], ['a', '', '']);
      assertDeepEqual(from0({ [key]: [{}, 'b', ['c']] })[key], ['', 'b', '']);
    });
    test(`${key}: Lücke in der Liste wird leer`, () => {
      // eslint-disable-next-line no-sparse-arrays
      assertDeepEqual(from0({ [key]: [, 'b', 'c'] })[key], ['', 'b', 'c']);
    });
  }
  test('eine kaputte Achse lässt die andere stehen', () => {
    const out = from0({ ...plain(LEGACY), colLabels: ['x'] });
    assertDeepEqual(out.colLabels, ['', '', '']);
    assertDeepEqual(out.rowLabels, LEGACY.rowLabels);
  });
});

suite('triz-9-windows Migration 0→1.0 — Raster', () => {
  for (const [name, v] of [['zwei Zeilen', [EMPTY_ROW(), EMPTY_ROW()]], ['vier Zeilen', [...plain(LEGACY.cells), EMPTY_ROW()]], ['leer', []], ['keine Liste', 'x'], ['null', null]]) {
    test(`cells ${name} → 3×3 leer`, () => {
      assertEqual(json(from0({ ...plain(LEGACY), cells: v }).cells), json(EMPTY.cells));
    });
  }
  test('Zeile keine Liste → drei leere Fenster, die anderen Zeilen bleiben', () => {
    const cells = plain(LEGACY.cells);
    cells[1] = { 0: { text: 'x', image: null } };
    const out = from0({ cells }).cells;
    assertEqual(json(out[1]), json(EMPTY_ROW()));
    assertEqual(json(out[0]), json(LEGACY.cells[0]));
    assertEqual(json(out[2]), json(LEGACY.cells[2]));
  });
  test('Zeile mit zwei Fenstern wird am Ende aufgefüllt', () => {
    const cells = plain(LEGACY.cells);
    cells[0] = cells[0].slice(0, 2);
    assertEqual(json(from0({ cells }).cells[0]), json([...LEGACY.cells[0].slice(0, 2), E()]));
  });
  test('Zeile mit vier Fenstern verliert den Überschuss', () => {
    const cells = plain(LEGACY.cells);
    cells[2].push({ text: 'zu viel', image: null });
    assertEqual(json(from0({ cells }).cells[2]), json(LEGACY.cells[2]));
  });
  for (const v of [null, 'x', 7, true, ['a']]) {
    test(`Fenster ${json(v)} (kein Objekt) wird leer, an seinem Platz`, () => {
      const cells = plain(LEGACY.cells);
      cells[1][0] = v;
      const out = from0({ cells }).cells;
      assertEqual(json(out[1]), json([E(), ...LEGACY.cells[1].slice(1)]));
    });
  }
  for (const v of [7, null, ['a'], { a: 1 }, undefined]) {
    test(`text ${json(v) ?? 'undefined'} wird leer, das Bild bleibt`, () => {
      const out = from0({ cells: [[{ text: v, image: PNG }], [], []] }).cells;
      assertEqual(json(out[0][0]), json({ text: '', image: PNG }));
    });
  }
  test('image als Daten-URL bleibt', () => {
    for (const url of [PNG, 'data:image/jpeg;base64,AAAA', 'data:image/svg+xml;base64,PHN2Zz4=']) {
      assertEqual(from0({ cells: [[{ text: '', image: url }], [], []] }).cells[0][0].image, url);
    }
  });
  for (const v of ['', 'http://x/y.png', 'data:img/png;base64,123', 'data:image/png,abc', 'data:text/plain;base64,AAAA', 42, true, {}, undefined]) {
    test(`image ${json(v) ?? 'undefined'} (keine Daten-URL) wird null, der Text bleibt`, () => {
      assertEqual(json(from0({ cells: [[{ text: 't', image: v }], [], []] }).cells[0][0]), json({ text: 't', image: null }));
    });
  }
});

suite('triz-9-windows Migration 0→1.0 — kein Stand', () => {
  for (const [name, v] of [['null', null], ['undefined', undefined], ['{}', {}], ['Liste', [1, 2]], ['Text', 'x'], ['Zahl', 5]]) {
    test(`${name} ergibt die Vorgabe`, () => {
      assertEqual(json(from0(v)), json(EMPTY));
    });
  }
  test('Teildaten: genannte Werte bleiben, der Rest ist Vorgabe', () => {
    assertEqual(json(from0({ systemTitle: 'S' })), json({ ...EMPTY, systemTitle: 'S' }));
    assertEqual(json(from0({ rowLabels: ['a', 'b', 'c'] })), json({ ...EMPTY, rowLabels: ['a', 'b', 'c'] }));
  });
  test('jedes Fenster ist ein eigenes Objekt', () => {
    const out = from0({});
    out.cells[0][0].text = 'x';
    assertEqual(out.cells[1][1].text, '');
  });
});
