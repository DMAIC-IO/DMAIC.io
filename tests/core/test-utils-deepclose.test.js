/**
 * Tests für assertDeepClose: rekursiver Vergleich mit Gleitkomma-Toleranz,
 * alles andere (Schlüssel, Typen, Nicht-Zahlen, NaN/±Infinity/null) exakt.
 */

import { suite, test, assertDeepClose, assertThrows } from '../test-utils.js';

suite('assertDeepClose', () => {
  test('Abweichung in der letzten Stelle (Node 20 gegen 24) geht durch', () => {
    assertDeepClose(
      { cl: 3.6113416861527745, lcl: 0.0001352645068302972, rows: [{ x: 0.34259121148207816 }] },
      { cl: 3.611341686152775, lcl: 0.00013526450683029717, rows: [{ x: 0.3425912114820777 }] },
    );
  });

  test('Werte nahe 0 über die absolute Toleranz', () => {
    assertDeepClose({ v: 1e-16 }, { v: 0 });
    assertThrows(() => assertDeepClose({ v: 1e-14 }, { v: 0 }));
  });

  test('echte Abweichung 1e-9 ist rot, die Meldung nennt Pfad und beide Werte', () => {
    assertThrows(() => assertDeepClose({ a: [1, { b: 2 + 2e-9 }] }, { a: [1, { b: 2 }] }),
      /a\[1\]\.b: erwartet 2, erhalten 2\.000000002/);
  });

  test('fehlender und zusätzlicher Schlüssel sind rot', () => {
    assertThrows(() => assertDeepClose({ a: 1 }, { a: 1, b: 2 }), /b/);
    assertThrows(() => assertDeepClose({ a: 1, c: 3 }, { a: 1 }), /c/);
  });

  test('Typwechsel ist rot', () => {
    assertThrows(() => assertDeepClose({ a: '1' }, { a: 1 }));
    assertThrows(() => assertDeepClose({ a: null }, { a: 0 }));
    assertThrows(() => assertDeepClose({ a: [1] }, { a: { 0: 1 } }));
    assertThrows(() => assertDeepClose([1, 2], [1, 2, 3]));
  });

  test('Nicht-Zahlen und Sonderwerte exakt', () => {
    assertDeepClose({ s: 'x', b: true, n: null, nan: NaN, inf: Infinity, ninf: -Infinity },
      { s: 'x', b: true, n: null, nan: NaN, inf: Infinity, ninf: -Infinity });
    assertThrows(() => assertDeepClose({ s: 'x' }, { s: 'y' }));
    assertThrows(() => assertDeepClose({ v: NaN }, { v: 1 }));
    assertThrows(() => assertDeepClose({ v: Infinity }, { v: -Infinity }));
    assertThrows(() => assertDeepClose({ v: Infinity }, { v: 1e308 }));
  });

  test('eigene Toleranz über Optionen', () => {
    assertDeepClose([1.001], [1], { rel: 1e-2 });
    assertThrows(() => assertDeepClose([1.001], [1]));
  });
});
