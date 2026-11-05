/**
 * Tests for js/core/export-utils.js
 *
 * Covers the pure, DOM-free helpers of the column/card exporter:
 *  - columnExportDims  (canvas dimension geometry)
 *  - truncateColumnLabel (card-label truncation)
 *  - columnsToSVG      (card board as SVG text, byte-stable)
 *
 * The canvas/SVG draw paths are DOM/canvas-bound and are covered by sipoc's
 * E2E export + visual-snapshot tests; here we only assert the pure math.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { columnExportDims, truncateColumnLabel, columnsToSVG } from '../../js/core/export-utils.js';

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

const GOLDEN = '<svg xmlns="http://www.w3.org/2000/svg" width="448" height="170" viewBox="0 0 448 170"><rect width="448" height="170" fill="#fff"/><rect x="20" y="20" width="200" height="130" rx="6" fill="#eee" stroke="#ccc"/><rect x="20" y="20" width="200" height="48" rx="6" fill="#112233" fill-opacity="0.09"/><rect x="20" y="62" width="200" height="6" fill="#112233" fill-opacity="0.09"/><line x1="20" y1="68" x2="220" y2="68" stroke="#ccc"/><circle cx="34" cy="44" r="5" fill="#112233"/><text x="46" y="38" fill="#111" font-size="11" font-weight="bold" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">SUPPLIERS</text><text x="46" y="52" fill="#999" font-size="10" font-family="JetBrains Mono, monospace" dominant-baseline="central">Lieferanten</text><rect x="28" y="74" width="184" height="32" rx="4" fill="#fff" stroke="#ccc"/><text x="34" y="90" fill="#111" font-size="13" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">A &amp; &quot;B&quot;</text><rect x="28" y="112" width="184" height="32" rx="4" fill="#fff" stroke="#ccc"/><text x="34" y="128" fill="#111" font-size="13" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">Ein sehr langer Eintrag mi…</text><rect x="228" y="20" width="200" height="92" rx="6" fill="#eee" stroke="#ccc"/><rect x="228" y="20" width="200" height="48" rx="6" fill="#445566" fill-opacity="0.09"/><rect x="228" y="62" width="200" height="6" fill="#445566" fill-opacity="0.09"/><line x1="228" y1="68" x2="428" y2="68" stroke="#ccc"/><circle cx="242" cy="44" r="5" fill="#445566"/><text x="254" y="38" fill="#111" font-size="11" font-weight="bold" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">INPUTS</text><text x="254" y="52" fill="#999" font-size="10" font-family="JetBrains Mono, monospace" dominant-baseline="central"></text></svg>';

suite('export-utils: columnsToSVG', () => {
  test('byte-gleich zur bisherigen SVG-Ausgabe', () => {
    // In Node fehlen document und getComputedStyle; die Farben kommen hier ohnehin aus opts.
    const stubbed = typeof document === 'undefined';
    if (stubbed) {
      globalThis.document = { documentElement: {} };
      globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
    }
    try {
      const cols = [
        { title: 'SUPPLIERS', desc: 'Lieferanten', color: '#112233', items: ['A & "B"', 'Ein sehr langer Eintrag mit über achtundzwanzig Zeichen'] },
        { title: 'INPUTS', desc: '', color: '#445566', items: [] },
      ];
      const colors = { bgPrimary: '#fff', bgSecondary: '#eee', borderColor: '#ccc', textPrimary: '#111', textSecondary: '#555', textTertiary: '#999' };
      assertEqual(columnsToSVG(cols, colors), GOLDEN);
    } finally {
      if (stubbed) { delete globalThis.document; delete globalThis.getComputedStyle; }
    }
  });
});
