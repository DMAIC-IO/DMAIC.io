/** Einfügen und Füllen (core/datagrid/table/paste.js). */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { parseClipboard, splitHeader, fillBlock } from '../../../js/core/datagrid/table/paste.js';

suite('Tabellen-Einfügen', () => {
  test('parseClipboard zerlegt TSV, vereinheitlicht Zeilenenden, lässt Leerzeilen weg', () => {
    assertDeepEqual(parseClipboard('a\tb\r\n1\t2\r\n\r\n3\t4\n'), [['a', 'b'], ['1', '2'], ['3', '4']]);
    assertDeepEqual(parseClipboard('  \t \n'), []);
  });

  test('splitHeader erkennt Kopfzeile', () => {
    assertDeepEqual(splitHeader([['x', 'y'], ['1', '2']]), { header: ['x', 'y'], rows: [['1', '2']] });
    const rows = [['1', '2'], ['3', '4']];
    assertEqual(splitHeader(rows).header, null);
  });

  test('fillBlock: lineare Reihe vorwärts und rückwärts', () => {
    const src = [[{ value: 1 }, { value: 2 }]];
    assertDeepEqual(fillBlock(src, 'numeric', 3, 1, false)[0].map((f) => f.value), [3, 4, 5]);
    assertDeepEqual(fillBlock(src, 'numeric', 2, -1, false)[0].map((f) => f.value), [0, -1]);
  });

  test('fillBlock: Strg kopiert statt extrapoliert; Formeln werden verschoben', () => {
    const out = fillBlock([[{ value: 1 }, { value: 2 }]], 'numeric', 3, 1, true)[0];
    assertDeepEqual(out.map((f) => f.value), [1, 2, 1]);
    const f = fillBlock([[{ value: null, formula: '=C1[1]*2' }]], 'numeric', 2, 1, false)[0];
    assertDeepEqual(f.map((x) => x.formula), ['=C1[2]*2', '=C1[3]*2']);
    assertEqual(f[0].value, null);
  });
});
