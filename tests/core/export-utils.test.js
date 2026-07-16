/**
 * Tests for js/core/export-utils.js
 *
 * Covers the pure, DOM-free helpers of the column/card exporter:
 *  - columnExportDims  (canvas dimension geometry)
 *  - truncateColumnLabel (card-label truncation)
 *
 * The canvas/SVG draw paths are DOM/canvas-bound and are covered by sipoc's
 * E2E export + visual-snapshot tests; here we only assert the pure math.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { columnExportDims, truncateColumnLabel } from '../../js/core/export-utils.js';

// Defaults baked into export-utils (must stay in sync with _COL_DEFAULTS).
const D = { COL_W: 200, GAP: 8, PAD: 20, HEADER_H: 48, ITEM_H: 32, ITEM_PAD: 6 };

const col = (...items) => ({ title: 'T', color: '#000', items });

suite('export-utils: columnExportDims', () => {
  test('width = 2·PAD + N·COL_W + (N−1)·GAP', () => {
    const cols = [col('a'), col('b'), col('c'), col('d'), col('e')];
    const { w } = columnExportDims(cols);
    const expected = D.PAD * 2 + 5 * D.COL_W + 4 * D.GAP;
    assertEqual(w, expected, 'width for 5 columns');
  });

  test('height uses the tallest column (maxItems)', () => {
    const cols = [col('a'), col('a', 'b', 'c'), col('a', 'b')];
    const { h, maxItems } = columnExportDims(cols);
    assertEqual(maxItems, 3, 'maxItems is the longest column');
    const expected = D.PAD * 2 + D.HEADER_H + 3 * (D.ITEM_H + D.ITEM_PAD) + D.ITEM_PAD;
    assertEqual(h, expected, 'height for tallest column of 3');
  });

  test('empty columns still reserve one item-row (maxItems = 1)', () => {
    const cols = [col(), col(), col()];
    const { h, maxItems } = columnExportDims(cols);
    assertEqual(maxItems, 1, 'maxItems floors at 1');
    const expected = D.PAD * 2 + D.HEADER_H + 1 * (D.ITEM_H + D.ITEM_PAD) + D.ITEM_PAD;
    assertEqual(h, expected, 'height with all-empty columns');
  });

  test('single column width has no gap term', () => {
    const { w } = columnExportDims([col('a')]);
    assertEqual(w, D.PAD * 2 + D.COL_W, 'single-column width (no gap)');
  });

  test('opts override geometry', () => {
    const { w } = columnExportDims([col('a'), col('b')], { COL_W: 100, GAP: 0, PAD: 10 });
    assertEqual(w, 10 * 2 + 2 * 100 + 1 * 0, 'overridden geometry');
  });
});

suite('export-utils: truncateColumnLabel', () => {
  test('short labels pass through unchanged', () => {
    assertEqual(truncateColumnLabel('short'), 'short', 'no truncation');
  });

  test('label at exactly max (28) is not truncated', () => {
    const s = 'x'.repeat(28);
    assertEqual(truncateColumnLabel(s), s, '28 chars stays whole');
  });

  test('label over max is cut to 26 chars + ellipsis', () => {
    const s = 'x'.repeat(40);
    const out = truncateColumnLabel(s);
    assertEqual(out, 'x'.repeat(26) + '…', 'truncated to 26 + …');
    assertEqual(out.length, 27, '26 chars plus one ellipsis glyph');
  });

  test('custom max/trunc thresholds honoured', () => {
    assertEqual(truncateColumnLabel('abcdef', 4, 2), 'ab…', 'custom thresholds');
  });
});
