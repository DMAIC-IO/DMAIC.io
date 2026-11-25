/**
 * Tests for modules/triz-contradiction-matrix/domain/migrations.js —
 * Schritt '0→1.0' für jeden Stand ohne `_schema`: wie das alte
 * `State.fromJSON` (Parameter über `Number()` des wahren Werts, nur ganze
 * Zahlen 1 bis 39 bleiben; Notiz Text oder leer; `showMatrix` nach
 * `Boolean()`; Fremdes entfällt).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/triz-contradiction-matrix/domain/migrations.js';

const EMPTY = { improving: null, worsening: null, problemNote: '', showMatrix: false };

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema` wie die Altform. */
const LEGACY = {
  improving: 21,
  worsening: 33,
  problemNote: 'Mehr Leistung des Rührwerks & schnellere Charge <Ziel "30 min">.\nDie Bedienung wird dabei schwerer — Bediener müssen öfter nachregeln (> 5 Eingriffe).',
  showMatrix: true,
};

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('triz-contradiction-matrix Migration 0→1.0 — vollständige Stände', () => {
  test('Altprojekt bleibt zeichengleich, in gespeicherter Reihenfolge', () => {
    assertEqual(JSON.stringify(from0(plain(LEGACY))), JSON.stringify(LEGACY));
  });
  test('Schlüssel in fremder Reihenfolge kommen geordnet heraus', () => {
    const reversed = Object.fromEntries(Object.entries(plain(LEGACY)).reverse());
    assertEqual(JSON.stringify(from0(reversed)), JSON.stringify(LEGACY));
  });
  test('Ergebnis ist ein einfaches Objekt mit genau vier Schlüsseln', () => {
    const out = from0(plain(LEGACY));
    assertEqual(Object.getPrototypeOf(out), Object.prototype);
    assertDeepEqual(Object.keys(out), ['improving', 'worsening', 'problemNote', 'showMatrix']);
  });
  test('fremde Schlüssel entfallen', () => {
    assertEqual(JSON.stringify(from0({ ...plain(LEGACY), extra: 1, _cache: [] })), JSON.stringify(LEGACY));
  });
});

suite('triz-contradiction-matrix Migration 0→1.0 — Parameter', () => {
  test('Zahltext "9" wird 9, "14" wird 14', () => {
    const out = from0({ improving: '9', worsening: '14' });
    assertEqual(out.improving, 9);
    assertEqual(out.worsening, 14);
  });
  test('true wird 1 (wie Number(true) der Altform)', () => {
    assertEqual(from0({ improving: true }).improving, 1);
    assertEqual(from0({ worsening: true }).worsening, 1);
  });
  test('Grenzen 1 und 39 bleiben', () => {
    const out = from0({ improving: 1, worsening: 39 });
    assertEqual(out.improving, 1);
    assertEqual(out.worsening, 39);
  });
  for (const v of [0, '', null, undefined, false]) {
    test(`${JSON.stringify(v) ?? 'undefined'} wird null`, () => {
      assertEqual(from0({ improving: v }).improving, null);
      assertEqual(from0({ worsening: v }).worsening, null);
    });
  }
  for (const v of [40, -3, 2.5, 'abc', '2.5', [], {}]) {
    test(`${JSON.stringify(v)} (nicht darstellbar) wird null`, () => {
      assertEqual(from0({ improving: v }).improving, null);
      assertEqual(from0({ worsening: v }).worsening, null);
    });
  }
  test('ein ungültiger Parameter lässt den anderen und die Notiz stehen', () => {
    assertEqual(JSON.stringify(from0({ ...plain(LEGACY), improving: 40 })), JSON.stringify({ ...LEGACY, improving: null }));
  });
});

suite('triz-contradiction-matrix Migration 0→1.0 — Notiz und Matrix', () => {
  for (const v of [42, null, ['a'], { a: 1 }, true]) {
    test(`Notiz ${JSON.stringify(v)} wird leer`, () => {
      assertEqual(from0({ problemNote: v }).problemNote, '');
    });
  }
  test('Notiz mit Sonderzeichen und Zeilenumbruch bleibt', () => {
    assertEqual(from0({ problemNote: 'a & <b> "c"\nd' }).problemNote, 'a & <b> "c"\nd');
  });
  test('showMatrix folgt Boolean(): "false" und 1 werden true, 0 und fehlend false', () => {
    assertEqual(from0({ showMatrix: 'false' }).showMatrix, true);
    assertEqual(from0({ showMatrix: 1 }).showMatrix, true);
    assertEqual(from0({ showMatrix: 0 }).showMatrix, false);
    assertEqual(from0({}).showMatrix, false);
  });
});

suite('triz-contradiction-matrix Migration 0→1.0 — kein Stand', () => {
  for (const [name, v] of [['null', null], ['undefined', undefined], ['{}', {}], ['Liste', [1, 2]], ['Text', 'x'], ['Zahl', 5]]) {
    test(`${name} ergibt die Vorgabe`, () => {
      assertEqual(JSON.stringify(from0(v)), JSON.stringify(EMPTY));
    });
  }
  test('Teildaten: genannte Werte bleiben, der Rest ist Vorgabe', () => {
    assertEqual(JSON.stringify(from0({ improving: 9 })), JSON.stringify({ ...EMPTY, improving: 9 }));
    assertTrue(from0({ problemNote: 'x' }).improving === null);
  });
});
