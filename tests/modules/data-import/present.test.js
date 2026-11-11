/**
 * Datenimport: Anzeige-Bausteine (viewmodel/present.js) ohne DOM.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { ChunkLoadError } from '../../../js/core/chunks.js';
import {
  parseErrorMessage, fmtBytes, summarize, clampSheet, typeLabel, previewColumns, previewRows, moreRows, PREVIEW_ROWS,
} from '../../../js/modules/data-import/viewmodel/present.js';

suite('data-import present — parseErrorMessage', () => {
  const t = (k, p) => `${k}:${p?.message ?? ''}`;
  const tApp = (k) => `APP:${k}`;

  test('ein gescheitertes Nachladen zeigt die übersetzte Meldung der App', () => {
    assertEqual(parseErrorMessage(new ChunkLoadError(new Error('x')), t, tApp), 'APP:app.chunkLoadFailed');
  });

  test('ein Fehler mit Code nutzt den Code als Schlüssel, sonst den Satz mit dem Fehlertext', () => {
    assertEqual(parseErrorMessage({ code: 'bad' }, t, tApp), 'bad:');
    assertEqual(parseErrorMessage(new Error('boom'), t, tApp), 'parseErrorDetail:boom');
  });
});

suite('data-import present — Anzeige', () => {
  test('fmtBytes: B, KB mit einer, MB mit zwei Nachkommastellen', () => {
    assertEqual(fmtBytes(null), '');
    assertEqual(fmtBytes(512), '512 B');
    assertEqual(fmtBytes(1536), '1.5 KB');
    assertEqual(fmtBytes(3 * 1024 * 1024), '3.00 MB');
  });

  test('summarize lässt die Werte weg und nimmt shortName ohne Namen', () => {
    const parsed = {
      format: 'csv',
      sheets: [{ name: 'S', rowCount: 2, columns: [
        { name: 'A', shortName: 'C1', type: 'numeric', values: [1, 2] },
        { name: '', shortName: 'C2', type: 'text', values: ['x', 'y'] },
      ] }],
    };
    assertDeepEqual(summarize(parsed), {
      format: 'csv',
      sheets: [{ name: 'S', rowCount: 2, columns: [{ name: 'A', type: 'numeric' }, { name: 'C2', type: 'text' }] }],
    });
  });

  test('clampSheet klemmt auf das letzte Blatt, -1 ohne Blätter', () => {
    assertEqual(clampSheet(2, 1), 0);
    assertEqual(clampSheet(1, 3), 1);
    assertEqual(clampSheet(0, 0), -1);
  });

  test('typeLabel je Spaltentyp', () => {
    const t = (k) => k;
    assertDeepEqual(['numeric', 'text', 'date', 'time', 'currency', 'percent', 'binary'].map((x) => typeLabel(x, t)),
      ['typeNumeric', 'typeText', 'typeDate', 'typeTime', 'typeCurrency', 'typePercent', 'typeBinary']);
  });

  test('Vorschau: höchstens PREVIEW_ROWS Zeilen, leere Zellen als Punkt, Zahlen rechtsbündig', () => {
    const n = PREVIEW_ROWS + 5;
    const sheet = {
      rowCount: n,
      columns: [
        { name: 'A', type: 'numeric', values: Array.from({ length: n }, (_, i) => (i === 1 ? null : i)) },
        { name: '', shortName: 'C2', type: 'text', values: Array.from({ length: n }, () => 'x') },
      ],
    };
    const rows = previewRows(sheet);
    assertEqual(rows.length, PREVIEW_ROWS);
    assertDeepEqual(rows[0][0], { cls: 'data-import__cell--num', text: '0' });
    assertDeepEqual(rows[1][0], { cls: 'data-import__cell--null', text: '·' });
    assertDeepEqual(rows[0][1], { cls: '', text: 'x' });
    assertEqual(moreRows(sheet), 5);
    assertDeepEqual(previewColumns(sheet, (k) => k).map((c) => c.name), ['A', 'C2']);
    assertDeepEqual(previewRows(null), []);
  });
});
