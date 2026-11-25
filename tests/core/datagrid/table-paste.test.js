/** Einfügen und Füllen (core/datagrid/table/paste.js). */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { parseClipboard, splitHeader, fillBlock } from '../../../js/core/datagrid/table/paste.js';

suite('Tabellen-Einfügen', () => {
  test('parseClipboard zerlegt TSV, vereinheitlicht Zeilenenden, lässt nur Leerzeilen am Rand weg', () => {
    assertDeepEqual(parseClipboard('a\tb\r\n1\t2\r\n\r\n3\t4\n'), [['a', 'b'], ['1', '2'], [''], ['3', '4']]);
    assertDeepEqual(parseClipboard('  \t \n'), []);
  });

  test('parseClipboard mit keepBlank filtert nichts', () => {
    assertDeepEqual(parseClipboard('\n1\n\n2\n', { keepBlank: true }), [[''], ['1'], [''], ['2'], ['']]);
  });

  test('splitHeader erkennt Kopfzeile', () => {
    assertDeepEqual(splitHeader([['x', 'y'], ['1', '2']]), { header: ['x', 'y'], rows: [['1', '2']] });
    const rows = [['1', '2'], ['3', '4']];
    assertEqual(splitHeader(rows).header, null);
  });

  test('splitHeader: Namen über Zahlenzeile ist Kopf', () => {
    assertDeepEqual(splitHeader([['Teil', 'Wert'], ['A', '1']]), { header: ['Teil', 'Wert'], rows: [['A', '1']] });
  });

  test('splitHeader: erste Zeile aus Text und Zahl ist Daten', () => {
    const rows = [['A', '1'], ['B', '2']];
    assertDeepEqual(splitHeader(rows), { header: null, rows });
  });

  test('splitHeader: leere Zelle in der ersten Zeile ist kein Kopf', () => {
    const rows = [['', 'Y'], ['1', '2']];
    assertDeepEqual(splitHeader(rows), { header: null, rows });
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

  test('fillBlock waagerecht: Formel C1[2] wandert nach C2[2], C3[2]; links nach C0 abgeschnitten', () => {
    const r = fillBlock([[{ value: null, formula: '=C1[2]' }]], 'numeric', 2, 1, false, { axis: 'h' })[0];
    assertDeepEqual(r.map((x) => x.formula), ['=C2[2]', '=C3[2]']);
    const l = fillBlock([[{ value: null, formula: '=C3[2]' }]], 'numeric', 3, -1, false, { axis: 'h', before: 2 })[0];
    assertDeepEqual(l.map((x) => x.formula), ['=C2[2]', '=C1[2]']);
  });

  test('fillBlock waagerecht: Werte links und rechts, after begrenzt', () => {
    const src = [[{ value: 10 }, { value: 20 }]];
    assertDeepEqual(fillBlock(src, 'numeric', 3, 1, false, { axis: 'h', after: 2 })[0].map((f) => f.value), [30, 40]);
    assertDeepEqual(fillBlock(src, 'numeric', 2, -1, false, { axis: 'h' })[0].map((f) => f.value), [0, -10]);
  });

  test('fillBlock rückwärts: bei before = 1 genau ein Eintrag (wie targetRow < 0)', () => {
    const r = fillBlock([[{ value: 1 }, { value: 2 }]], 'numeric', 5, -1, false, { before: 1 })[0];
    assertEqual(r.length, 1);
    assertEqual(r[0].value, 0);
  });

  test('fillBlock rückwärts: Formeln aus der gespiegelten Quellzeile', () => {
    const src = [[{ value: null, formula: '=C1[10]' }, { value: null, formula: '=C1[11]*3' }]];
    const r = fillBlock(src, 'numeric', 3, -1, false)[0];
    // Ziel -1 kommt aus Quellzeile 1, Ziel -2 aus Zeile 0, Ziel -3 aus Zeile 1
    assertDeepEqual(r.map((x) => x.formula), ['=C1[9]*3', '=C1[8]', '=C1[7]*3']);
  });

  test('fillBlock rückwärts: repeat und textSuffix (sourceIdx-Zweig)', () => {
    const rep = fillBlock([[{ value: 'a' }, { value: 'b' }, { value: 'x' }]], 'text', 4, -1, false)[0];
    assertDeepEqual(rep.map((f) => f.value), ['x', 'b', 'a', 'x']);
    const suf = fillBlock([[{ value: 'T1' }, { value: 'T2' }]], 'text', 2, -1, false)[0].map((f) => f.value);
    assertDeepEqual(suf, ['T0', 'T0']); // Suffix klemmt bei 0
    const ctrl = fillBlock([[{ value: 'T1' }, { value: 'T2' }]], 'text', 3, -1, true)[0].map((f) => f.value);
    assertDeepEqual(ctrl, ['T2', 'T1', 'T2']);
  });

  test('fillBlock mit mehreren Quellspalten: je Vektor eigene Reihe', () => {
    const r = fillBlock([[{ value: 1 }, { value: 2 }], [{ value: 10 }, { value: 30 }]], 'numeric', 2, 1, false);
    assertDeepEqual(r.map((v) => v.map((f) => f.value)), [[3, 4], [50, 70]]);
  });
});
